// staff.js — 従業員用ケーキ受付：合言葉でログイン → 自分の名前を選ぶ → 名前か番号で選んで記録。新しい人には4桁の番号を発行。
// 謎解き「宛先不明のケーキ便」の参加登録と、正解済みの人の「完了」（報酬を渡したら押す）もここ。
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

// ---------- ① 合言葉でログイン → ② 自分の名前を選ぶ → 受付 ----------
let employees = [];

async function loadEmployees() {
  try { employees = (await cakeRpc("cake_staff_employees")) || []; } catch { employees = []; }
  renderStaffPick();
}

function renderStaffPick() {
  const last = cakeStore(STAFF_KEY) || "";
  const list = employees.slice();
  $("staffPick").innerHTML = list.length
    ? list.map((n) => `<button type="button" class="staff-btn${n === last ? " last" : ""}" data-staff="${cakeEsc(n)}">${cakeEsc(n)}${n === last ? '<span class="small">前回</span>' : ""}</button>`).join("")
    : '<div class="small muted">従業員の一覧を読み込めませんでした。下に名前を入力してください。</div>';
  if (last && !list.includes(last)) $("staffInput").value = last;
}

function showCard(id) {
  ["loginCard", "staffCard", "deskView"].forEach((x) => $(x).classList.toggle("hidden", x !== id));
}

async function login(p, { quiet = false } = {}) {
  try {
    info = await cakeRpc("cake_staff_login", { p_pass: p, ...testArgs() });
    pass = p;
    cakeStore(PASS_KEY, p);
    $("loginError").textContent = "";
    $("passInput").value = "";
    if (staff) { openDesk(); return; }
    showCard("staffCard");
    if (!employees.length) loadEmployees();
  } catch (e) {
    if (!quiet) $("loginError").textContent = e.message;
    cakeStore(PASS_KEY, null);
    pass = "";
    showCard("loginCard");
  }
}

function chooseStaff(name) {
  const n = cleanName(name);
  if (!n) { $("staffError").textContent = "名前を選ぶか入力してください"; return; }
  $("staffError").textContent = "";
  staff = n;
  cakeStore(STAFF_KEY, n);
  openDesk();
}

function openDesk() {
  $("staffName").textContent = staff;
  showCard("deskView");
  renderBadge();
  loadTonight();
  loadDelivery();
  clearInterval(dlvPoll);
  dlvPoll = setInterval(() => { if (!document.hidden && pass && staff && !$("deskView").classList.contains("hidden")) loadDelivery(); }, 20000);
  $("nameInput").focus();
}

function showStaffPick() {
  staff = "";
  renderStaffPick();
  showCard("staffCard");
}

function logout() {
  clearInterval(dlvPoll);
  pass = "";
  staff = "";
  selNight = null;
  cakeStore(PASS_KEY, null);
  chips = [];
  renderChips();
  $("passInput").value = "";
  showCard("loginCard");
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
    if ($("dlvWithRecord").checked) {
      $("dlvWithRecord").checked = false;
      await dlvJoinAfterRecord(res.records);
    }
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
        ${(r.together_people || []).length ? `<div class="meta">🫖 一緒に来た人（✕で外す）</div><div class="unpair-list">${r.together_people.map((o) => `<button type="button" class="unpair" data-unpair="${cakeEsc(r.id)}" data-other="${cakeEsc(o.id)}" data-name="${cakeEsc(r.name)}" data-oname="${cakeEsc(o.name)}">${cakeEsc(o.name)}<span aria-hidden="true">✕</span></button>`).join("")}</div>` : ""}
        <div class="meta">${timeText(r.recorded_at)} ・ No.${cakeEsc(r.code)} ・ ${cakeEsc(r.staff || "")}</div></div>
        <div class="li-actions">
        <button class="btn ghost sm" type="button" data-undo="${cakeEsc(r.id)}" data-name="${cakeEsc(r.name)}">取消</button></div></div>`).join("")
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

// 2人の間だけ「一緒に来た」を外す（ほかの人とのつながりと来店の記録は残る）
async function unpair(id, other, name, otherName) {
  if (!confirm(`${name} さんと ${otherName} さんの「一緒に来た」を外しますか？\n（ほかの人とのつながりと、来店の記録は残ります）`)) return;
  try {
    await cakeRpc("cake_staff_ungroup_pair", { p_pass: pass, p_visit_id: id, p_other: other });
    toast("一緒に来た記録を外しました");
    loadTonight();
  } catch (e) {
    toast(e.message);
  }
}

// ---------- 謎解き「宛先不明のケーキ便」 ----------
let dlvSuggestions = [];
let dlvTimer = null;
let dlvSeq = 0;
let dlvRows = [];
let dlvPoll = null;

function dlvTime(iso) {
  return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}

function dlvStatus(r) {
  if (r.stage >= 4) return '<span class="dlv-st s4">完了</span>';
  if (r.stage === 3) return '<span class="dlv-st s3">正解済み</span>';
  if (r.stage === 2) return `<span class="dlv-st s2">招待状まで${r.answer_tries ? `・謎に${r.answer_tries}回挑戦` : ""}</span>`;
  return '<span class="dlv-st">配達中</span>';
}

async function loadDelivery() {
  if (!pass) return;
  try {
    const res = await cakeRpc("cake_staff_delivery_list", { p_pass: pass, ...testArgs() });
    dlvRows = Array.isArray(res.rows) ? res.rows : [];
    const g = res.guide || {};
    $("dlvGuideJoin").textContent = g.join || "";
    $("dlvGuideDone").textContent = g.done || "";
    const waiting = dlvRows.filter((r) => r.stage === 3).length;
    const done = dlvRows.filter((r) => r.stage >= 4).length;
    $("dlvCount").textContent = `${dlvRows.length}人${waiting ? `・完了待ち${waiting}` : ""}${done ? `・完了${done}` : ""}`;
    $("dlvList").innerHTML = dlvRows.map((r, i) => {
      const meta = r.stage >= 4
        ? `✓ 完了 ${dlvTime(r.done_at)} ・ ${cakeEsc(r.done_by || "")}`
        : r.stage === 3 ? `依頼人が分かった ${dlvTime(r.solved_at)}` : `参加 ${dlvTime(r.joined_at)} ・ ${cakeEsc(r.joined_by || "")}`;
      const actions = r.stage >= 4
        ? `<button class="btn ghost sm" type="button" data-dlv-undo="${i}">取消</button>`
        : r.stage === 3
          ? `<button class="btn sm" type="button" data-dlv-done="${i}">完了</button>`
          : `<button class="btn ghost sm" type="button" data-dlv-leave="${i}">参加取消</button>`;
      return `<div class="li${r.stage === 3 ? " dlv-wait" : ""}${r.stage >= 4 ? " dlv-done-row" : ""}">
        <div><b>${cakeEsc(r.name)}</b>${dlvStatus(r)}
          <div class="meta">配達員No.${r.no} ・ アルバム ${cakeEsc(r.code)}</div>
          <div class="meta">${meta}</div></div>
        <div class="li-actions">${actions}</div></div>`;
    }).join("") || '<div class="small muted">まだ参加者はいません</div>';
  } catch (e) {
    $("dlvList").innerHTML = `<div class="small" style="color:var(--danger)">${cakeEsc(e.message)}</div>`;
    if (/合言葉/.test(e.message)) logout();
  }
}

function dlvRenderSuggest() {
  const typed = cleanName($("dlvInput").value);
  if (!typed) { $("dlvSuggest").innerHTML = ""; return; }
  const isCode = /^[0-9０-９]{1,4}$/.test(typed);
  const exact = isCode || dlvSuggestions.some((x) => nameKey(x.name) === nameKey(typed));
  const joined = new Set(dlvRows.map((r) => r.code));
  let html = dlvSuggestions.map((x, i) => {
    const isApp = x.source === "app";
    const already = !isApp && joined.has(x.code);
    const meta = already ? "参加済み" : isApp ? "購入者・アルバムはまだ" : `No.${x.code}`;
    return `<button type="button" data-dlv-i="${i}" class="${already ? "done" : ""}"><span>${cakeEsc(x.name)}</span><span class="meta${isApp ? " app" : ""}">${cakeEsc(meta)}</span></button>`;
  }).join("");
  if (isCode && !dlvSuggestions.length) html += `<div class="small muted" style="padding:6px 4px">番号「${cakeEsc(typed)}」のアルバムは見つかりません</div>`;
  if (!exact) html += `<button type="button" data-dlv-new="1" class="new"><span>＋ 新しく登録して参加：${cakeEsc(typed)}</span><span class="meta">初めての人</span></button>`;
  $("dlvSuggest").innerHTML = html;
}

function dlvSearch() {
  const q = cleanName($("dlvInput").value);
  $("dlvError").textContent = "";
  clearTimeout(dlvTimer);
  if (!q) { dlvSuggestions = []; dlvRenderSuggest(); return; }
  dlvRenderSuggest();
  dlvTimer = setTimeout(async () => {
    const seq = ++dlvSeq;
    try {
      const res = await cakeRpc("cake_staff_search", { p_pass: pass, p_query: q, ...testArgs() });
      if (seq !== dlvSeq) return;
      dlvSuggestions = Array.isArray(res) ? res : [];
      dlvRenderSuggest();
    } catch (e) {
      toast(e.message);
    }
  }, 220);
}

// query は名前か4桁の番号、label は確認に出す名前
async function dlvJoin(query, isNew, label = query) {
  query = cleanName(query);
  label = cleanName(label);
  if (!query) return;
  try {
    const r = await cakeRpc("cake_staff_delivery_join", { p_pass: pass, p_staff: staff, p_name: query, ...testArgs() });
    $("dlvInput").value = "";
    dlvSuggestions = [];
    dlvRenderSuggest();
    $("dlvResult").innerHTML = r.already
      ? `<div class="r"><b>${cakeEsc(r.name)}</b>　もう参加しています（配達員No.${r.no}・アルバム ${cakeEsc(r.code)}）</div>`
      : `<div class="r new"><b>${cakeEsc(r.name)}</b>　ケーキ便に参加しました（配達員No.${r.no}）
          ${r.is_new ? `<div class="code">${cakeEsc(r.code)}</div><div class="small">「アルバム番号は <b>${cakeEsc(r.code)}</b> です。アルバムに配達員のページが届いています」と伝えてください</div>`
                     : `<div class="small">アルバム ${cakeEsc(r.code)} に「ケーキ便」のタブが増えました。注文票の画像を渡してください</div>`}</div>`;
    $("dlvResult").classList.remove("hidden");
    toast(r.already ? "もう参加しています" : "参加を登録しました");
    loadDelivery();
  } catch (e) {
    $("dlvError").textContent = e.message;
    if (/合言葉/.test(e.message)) logout();
  }
}

// ケーキセットの記録といっしょに参加（記録した全員）
async function dlvJoinAfterRecord(records) {
  const lines = [];
  for (const r of records || []) {
    try {
      const j = await cakeRpc("cake_staff_delivery_join", { p_pass: pass, p_staff: staff, p_name: r.code, ...testArgs() });
      lines.push(`📮 ${cakeEsc(j.name)}：${j.already ? "もうケーキ便に参加しています" : "ケーキ便に参加しました"}（配達員No.${j.no}）`);
    } catch (e) {
      lines.push(`📮 ${cakeEsc(r.name)}：ケーキ便に参加できませんでした（${cakeEsc(e.message)}）`);
    }
  }
  $("result").insertAdjacentHTML("beforeend", `<div class="small" style="margin-top:6px;color:var(--gold2)">${lines.join("<br>")}<br>注文票の画像を渡してください</div>`);
  loadDelivery();
}

async function dlvDone(r) {
  if (!confirm(`${r.name} さんの「配達完了」を記録しますか？\n\n報酬を渡してから押してください。\n押すと、${r.name} さんのページに配達完了が届きます。`)) return;
  try {
    const res = await cakeRpc("cake_staff_delivery_done", { p_pass: pass, p_staff: staff, p_code: r.code, ...testArgs() });
    toast(`完了にしました（${res.rank}番目の配達員）`);
    loadDelivery();
  } catch (e) {
    toast(e.message);
  }
}

async function dlvUndo(r) {
  if (!confirm(`${r.name} さんの「完了」を取り消しますか？\n（押し間違えたときだけ。正解済みに戻ります）`)) return;
  try {
    await cakeRpc("cake_staff_delivery_undo", { p_pass: pass, p_code: r.code, ...testArgs() });
    toast("完了を取り消しました");
    loadDelivery();
  } catch (e) {
    toast(e.message);
  }
}

async function dlvLeave(r) {
  if (!confirm(`${r.name} さんのケーキ便の参加を取り消しますか？\n（ここまでの進み具合も消えます。アルバムは残ります）`)) return;
  try {
    await cakeRpc("cake_staff_delivery_leave", { p_pass: pass, p_code: r.code, ...testArgs() });
    toast("参加を取り消しました");
    loadDelivery();
  } catch (e) {
    toast(e.message);
  }
}

// ---------- 起動 ----------
function start() {
  if (CAKE_TEST) {
    cakeMarkDemo();
    $("testBanner").classList.remove("hidden");
    const sel = $("testNightSelect");
    sel.innerHTML = cakeTestOptions(18);
    sel.value = String(cakeTestNight());
    sel.addEventListener("change", () => {
      setCakeTestNight(Number(sel.value));
      selNight = null;
      if (pass) login(pass, { quiet: true });
    });
  }
  $("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = $("passInput").value;
    if (!p) { $("loginError").textContent = "合言葉を入れてください"; return; }
    $("loginError").textContent = "";
    login(p);
  });
  $("staffPick").addEventListener("click", (e) => {
    const b = e.target.closest("[data-staff]");
    if (b) chooseStaff(b.dataset.staff);
  });
  $("staffManualForm").addEventListener("submit", (e) => {
    e.preventDefault();
    chooseStaff($("staffInput").value);
  });
  $("staffLogoutBtn").addEventListener("click", logout);
  $("changeStaffBtn").addEventListener("click", showStaffPick);
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
    const u = e.target.closest("[data-unpair]");
    if (u) { unpair(u.dataset.unpair, u.dataset.other, u.dataset.name, u.dataset.oname); return; }
    const b = e.target.closest("[data-undo]");
    if (b) undo(b.dataset.undo, b.dataset.name);
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && pass && staff && !$("deskView").classList.contains("hidden")) { loadTonight(); loadDelivery(); } });
  $("dlvInput").addEventListener("input", dlvSearch);
  $("dlvInput").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    const first = $("dlvSuggest").querySelector("button:not(.done)");
    if (first) first.click();
  });
  $("dlvSuggest").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.classList.contains("done")) return;
    if (b.dataset.dlvNew) dlvJoin($("dlvInput").value, true);
    else {
      const x = dlvSuggestions[Number(b.dataset.dlvI)];
      if (x) dlvJoin(x.source === "app" ? x.name : x.code, x.source === "app", x.name);
    }
  });
  $("dlvList").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const r = dlvRows[Number(b.dataset.dlvDone ?? b.dataset.dlvUndo ?? b.dataset.dlvLeave)];
    if (!r) return;
    if (b.dataset.dlvDone !== undefined) dlvDone(r);
    else if (b.dataset.dlvUndo !== undefined) dlvUndo(r);
    else if (b.dataset.dlvLeave !== undefined) dlvLeave(r);
  });

  // 合言葉を覚えていればログイン画面は飛ばすが、名前はページを開くたびに選ぶ
  loadEmployees();
  const saved = cakeStore(PASS_KEY);
  if (saved) login(saved, { quiet: true });
}

start();
