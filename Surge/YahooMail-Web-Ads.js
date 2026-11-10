/* Yahoo Mail web response rewrite, 2026-11-10.
 * Local Surge script. No network requests, logs, or account entitlement edits.
 */
(function () {
  "use strict";
  const switches = [
    "ads", "firstPartyAdsEnabled", "taboola", "taboolaServerPrefetch",
    "lrecMonAdArbitration", "footerAd", "pencilAd", "secondPencilAd",
    "thirdPencilAd", "infinitePencilAd", "msgReadPencilAd",
    "emptyFolderDisplayAd", "emptyFolderLeaderboardWithRightRailDisplayAd",
    "emptyFolderDisplayAdInAdditionalSmartViews", "gamAdsInAttachmentsView",
    "sendConfirmationAd", "settingsOverlayAd", "leaderboardToReplacePencil",
    "leaderboardToReplaceThirdPencilOnward", "gamAdStackingV2"
  ];
  function objectEnd(text, start) {
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) return i + 1;
    }
    return -1;
  }
  function configObjectStart(text, start, end) {
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < end; i++) {
      const c = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') {
        if (depth === 1) {
          const match = /^"config"\s*:\s*\{/.exec(text.slice(i, end));
          if (match) return i + match[0].lastIndexOf("{");
        }
        quoted = true;
      } else if (c === "{") depth++;
      else if (c === "}") depth--;
    }
    return -1;
  }
  try {
    const original = $response.body;
    if (typeof original !== "string" || !original.includes("root.AppBootstrapData")) {
      $done({}); return;
    }
    let changed = false;
    let body = original.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi,
      function (whole, opening, source, closing) {
        const marker = /\broot\.AppBootstrapData\s*=\s*\{/.exec(source);
        if (!marker) return whole;
        const begin = marker.index + marker[0].lastIndexOf("{");
        const end = objectEnd(source, begin);
        if (end < 0) return whole;
        // Parse only the config object. The outer JS object contains undefined.
        const configStart = configObjectStart(source, begin, end);
        if (configStart < 0) return whole;
        const configEnd = objectEnd(source, configStart);
        if (configEnd < 0 || configEnd > end) return whole;
        let config;
        try { config = JSON.parse(source.slice(configStart, configEnd)); }
        catch (_) { return whole; }
        for (const key of switches) {
          if (Object.prototype.hasOwnProperty.call(config, key) && typeof config[key] === "boolean") {
            config[key] = false;
          }
        }
        const json = JSON.stringify(config).replace(/</g, "\\u003c");
        const rewritten = source.slice(0, configStart) + json + source.slice(configEnd);
        changed = true;
        return opening + rewritten + closing;
      });
    if (!changed) { $done({}); return; }
    // Only observed advertising wrappers; preserve sidebar tools and message rows.
    // If inline styles are disallowed by the page CSP, the config rewrite still works.
    if (!body.includes('id="yahoo-mail-web-ad-css"')) {
      const css = '<style id="yahoo-mail-web-ad-css">' +
        '#right-rail-container div:has(>div>div>iframe[src^="https://gpt.mail.yahoo.net/c/sandbox"]){display:none!important}' +
        '[data-test-id="virtual-list-container"] div:has(>a[role="listitem"][href^="https://api.taboola.com/2.0/json/yahoo-mail/recommendations.notify-click"]){display:none!important}' +
        '</style>';
      body = body.replace(/<\/head\s*>/i, css + "$&");
    }
    $done({ body });
  } catch (_) { $done({}); }
})();
