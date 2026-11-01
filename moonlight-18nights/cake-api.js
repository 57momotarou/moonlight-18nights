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

function setCakeTestNight(n) {
  try { sessionStorage.setItem(CAKE_TEST_KEY, String(n)); } catch {}
}

function cakeTestOptions(total = 18) {
  let html = `<option value="0">開始前</option>`;
  for (let n = 1; n <= total; n++) html += `<option value="${n}">第${n}夜${n === total ? "（最終夜）" : ""}</option>`;
  html += `<option value="${total + 1}">終了後</option>`;
  return html;
}
