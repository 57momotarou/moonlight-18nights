// purge-staff.js — 受付の「買えなかった夜を開ける」：名残の月（11/18 17:00〜。デモは第18夜）のあいだだけ、ケーキセットのタブに出る。
// 買えなかった夜（第1〜17夜）のカードを、ケーキセット1個につき1夜分ずつ開ける。開いたカードは銀になり、
// 証明書・フレーム・称号・夜空の星には数えない（SQL は docs/supabase/moonlight_purge.sql。中の名前は最初の案の purge のまま）。
// staff.js の start から purgeInit を呼ぶ。画面に出す言葉は「名残の月」「買えなかった夜」（最初の案の名前は使わない。利用者の指定 2026-11-18）。
"use strict";

let purgeState = null;      // cake_purge_status の結果
let purgeRows = [];
let purgeSug = [];
let purgeTimer = null;
let purgeSeq = 0;
let purgePick = null;       // { name, code, isNew, fromApp, nights: Map(夜→"visit"|"purge"), loading }
let purgeSel = new Set();   // 開ける夜
let purgeBusy = false;

function purgeNightsText(list) {
  return list.length ? `第${list.join("・")}夜` : "";
}

function purgeLastNight() {
  return purgeState ? purgeState.last_night : 17;
}

// ---------- 状態と一覧 ----------
async function purgeLoad() {
  if (!pass) return;
  try {
    const res = await cakeRpc("cake_staff_purge_list", { p_pass: pass, ...testArgs() });
    purgeState = res.state || null;
    purgeRows = Array.isArray(res.records) ? res.records : [];
  } catch (e) {
    // SQL（moonlight_purge.sql）を流す前は関数がない。受付のほかの機能は止めない
    purgeState = null;
    purgeRows = [];
    if (/合言葉/.test(e.message)) logout();
  }
  purgeRender();
}

function purgeEndText(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ja-JP", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Tokyo" });
}

function purgeRender() {
  const open = Boolean(purgeState && purgeState.open);
  $("purgeCard").classList.toggle("hidden", !open);
  if (!open) return;
  const st = purgeState;
  $("purgeWhen").textContent = st.test ? "デモ・第18夜" : st.active ? `${purgeEndText(st.ends_at)}まで` : "記録し忘れの分だけ";
  $("purgeCount").textContent = purgeRows.length ? `（${purgeRows.length}）` : "";
  $("purgeList").innerHTML = purgeRows.map((r, i) => `<div class="li">
      <div><b>${cakeEsc(r.name)}</b>　<span class="purge-night">第${r.night}夜</span>
        <div class="meta">${timeText(r.opened_at)} ・ No.${cakeEsc(r.code)} ・ ${cakeEsc(r.staff || "")}</div></div>
      <div class="li-actions"><button class="btn ghost sm" type="button" data-purge-undo="${i}">取消</button></div></div>`).join("")
    || '<div class="small muted">まだありません</div>';
  purgeRenderPick();
}

// ---------- お客さんを選ぶ ----------
function purgeRenderSuggest() {
  const typed = cleanName($("purgeInput").value);
  const box = $("purgeSuggest");
  if (!typed) { box.innerHTML = ""; return; }
  const isCode = /^[0-9０-９]{1,4}$/.test(typed);
  const exact = isCode || purgeSug.some((s) => nameKey(s.name) === nameKey(typed));
  let html = purgeSug.map((s, i) => {
    const isApp = s.source === "app";
    const meta = isApp ? "購入者・アルバムはまだ" : `${s.visits}夜 ・ No.${s.code}`;
    return `<button type="button" data-purge-i="${i}"><span>${cakeEsc(s.name)}</span><span class="meta${isApp ? " app" : ""}">${cakeEsc(meta)}</span></button>`;
  }).join("");
  if (isCode && !purgeSug.length) html += `<div class="small muted" style="padding:6px 4px">番号「${cakeEsc(typed)}」のアルバムは見つかりません</div>`;
  if (!exact) html += `<button type="button" data-purge-new="1" class="new"><span>＋ 新しく登録：${cakeEsc(typed)}</span><span class="meta">初めての人</span></button>`;
  box.innerHTML = html;
}

function purgeSearch() {
  const q = cleanName($("purgeInput").value);
  clearTimeout(purgeTimer);
  if (!q) { purgeSug = []; purgeRenderSuggest(); return; }
  purgeRenderSuggest();
  purgeTimer = setTimeout(async () => {
    const seq = ++purgeSeq;
    try {
      const res = await cakeRpc("cake_staff_search", { p_pass: pass, p_query: q, ...testArgs() });
      if (seq !== purgeSeq) return;
      purgeSug = Array.isArray(res) ? res : [];
      purgeRenderSuggest();
    } catch (e) {
      toast(e.message);
    }
  }, 220);
}

async function purgeChoose(item) {
  purgePick = { ...item, nights: new Map(), loading: !item.isNew };
  purgeSel = new Set();
  $("purgeInput").value = "";
  purgeSug = [];
  purgeRenderSuggest();
  $("purgeError").textContent = "";
  $("purgeResult").classList.add("hidden");
  purgeRenderPick();
  if (item.isNew) return;
  const me = purgePick;
  try {
    const res = await cakeRpc("cake_staff_purge_nights", { p_pass: pass, p_name: item.code || item.name, ...testArgs() });
    if (purgePick !== me) return;
    if (res.state) purgeState = res.state;
    me.nights = new Map((res.nights || []).map((x) => [x.night, x.kind]));
    if (res.exists) { me.name = res.name; me.code = res.code; } else { me.isNew = true; }
  } catch (e) {
    $("purgeError").textContent = e.message;
  } finally {
    me.loading = false;
    if (purgePick === me) purgeRenderPick();
  }
}

function purgeFree() {
  // まだ持っていない夜（古い順）
  const out = [];
  if (!purgePick) return out;
  for (let n = 1; n <= purgeLastNight(); n++) if (!purgePick.nights.has(n)) out.push(n);
  return out;
}

function purgeRenderPick() {
  const box = $("purgePickBox");
  const btn = $("purgeBtn");
  if (!purgePick) {
    box.classList.add("hidden");
    box.innerHTML = "";
    btn.disabled = true;
    btn.textContent = "開ける";
    return;
  }
  const p = purgePick;
  const free = purgeFree();
  const start = info && info.start_date;
  let grid = "";
  for (let n = 1; n <= purgeLastNight(); n++) {
    const kind = p.nights.get(n);
    const on = purgeSel.has(n);
    const label = kind === "visit" ? "来店" : kind === "purge" ? "開けた" : on ? "開ける" : "";
    grid += `<button type="button" class="pn${kind ? ` has ${kind}` : ""}${on ? " on" : ""}" data-pn="${n}"${kind || p.loading ? " disabled" : ""}>
      <b>第${n}夜</b><small>${start ? cakeEsc(cakeNightDate(start, n)) : ""}</small><i>${label}</i></button>`;
  }
  const count = purgeSel.size;
  box.innerHTML = `<div class="purge-who"><div><b>${cakeEsc(p.name)}</b>${p.isNew ? '<span class="tag">はじめて</span>' : ` <span class="small muted">No.${cakeEsc(p.code || "")}</span>`}</div>
      <button type="button" class="linklike small" data-purge-clear="1">ほかの人にする</button></div>
    ${p.loading ? '<div class="small muted">読み込み中…</div>' : `
    <div class="purge-grid">${grid}</div>
    ${free.length ? "" : '<div class="small" style="color:var(--warn)">第1〜' + purgeLastNight() + '夜は、もう全部そろっています</div>'}`}`;
  box.classList.remove("hidden");
  btn.disabled = p.loading || count === 0 || purgeBusy;
  btn.textContent = count ? `${purgeNightsText([...purgeSel].sort((a, b) => a - b))}を開ける` : "開ける夜を選んでください";
}

function purgeToggle(n) {
  if (!purgePick || purgePick.nights.has(n)) return;
  if (purgeSel.has(n)) purgeSel.delete(n); else purgeSel.add(n);
  purgeRenderPick();
}

// ---------- 開ける・取り消す ----------
async function purgeOpen() {
  if (!purgePick || !purgeSel.size || purgeBusy) return;
  const p = purgePick;
  if (p.isNew && !p.fromApp && !confirm(`初めてのお客さんとして登録します。\n\n${p.name}\n\n名前のまちがいはないですか？`)) return;
  purgeBusy = true;
  purgeRenderPick();
  const nights = [...purgeSel].sort((a, b) => a - b);
  try {
    const res = await cakeRpc("cake_staff_purge_open", {
      p_pass: pass, p_staff: staff, p_name: p.code || p.name, p_nights: nights, ...testArgs()
    });
    const opened = res.opened || [];
    const skipped = res.skipped || [];
    $("purgeResult").innerHTML = `<div class="r${res.is_new ? " new" : ""} purge-r"><b>${cakeEsc(res.name)}</b>　${opened.length ? `${purgeNightsText(opened)}を開けました` : "開けた夜はありません"}
        ${skipped.length ? `<div class="small" style="color:var(--warn)">${purgeNightsText(skipped)}はもう持っていたので、開けていません</div>` : ""}
        ${res.is_new ? `<div class="code">${cakeEsc(res.code)}</div><div class="small">「アルバム番号は <b>${cakeEsc(res.code)}</b> です」と伝えてください</div>` : `<div class="small muted">アルバム番号 ${cakeEsc(res.code)}</div>`}</div>`;
    $("purgeResult").classList.remove("hidden");
    purgePick = null;
    purgeSel = new Set();
    toast(opened.length ? "開けました" : "開ける夜はありませんでした");
    await purgeLoad();
  } catch (e) {
    $("purgeError").textContent = e.message;
    if (/合言葉/.test(e.message)) logout();
  } finally {
    purgeBusy = false;
    purgeRenderPick();
  }
}

async function purgeUndo(r) {
  if (!confirm(`${r.name} さんの第${r.night}夜（あとから開けた分）を取り消しますか？`)) return;
  try {
    await cakeRpc("cake_staff_purge_undo", { p_pass: pass, p_id: r.id });
    toast("取り消しました");
    await purgeLoad();
  } catch (e) {
    toast(e.message);
  }
}

function purgeReset() {
  purgeState = null;
  purgeRows = [];
  purgePick = null;
  purgeSel = new Set();
  purgeSug = [];
  $("purgeInput").value = "";
  $("purgeSuggest").innerHTML = "";
  $("purgeResult").classList.add("hidden");
  $("purgeError").textContent = "";
  purgeRender();
}

function purgeInit() {
  $("purgeInput").addEventListener("input", purgeSearch);
  $("purgeInput").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    const first = $("purgeSuggest").querySelector("button");
    if (first) first.click();
  });
  $("purgeSuggest").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.purgeNew) {
      purgeChoose({ name: cleanName($("purgeInput").value), isNew: true, fromApp: false, code: "" });
      return;
    }
    const s = purgeSug[Number(b.dataset.purgeI)];
    if (!s) return;
    if (s.source === "app") purgeChoose({ name: s.name, isNew: true, fromApp: true, code: "" });
    else purgeChoose({ name: s.name, isNew: false, fromApp: false, code: s.code });
  });
  $("purgePickBox").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.purgeClear) { purgePick = null; purgeSel = new Set(); purgeRenderPick(); $("purgeInput").focus(); return; }
    if (b.dataset.pn) purgeToggle(Number(b.dataset.pn));
  });
  $("purgeBtn").addEventListener("click", purgeOpen);
  $("purgeList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-purge-undo]");
    if (!b) return;
    const r = purgeRows[Number(b.dataset.purgeUndo)];
    if (r) purgeUndo(r);
  });
}
