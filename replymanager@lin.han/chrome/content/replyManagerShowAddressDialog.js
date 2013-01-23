/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function onLoad() {
  let addressList = window.arguments[0].inAddressList;
  let richlist = document.getElementById("replyManagerAddressRichlist");
  addressList.forEach(function(address) {
    richlist.appendItem(address);
  });
}

function doOK() {
  window.arguments[0].outSendReminder = true;
  return true;
}

function doCancel() {
  window.arguments[0].outSendReminder = false;
  return true;
}
