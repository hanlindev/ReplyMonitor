/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
Components.utils.import("resource://replymanager/modules/replyManagerUtils.jsm");
Components.utils.import("resource://replymanager/modules/replyManagerCalendar.jsm");
Components.utils.import("resource://replymanager/modules/calUtils.jsm");
Components.utils.import("resource:///modules/gloda/public.js");
Components.utils.import("resource:///modules/gloda/indexer.js");
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource:///modules/Services.jsm");

function onLoad() {
  let replyManagerMenu = document.getElementById("replyManagerMailContextMenu");
  let replyManagerMessageMenu = document.getElementById("replyManagerMessageMenu");
  let enabled = cal.getPrefSafe("extensions.replymanager.enabled", false);
  replyManagerMenu.hidden = !enabled;
  replyManagerMessageMenu.hidden = !enabled;

  //initialize the ReplyManagerCalendar module
  ReplyManagerCalendar.initCalendar();
  replyManagerMailListener.init();
  replyManagerTabOpener.init();

  //If no email is selected the ReplyManager menu should be hidden
  document.getElementById("mailContext")
          .addEventListener("popupshowing", function() {
    replyManagerMenu.hidden = ((gFolderDisplay.selectedMessage == null) |
     !cal.getPrefSafe("extensions.replymanager.enabled", false) |
     !GlodaIndexer.enabled);
  });

  //Add a similar event listener to the Message menu
  document.getElementById("messageMenuPopup")
          .addEventListener("popupshowing", function() {
    replyManagerMessageMenu.hidden = (!cal.getPrefSafe("extensions.replymanager.enabled", false) |
      !GlodaIndexer.enabled);
    // The ReplyManager menu in the message menu is not hidden when no message
    // is selected but disabled instead
    replyManagerMessageMenu.setAttribute("disabled", gFolderDisplay.selectedMessage == null);
  });

  updateToolbarButtons(gFolderDisplay.selectedMessage);
}

var replyManagerMailWindowListener = {
  onStartHeaders: function() {
    updateToolbarButtons(gFolderDisplay.selectedMessage);
  },
  onEndHeaders: function() {},
  onEndAttachments: function() {},
  onBeforeShowHeaderPane: function() {},
};
gMessageListeners.push(replyManagerMailWindowListener);

// Hide/Show the toolbarbuttons when the "reply manager enabled" preference is toggled.
var replyManagerMailWindowPrefListener = {
  onLoad: function() {
    Services.prefs.addObserver("extensions.replymanager.enabled", this, false);
  },
  
  observe: function(subject, topic, data) {
    if (topic != "nsPref:changed") {
      return;
    }

    switch(data)
    {
      case "extensions.replymanager.enabled":
        updateToolbarButtons(gFolderDisplay.selectedMessage);
        break;
    }
  }
};
replyManagerMailWindowPrefListener.onLoad();
//--------------------mailContext menu section----------------------------
/**
 * startComposeReminder opens the message compose window with some fields filled
 * with some boilerplates.
 */
function startComposeReminder() {
  let msgHdr = gFolderDisplay.selectedMessage;
  ReplyManagerUtils.startReminderComposeForHdr(msgHdr);
}

/**
 * deployMenuitems sets the state of some menuitems in the reply manager popup
 * before the popup shows.
 */
function onReplyManagerPopupShowing(elementId) {
  let msgHdr = gFolderDisplay.selectedMessage;
  let checkboxId = (elementId == "replyManagerMessageMenupopup") ?
                   "messageExpectReplyCheckbox"
                 : "expectReplyCheckbox";
  let expectReplyCheckbox = document.getElementById(checkboxId);
  // Somehow disabling the menuitem directly doesn't work so I disable the
  // associated command instead.
  let modifyCommand = document.getElementById("cmd_modifyExpectReply");
  if (ReplyManagerUtils.isHdrExpectReply(msgHdr)) {
    expectReplyCheckbox.setAttribute("checked", "true");
    modifyCommand.setAttribute("disabled", "false");
  } else {
    expectReplyCheckbox.setAttribute("checked", "false");
    modifyCommand.setAttribute("disabled", "true");
  }
  return true;
}

/**
 * toggleExpectReplyCheck box is invoked when the user click the
 * "Expect Reply" checkbox in the menupopup. It will toggle the
 * ExpectReply state of the selected message.
 */
function toggleExpectReplyCheckbox(elementId) {
  let checkbox = document.getElementById(elementId);
  let msgHdr = gFolderDisplay.selectedMessage;
  // Since we are going to change the property of the email, we
  // need to reflect this change to the header view pane. Thus
  // hdrViewDeployItems is called in order to make this change.
  if (checkbox.getAttribute("checked") == "true") {
    ReplyManagerUtils.resetExpectReplyForHdr(msgHdr);
    replyManagerHdrViewWidget.hdrViewDeployItems();
    updateToolbarButtons(msgHdr);
  } else if (checkbox.getAttribute("checked") == "false") {
    let params = {
      inMsgHdr: msgHdr,
      outDate: null
    };
    window.openDialog("chrome://replymanager/content/replyManagerDateDialog.xul",
                      "replyManagerDateDialog",
                      "chrome, dialog, modal", params);
    if (params.outDate) {
      ReplyManagerUtils.setExpectReplyForHdr(msgHdr, params.outDate);
      // update the hdr view pane
      replyManagerHdrViewWidget.hdrViewDeployItems();
      updateToolbarButtons(msgHdr);
    }
  }
}

/**
 * modifyExpectReply is called when the user clicks the "Change Deadline" menuitem
 */
function modifyExpectReply() {
  let msgHdr = gFolderDisplay.selectedMessage;
  let params = {
    inMsgHdr: msgHdr,
    outDate: null
  }
  window.openDialog("chrome://replymanager/content/replyManagerDateDialog.xul", "",
                    "chrome, dialog, modal", params);
  if (params.outDate) {
    ReplyManagerUtils.updateExpectReplyForHdr(msgHdr, params.outDate);
    //update the hdr view pane
    replyManagerHdrViewWidget.hdrViewDeployItems();
  }
}

/**
 * Listener for new messages and message delete operation.
 * Some emails are associated with calendar events so the
 * the addition and removal of such messages should be
 * watched for so that the calendar event is up to date.
 */
var replyManagerMailListener = {
  // This is used for receiving the "itemAdded" event notification.
  collections: {},

  init: function() {
    MailServices.mfn.addListener(this, MailServices.mfn.msgAdded |
                                       MailServices.mfn.msgsDeleted);
  },

  checkMessage: function(aGlodaMsg) {
    aGlodaMsg.conversation.getMessagesCollection({
      onItemsAdded: function() {},
      onItemsModified: function() {},
      onItemsRemoved: function() {},
      onQueryCompleted: function(aCollection) {
        for each (let [i, msg] in Iterator(aCollection.items)) {
          if (ReplyManagerUtils.isHdrExpectReply(msg.folderMessage)) {
            // Update the calendar event
            ReplyManagerUtils.updateExpectReplyForHdr(msg.folderMessage);
          }
        }
        // We no longer need to watch for this Gloda message so
        // remove the collection for this message from the container.
        delete replyManagerMailListener.collections[aGlodaMsg._headerMessageID];
      }
    });
  },

  msgAdded: function (aMsgHdr) {
    // When the message is just added to the DB, the Gloda message is
    // not immediately available so we need to listen for the "itemAdded"
    // event when the message gets indexed.
    replyManagerMailListener.collections[aMsgHdr.messageId] =
    Gloda.getMessageCollectionForHeader(aMsgHdr, {
      onItemsAdded: function(aItems, aCollection) {
        if (aItems.length > 0) {
          replyManagerMailListener.checkMessage(aItems[0]);
        }
      },
      onItemsModified: function() {},
      onItemsRemoved: function() {},
      onQueryCompleted: function() {}
    });
  },

  msgsDeleted: function(aItems) {
    let mailEnumerator = aItems.enumerate();
    while (mailEnumerator.hasMoreElements()) {
      let msg = mailEnumerator.getNext()
                              .QueryInterface(Components.interfaces.nsIMsgDBHdr);
      if (msg instanceof Components.interfaces.nsIMsgDBHdr &&
          ReplyManagerUtils.isHdrExpectReply(msg)) {
        ReplyManagerUtils.resetExpectReplyForHdr(msg);
      }
    }
  }
};

//----------------------------ToolbarButton Section---------------------
function updateToolbarButtons(aMsgHdr) {
  let replyManagerEnabled = cal.getPrefSafe("extensions.replymanager.enabled");
  let strings = new StringBundle("chrome://replymanager/locale/replyManager.properties");
  let markButton = document.getElementById("markExpectReplyButton");
  let modifyButton = document.getElementById("modifyDeadlineButton");
  let viewButton = document.getElementById("viewAllMarkedMessagesButton");
  
  // If the user has not moved any of these toolbar buttons out of the storage, we won't need
  // to update them so break from here.
  if (markButton == null) {
    return;
  }
  
  markButton.collapsed = !replyManagerEnabled;
  modifyButton.collapsed = !replyManagerEnabled;
  viewButton.collapsed = !replyManagerEnabled;
  
  if (aMsgHdr &&
      cal.getPrefSafe("extensions.replymanager.enabled", false) &&
      GlodaIndexer.enabled) {
    if (ReplyManagerUtils.isHdrExpectReply(aMsgHdr)) {
      // This message is marked, we need to set the icon and label of the
      // "markExpectReplyButton" to the "Unmark" theme. and disable deadline
      // modification
      if (markButton) {
        markButton.setAttribute("label", strings.getString("unmarkExpectReplyLabel"));
        markButton.setAttribute("class", "unmarkExpectReplyButton");
        markButton.setAttribute("disabled", "false");
      }
      if (modifyButton)
        modifyButton.setAttribute("disabled", "false");
    } else {
      if (markButton) {
        markButton.setAttribute("label", strings.getString("markExpectReplyLabel"));
        markButton.setAttribute("class", "markExpectReplyButton");
        markButton.setAttribute("disabled", "false");
      }
      if (modifyButton)
        modifyButton.setAttribute("disabled", "true");
    }
  } else {
    // No message is selected, for simplicity we set the "markExpectReplyButton" to
    // the "Mark" theme and then disable it.
    if (markButton) {
      markButton.setAttribute("label", strings.getString("markExpectReplyLabel"));
      markButton.setAttribute("class", "markExpectReplyButton");
      markButton.setAttribute("disabled", "true");
    }
    if (modifyButton)
      modifyButton.setAttribute("disabled", "true");
  }
}

function toolbarMarkExpectReply() {
  let msgHdr = gFolderDisplay.selectedMessage;
  if (msgHdr != null && ReplyManagerUtils.isHdrExpectReply(msgHdr)) {
    ReplyManagerUtils.resetExpectReplyForHdr(msgHdr);
    replyManagerHdrViewWidget.hdrViewDeployItems();
    updateToolbarButtons(msgHdr);
  } else {
    let params = {
      inMsgHdr: msgHdr,
      outDate: null
    };
    window.openDialog("chrome://replymanager/content/replyManagerDateDialog.xul",
                      "replyManagerDateDialog",
                      "chrome, dialog, modal", params);
    if (params.outDate) {
      ReplyManagerUtils.setExpectReplyForHdr(msgHdr, params.outDate);
      // update the hdr view pane
      replyManagerHdrViewWidget.hdrViewDeployItems();
      updateToolbarButtons(msgHdr);
    }
  }
}

//---------------------Misc Section-----------------------------------

var replyManagerTabOpener = {
  strings: null,

  init: function() {
    this.strings = new StringBundle("chrome://replymanager/locale/replyManager.properties");
  },

  openTab: function() {
    let query = Gloda.newQuery(Gloda.NOUN_MESSAGE);
    query.isExpectReply(true);
    let tabTitle = this.strings.getString("replyManagerMailTabTitle");
    let queryCollection = query.getCollection({
      onItemsAdded: function() {},
      onItemsRemoved: function() {},
      onItemsModified: function() {},
      onQueryCompleted: function(aCollection) {
        let tabmail = document.getElementById("tabmail");
        tabmail.openTab("glodaList", {
          collection: queryCollection,
          message: aCollection.items[0],
          title: tabTitle,
          background: false
        });
      },
    });
  },
};

window.addEventListener("load", onLoad);
