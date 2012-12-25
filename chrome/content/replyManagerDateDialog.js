/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://replymanager/modules/replyManagerUtils.jsm");

/**
 * If the message is expecting replies we need to set the datepicker
 * the value of the expect reply date for convenience.
 */
function onLoad() {
  // The background color of the minimonth-header element is not applied. Removing the class
  // of the minimonth header and then reset it to the original value can get the color back.
  let minimonth = document.getElementById("replyManagerDatePicker");
  let mmheader = document.getAnonymousElementByAttribute(minimonth, "anonid", "minimonth-header");
  mmheader.setAttribute("class", null);
  mmheader.setAttribute("class", "minimonth-month-box");

  let header = window.arguments[0].inMsgHdr;
  if (ReplyManagerUtils.isHdrExpectReply(header)) {
    let datepicker = document.getElementById("replyManagerDatePicker");
    let aDate = new Date(header.getStringProperty("ExpectReplyDate"));
    datepicker.mValue = aDate;
    datepicker.showMonth(aDate);
  }
}

function doOK() {
  let params = window.arguments[0];
  let aDate = document.getElementById("replyManagerDatePicker").value;
  // This substring has the format YYYY-MM-DD
  params.outDate = aDate.toISOString().substr(0, 10);
  return true;
}

function doCancel() {
  return true;
}
