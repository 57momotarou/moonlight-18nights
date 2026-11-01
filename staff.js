// staff.js — 従業員用ケーキ受付：受け付ける人（従業員）と合言葉 → 名前か番号で選んで記録。新しい人には4桁の番号を発行。
"use strict";

const PASS_KEY = "moonlight-cake-staff-pass";
const STAFF_KEY = "moonlight-cake-staff-name";
const $ = (id) => document.getElementById(id);
let pass = "";
let staff = "";
let info = null;       // cake_staff_login の結果
let selNight = null;   // 記録する夜（null = 今夜）
let chips = [];        // { name, isNew, fromApp, code }
let suggestions = [];
let searchTimer = null;
let searchSeq = 0;

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add("hidden"), 2800);
}

function nameKey(s) {
  return String(s || "").normalize("NFKC").replace(/[\s　・･]+/g, "")
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60)).toLowerCase();
}

function cleanName(s) {
  return String(s || "").trim().replace(/[\s　]+/g, " ");
}

function timeText(iso) {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}

function testArgs() {
  const t = cakeTestNight();
  return t === null ? {} : { p_test_night: t };
}

// ---------- 夜 ----------
function maxNight() {
  return info ? Math.min(info.night, info.total_nights) : 0;
}
function targetNight() {
  return selNight || maxNight();
}
function isLate() {
  return Boolean(info) && targetNight() !== info.night;
}

function renderBadge() {
  if (!info) return;
  const { night, total_nights: total, start_date: start } = info;
  let text;
  if (night < 1) text = `🌑 開始前（${cakeNightDate(start, 1)}から）`;
  else if (night > total) text = "🌕 企画は終了しました";
  else text = `🌙 第${night}夜 ${cakeNightDate(start, night)}${night === total ? "（最終夜）" : ""}`;
  $("nightBadge").textContent = (CAKE_TEST ? "🧪 " : "") + text;
  renderNightSelect();
}

function renderNightSelect() {
  const sel = $("nightSelect");
  const max = maxNight();
  if (max < 1) { sel.innerHTML = "<option>開始前</option>"; sel.disabled = true; updateLateNote(); return; }
  sel.disabled = false;
  if (selNight && selNight > max) selNight = null;
  const cur = targetNight();
  let html = "";
  for (let n = max; n >= 1; n--) {
    html += `<option value="${n}"${n === cur ? " selected" : ""}>第${n}夜 ${cakeNightDate(info.start_date, n)}${n === info.night ? "（今夜）" : ""}</option>`;
  }
  sel.innerHTML = html;
  updateLateNote();
}

function updateLateNote() {
  const n = targetNight();
  const note = $("lateNote");
  if (isLate() && n >= 1) {
    note.textContent = `⚠ 第${n}夜（${cakeNightDate(info.start_date, n)}）の分として、あとから記録します`;
    note.classList.remove("hidden");
  } else {
    note.classList.add("hidden");
  }
  $("listTitle").textContent = isLate() ? `第${n}夜の記録` : "今夜の記録";
  renderChips();
}

// ---------- 合言葉と受付の人（同じ画面） ----------
async function loadEmployees() {
  const sel = $("staffSelect");
  let list = [];
  try { list = await cakeRpc("cake_staff_employees"); } catch {}
  const saved = cakeStore(STAFF_KEY) || "";
  sel.innerHTML = `<option value="">選んでください</option>`
    + (list || []).map((n) => `<option value="${cakeEsc(n)}">${cakeEsc(n)}</option>`).join("")
    + `<option value="__manual">一覧にない（入力する）</option>`;
  if (saved && list.includes(saved)) sel.value = saved;
  else if (saved) { sel.value = "__manual"; $("staffInput").value = saved; }
  toggleManual();
}

function toggleManual() {
  $("staffInput").classList.toggle("hidden", $("staffSelect").value !== "__manual");
}

function chosenStaffName() {
  const v = $("staffSelect").value;
  return cleanName(v === "__manual" ? $("staffInput").value : v);
}

async function login(p, name, { quiet = false } = {}) {
  try {
    info = await cakeRpc("cake_staff_login", { p_pass: p, ...testArgs() });
    pass = p;
    staff = name;
    cakeStore(PASS_KEY, p);
    cakeStore(STAFF_KEY, name);
    $("staffName").textContent = staff;
    $("loginCard").classList.add("hidden");
    $("deskView").classList.remove("hidden");
    renderBadge();
    loadTonight();
    $("nameInput").focus();
  } catch (e) {
    if (!quiet) $("loginError").textContent = e.message;
    cakeStore(PASS_KEY, null);
    $("deskView").classList.add("hidden");
    $("loginCard").classList.remove("hidden");
  }
}

function showLogin() {
  $("deskView").classList.add("hidden");
  $("loginCard").classList.remove("hidden");
  if (pass) $("passInput").value = pass;
}

function logout() {
  pass = "";
  selNight = null;
  cakeStore(PASS_KEY, null);
  chips = [];
  renderChips();
  $("deskView").classList.add("hidden");
  $("loginCard").classList.remove("hidden");
  $("passInput").value = "";
}

// ---------- 名前の候補 ----------
function renderSuggest() {
  const typed = cleanName($("nameInput").value);
  if (!typed) { $("suggest").innerHTML = ""; return; }
  const key = nameKey(typed);
  const isCode = /^[0-9０-９]{1,4}$/.test(typed);
  const exact = isCode || suggestions.some((s) => nameKey(s.name) === key);
  let html = suggestions.map((s, i) => {
    const inChips = chips.some((c) => nameKey(c.name) === nameKey(s.name));
    const isApp = s.source === "app";
    const meta = isApp ? "購入者・アルバムはまだ" : s.tonight ? (isLate() ? "この夜は記録済み" : "今夜は記録済み") : `${s.visits}夜 ・ No.${s.code}`;
    return `<button type="button" data-i="${i}" class="${inChips ? "done" : ""}">
      <span>${cakeEsc(s.name)}</span><span class="meta${isApp ? " app" : ""}">${inChips ? "追加済み" : cakeEsc(meta)}</span></button>`;
  }).join("");
  if (isCode && !suggestions.length) {
    html += `<div class="small muted" style="padding:6px 4px">番号「${cakeEsc(typed)}」のアルバムは見つかりません</div>`;
  }
  if (!exact) {
    html += `<button type="button" data-new="1" class="new"><span>＋ 新しく登録：${cakeEsc(typed)}</span><span class="meta">初めての人</span></button>`;
  }
  $("suggest").innerHTML = html;
}

function search() {
  const q = cleanName($("nameInput").value);
  clearTimeout(searchTimer);
  if (!q) { suggestions = []; renderSuggest(); return; }
  renderSuggest();
  searchTimer = setTimeout(async () => {
    const seq = ++searchSeq;
    try {
      const res = await cakeRpc("cake_staff_search", { p_pass: pass, p_query: q, p_night: targetNight() || null, ...testArgs() });
      if (seq !== searchSeq) return;
      suggestions = Array.isArray(res) ? res : [];
      renderSuggest();
    } catch (e) {
      toast(e.message);
    }
  }, 220);
}

function addChip(item) {
  if (chips.some((c) => nameKey(c.name) === nameKey(item.name))) return;
  chips.push(item);
  $("nameInput").value = "";
  suggestions = [];
  renderSuggest();
  renderChips();
  $("nameInput").focus();
}

function renderChips() {
  $("chips").innerHTML = chips.map((c, i) => `<span class="chip">${cakeEsc(c.name)}${c.isNew ? '<span class="tag">はじめて</span>' : ""}
    <button type="button" data-rm="${i}" aria-label="${cakeEsc(c.name)}を外す">×</button></span>`).join("");
  const n = chips.length;
  const when = isLate() ? `第${targetNight()}夜の分として` : "";
  $("recordBtn").disabled = n === 0;
  $("recordBtn").textContent = n > 1 ? `${when}ケーキセットを記録（${n}人・一緒に来た）` : `${when}ケーキセットを記録`;
  $("recordError").textContent = "";
}

// ---------- 記録 ----------
async function record() {
  if (!chips.length) return;
  const typed = chips.filter((c) => c.isNew && !c.fromApp).map((c) => c.name);
  if (typed.length && !confirm(`初めてのお客さんとして登録します。\n\n${typed.join("\n")}\n\n名前のまちがいはないですか？`)) return;
  if (isLate() && !confirm(`第${targetNight()}夜（${cakeNightDate(info.start_date, targetNight())}）の分として記録します。よろしいですか？`)) return;
  const btn = $("recordBtn");
  btn.disabled = true;
  try {
    const res = await cakeRpc("cake_staff_record", {
      p_pass: pass, p_staff: staff, p_names: chips.map((c) => c.name), p_night: targetNight() || null, ...testArgs()
    });
    const where = res.late ? "この夜" : "今夜";
    $("result").innerHTML = res.records.map((r) => {
      if (r.already) return `<div class="r"><b>${cakeEsc(r.name)}</b><div class="small muted">${where}のスタンプはもうあります（1晩1つ）。${res.together ? "一緒に来た人は追加しました。" : ""}番号 ${cakeEsc(r.code)}</div></div>`;
      if (r.is_new) return `<div class="r new"><b>${cakeEsc(r.name)}</b>　はじめてのお客さん<div class="code">${cakeEsc(r.code)}</div>
        <div class="small">「アルバム番号は <b>${cakeEsc(r.code)}</b> です」と伝えてください</div></div>`;
      return `<div class="r"><b>${cakeEsc(r.name)}</b>　${r.visits}夜目<div class="small muted">アルバム番号 ${cakeEsc(r.code)}</div></div>`;
    }).join("")
      + (res.together ? `<div class="small muted">🫖 一緒に来た人として記録しました</div>` : "")
      + (res.late ? `<div class="small" style="color:var(--warn)">第${res.night}夜（${cakeNightDate(info.start_date, res.night)}）の分として記録しました</div>` : "");
    $("resultCard").classList.remove("hidden");
    chips = [];
    renderChips();
    loadTonight();
    toast("記録しました");
  } catch (e) {
    $("recordError").textContent = e.message;
    if (/合言葉/.test(e.message)) logout();
  } finally {
    btn.disabled = chips.length === 0;
  }
}

async function loadTonight() {
  try {
    const res = await cakeRpc("cake_staff_tonight", { p_pass: pass, p_night: targetNight() || null, ...testArgs() });
    if (info && res.current !== info.night) { info.night = res.current; renderBadge(); }
    $("tonightCount").textContent = `${res.records.length}人`;
    $("tonightList").innerHTML = res.records.map((r) => `<div class="li">
        <div><b>${cakeEsc(r.name)}</b>${r.late ? '<span class="late">あとから記録</span>' : ""}
        ${r.together.length ? `<div class="meta">🫖 ${r.together.map(cakeEsc).join("・")} と</div>` : ""}
        <div class="meta">${timeText(r.recorded_at)} ・ No.${cakeEsc(r.code)} ・ ${cakeEsc(r.staff || "")}</div></div>
        <button class="btn ghost sm" type="button" data-undo="${cakeEsc(r.id)}" data-name="${cakeEsc(r.name)}">取消</button></div>`).join("")
      || '<div class="small muted">まだ記録はありません</div>';
  } catch (e) {
    toast(e.message);
  }
}

async function undo(id, name) {
  if (!confirm(`${name} さんの第${targetNight()}夜の記録を取り消しますか？\n（一緒に来た記録も外れます）`)) return;
  try {
    await cakeRpc("cake_staff_undo", { p_pass: pass, p_visit_id: id });
    toast("取り消しました");
    loadTonight();
  } catch (e) {
    toast(e.message);
  }
}

// ---------- 起動 ----------
function start() {
  if (CAKE_TEST) {
    $("testBanner").classList.remove("hidden");
    const sel = $("testNightSelect");
    sel.innerHTML = cakeTestOptions(18);
    sel.value = String(cakeTestNight());
    sel.addEventListener("change", () => {
      setCakeTestNight(Number(sel.value));
      selNight = null;
      if (pass && staff) login(pass, staff, { quiet: true });
    });
  }
  $("staffSelect").addEventListener("change", toggleManual);
  $("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = chosenStaffName();
    const p = $("passInput").value;
    if (!name) { $("loginError").textContent = "受け付ける人を選んでください"; return; }
    if (!p) { $("loginError").textContent = "合言葉を入れてください"; return; }
    $("loginError").textContent = "";
    login(p, name);
  });
  $("changeStaffBtn").addEventListener("click", showLogin);
  $("logoutBtn").addEventListener("click", logout);
  $("nameInput").addEventListener("input", search);
  $("nameInput").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    const first = $("suggest").querySelector("button:not(.done)");
    if (first) first.click();
  });
  $("suggest").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.new) {
      addChip({ name: cleanName($("nameInput").value), isNew: true, code: "" });
    } else {
      const s = suggestions[Number(b.dataset.i)];
      if (s.source === "app") addChip({ name: s.name, isNew: true, fromApp: true, code: "" });
      else addChip({ name: s.name, isNew: false, code: s.code });
    }
  });
  $("chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm]");
    if (!b) return;
    chips.splice(Number(b.dataset.rm), 1);
    renderChips();
    renderSuggest();
  });
  $("recordBtn").addEventListener("click", record);
  $("nightSelect").addEventListener("change", (e) => {
    const n = Number(e.target.value);
    selNight = n === info.night ? null : n;
    updateLateNote();
    suggestions = [];
    search();
    $("resultCard").classList.add("hidden");
    loadTonight();
  });
  $("tonightList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-undo]");
    if (b) undo(b.dataset.undo, b.dataset.name);
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && pass && staff && !$("deskView").classList.contains("hidden")) loadTonight(); });

  loadEmployees();
  const saved = cakeStore(PASS_KEY);
  const savedStaff = cakeStore(STAFF_KEY);
  if (saved && savedStaff) login(saved, savedStaff, { quiet: true });
}

start();
