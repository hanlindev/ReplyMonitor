/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
Components.utils.import("resource://replymanager/modules/replyManagerUtils.jsm");
Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource:///modules/gloda/indexer.js");

function onLoad() {
  // We need both ReplyManager and Gloda indexer enabled to make this feature work.
  let enabled = cal.getPrefSafe("extensions.replymanager.enabled") &
                GlodaIndexer.enabled;
  let replymanagerhbox = document.getElementById("replymanager-hbox");
  if (enabled) {
    replymanagerhbox.collapsed = false;
    gMsgCompose.addMsgSendListener(replyManagerSendListener);
    // The background color of the minimonth-header element is not applied. Removing the class
    // of the minimonth header and then reset it to the original value can get the color back.
    // First get the minimonth element and its header
    let datepicker = document.getElementById("reminder-date");
    let nodeList = document.getAnonymousNodes(datepicker);
    const nodeListLevel = 3;
    for (let i = 0; i < nodeListLevel; ++i) {
      // we need to do this three times to reach the minimonth box
      nodeList = nodeList[0].childNodes;
    }
    let mmheader = document.getAnonymousElementByAttribute(nodeList[0], "anonid", "minimonth-header");
    // Then set the class
    mmheader.setAttribute("class", null);
    mmheader.setAttribute("class", "minimonth-month-box");
  } else {
    replymanagerhbox.collapsed = true;
  }
}

function onUnload() {
  gMsgCompose.removeMsgSendListener(replyManagerSendListener);
}

/**
 * We need to listen for the onStopSending event to get the ID of the message for
 * use in the replyManagerComposeStateListener that will check if the user wants
 * to mark this message.
 */
var replyManagerSendListener = {
  onStartSending: function (aMsgID, aMsgSize) {},
  onProgress: function (aMsgID, aProgress, aProgressMax) {},
  onStatus: function (aMsgID, aMsg) {},
  onStopSending: function (aMsgID, aStatus, aMsg, aReturnFile) {
    // aMsgID starts with a < and ends with a >. Take the substring to strip the brackets.
    let newMsgID = aMsgID.substring(1, aMsgID.length - 1);
    let aComposeStateListener = new replyManagerComposeStateListener(newMsgID);
    gMsgCompose.RegisterStateListener(aComposeStateListener);
  },
  onGetDraftFolderURI: function (aFolderURI) {},
  onSendNotPerformed: function (aMsgID, aStatus) {},
};


/**
 * reply manager compose state listener
 * In order to communicate with the send listener, instead of using a single
 * listener object, each time the send listener gets notified, a new compse
 * state listener instance is created. And now no global is needed.
 */
function replyManagerComposeStateListener(aMsgID) {
  this.msgID = aMsgID;
}
replyManagerComposeStateListener.prototype = {
  // This is the ID of the saved message
  msgID: null,

  NotifyComposeFieldsReady: function() {},

  NotifyComposeBodyReady: function() {},

  ComposeProcessDone: function(aResult) {
    let folder = MailUtils.getFolderForURI(gMsgCompose.savedFolderURI);
    let msgDB = folder.msgDatabase;
    let savedMsgHdr = msgDB.getMsgHdrForMessageID(this.msgID);
    let toggle = document.getElementById("other-elements-toggle").checked;
    let aDate = document.getElementById("reminder-date").value;
    // the toISOString method is ignoring timezone offsets so we can't take
    // the substring from it. We can only manually generate the date string.
    let intDate = aDate.getDate();
    let intMonth = aDate.getMonth() + 1;
    let date = (intDate < 10) ? "0" + intDate : "" + intDate;
    let month = (intMonth < 10) ? "0" + intMonth : "" + intMonth;
    let dateStr = aDate.getFullYear() + "-" + month + "-" + date;
    if (savedMsgHdr != null && toggle) {
      ReplyManagerUtils.setExpectReplyForHdr(savedMsgHdr, dateStr);
    }
    gMsgCompose.UnregisterStateListener(this);
  },

  SaveInFolderDone: function(folderURI) {}
};

function toggleOtherReplyManagerElements()
{
  let toggle = document.getElementById("other-elements-toggle");
  if (toggle.checked)
    toggle.setAttribute("class", "expectReplyChecked");
  else
    toggle.setAttribute("class", "expectReplyUnchecked");
  let datePicker = document.getElementById("reminder-date");
  datePicker.disabled = !toggle.checked;
}

document.getElementById("msgcomposeWindow").addEventListener("compose-window-init", onLoad);
document.getElementById("msgcomposeWindow").addEventListener("compose-window-close", onUnload);
