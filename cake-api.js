// cake-api.js — 18夜の月：Supabase の関数（rpc）を呼ぶだけの小さな窓口。
// 接続先は同じフォルダーの config.js（window.MOONLIGHT_ALBUM_CONFIG）。
"use strict";

function cakeConnection() {
  const own = window.MOONLIGHT_ALBUM_CONFIG || {};
  const viewer = window.MOONLIGHT_CONFIG || {};
  const url = String(own.supabaseUrl || viewer.supabaseUrl || "").trim().replace(/\/+$/, "");
  const key = String(own.publishableKey || viewer.publishableKey || "").trim();
  return { url, key };
}

async function cakeRpc(name, args = {}) {
  const c = cakeConnection();
  if (!c.url || !c.key) throw new Error("接続先が設定されていません（config.js に Supabase の URL と Publishable key を書いてください）");
  let res;
  try {
    res = await fetch(`${c.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: c.key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(args),
      cache: "no-store"
    });
  } catch {
    throw new Error("通信できませんでした。電波を確認してもう一度お試しください");
  }
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = (body && (body.message || body.error_description || body.hint)) || `エラー (${res.status})`;
    throw new Error(msg);
  }
  return body;
}

function cakeStore(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
  return null;
}

function cakeEsc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function cakeNightDate(startDate, night) {
  const [y, m, d] = String(startDate || "2026-11-01").split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + night - 1));
  return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`;
}

const CAKE_STAGES = [
  { name: "新月", icon: "🌑" },
  { name: "三日月", icon: "🌒" },
  { name: "半月", icon: "🌓" },
  { name: "十三夜", icon: "🌔" },
  { name: "満月", icon: "🌕" }
];

// ---- テストモード（URLに ?test=1）。本番とは別の記録で、夜を自由に動かせる ----
const CAKE_TEST = new URLSearchParams(location.search).has("test");
const CAKE_TEST_KEY = "moonlight-cake-test-night";

function cakeTestNight() {
  if (!CAKE_TEST) return null;
  let v = 1;
  try { v = Number(sessionStorage.getItem(CAKE_TEST_KEY) || 1); } catch {}
  return Number.isInteger(v) && v >= 0 ? v : 1;
}

// デモページ（?test=1）だと一目でわかるように：上の帯・オレンジの枠・うすい「DEMO」の透かし・タブ名に【デモ】
function cakeMarkDemo() {
  if (!CAKE_TEST || document.body.classList.contains("is-demo")) return;
  document.body.classList.add("is-demo");
  if (!document.title.startsWith("【デモ】")) document.title = `【デモ】${document.title}`;
  const bar = document.createElement("div");
  bar.className = "demo-ribbon";
  bar.innerHTML = "<b>DEMO</b> デモページ ― 本番の記録・番号とは別です";
  document.body.prepend(bar);
  const mark = document.createElement("div");
  mark.className = "demo-watermark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "DEMO";
  document.body.append(mark);
}

function setCakeTestNight(n) {
  try { sessionStorage.setItem(CAKE_TEST_KEY, String(n)); } catch {}
}

function cakeTestOptions(total = 18) {
  let html = `<option value="0">開始前</option>`;
  for (let n = 1; n <= total; n++) html += `<option value="${n}">第${n}夜${n === total ? "（最終夜）" : ""}</option>`;
  html += `<option value="${total + 1}">終了後</option>`;
  return html;
}

// ---- ケーキ画像（Supabase の cake_image から。見てよい人にだけ届く） ----
const cakeImageCache = new Map();
let cakeImageCode = "";

function cakeSetImageCode(code) {
  if (code !== cakeImageCode) cakeImageCache.clear();
  cakeImageCode = code || "";
}

function cakeImageSrc(night, kind = "image") {
  const key = `${kind}:${night}`;
  if (!cakeImageCache.has(key)) {
    const t = typeof cakeTestNight === "function" ? cakeTestNight() : null;
    const p = cakeRpc("cake_image", { p_code: cakeImageCode, p_night: night, p_kind: kind, ...(t === null ? {} : { p_test_night: t }) })
      .then((r) => (r && r.data ? `data:${r.mime || "image/webp"};base64,${r.data}` : ""))
      .catch(() => { cakeImageCache.delete(key); return ""; });
    cakeImageCache.set(key, p);
  }
  return cakeImageCache.get(key);
}

// <img data-cake-night="3" data-cake-kind="image"> に画像を入れる
function cakeHydrateImages(root = document) {
  root.querySelectorAll("img[data-cake-night]").forEach((img) => {
    const night = Number(img.dataset.cakeNight);
    const kind = img.dataset.cakeKind || "image";
    if (img.dataset.loaded === `${kind}:${night}`) return;
    img.dataset.loaded = `${kind}:${night}`;
    cakeImageSrc(night, kind).then((src) => { if (src) img.src = src; });
  });
}
