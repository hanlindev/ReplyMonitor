/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

let EXPORTED_SYMBOLS = ["ReplyManagerCalendar"];

const Cu = Components.utils;
const Cc = Components.classes;
const Ci = Components.interfaces;
const ReplyManager = "ReplyManager";

Cu.import("resource://gre/modules/errUtils.js");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://calendar/modules/calUtils.jsm");
Cu.import("resource:///modules/gloda/public.js");
Cu.import("resource:///modules/gloda/index_msg.js");
Cu.import("resource:///modules/StringBundle.js");

/**
 * ReplyManagerCalendar
 * Helps the ReplyManagerUtils module handle calendar operations.
 */
let ReplyManagerCalendar = {
  /**
   * This method is called in replyManagerMailWindowOverlay.js
   * after the window fires the load event. This ensures that
   * ReplyManagerCalendar exists.
   */
  initCalendar: function()
  {
    let calendarID = cal.getPrefSafe("calendar.replymanager.calendarID");
    this.ensureHasCalendar();
    ReplyManagerCalendarManagerObserver.init();
    ReplyManagerCalendarObserver.init();
  },

  /**
   * Ensure that the "Reply Manager"(the default name of our calendar) calendar exists.
   */
  ensureHasCalendar: function() {
    // Create a new reply manager calendar and assign the id of the calendar
    // to the "calendar.replymanager.calendarID" preference.
    let createNewCalendar = function() {
      let calendarManager = Cc["@mozilla.org/calendar/manager;1"]
                              .getService(Ci.calICalendarManager);
      let temp = calendarManager.createCalendar("storage",
        Services.io.newURI("moz-profile-calendar://", null, null));
      let replyManagerStrings = new StringBundle("chrome://replymanager/locale/replyManager.properties");
      temp.name = replyManagerStrings.getString("ReplyManagerCalendarName");
      calendarManager.registerCalendar(temp);
      Services.prefs.setCharPref("calendar.replymanager.calendarID", temp.id);
      return temp;
    };

    // Get the calendar with the given ID, if such a calendar does not exist,
    // this method will call createNewCalendar.
    let getCalendarById = function(aCalID) {
      let calendarManager = Cc["@mozilla.org/calendar/manager;1"]
                          .getService(Ci.calICalendarManager);
      let calendar = calendarManager.getCalendarById(aCalID);
      if (calendar != null) {
        return calendar;
      } else {
        return createNewCalendar();
      }
    };

    let calendarID = cal.getPrefSafe("calendar.replymanager.calendarID", "");
    // Get the calendar with the calendarID. If the ID is an empty string,
    // the calendar does not exists. So create one.
    if (calendarID != "") {
      this.calendar = getCalendarById(calendarID);
    } else {
      this.calendar = createNewCalendar();
    }
  },

  retrieveItem: function(id, calendar)
  {
    let listener = new ReplyManagerCalendar.calOpListener();
    calendar.getItem(id, listener);
    return listener.mItems[0];
  },

  /**
   * addEvent
   * @param date is the javascript date object
   * @param id is the messageId field of the message header
   * @param status is a string that will be the title of the event
   */
  addEvent: function(dateStr, id, status)
  {
    this.calendar.readOnly = false;
    // First we need to test if an event with the same
    // id exists. If so what we need is modification instead
    // of addition.
    if (this.retrieveItem(id, this.calendar)) {
      this.modifyCalendarEvent(id, status, dateStr);
      return;
    }

    let iCalString = generateICalString(dateStr);

    // create event Object out of iCalString
    let event = cal.createEvent(iCalString);
    event.icalString = iCalString;

    // set Title (Summary)
    event.title = status;

    // set ID
    event.id = id;
    // add Item to Calendar
    this.calendar.addItem(event, null);

    Services.obs.notifyObservers(null, ReplyManager, "CalendarEventAdded");
  },

  /**
   * modifyCalendarEvent updates the title of the calendar event
   * to the status string
   * @param id uniquely identifies the event to be modified it is
   *        nsIMsgDBHdr::messageId
   * @param status string is the new event title
   * @param aDateStr(optional) if specified will change the date
   *        of the event.
   */
  modifyCalendarEvent: function(id, status, dateStr)
  {
    this.calendar.readOnly = false;
    // First we need to test if such event exists, if not we need
    // to create a new event.
    if (!this.retrieveItem(id, this.calendar)) {
      // No such event, create one
      this.addEvent(dateStr, id, status);
      return;
    }
    let oldEvent = this.retrieveItem(id, this.calendar);
    let iCalString = (dateStr) ? generateICalString(dateStr) :
                                 oldEvent.icalString;

    let newEvent = cal.createEvent(iCalString);
    newEvent.id = id;
    newEvent.calendar = this.calendar;
    newEvent.title = status;
    this.calendar.modifyItem(newEvent, oldEvent, null);

    Services.obs.notifyObservers(null, ReplyManager, "CalendarEventModified");
  },

  /**
   * removeEvent
   * @param id is nsIMsgDBHdr::messageId field
   */
  removeEvent: function(id)
  {
    try {
      this.calendar.readOnly = false;

      // The code for unmarking a message will always attempt to remove an
      // event even if such event doesn't exist to make sure that any previously
      // created event are correctly removed in case the user has disabled
      // event creation sometime after one is created. So we need to check if
      // the item returned is null.
      let tempEvent = this.retrieveItem(id, this.calendar);
      if (tempEvent != null)
        this.calendar.deleteItem(tempEvent,null);

      Services.obs.notifyObservers(null, ReplyManager, "CalendarEventRemoved");
    } catch(e) {
      logException(e);
    }
  },
};

ReplyManagerCalendar.calOpListener = function () {}
ReplyManagerCalendar.calOpListener.prototype = {
  mItems: [],
  mDetail: null,
  mId: null,
  mStatus: null,

  onOperationComplete: function(aCalendar, aStatus, aOperationType, aId, aDetail) {
    this.mDetail = aDetail;
    this.mStatus = aStatus;
    this.mId = aId;
  },

  onGetResult: function(aCalendar, aStatus, aItemType, aDetail, aCount, aItems) {
    this.mItems = aItems;
  },
}

function generateICalString(aDateStr) {
  // Strategy is to create iCalString and create Event from that string
  let iCalString = "BEGIN:VCALENDAR\n" +
                   "BEGIN:VEVENT\n" +
                   // generate Date as Ical compatible text string
                   "DTSTART;VALUE=DATE:" + aDateStr + "\n" +
                   // set Duration
                   "DURATION=PT1D\n" +
                   // set Alarm
                   "BEGIN:VALARM\nACTION:DISPLAY\nTRIGGER:-PT" + "1" + "M\nEND:VALARM\n" +
                   // finalize iCalString
                   "END:VEVENT\n" +
                   "END:VCALENDAR\n";
  return iCalString;
}

var ReplyManagerCalendarManagerObserver = {
  init: function() {
    let calendarManager = Cc["@mozilla.org/calendar/manager;1"]
                            .getService(Ci.calICalendarManager);
    calendarManager.addObserver(this);
  },

  onCalendarRegistered: function() {},

  onCalendarUnregistering: function() {},

  /**
   * We don't want the calendar to be deleted while the application is
   * running or things will break. So if the user somehow deleted the
   * ReplyManagerCalendar we need to re-create one. */
  onCalendarDeleting: function(aCalendar) {
    if (aCalendar.id == ReplyManagerCalendar.calendar.id) {
      // The calendar being deleted is our reply manager calendar we need
      // to create a new one
      ReplyManagerCalendar.ensureHasCalendar();
    }
  },
};

let ReplyManagerCalendarObserver = {
  init: function() {
    ReplyManagerCalendar.calendar.addObserver(this);
  },

  // query the message using Gloda with the message ID provided.
  queryMessage: function(aID, aCallback) {
    let query = Gloda.newQuery(Gloda.NOUN_MESSAGE);
    query.headerMessageID(aID);
    let collection = query.getCollection({
      onItemsAdded: function() {},
      onItemsRemoved: function() {},
      onItemsModified: function() {},
      onQueryCompleted: function(aCollection) {
        if (aCollection.items.length > 0) {
          let msgHdr = aCollection.items[0].folderMessage;
          aCallback(msgHdr);
          Services.obs.notifyObservers(null, ReplyManager, "HeaderPropertyChanged");
        }
      },
    });
  },

  onStartBatch: function() {},

  onEndBatch: function() {},

  onLoad: function() {},

  onAddItem: function() {},

  /**
   * The user may change the date of a reminder through the calendar interface,
   * we need to observe this and change the property on the message header
   * accordingly
   */
  onModifyItem: function(aNewItem, aOldItem) {
    // if the calendar is our ReplyManagerCalendar we know this is the case.
    let calendar = aOldItem.calendar;
    if (calendar == ReplyManagerCalendar.calendar) {
      // Generate a YYYY-MM-DD formated date string
      let aDateTime = aNewItem.startDate;
      let year = aDateTime.year;
      let month = aDateTime.month + 1;
      let day = aDateTime.day;
      let strMonth = (month < 10) ? "0" + month : month;
      let strDay = (day < 10) ? "0" + day : day;
      let dateStr = "" + year + "-" + strMonth + "-" + strDay;

      let msgID = aNewItem.id;
      let callback = function(aMsgHdr) {
        aMsgHdr.setStringProperty("ExpectReplyDate", dateStr);
      };
      this.queryMessage(msgID, callback);
    }
  },

  /**
   * It is most likely that when a user delete a event he wants to
   * unmark the message as expecting replies, so let's observe such
   * event and do it for the him.
   */
  onDeleteItem: function(aDeletedItem) {
    let calendar = aDeletedItem.calendar;
    if (calendar == ReplyManagerCalendar.calendar) {
      let msgID = aDeletedItem.id;
      let callback = function(aMsgHdr) {
        aMsgHdr.setStringProperty("ExpectReply", "false");
        GlodaMsgIndexer._reindexChangedMessages([aMsgHdr], true);
      };
      this.queryMessage(msgID, callback);
    }
  },

  onError: function() {},

  onPropertyChanged: function() {},

  onPropertyDeleting: function() {},
};
