// IP 数据中心检测 - Surge 原生 Panel 脚本
// Converted by 7号 from https://raw.githubusercontent.com/magicdan3688/MyProxyScripts/refs/heads/main/ip-dch.js
// 用法：在 sgmodule 的 [Script] 中用 argument=POLICY=你的策略组名 指定检测落地策略组。

const BASE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ARG = typeof $argument === "string" ? $argument : "";
const ARGS = parseArg(ARG);
const POLICY = ARGS.POLICY || "";

function parseArg(s) {
  const out = {};
  if (!s) return out;
  s.split(/[&;]/).forEach(part => {
    const i = part.indexOf("=");
    if (i < 0) return;
    const k = decodeURIComponent(part.slice(0, i).trim());
    const v = decodeURIComponent(part.slice(i + 1).trim());
    if (k) out[k] = v;
  });
  return out;
}

function withPolicy(opts = {}) {
  if (POLICY && POLICY !== "DIRECT") opts.policy = POLICY;
  return opts;
}

function req(method, url, opts = {}) {
  return new Promise(resolve => {
    const options = Object.assign({ url, timeout: opts.timeout || 6 }, opts);
    if (opts.headers) options.headers = opts.headers;
    if (opts.body !== undefined) options.body = opts.body;
    if (opts.policy) options.policy = opts.policy;
    const cb = (error, response, body) => {
      if (error) return resolve({ error, response, body: body || "" });
      resolve({ error: null, response, body: body || "" });
    };
    if (method === "POST") $httpClient.post(options, cb);
    else $httpClient.get(options, cb);
  });
}

async function get(url, headers, opts = {}) {
  const r = await req("GET", url, Object.assign(withPolicy({ timeout: 6 }), opts, { headers }));
  return r.body || "";
}

async function post(url, body, headers, opts = {}) {
  const r = await req("POST", url, Object.assign(withPolicy({ timeout: 6 }), opts, { headers, body }));
  return r.body || "";
}

async function getDirect(url, headers, timeout = 4) {
  const r = await req("GET", url, { timeout, headers, policy: "DIRECT" });
  return r.body || "";
}

function jp(s) { try { return JSON.parse(s); } catch (_) { return null; } }
function ti(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null; }

function fmtISP(isp) {
  if (!isp) return "未知";
  const s = String(isp).toLowerCase();
  if (/移动|mobile|cmcc/i.test(s)) return "中国移动";
  if (/电信|telecom|chinanet/i.test(s)) return "中国电信";
  if (/联通|unicom/i.test(s)) return "中国联通";
  if (/广电|broadcast|cbn/i.test(s)) return "中国广电";
  return isp;
}

function flagFromCountry(country) {
  if (!country) return "🌐";
  if (country.includes("中国")) return "🇨🇳";
  if (country.includes("日本")) return "🇯🇵";
  if (country.includes("美国")) return "🇺🇸";
  if (country.includes("香港")) return "🇭🇰";
  if (country.includes("台湾")) return "🇹🇼";
  if (country.includes("澳门")) return "🇲🇴";
  if (country.includes("新加坡")) return "🇸🇬";
  if (country.includes("韩国")) return "🇰🇷";
  if (country.includes("英国")) return "🇬🇧";
  return "📍";
}

function flagFromCode(code) {
  if (!code || !/^[A-Z]{2}$/i.test(code)) return "🌍";
  const c = code.toUpperCase() === "TW" ? "CN" : code.toUpperCase();
  return String.fromCodePoint(...c.split("").map(ch => 127397 + ch.charCodeAt()));
}

async function checkLocal() {
  let local = { ip: "获取失败", loc: "未知位置", isp: "未知运营商" };
  try {
    const body = jp(await getDirect("https://myip.ipip.net/json", { "User-Agent": "Mozilla/5.0" }, 4));
    if (body && body.data) {
      const arr = body.data.location || [];
      const country = arr[0] || "";
      return {
        ip: body.data.ip || "获取失败",
        loc: `${flagFromCountry(country)} ${arr[1] || ""} ${arr[2] || ""}`.trim() || "未知位置",
        isp: fmtISP(arr[4] || arr[3])
      };
    }
  } catch (_) {}
  try {
    const body = jp(await getDirect("https://ipservice.ws.126.net/locate/api/getLocByIp", { "User-Agent": "Mozilla/5.0" }, 4));
    if (body && body.result) {
      const country = body.result.country || "";
      return {
        ip: body.result.ip || "获取失败",
        loc: `${flagFromCountry(country)} ${body.result.province || ""} ${body.result.city || ""}`.trim() || "未知位置",
        isp: fmtISP(body.result.operator || body.result.company)
      };
    }
  } catch (_) {}
  return local;
}

async function checkLanding() {
  const out = { ip: "获取失败", loc: "未知位置", native: "未知", ippure: "低危 (0)", ippSev: 0, ipapi: "低危 (0%)", apiSev: 0 };
  try {
    const d = jp(await get("https://my.ippure.com/v1/info", null, { timeout: 5 }));
    if (d) {
      out.ip = d.ip || out.ip;
      let code = d.countryCode || "";
      if (String(code).toUpperCase() === "TW") code = "CN";
      out.loc = `${flagFromCode(code)} ${d.country || ""} ${d.city || ""}`.trim() || out.loc;
      out.native = d.isResidential === true ? "🏠 原生住宅" : d.isResidential === false ? "🏢 商业机房" : "未知";
      const risk = ti(d.fraudScore);
      if (risk !== null) {
        if (risk >= 80) { out.ippure = `极高 (${risk})`; out.ippSev = 4; }
        else if (risk >= 70) { out.ippure = `高危 (${risk})`; out.ippSev = 3; }
        else if (risk >= 40) { out.ippure = `中等 (${risk})`; out.ippSev = 1; }
        else { out.ippure = `低危 (${risk})`; out.ippSev = 0; }
      }
    }
  } catch (_) {}

  try {
    const ipData = jp(await get("http://ip-api.com/json/?lang=zh-CN", null, { timeout: 4 }));
    if (ipData && ipData.query) {
      const j = jp(await get(`https://api.ipapi.is/?q=${ipData.query}`, null, { timeout: 5 }));
      const score = j && j.company && j.company.abuser_score;
      const m = String(score || "").match(/([0-9.]+)\s*\(([^)]+)\)/);
      if (m) {
        const pct = Math.round(Number(m[1]) * 10000) / 100 + "%";
        const lv = m[2].trim();
        out.ipapi = `${lv} (${pct})`;
        out.apiSev = lv.includes("High") || lv.includes("Very High") ? 3 : lv.includes("Elevated") ? 2 : 0;
      }
    }
  } catch (_) {}
  return out;
}

async function checkChatGPT() {
  try {
    const web = await get("https://chatgpt.com", { "User-Agent": BASE_UA }, { timeout: 6 });
    const ios = await get("https://ios.chat.openai.com", { "User-Agent": BASE_UA }, { timeout: 6 });
    const blocked = !ios || ios.includes("blocked_why_headline") || ios.includes("unsupported_country_region_territory") || ((jp(ios) || {}).cf_details || "").match(/\([12]\)/);
    if (!web && blocked) return "不可用";
    if (!blocked) {
      const trace = await get("https://chatgpt.com/cdn-cgi/trace", null, { timeout: 5 });
      const m = trace && trace.match(/loc=([A-Z]{2})/);
      return m ? m[1] : "OK";
    }
    return web ? "Web" : "不可用";
  } catch (_) { return "不可用"; }
}

async function checkGemini() {
  try {
    const bodyRaw = 'f.req=[["K4WWud","[[0],[\\"en-US\\"]]",null,"generic"]]';
    const txt = await post("https://gemini.google.com/_/BardChatUi/data/batchexecute", bodyRaw, {
      "User-Agent": BASE_UA,
      "Accept-Language": "en-US",
      "Content-Type": "application/x-www-form-urlencoded"
    }, { timeout: 6 });
    if (!txt) return "不可用";
    let m = txt.match(/"countryCode"\s*:\s*"([A-Z]{2})"/i) || txt.match(/"requestCountry"\s*:\s*\{[^}]*"id"\s*:\s*"([A-Z]{2})"/i) || txt.match(/\[\[\\?"([A-Z]{2})\\?",\\?"S/);
    return m ? m[1].toUpperCase() : "OK";
  } catch (_) { return "不可用"; }
}

async function checkYTB() {
  try {
    const body = await get("https://www.youtube.com/premium", { "User-Agent": BASE_UA, "Accept-Language": "en" }, { timeout: 6 });
    if (!body) return "不可用";
    if (body.includes("www.google.cn")) return "CN";
    if (body.includes("Premium is not available in your country") || body.includes("YTB Premium is not available")) return "不可用";
    const m = body.match(/"contentRegion"\s*:\s*"?([A-Z]{2})"?/);
    if (m) return m[1].toUpperCase();
    if (/ad-free|Ad-free/.test(body)) return "OK";
    return "不可用";
  } catch (_) { return "不可用"; }
}

async function checkNetflix() {
  try {
    const urls = ["https://www.netflix.com/title/81280792", "https://www.netflix.com/title/70143836"];
    const bodies = await Promise.all(urls.map(u => get(u, { "User-Agent": BASE_UA }, { timeout: 6 })));
    if (!bodies[0] && !bodies[1]) return "不可用";
    if (/oh no!/i.test(bodies[0] || "") && /oh no!/i.test(bodies[1] || "")) return "自制";
    for (const b of bodies) {
      const m = b && b.match(/"countryCode"\s*:\s*"?([A-Z]{2})"?/);
      if (m) return m[1].toUpperCase();
    }
    return "OK";
  } catch (_) { return "不可用"; }
}

async function checkTTK() {
  try {
    const body = await get("https://www.tiktok.com/", { "User-Agent": BASE_UA, "Accept-Language": "en" }, { timeout: 6 });
    const m = body && body.match(/"region"\s*:\s*"([A-Z]{2})"/);
    if (m) return m[1].toUpperCase();
    return body ? "OK" : "不可用";
  } catch (_) { return "不可用"; }
}


function riskByBool(hit) {
  return hit ? { text: "高危", sev: 3 } : { text: "低危", sev: 0 };
}


async function checkIP2LocationRisk(ip) {
  if (!ip || ip === "获取失败") return { text: "IP2Location 获取失败", sev: 4 };
  try {
    const html = await get(`https://www.ip2location.io/${encodeURIComponent(ip)}`, { "User-Agent": BASE_UA }, { timeout: 8 });
    if (!html) return { text: "IP2Location 无响应", sev: 3 };
    let usageMatch = html.match(/Usage\s*Type<\/label>\s*<p[^>]*>\s*\(([A-Z]+)\)/i);
    if (!usageMatch) usageMatch = html.match(/Usage\s*Type<\/label>\s*<p[^>]*>\s*([A-Z]+(?:\/[A-Z]+)?)\s*</i);
    const fraudMatch = html.match(/Fraud\s*Score<\/label>\s*<p[^>]*>\s*(\d+)/i);
    const proxyMatch = html.match(/>Proxy<\/label>\s*<p[^>]*>[^<]*<i[^>]*><\/i>\s*(Yes|No)/i);
    const fraud = fraudMatch ? ti(fraudMatch[1]) : null;
    if (fraud !== null) {
      if (fraud >= 66) return { text: `IP2Location 高风险 (${fraud})`, sev: 3 };
      if (fraud >= 33) return { text: `IP2Location 中风险 (${fraud})`, sev: 1 };
      return { text: `IP2Location 低风险 (${fraud})`, sev: 0 };
    }
    const proxy = proxyMatch ? proxyMatch[1].toLowerCase() === "yes" : false;
    const usage = usageMatch ? ` (${usageMatch[1]})` : "";
    const r = riskByBool(proxy);
    return { text: `IP2Location ${r.text}${usage}`, sev: r.sev };
  } catch (_) {
    return { text: "IP2Location 失败", sev: 3 };
  }
}

async function checkDBIPRisk(ip) {
  if (!ip || ip === "获取失败") return { text: "DB-IP 获取失败", sev: 4 };
  try {
    const html = await get(`https://db-ip.com/${encodeURIComponent(ip)}`, { "User-Agent": BASE_UA }, { timeout: 8 });
    if (!html) return { text: "DB-IP 无响应", sev: 3 };
    const riskTextMatch = html.match(/Estimated threat level for this IP address is\s*<span[^>]*>\s*([^<\s]+)\s*<\/span>/i);
    const riskText = (riskTextMatch ? riskTextMatch[1] : "").toLowerCase();
    if (riskText === "high") return { text: "DB-IP 高风险", sev: 3 };
    if (riskText === "medium") return { text: "DB-IP 中风险", sev: 1 };
    if (riskText === "low") return { text: "DB-IP 低风险", sev: 0 };
    return { text: "DB-IP 获取失败", sev: 2 };
  } catch (_) {
    return { text: "DB-IP 失败", sev: 3 };
  }
}

async function checkIPRegistryRisk(ip) {
  if (!ip || ip === "获取失败") return { text: "ipregistry 获取失败", sev: 4 };
  try {
    let apiKey = null;
    try {
      const html = await get("https://ipregistry.co", { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }, { timeout: 8 });
      const keyMatch = String(html || "").match(/apiKey="([a-zA-Z0-9]+)"/);
      if (keyMatch) apiKey = keyMatch[1];
    } catch (_) {}
    if (!apiKey) return { text: "ipregistry 无KEY", sev: 2 };
    const j = jp(await get(`https://api.ipregistry.co/${encodeURIComponent(ip)}?hostname=true&key=${apiKey}`, {
      "Origin": "https://ipregistry.co",
      "Referer": "https://ipregistry.co/",
      "User-Agent": "Mozilla/5.0"
    }, { timeout: 8 }));
    if (!j || j.code) return { text: "ipregistry 获取失败", sev: 2 };
    const sec = j.security || {};
    const items = [];
    if (sec.is_proxy === true) items.push("Proxy");
    if (sec.is_tor === true || sec.is_tor_exit === true) items.push("Tor");
    if (sec.is_vpn === true) items.push("VPN");
    if (sec.is_cloud_provider === true) items.push("Hosting");
    if (sec.is_abuser === true) items.push("Abuser");
    if (items.length === 0) return { text: "ipregistry 低风险", sev: 0 };
    const sev = items.includes("Tor") || items.includes("Abuser") ? 3 : items.length >= 2 ? 2 : 1;
    const label = sev >= 3 ? "高风险" : sev >= 2 ? "较高风险" : "有标记";
    return { text: `ipregistry ${label} (${items.join("/")})`, sev };
  } catch (_) {
    return { text: "ipregistry 失败", sev: 3 };
  }
}


function sevText(sev) {
  if (sev >= 4) return "极高风险";
  if (sev >= 3) return "高风险";
  if (sev >= 2) return "中等风险";
  if (sev >= 1) return "中低风险";
  return "纯净低危";
}

function okMark(v) { return v === "不可用" || v === "CN" ? "❌" : "✅"; }

(async () => {
  const started = Date.now();
  const [local, landing, gpt, gemini, yt, nf, tt] = await Promise.all([
    checkLocal(), checkLanding(), checkChatGPT(), checkGemini(), checkYTB(), checkNetflix(), checkTTK()
  ]);

  const [ip2locRisk, dbipRisk, ipregRisk] = await Promise.all([
    checkIP2LocationRisk(landing.ip),
    checkDBIPRisk(landing.ip),
    checkIPRegistryRisk(landing.ip)
  ]);
  const maxSev = Math.max(landing.ippSev || 0, landing.apiSev || 0, ip2locRisk.sev || 0, dbipRisk.sev || 0, ipregRisk.sev || 0, landing.ip === "获取失败" ? 4 : 0);
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const cost = ((Date.now() - started) / 1000).toFixed(1);

  const title = `数据中心 ${POLICY ? `(${POLICY})` : ""} · ${sevText(maxSev)}`;
  const content = [
    `本地：${local.ip}`,
    `　　　${local.loc} · ${local.isp}`,
    `落地：${landing.ip}`,
    `　　　${landing.loc} · ${landing.native}`,
    ``,
    `风险：IPPure ${landing.ippure}`,
    `　　　ipapi  ${landing.ipapi}`,
    `　　　${ip2locRisk.text}`,
    `　　　${dbipRisk.text}`,
    `　　　${ipregRisk.text}`,
    ``,
    `解锁：GPT　${okMark(gpt)} ${gpt}｜Gemini ${okMark(gemini)} ${gemini}`,
    `　　　YTB　${okMark(yt)} ${yt}｜Netflix ${okMark(nf)} ${nf}`,
    `　　　TTK　${okMark(tt)} ${tt}`,
    `更新：${hh}:${mm} · ${cost}s`
  ].join("\n");

  $done({
    title,
    content,
    icon: maxSev >= 3 ? "exclamationmark.shield.fill" : "checkmark.shield.fill",
    "icon-color": maxSev >= 3 ? "#FF9500" : "#32D74B"
  });
})().catch(e => {
  $done({ title: "数据中心检测失败", content: String(e && e.message || e), icon: "xmark.shield.fill", "icon-color": "#FF3B30" });
});
