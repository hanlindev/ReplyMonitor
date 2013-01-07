/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

let EXPORTED_SYMBOLS = ["ReplyManagerUtils"];

const Cu = Components.utils;
const Cc = Components.classes;
const Ci = Components.interfaces;

Cu.import("resource:///modules/gloda/public.js");
Cu.import("resource://replymanager/modules/replyManagerCalendar.jsm");
Cu.import("resource://calendar/modules/calUtils.jsm");
Cu.import("resource:///modules/mailServices.js");
Cu.import("resource:///modules/gloda/index_msg.js");
Cu.import("resource:///modules/StringBundle.js");

let ReplyManagerUtils = {
  /**
   * Get the list of email addresses who have not replied to the message
   * @param aGlodaMsg
   * @param callback function: receiving four arguments - aGlodaMsg, aCollection
   *                           and recipients array.
   * a recipient is an object with the following member attributes:
   *    1. address: the mailbox address of the recipient without the name
   *    2. didReply: true if the recipients has replied.
   */
  getNotRepliedForGlodaMsg: function ReplyManagerUtils_getNotRepliedForGlodaMsg(aGlodaMsg, callback) {
    aGlodaMsg.conversation.getMessagesCollection({
      onItemsAdded: function() {},
      onItemsModified: function() {},
      onItemsRemoved: function() {},
      onQueryCompleted: function(aCollection) {
        // The constructor for the recipient object described above
        function recipient(aAddress, aDidReply) {
          this.address = aAddress;
          this.didReply = aDidReply;
        }

        let recipients = [];
        for (let i = 0; i < aGlodaMsg.recipients.length; ++i) {
          let address = aGlodaMsg.recipients[i].value;
          let didReply = aCollection.items.some(function(aItem) aItem.from.value == address);
          recipients[i] = new recipient(address, didReply);
        }

        callback(aGlodaMsg, aCollection, recipients);
      }
    });
  },

  /**
   * getNotRepliedForHdr
   * @param aMsgHdr
   * @param callback function
   * The strategy is that we get the gloda message first then query the gloda database from that
   * message.
   */
  getNotRepliedForHdr: function ReplyManagerUtils_getNotRepliedForHdr(aMsgHdr, callback)
  {
    Gloda.getMessageCollectionForHeader(aMsgHdr, {
      onItemsAdded: function() {},
      onItemsModified: function() {},
      onItemsRemoved: function() {},
      onQueryCompleted: function(aCollection) {
        //We need to ensure that the message has been indexed
        if (aCollection.items.length > 0) {
          ReplyManagerUtils.getNotRepliedForGlodaMsg.call(this, aCollection.items[0], callback);
        } else {
          throw new Error("Reply Manager Error: Message not found in Gloda database");
        }
      }
    });
  },

  /**
   * Set ExpectReply flag to true and set the ExpectReplyDate property.
   * If the flag is already true, modify the ExpectReplyDate property.
   */
  setExpectReplyForHdr: function ReplyManagerUtils_setExpectReplyForHdr(aMsgHdr, aDateStr)
  {
    markHdrExpectReply(aMsgHdr, true, aDateStr);

    if (cal.getPrefSafe("extensions.replymanager.create_calendar_event_enabled", false))
      ReplyManagerUtils.addHdrToCalendar(aMsgHdr);
  },

  /**
   * Reset ExpectReply flag.
   * We don't need to modify the ExpectReplyDate property because they will be set when we set the
   * flag again.
   */
  resetExpectReplyForHdr: function ReplyManagerUtils_resetExpectReplyForHdr(aMsgHdr)
  {
    markHdrExpectReply(aMsgHdr, false);

    // We should attempt to remove the event regardless of the preference because an event might be
    // created before the preference was set to false.
    ReplyManagerUtils.removeHdrFromCalendar(aMsgHdr);
  },

  /**
   * updateExpectReplyForHdr updates the Expect Reply date and the associated
   * calendar event if the feature is enabled
   * @param aMsgHdr
   * @param aDateStr is an optional parameter that, when specified, will
   *        change the expect reply date. If not this method will only
   *        attempt to modify the calendar event's title.
   */
  updateExpectReplyForHdr: function ReplyManagerUtils_updateExpectReplyForHdr(aMsgHdr, aDateStr) {
    let callback = function (aGlodaMessage, aCollection, aRecipientsList) {
      let replyManagerStrings = new StringBundle("chrome://replymanager/locale/replyManager.properties");
      let subject = aGlodaMessage.subject;
      let recipients = getNotRepliedRecipients(aRecipientsList);
      let dateStr = (aDateStr) ? aDateStr : aMsgHdr.getStringProperty("ExpectReplyDate");
	  // Convert to locale date string
	  dateStr = (new Date(dateStr)).toLocaleDateString();
      let newDate = (aDateStr) ? getDateForICalString(aDateStr)
                               : null;

      // When all people have replied to our email, the recipients will be an empty string.
      // In that case we need to give the event a more meaningful title.
      let newStatus = (recipients == "") ?
                      "\"" + subject + "\" : " + replyManagerStrings.getString("AllReplied") :
                      "\"" + subject + "\" " + replyManagerStrings.getString("NotAllReplied") + " "
                      + recipients + " " + replyManagerStrings.getString("DeadlineForReplies") +  " " + dateStr;
      ReplyManagerCalendar.modifyCalendarEvent(aMsgHdr.messageId, newStatus, newDate);
    }
    if (aDateStr) {
      aMsgHdr.setStringProperty("ExpectReplyDate", aDateStr);
    }
    if (cal.getPrefSafe("extensions.replymanager.create_calendar_event_enabled", false))
      ReplyManagerUtils.getNotRepliedForHdr(aMsgHdr, callback);
  },

  /**
   * test if this message is expecting replies
   * @param aMsgHdr is an nsIMsgDBHdr object
   */
  isHdrExpectReply: function ReplyManagerUtils_isHdrExpectReply(aMsgHdr) {
    return aMsgHdr.getStringProperty("ExpectReply") == "true";
  },

  /**
   * Add this expect reply entry to calendar
   * @param aMsgHdr is the message header associated with this event
   */
  addHdrToCalendar: function ReplyManagerUtils_addHdrToCalendar(aMsgHdr) {
    let replyManagerStrings = new StringBundle("chrome://replymanager/locale/replyManager.properties");
    let headerParser = MailServices.headerParser;
    // We need to merge the three fields and remove duplicates.
    // To make it simpler, we can create an object and make
    // each address a property of that object. This prevents
    // duplicates.
    let recipients = {};
    let mergeFunction = function (addressStr) {
      if (addressStr != "") {
        let addressListObj = {};
        headerParser.parseHeadersWithArray(addressStr, addressListObj, {}, {});
        for each (let recipient in addressListObj.value) {
          //Let's make the address the name of the property
          recipients[recipient] = true;
        }
      }
    };
    mergeFunction(aMsgHdr.recipients);
    mergeFunction(aMsgHdr.ccList);
    mergeFunction(aMsgHdr.bccList);
    let finalRecipients = Object.getOwnPropertyNames(recipients);

    // If we initialized using a whole date string, the date will be 1 less
    // than the real value so we need to separete the values.
    let dateStr = aMsgHdr.getStringProperty("ExpectReplyDate");
	// Convert to locale date string
	localeDateStr = (new Date(dateStr)).toLocaleDateString();
    let date = getDateForICalString(dateStr);
    let status = "\"" + aMsgHdr.subject + "\" " + replyManagerStrings.getString("NotAllReplied")
                      + finalRecipients + " " + replyManagerStrings.getString("DeadlineForReplies") +  " " + localeDateStr;
    ReplyManagerCalendar.addEvent(date, aMsgHdr.messageId, status);
  },

  removeHdrFromCalendar: function ReplyManagerUtils_removeHdrFromCalendar(aMsgHdr) {
    ReplyManagerCalendar.removeEvent(aMsgHdr.messageId);
  },

  startReminderComposeForHdr: function ReplyManagerUtils_startReminderCompose(aMsgHdr) {
    ReplyManagerUtils.getNotRepliedForHdr(aMsgHdr, ReplyManagerUtils.openComposeWindow);
  },

  openComposeWindow: function ReplyManagerUtils_openComposeWindow(aGlodaMsg, aCollection, aRecipientsList) {
    let recipients = getNotRepliedRecipients(aRecipientsList);
    let boilerplate = cal.getPrefSafe("extensions.replymanager.boilerplate");

    cal.sendMailTo(recipients, aGlodaMsg.subject, boilerplate);
  }
};

/**
 * Mark the given header as expecting reply
 * @param aMsgHdr is an nsIMsgDBHdr
 * @param aExpectReply is the boolean value indicating whether
 *        the message is expecting replies
 * @param aDate is the expect reply date. It must be provided if
 *        aExpectReply is true
 */
function markHdrExpectReply(aMsgHdr, aExpectReply, aDate) {
  let database = aMsgHdr.folder.msgDatabase;
  if (aExpectReply && aDate == null)
    throw new Error("Error: a date must be provided if aExpectReply is true");
  if (aMsgHdr.folder instanceof Ci.nsIMsgImapMailFolder) {
    database.setAttributeOnPendingHdr(aMsgHdr, "ExpectReply", aExpectReply);
    if (aExpectReply)
      database.setAttributeOnPendingHdr(aMsgHdr, "ExpectReplyDate", aDate);
  }
  aMsgHdr.setStringProperty("ExpectReply", aExpectReply);
  if (aExpectReply)
    aMsgHdr.setStringProperty("ExpectReplyDate", aDate);

  // We need to re-index this message to reflect the change to the Gloda attribute
  indexMessage(aMsgHdr);
}

/**
 * Tell Gloda to reindex the message to make queries return the correct collections
 */
function indexMessage(aMsgHdr) {
  if (Gloda.isMessageIndexed(aMsgHdr)) {
    //the message is already indexed we just need to reindex it
    GlodaMsgIndexer._reindexChangedMessages([aMsgHdr], true);
  } else {
    GlodaMsgIndexer.indexMessages([[aMsgHdr.folder, aMsgHdr.messageKey]]);
  }
}

function getNotRepliedRecipients(aRecipientsList) {
  return recipients = [recipient.address for each ([i, recipient] in Iterator(aRecipientsList))
    if (!recipient.didReply)].join(",");
}

//Remove the '-' in the date string to get a date string used by iCalString
function getDateForICalString(aDateStr) {
  let year = aDateStr.substr(0, 4);
  let month = aDateStr.substr(5, 2);
  let date = aDateStr.substr(8, 2);
  return year + month + date;
}

/**
 * Gloda attribute provider
 * the isExpectReply attribute of the message header is contributed to
 * Gloda so that we can query messages marked isExpectReply. I need to
 * get a collection of such messages to display them collectively.
 */
let isExpectReply = {

  init: function() {
    this.defineAttribute();
  },

  defineAttribute: function() {
    this._isExpectReplyAttribute = Gloda.defineAttribute({
      provider: this,
      extensionName: "replyManager",
      attributeType: Gloda.kAttrExplicit,
      attributeName: "isExpectReply",
      bind: true,
      singular: true,
      canQuery: true,
      subjectNouns: [Gloda.NOUN_MESSAGE],
      objectNoun: Gloda.NOUN_BOOLEAN,
      parameterNoun: null,
    });
  },

  process: function(aGlodaMessage, aRawReps, aIsNew, aCallbackHandle) {
    aGlodaMessage.isExpectReply =
           ReplyManagerUtils.isHdrExpectReply(aRawReps.header);
    yield Gloda.kWorkDone;
  }
};
isExpectReply.init();
