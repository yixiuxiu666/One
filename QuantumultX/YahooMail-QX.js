/* Yahoo Mail App + Web for Quantumult X, v1.0.0 / 2026-11-10.
 * Converted from YahooMail-App-Web.sgmodule v3.0.1.
 * No network requests, logs, persistent storage, or entitlement edits.
 * Web rewriting preserves the original Surge implementation.
 */
(function () {
  "use strict";
  const appSwitches = [
    "adPlaceholderView", "mailTineAds", "topPencilAd", "secondPencilAd",
    "topPencilAdUsingTaboolaApi", "secondPencilAdUsingTaboolaApi",
    "mobileLeaderboard", "infiniteMobileLeaderboard",
    "infiniteMobileLeaderboardInMailTine", "infiniteMobileLeaderboardOnIpad",
    "nativeAdsEnabled", "geminiAdsInAllFoldersEnabled", "smAdManagerEnabled",
    "sponsored_moments_ad_enabled", "enableGraphicalAdsPrefetch", "mobileLeaderboardPrefetch"
  ];
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  function zeroNumbers(value) {
    if (typeof value === "number") return 0;
    if (Array.isArray(value)) return value.map(zeroNumbers);
    if (isObject(value)) {
      for (const key of Object.keys(value)) value[key] = zeroNumbers(value[key]);
    }
    return value;
  }
  function rewriteApp(original, url) {
    const configMatch = /^https:\/\/config\.mobile\.yahoo\.com\/V3\/getconfig(?:\?|$)/.test(url);
    const taboolaMatch = /^https:\/\/api\.taboola\.com\/2\.0\/json\/yahoo-ios-mail\/recommendations\.get(?:\?|$)/.test(url);
    if (!configMatch && !taboolaMatch) return null;
    const data = JSON.parse(original);
    if (!isObject(data)) return null;
    if (configMatch) {
      if (data.doctype !== "YMConfig" || !isObject(data.feature)) return null;
      const domain = data.feature["com.yahoo.MailSDK.domain"];
      if (!isObject(domain)) return null;
      for (const key of appSwitches) {
        if (hasOwn(domain, key)) domain[key] = zeroNumbers(domain[key]);
      }
    } else {
      if (!Array.isArray(data.placements)) return null;
      data.placements = data.placements.filter(placement => {
        if (!isObject(placement) || !Array.isArray(placement.list)) return true;
        placement.list = placement.list.filter(item =>
          !isObject(item) || typeof item.origin !== "string" ||
          item.origin.replace(/[a-z]/g, c => c.toUpperCase()) !== "SPONSORED"
        );
        return placement.list.length > 0;
      });
    }
    return JSON.stringify(data);
  }
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
    if (typeof original !== "string") { $done({}); return; }
    const url = $request.url;
    const appBody = rewriteApp(original, url);
    if (appBody !== null) { $done({ body: appBody }); return; }
    if (!/^https:\/\/mail\.yahoo\.com\/n\/(?:[^?]*)(?:\?.*)?$/.test(url)) {
      $done({}); return;
    }
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
