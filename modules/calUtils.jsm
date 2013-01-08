/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* My initial objective is to integrate this feature into Lightning so I didn't
 * add check when Lightning's moduels are used. However now as a standalone
 * addon I can't ignore the case when Lightning isn't installed. In order to
 * avoid modifying too much code, this module that partially implements calUtils
 * functions is added.
 */

let EXPORTED_SYMBOLS = ["cal"];

const Cu = Components.utils;
const Cc = Components.classes;
const Ci = Components.interfaces;

var cal = {
  /**
   * This is not exactly the same getPrefSafe method as that implemented by
   * Lightning's calUtils but it's safe to do that here.
   */
  getPrefSafe: function(prefName) {
    let prefBranch = Cc["@mozilla.org/preferences-service;1"]
	  .getService(Ci.nsIPrefBranch);
	let prefType = prefBranch.getPrefType(prefName);
	switch(prefType) {
	  case prefBranch.PREF_STRING:
	    return prefBranch.getCharPref(prefName);
	  case prefBranch.PREF_INT:
	    return prefBranch.getIntPref(prefName);
	  case prefBranch.PREF_BOOL:
	    return prefBranch.getBoolPref(prefName);
	}
  },
};