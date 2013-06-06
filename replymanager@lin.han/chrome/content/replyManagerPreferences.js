/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
Components.utils.import("resource://replymanager/modules/replyManagerUtils.jsm");

/**
 * Global Object to hold methods for the Reply Manager pref pane
 */
var gReplyManagerPane = {
  enableReplyManagerCheckbox: null,

  enableCreateCalendarEventCheckbox: null,

  enableIncludeCCCheckbox: null,

  enableIncludeBCCCheckbox: null,

  reminderBoilerplateTextbox: null,

  /**
   * Initialize the Reply Manager pref pane. Sets up dialog controls
   * to show the categories saved in preferences.
   */
  init: function() {
    this.enableReplyManagerCheckbox =
      document.getElementById("enableReplyManagerCheckbox");
  	this.enableReplyManagerCheckbox.checked =
  	  cal.getPrefSafe("extensions.replymanager.enabled", true);
    
    this.enableCreateCalendarEventCheckbox =
      document.getElementById("toggleReplyManagerCreateEvent");
  	this.enableCreateCalendarEventCheckbox.checked =
  	  cal.getPrefSafe("extensions.replymanager.create_calendar_event_enabled", true);
    
    this.enableIncludeCCCheckbox =
      document.getElementById("toggleReplyManagerIncludeCC");
    this.enableIncludeCCCheckbox.checked =
      cal.getPrefSafe("extensions.replymanager.includecc", true);

    this.enableIncludeBCCCheckbox =
      document.getElementById("toggleReplyManagerIncludeBCC");
    this.enableIncludeBCCCheckbox.checked =
      cal.getPrefSafe("extensions.replymanager.includebcc", true);

    this.reminderBoilerplateTextbox =
      document.getElementById("reminderBoilerplateTextbox");
  	this.reminderBoilerplateTextbox.value = 
  	  cal.getPrefSafe("extensions.replymanager.boilerplate", "");
      this.enableElements(this.enableReplyManagerCheckbox.checked);
  },

  toggleReplyManagerEnabled: function() {
    this.enableElements(this.enableReplyManagerCheckbox.checked);
  },

  CcBccChanged: function() {
    ReplyManagerUtils.CcBccChanged = true;
  },

  enableElements: function(aEnabled) {
    this.enableCreateCalendarEventCheckbox.disabled = !aEnabled;
    this.reminderBoilerplateTextbox.disabled = !aEnabled;
  }
};
