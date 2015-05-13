/* vim: se ts=8 sts=2 et sw=2 tw=80 cc=80: */

var self     = require("sdk/self");
var buttons  = require('sdk/ui/button/toggle');
var tabs     = require("sdk/tabs");
var panels   = require("sdk/panel");
var spref    = require('sdk/simple-prefs');
var xhr      = require("sdk/net/xhr");
var _        = require("sdk/l10n").get; // Localization

/*
 * Directory for highlight.js code (under data/)
 */
var gHJSPath   = "highlightjs";
var gHJSScript = "highlight.min.js"

/*
 * List of supported languages (for display in button label)
 */
var gLanguagePath = "languages.json"
var gLanguageList = {};

/*
 * Icon sets for toggle button
 */
var gIconInit;
var gIconOff;
var gIconOn;

function setIcons () {
  var invert = spref.prefs["invert"] ? ".invert" : "";
  gIconInit = { // actually links towards ./lightbulb_off-xx(.invert)?.png
    "16": "./lightbulb_init-16" + invert + ".png",
    "32": "./lightbulb_init-32.png",
    "64": "./lightbulb_init-64.png"
  };
  gIconOff = {
    "16": "./lightbulb_off-16" + invert + ".png",
    "32": "./lightbulb_off-32.png",
    "64": "./lightbulb_off-64.png"
  };
  gIconOn = {
    "16": "./lightbulb_on-16" + invert + ".png",
    "32": "./lightbulb_on-32.png",
    "64": "./lightbulb_on-64.png"
  };
}
setIcons();

/*
 * Update preferences
 */
spref.on("", onPrefChange);
function onPrefChange(aPref) {
  switch (aPref) {
    case "invert":
      setIcons();
      button.icon = gIconInit;
      break;
    default:
      break;
  }
}

/*
 * Toggle button
 */
var button = buttons.ToggleButton({
  id      : "Highlighter",
  label   : _("button_label"),
  icon    : gIconInit,
  onClick : handleClick
});

/*
 * Language selection panel
 */
function panelSelect() {
  window.addEventListener('click', function(event) {
    let t = event.target;
    if (t.nodeName == 'DIV') {
      self.port.emit('click-lang', t.getAttribute('id'));
    }
  }, false);
}

var panel = panels.Panel({
  contentURL    : self.data.url("panel.html"),
  contentScript : "(" + panelSelect.toString() + ")()",
  onHide        : function() {
    if (panel.languageId == "" || panel.languageId == undefined) {
      button.state("tab", {"icon" : gIconOff, "checked" : false,
                   "label" : _("button_label")});
    }
  }
});

panel.port.on("click-lang", function(languageId) {
  panel.languageId = languageId;
  panel.hide();
  doHighlight(languageId);
});

/*
 * Auto-highlight source code pages
 * condition: document.body has single <pre></pre> child node
 */
function checkBody() {
  if (document.body && document.body.childNodes.length &&
      document.body.firstChild.nodeName == "PRE") {
    self.port.emit('isCodeBlock');
  }
};
(function setAutoHighlight() {
  tabs.on("ready", function(aTab) {
    if (spref.prefs["autohl"]) {
      let worker = aTab.attach({
        contentScript: "(" + checkBody.toString() + ")()",
      });
      worker.port.on("isCodeBlock", function() {
        button.state("tab", {"icon" : gIconOn, "checked" : true});
        doHighlight("", aTab);
      });
    }
  });
})();

/*
 * Callbacks
 */
function handleClick(state) {
  /*
   * Classic behavior (window-wise) would be:
   *    // checked is false: clicking a first time set it to true
   *    if (checked)      // i.e. we just clicked an odd time
   *      do highlight
   *    else              // we just clicked an even time
   *      undo highlight
   *    fi
   * But here we toggle tab-wise, so we need to check "manually".
   *
   * Also first time we click tab.checked is false, click does not set it to
   * true. Hence we need a way to know if it's the first time for this tab:
   * here we change the icon path (actually is a link to same PNG file).
   */
  button.state("window", {"checked" : false});
  if (button.state("tab").icon["16"] == gIconInit["16"]) {
    button.state("tab", {"icon" : gIconOn, "checked" : false});
  }

  if (!button.state("tab").checked) {
    button.state("tab", {"icon" : gIconOn, "checked" : true});
    panel.languageId = "";
    panel.show({
      position: button
    });
  }
  else {
    button.state("tab", {"icon" : gIconOff, "checked" : false,
                 "label" : _("button_label")});
    undoHighlight();
  }
}

function doHighlight(aLanguageId, aTab=tabs.activeTab) {
  console.debug(_("log_highlight", aLanguageId, spref.prefs["style"]));

  let worker = aTab.attach({
    contentScriptOptions: {
      "stylesheet"  : self.data.url(gHJSPath + "/styles/" +
                      spref.prefs["style"] + ".css"),
      "bgColor"     : spref.prefs["bgColor"],
      "language"    : aLanguageId,
      "lineNumbers" : spref.prefs["lineNumbers"]
    },
    contentScriptFile: [
      self.data.url(gHJSPath + "/" + gHJSScript),
      self.data.url("enlightscript.js")
    ]
  });

  worker.port.on("toggle_off", function(reason) {
    /*
     * For some reason document content is not highlighted.
     * Need to toggle button off.
     */
    if (!button.state("tab").checked) {
      return;
    }
    let logToggleOffReason = _("log_toff_r" + reason);
    console.debug(_("log_toggleoff", logToggleOffReason));
    button.state("tab", {"icon" : gIconOff, "checked" : false,
                 "label" : _("button_label")});
  });

  /*
   * Add language ID to button's label if we know it
   */
  if (aLanguageId && aLanguageId != "auto") {
    button.state("tab", {"icon" : gIconOn, "checked" : true,
                 "label" : _("button_label") +
                   " [" + gLanguageList[aLanguageId] + "]"});
  }
  else {
    worker.port.on("detected_language", function(aId) {
      /*
       * We launched language auto-detection, and content script is telling us
       * what language was detected: update button label
       */
      button.state("tab", {"icon" : gIconOn, "checked" : true,
                   "label" : _("button_label") +
                     " [" + gLanguageList[aId] + "]"});
    });
  }

  aTab.on("ready", function () {
    /*
     * Content document has been changed/reloaded.
     * Need to toggle button off.
     */
    if (!button.state("tab").checked) {
      return;
    }
    console.debug(_("log_toggleoff", "log_toff_r2"));
    button.state("tab", {"icon" : gIconOff, "checked" : false});
    aTab.on("ready", function () {});
  });
}

function undoHighlight() {
  console.debug(_("log_undo"));
  tabs.activeTab.attach({
    contentScriptFile: [
      self.data.url("enlightscript.js")
    ]
  });
}

/*
 * Functions used to parse JSON list of languages (so that we can display name
 * of detected language in button label)
 */
function loadJSON(aCallback) {
  var xobj = new xhr.XMLHttpRequest();
  xobj.overrideMimeType("application/json");
  xobj.open('GET', self.data.url(gLanguagePath), true);
  xobj.onreadystatechange = function () {
    if (xobj.readyState == 4 && xobj.status == "200") {
      aCallback(xobj.responseText);
    }
  };
  xobj.send(null);
}

function parseResponse(aResponse) {
  gLanguageList = JSON.parse(aResponse);
}

loadJSON(parseResponse);

/*
 * Exports for unit tests
 */
exports.button      = button;
exports.panel       = panel;
exports.doHighlight = doHighlight;