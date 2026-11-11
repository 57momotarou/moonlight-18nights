// futari-staff.js — 受付の「ふたりの月」：カップル・夫婦のふたりの参加登録と、進み具合の一覧。
// 箱を開けたふたりが来たら、渡すホールケーキを確かめて「受け取り」（お代はいただかない）。staff.js の start から fsInit を呼ぶ。
"use strict";

const FS_TYPE_NAMES = { yoizuki: "宵月", izayoi: "十六夜", ariake: "有明", oborozuki: "朧月", matsuyoi: "待宵" };
let fsRows = [];
const fsPicked = [null, null];   // { query, name, isNew, fromApp, code }
const fsSug = [[], []];
const fsTimer = [null, null];
const fsSeq = [0, 0];
let fsBusy = false;

function fsBoxName(type) {
  return FS_TYPE_NAMES[type] ? `${FS_TYPE_NAMES[type]}のホールケーキ` : "";
}

function fsStatus(r) {
  if (r.received_at) return '<span class="fs-st s-done">受け取り済み</span>';
  if (r.opened_at) return '<span class="fs-st s-open">開封済み・受け取り待ち</span>';
  if (r.type && r.photos >= 6) return '<span class="fs-st">開ける待ち</span>';
  if (r.type) return `<span class="fs-st">写真 ${r.photos}/6</span>`;
  return `<span class="fs-st">心理テスト ${r.answered}/2</span>`;
}

// ---------- 一覧 ----------
async function fsLoad() {
  if (!pass) return;
  try {
    const res = await cakeRpc("cake_staff_futari_list", { p_pass: pass, ...testArgs() });
    fsRows = Array.isArray(res && res.rows) ? res.rows : [];
    const waiting = fsRows.filter((r) => r.opened_at && !r.received_at).length;
    $("fsCount").textContent = `${fsRows.length}組${waiting ? `・受け取り待ち${waiting}` : ""}`;
    $("fsTabSub").textContent = waiting ? `受け取り待ち ${waiting}組` : `参加 ${fsRows.length}組`;
    document.querySelector('.staff-tabs [data-desk="futari"]')?.classList.toggle("has-news", waiting > 0);
    $("fsList").innerHTML = fsRows.map((r, i) => {
      const meta = r.received_at
        ? `✓ 受け取り ${dlvTime(r.received_at)} ・ ${cakeEsc(r.received_by || "")}`
        : r.opened_at ? `開封 ${dlvTime(r.opened_at)}` : `参加 ${dlvTime(r.joined_at)} ・ ${cakeEsc(r.joined_by || "")}`;
      const actions = r.received_at
        ? `<button class="btn ghost sm" type="button" data-fs-unrecv="${i}">取消</button>`
        : r.opened_at
          ? `<button class="btn sm" type="button" data-fs-recv="${i}">受け取り</button>`
          : `<button class="btn ghost sm" type="button" data-fs-leave="${i}">参加取消</button>`;
      return `<div class="li${r.opened_at && !r.received_at ? " fs-wait" : ""}${r.received_at ? " fs-done-row" : ""}">
        <div><b>${cakeEsc(r.a.name)}</b> ＆ <b>${cakeEsc(r.b.name)}</b>${fsStatus(r)}
          ${r.opened_at && !r.received_at ? `<div class="fs-box">🎁 ${fsBoxName(r.type)}</div>` : ""}
          <div class="meta">No.${String(r.no).padStart(3, "0")} ・ アルバム ${cakeEsc(r.a.code)} / ${cakeEsc(r.b.code)}${r.type && !r.opened_at ? ` ・ ${FS_TYPE_NAMES[r.type] || ""}のふたり` : ""}</div>
          <div class="meta">${meta}</div></div>
        <div class="li-actions">${actions}</div></div>`;
    }).join("") || '<div class="small muted">まだ参加しているふたりはいません</div>';
  } catch (e) {
    $("fsList").innerHTML = `<div class="small" style="color:var(--danger)">${cakeEsc(e.message)}</div>`;
    if (/合言葉/.test(e.message)) logout();
  }
}

// ---------- ふたりを選ぶ ----------
function fsRenderSuggest(k) {
  const typed = cleanName($(`fsInput${k}`).value);
  const box = $(`fsSuggest${k}`);
  if (!typed) { box.innerHTML = ""; return; }
  const isCode = /^[0-9０-９]{1,4}$/.test(typed);
  const exact = isCode || fsSug[k].some((x) => nameKey(x.name) === nameKey(typed));
  const inPair = new Set(fsRows.flatMap((r) => [r.a.code, r.b.code]));
  let html = fsSug[k].map((x, i) => {
    const isApp = x.source === "app";
    const already = !isApp && inPair.has(x.code);
    const meta = already ? "もう参加しています" : isApp ? "購入者・アルバムはまだ" : `No.${x.code}`;
    return `<button type="button" data-fs-i="${i}" class="${already ? "done" : ""}"><span>${cakeEsc(x.name)}</span><span class="meta${isApp ? " app" : ""}">${cakeEsc(meta)}</span></button>`;
  }).join("");
  if (isCode && !fsSug[k].length) html += `<div class="small muted" style="padding:6px 4px">番号「${cakeEsc(typed)}」のアルバムは見つかりません</div>`;
  if (!exact) html += `<button type="button" data-fs-new="1" class="new"><span>＋ 新しく登録：${cakeEsc(typed)}</span><span class="meta">初めての人</span></button>`;
  box.innerHTML = html;
}

function fsSearch(k) {
  const q = cleanName($(`fsInput${k}`).value);
  $("fsError").textContent = "";
  clearTimeout(fsTimer[k]);
  if (!q) { fsSug[k] = []; fsRenderSuggest(k); return; }
  fsRenderSuggest(k);
  fsTimer[k] = setTimeout(async () => {
    const seq = ++fsSeq[k];
    try {
      const res = await cakeRpc("cake_staff_search", { p_pass: pass, p_query: q, ...testArgs() });
      if (seq !== fsSeq[k]) return;
      fsSug[k] = Array.isArray(res) ? res : [];
      fsRenderSuggest(k);
    } catch (e) {
      toast(e.message);
    }
  }, 220);
}

function fsSetPick(k, item) {
  fsPicked[k] = item;
  $(`fsInput${k}`).value = "";
  fsSug[k] = [];
  fsRenderSuggest(k);
  fsRenderPicked();
  if (k === 0 && !fsPicked[1]) $("fsInput1").focus();
}

function fsRenderPicked() {
  for (const k of [0, 1]) {
    const p = fsPicked[k];
    $(`fsPicked${k}`).innerHTML = p
      ? `<span class="chip">${cakeEsc(p.name)}${p.isNew ? '<span class="tag">はじめて</span>' : `<span class="small muted">No.${cakeEsc(p.code)}</span>`}
          <button type="button" data-fs-rm="${k}" aria-label="${cakeEsc(p.name)}を外す">×</button></span>`
      : "";
    $(`fsInput${k}`).classList.toggle("hidden", Boolean(p));
  }
  $("fsJoinBtn").disabled = !(fsPicked[0] && fsPicked[1]) || fsBusy;
}

async function fsJoin() {
  const [a, b] = fsPicked;
  if (!a || !b || fsBusy) return;
  if ((a.code && a.code === b.code) || (!a.code && !b.code && nameKey(a.name) === nameKey(b.name))) {
    $("fsError").textContent = "同じ人が選ばれています";
    return;
  }
  const typed = [a, b].filter((p) => p.isNew && !p.fromApp).map((p) => p.name);
  const msg = `${a.name} さんと ${b.name} さんを「ふたりの月」に登録します。`
    + (typed.length ? `\n\n初めてのお客さんとして登録します。\n${typed.join("\n")}\n\n名前のまちがいはないですか？` : "");
  if (!confirm(msg)) return;
  fsBusy = true;
  fsRenderPicked();
  try {
    const r = await cakeRpc("cake_staff_futari_join", { p_pass: pass, p_staff: staff, p_a: a.query, p_b: b.query, ...testArgs() });
    fsPicked[0] = fsPicked[1] = null;
    const person = (x) => x.is_new
      ? `<div class="r new"><b>${cakeEsc(x.name)}</b>　はじめてのお客さん<div class="code">${cakeEsc(x.code)}</div>
          <div class="small">「アルバム番号は <b>${cakeEsc(x.code)}</b> です」と伝えてください</div></div>`
      : `<div class="r"><b>${cakeEsc(x.name)}</b>　アルバム ${cakeEsc(x.code)}</div>`;
    $("fsResult").innerHTML = `<div class="r new"><b>${cakeEsc(r.a.name)} ＆ ${cakeEsc(r.b.name)}</b>　ふたりの月に参加しました（No.${String(r.no).padStart(3, "0")}）
        <div class="small">ふたりのアルバムに「ふたり」のタブが増えました。まず、ひとりずつ心理テストに答えてもらってください。</div></div>`
      + person(r.a) + person(r.b);
    $("fsResult").classList.remove("hidden");
    toast("ふたりの月に登録しました");
    fsLoad();
  } catch (e) {
    $("fsError").textContent = e.message;
    if (/合言葉/.test(e.message)) logout();
  } finally {
    fsBusy = false;
    fsRenderPicked();
  }
}

// ---------- 受け取り・取消 ----------
async function fsReceive(r) {
  const box = fsBoxName(r.type);
  if (!confirm(`${r.a.name} さんと ${r.b.name} さんに「${box}」を渡しましたか？\n\n渡してから押してください。押すと、ふたりのページに「受け取りました」と出ます。\nアルバムを画像で保存するよう、声をかけてくださいね。`)) return;
  try {
    await cakeRpc("cake_staff_futari_receive", { p_pass: pass, p_staff: staff, p_no: r.no, ...testArgs() });
    toast("受け取りにしました");
    fsLoad();
  } catch (e) {
    toast(e.message);
  }
}

async function fsUnreceive(r) {
  if (!confirm(`${r.a.name} さんと ${r.b.name} さんの「受け取り」を取り消しますか？\n（押し間違えたときだけ）`)) return;
  try {
    await cakeRpc("cake_staff_futari_unreceive", { p_pass: pass, p_no: r.no, ...testArgs() });
    toast("受け取りを取り消しました");
    fsLoad();
  } catch (e) {
    toast(e.message);
  }
}

async function fsLeave(r) {
  if (!confirm(`${r.a.name} さんと ${r.b.name} さんの「ふたりの月」を取り消しますか？\n（心理テストの答えと写真も消えます。アルバムは残ります）`)) return;
  try {
    await cakeRpc("cake_staff_futari_leave", { p_pass: pass, p_no: r.no, ...testArgs() });
    toast("参加を取り消しました");
    fsLoad();
  } catch (e) {
    toast(e.message);
  }
}

// ---------- 起動（staff.js の start から呼ぶ） ----------
function fsInit() {
  for (const k of [0, 1]) {
    const input = $(`fsInput${k}`);
    input.addEventListener("input", () => fsSearch(k));
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.isComposing) return;
      e.preventDefault();
      $(`fsSuggest${k}`).querySelector("button:not(.done)")?.click();
    });
    $(`fsSuggest${k}`).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || b.classList.contains("done")) return;
      if (b.dataset.fsNew) {
        const name = cleanName(input.value);
        if (name) fsSetPick(k, { query: name, name, isNew: true, code: "" });
        return;
      }
      const x = fsSug[k][Number(b.dataset.fsI)];
      if (!x) return;
      if (x.source === "app") fsSetPick(k, { query: x.name, name: x.name, isNew: true, fromApp: true, code: "" });
      else fsSetPick(k, { query: x.code, name: x.name, isNew: false, code: x.code });
    });
    $(`fsPicked${k}`).addEventListener("click", (e) => {
      if (!e.target.closest("[data-fs-rm]")) return;
      fsPicked[k] = null;
      fsRenderPicked();
      $(`fsInput${k}`).focus();
    });
  }
  $("fsJoinBtn").addEventListener("click", fsJoin);
  $("fsList").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const r = fsRows[Number(b.dataset.fsRecv ?? b.dataset.fsUnrecv ?? b.dataset.fsLeave)];
    if (!r) return;
    if (b.dataset.fsRecv !== undefined) fsReceive(r);
    else if (b.dataset.fsUnrecv !== undefined) fsUnreceive(r);
    else if (b.dataset.fsLeave !== undefined) fsLeave(r);
  });
  fsRenderPicked();
}
