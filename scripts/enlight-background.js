/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Paths.
 */
var gHLJSPath      = "highlightjs/highlight.pack.js";
var gContentScript = "scripts/enlight-content.js";
var gLanguagePath  = "popup/languages-list_all.json";

/*
 * List of supported languages (for display in button label).
 */
var gLanguageList = {};

/*
 * Current page status: highlighted, or not.
 */
var isHighlighted = false;

/*
 * Options, hardcoded for now.
 */
var options = {
  hlstyle: "solarized-dark.css",
  autohl: false,
  linenumbers: false,
};

/*
 * Callback.
 */
function onError(error) {
  console.error("[enlight]: Error:", error);
}

/*
 * Reload one option from storage.
 */
function reloadOption(aId, aDefault) {
  let gettingItem = browser.storage.local.get(aId);
  return gettingItem.then((res) => {
    if (res[aId] != undefined)
      options[aId] = res[aId];
  }, onError);
}

/*
 * Update button tooltip label ("title").
 */
function updateTitle(aLanguageId) {
  if (aLanguageId)
    browser.browserAction.setTitle({
      title: "Enlight [" + gLanguageList[aLanguageId] + "]"
    });
  else
    browser.browserAction.setTitle({title: "Enlight"});
}

/*
 * Actually trigger syntax highlighting by injecting content scripts.
 */
function doHighlight(aLanguageId) {
  browser.tabs.executeScript({
    file: gHLJSPath
  }).then(() => {
    browser.tabs.executeScript({
      code:
        "window.enlightContentScriptOptions = {" +
        "  language: '" + aLanguageId + "'," +
        "  lineNumbers: " + options.linenumbers +
        "};"
    }).then(() => {
      browser.tabs.executeScript({
        file: gContentScript
      }).then(() => {
        if (aLanguageId == "undo")
          return browser.tabs.removeCSS({
            file: "/highlightjs/styles/" + options.hlstyle
          });
        else
          return browser.tabs.insertCSS({
            file: "/highlightjs/styles/" + options.hlstyle
          });
      });
    });
  });
}

/*
 * Listener. Communicate with popup.
 */
function popupListener(aMsg, aSender, aSendResponse) {
  if (aMsg.languageId) {
    console.debug("[enlight] Required language:", aMsg.languageId);
    doHighlight(aMsg.languageId);
    isHighlighted = true;
    updateTitle(aMsg.languageId);
  } else if (aMsg.shouldOpenPopup) {
    aSendResponse({shouldOpen: !isHighlighted});
    if (isHighlighted) {
      doHighlight("undo");
      isHighlighted = false;
      updateTitle();
    }
  }
}

/*
 * Injected script. Check page contents, for auto-highlighting.
 */
function checkBody() {
  let port = browser.runtime.connect({name:"checkBodyPort"});
  if (
    document.body &&
    document.body.childNodes.length == 1 &&
    document.body.firstChild.nodeName == "PRE" &&
    document.location.toString()
      .slice(0,"view-source:".length) != "view-source:"
  )
    port.postMessage({isCodeBlock: true});
  else
    port.postMessage({isCodeBlock: false});
  port.disconnect();
}

/*
 * Listen to injected script to see if it detects a code block in the page.
 */
function checkBodyListener(p) {
  switch (p.name) {
    case "checkBodyPort":
      p.onMessage.addListener((m) => {
        console.debug("[enlight] Do we detect a code block?", m.isCodeBlock);
        doHighlight("auto");
        isHighlighted = true;
      });
      break;
    case "detectedLanguage":
      p.onMessage.addListener((m) => {
        console.debug("[enlight] Content script detected language:",
          m.language);
        updateTitle(m.language);
      });
      break;
    default: {};
  }
}

/*
 * Listener. If auto-highlighting is selected, highlight all raw text pages.
 */
function tabUpdateListener(aTabId, aChangeInfo, aTabInfo) {
  if (!aChangeInfo.url)
    return;
  /*
   * Auto-highlight!
   */
  browser.tabs.executeScript({
    code: "(" + checkBody.toString() + ")()"
  });
}

/*
 * Parse JSON list of languages so that we can display the name of detected
 * languages in button label.
 */
function loadJSON(aCallback) {
    var xobj = new XMLHttpRequest();
    xobj.overrideMimeType("application/json");
    xobj.open("GET", gLanguagePath, true);
    xobj.onreadystatechange = function () {
        if (xobj.readyState == 4 && xobj.status == "200") {
            aCallback(xobj.responseText);
        }
    };
    xobj.send(null);
}

/*
 * Callback.
 */
function parseResponse(aResponse) {
  gLanguageList = JSON.parse(aResponse);
}

/*
 * Load all options, and set up auto-highlighting if required.
 */
function init() {
  if (options.autohl) {
    browser.runtime.onConnect.removeListener(checkBodyListener);
    browser.tabs.onUpdated.removeListener(tabUpdateListener);
  }

  reloadOption("autohl")
    .then(reloadOption("linenumbers"))
    .then(reloadOption("hlstyle"))
    .then(() => {
      if (options.autohl) {
        browser.runtime.onConnect.addListener(checkBodyListener);
        browser.tabs.onUpdated.addListener(tabUpdateListener);
      }
    });
}

/*
 * Perform these operations at add-on start-up:
 */

browser.runtime.onMessage.addListener(popupListener);

browser.storage.onChanged.addListener(init);
init();

loadJSON(parseResponse);
