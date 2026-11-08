// delivery.js — 謎解き「宛先不明のケーキ便」：参加した人のアルバムにだけ出るタブ（配達員のページ）。
// 文面・答え合わせ・画像の鍵は Supabase から届く（cake_album の delivery、cake_delivery_address / cake_delivery_answer）。
// 画像は assets/*.bin（暗号化済み）。届いた鍵でこのページの中だけで開くので、GitHub を見ても中身は分からない。
// 段階は1〜4（4は店員が「完了」を押したとき）。物語の文面とボタンの文字もサーバーから届く。
"use strict";

let dlvShown = "";        // いま描いている「番号:段階」。同じなら描き直さない（入力中・演出中を消さない）
let dlvBusy = false;
let dlvPollTimer = null;
let dlvAutoTab = "";      // 最初に開いたとき、ケーキを買っていない参加者はケーキ便のタブから見せる
const dlvUrlCache = new Map();

function dlv() {
  return album && album.delivery ? album.delivery : null;
}

function dlvT(key) {
  const d = dlv();
  const v = d && d.story ? d.story[key] : "";
  return v === undefined || v === null ? "" : v;
}

function dlvAsset(name) {
  const d = dlv();
  return d && d.assets ? d.assets[name] || null : null;
}

// 端末に覚えておく小さな印（演出を見たかどうか）。番号ごと・デモは別
function dlvFlag(name, value) {
  const key = `moonlight-dlv-${name}-${code}${CAKE_TEST ? "-demo" : ""}`;
  if (value === undefined) return cakeStore(key) === "1";
  cakeStore(key, value ? "1" : null);
  return value;
}

// 【】で囲んだところを金色にする（それ以外はそのまま表示）
function dlvRich(text) {
  return cakeEsc(text).replace(/【(.+?)】/g, '<span class="gold">$1</span>');
}

// ---------- 画像（暗号化を解いて表示） ----------
function dlvAssetUrl(a) {
  if (!a || !a.file || !a.key) return Promise.resolve("");
  if (!dlvUrlCache.has(a.file)) {
    const p = (async () => {
      if (!window.crypto || !crypto.subtle) throw new Error("このブラウザでは画像を開けません");
      // 公開直後に一度失敗した結果（404）が残っていることがあるので、だめなら取り直す
      let res = await fetch(`assets/${a.file}`, { cache: "force-cache" }).catch(() => null);
      if (!res || !res.ok) res = await fetch(`assets/${a.file}?r=${Date.now()}`, { cache: "reload" });
      if (!res.ok) throw new Error("画像を読み込めませんでした");
      const buf = new Uint8Array(await res.arrayBuffer());
      const raw = Uint8Array.from(atob(a.key), (c) => c.charCodeAt(0));
      const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
      return URL.createObjectURL(new Blob([plain], { type: a.mime || "image/webp" }));
    })();
    p.catch(() => dlvUrlCache.delete(a.file));
    dlvUrlCache.set(a.file, p);
  }
  return dlvUrlCache.get(a.file);
}

// <img data-dlv="slip"> に画像を入れる。全部そろったら resolve
function dlvHydrate(root) {
  const jobs = [...root.querySelectorAll("img[data-dlv]")].map((img) => {
    const a = dlvAsset(img.dataset.dlv);
    if (!a) return Promise.resolve();
    if (img.dataset.file === a.file && img.complete && img.naturalWidth) return Promise.resolve();
    img.dataset.file = a.file;
    return dlvAssetUrl(a).then((src) => new Promise((resolve) => {
      if (!src) return resolve();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = src;
    })).catch(() => { img.alt = "画像を読み込めませんでした"; });
  });
  return Promise.all(jobs);
}

// ---------- タブ ----------
function renderDeliveryTab() {
  const d = dlv();
  const btn = document.querySelector('.tabs .tab[data-tab="delivery"]');
  if (!btn) return;
  btn.classList.toggle("hidden", !d);
  document.querySelector(".tabs").classList.toggle("four", Boolean(d));
  const seen = Number(cakeStore(`moonlight-dlv-seen-${code}${CAKE_TEST ? "-demo" : ""}`) || 0);
  btn.classList.toggle("has-news", Boolean(d) && d.stage > seen && activeTab !== "delivery");
  if (!d) {
    if (activeTab === "delivery") setTab("collection");
    dlvShown = "";
    return;
  }
  if (dlvAutoTab !== code) {
    dlvAutoTab = code;
    if (!album.visits.length && activeTab === "collection") setTab("delivery");
  }
}

function dlvMarkSeen() {
  const d = dlv();
  if (d) cakeStore(`moonlight-dlv-seen-${code}${CAKE_TEST ? "-demo" : ""}`, String(d.stage));
  document.querySelector('.tabs .tab[data-tab="delivery"]')?.classList.remove("has-news");
}

function dlvReset() {
  dlvShown = "";
  const root = $("dlvRoot");
  if (root) root.innerHTML = "";
  document.querySelector('.tabs .tab[data-tab="delivery"]')?.classList.add("hidden");
  document.querySelector(".tabs")?.classList.remove("four");
}

// ---------- 画面 ----------
function renderDelivery(force = false) {
  const d = dlv();
  const root = $("dlvRoot");
  if (!root || !d || activeTab !== "delivery") return;
  dlvMarkSeen();
  const key = `${code}:${d.stage}`;
  if (!force && dlvShown === key) return;
  dlvShown = key;
  const body = d.stage >= 4 ? dlvStage4(d) : d.stage === 3 ? dlvStage3(d) : d.stage === 2 ? dlvStage2(d) : dlvStage1(d);
  root.innerHTML = dlvIdCard(d) + body;
  dlvHydrate(root).then(() => { if (d.stage >= 4) dlvAfterDoneShown(); });
  if (d.stage === 3) ["slip", "piece"].forEach((n) => dlvAssetUrl(dlvAsset(n)).catch(() => {}));   // 演出ですぐ出せるように先に開いておく
  if (d.stage >= 4) dlvRenderCert();
}

function dlvIdCard(d) {
  // まだ着いていない段階の名前は「？」（先の展開を見せない）
  const names = ["配達", "招待状", "依頼人", "完了"];
  const steps = names.map((s, i) => (i + 1 <= d.stage || i === 3 ? s : "？"));
  return `<section class="card dlv-id">
    <div class="dlv-id-top"><span class="dlv-eyebrow">CAKE DELIVERY ・ 配達員証</span><span class="dlv-no">No.${String(d.no).padStart(3, "0")}</span></div>
    <div class="dlv-id-main">
      <svg class="dlv-id-ic" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 17l16-8 16 8v16l-16 8-16-8z"/><path d="M8 17l16 8 16-8"/><path d="M24 25v16"/><path d="M16 13l16 8"/><path d="M33.5 6.5a4.5 4.5 0 1 0 2.4 7.6 5 5 0 0 1-2.4-7.6z" fill="currentColor" stroke="none"/></svg>
      <div><div class="dlv-id-sub">宛先不明のケーキ便</div><div class="dlv-id-name">${cakeEsc(album.name)}</div></div>
    </div>
    <ol class="dlv-steps">${steps.map((s, i) => {
      const n = i + 1;
      const cls = d.stage >= 4 || n < d.stage ? "done" : n === d.stage ? "cur" : "";
      return `<li class="${cls}"><i></i><span>${s}</span></li>`;
    }).join("")}</ol>
  </section>`;
}

// 段階1：注文票・道案内・番地を入れて報酬を受け取る
function dlvStage1() {
  const route = Array.isArray(dlvT("route")) ? dlvT("route") : [];
  return `<section class="card">
      <h2>${cakeEsc(dlvT("slip_title"))}</h2>
      <p class="dlv-lead">${cakeEsc(dlvT("intro"))}</p>
      <button type="button" class="dlv-photo dlv-slip-photo" data-zoom="slip" aria-label="注文票を大きく見る"><img data-dlv="slip" alt="注文票"></button>
      <p class="small muted center">${cakeEsc(dlvT("slip_note"))}</p>
    </section>
    <section class="card">
      <h2>${cakeEsc(dlvT("route_title"))}</h2>
      <ol class="dlv-route">${route.map((r, i) => `<li>
        <button type="button" class="dlv-photo" data-zoom="${cakeEsc(r.asset)}" aria-label="写真を大きく見る"><img data-dlv="${cakeEsc(r.asset)}" alt=""><b>${i + 1}</b></button>
        <span>${cakeEsc(r.caption)}</span></li>`).join("")}</ol>
      ${dlvT("route_hint") ? `<details class="dlv-hint"><summary>${cakeEsc(dlvT("route_hint_label") || "ヒント")}</summary><p>${cakeEsc(dlvT("route_hint"))}</p></details>` : ""}
    </section>
    <section class="card dlv-receive">
      <h2>${cakeEsc(dlvT("receive_title"))}</h2>
      <p class="small">${cakeEsc(dlvT("receive_note"))}</p>
      <form class="dlv-form" id="dlvAddressForm" autocomplete="off">
        <label for="dlvAddress">${cakeEsc(dlvT("receive_label"))}</label>
        <div class="dlv-input-row"><input id="dlvAddress" inputmode="numeric" maxlength="12" placeholder="0000" enterkeyhint="done"><button class="btn" type="submit">${cakeEsc(dlvT("receive_button") || "受け取る")}</button></div>
        <p class="dlv-msg" id="dlvAddressMsg" aria-live="polite"></p>
      </form>
    </section>`;
}

// 段階2
function dlvStage2() {
  const opened = dlvFlag("opened");
  return `<section class="card dlv-invite">
      <h2>${cakeEsc(dlvT("invite_title"))}</h2>
      <div id="dlvInviteBody">${opened ? dlvInvitationHtml() : dlvEnvelopeHtml()}</div>
    </section>
    ${dlvPastHtml(["slip", "route"])}`;
}

function dlvEnvelopeHtml() {
  return `<div class="dlv-envelope" id="dlvEnvelope">
      <div class="env-back"></div>
      <div class="env-card"><img data-dlv="invitation" alt=""></div>
      <div class="env-front"></div>
      <div class="env-flap"></div>
      <div class="env-seal" aria-hidden="true">☾</div>
    </div>
    <p class="small muted center">${cakeEsc(dlvT("invite_note"))}</p>
    <button class="btn block glow" type="button" data-dlv-act="open">封を開ける</button>`;
}

function dlvInvitationHtml() {
  const flipped = dlvFlag("flipped");
  const lines = Array.isArray(dlvT("back_lines")) ? dlvT("back_lines") : [];
  return `<div class="dlv-flip${flipped ? " flipped" : ""}" id="dlvFlip">
      <div class="dlv-flip-inner">
        <div class="dlv-face front"><img data-dlv="invitation" alt="招待状"></div>
        <div class="dlv-face back"><div class="inv-back">
          <div class="inv-moon"></div>
          <div class="inv-en">${cakeEsc(dlvT("back_en"))}</div>
          <div class="inv-title">${cakeEsc(dlvT("back_title"))}</div>
          <div class="inv-rule"><i></i><b></b><i></i></div>
          <div class="inv-lines">${lines.map((l) => (l ? `<p>${dlvRich(l)}</p>` : '<p class="gap"></p>')).join("")}</div>
          <div class="inv-boxes"><span></span><span></span><span></span><span></span></div>
        </div></div>
      </div>
    </div>
    <div class="dlv-flip-tools"><button class="btn ghost sm" type="button" data-dlv-act="flip">↻ ${flipped ? "表を見る" : "裏を見る"}</button></div>
    <form class="dlv-form${dlvFlag("backseen") ? "" : " hidden"}" id="dlvAnswerForm" autocomplete="off">
      <label for="dlvAnswer">${cakeEsc(dlvT("answer_label"))}</label>
      <div class="dlv-input-row"><input id="dlvAnswer" maxlength="20" placeholder="？" enterkeyhint="done"><button class="btn" type="submit">${cakeEsc(dlvT("answer_button") || "答える")}</button></div>
      <p class="dlv-msg" id="dlvAnswerMsg" aria-live="polite"></p>
    </form>`;
}

// 段階3
function dlvStage3() {
  const picked = dlvFlag("picked");
  const matched = dlvFlag("matched");
  let piece;
  if (!picked) {
    piece = `<p class="dlv-story">${cakeEsc(dlvT("piece_text"))}</p>
      <button class="btn block glow" type="button" data-dlv-act="pick">${cakeEsc(dlvT("piece_button") || "つぎへ")}</button>`;
  } else if (!matched) {
    piece = `${dlvMergeHtml("loose")}
      <p class="dlv-story">${cakeEsc(dlvT("match_text"))}</p>
      <button class="btn block glow" type="button" data-dlv-act="match">${cakeEsc(dlvT("match_button") || "つぎへ")}</button>`;
  } else {
    piece = `${dlvMergeHtml("merged")}${dlvMatchedText()}`;
  }
  return `<section class="card dlv-solved">
      <div class="dlv-spark" aria-hidden="true">✦</div>
      <h2>${cakeEsc(dlvT("solved_title"))}</h2>
      <p>${cakeEsc(dlvT("solved_note"))}</p>
    </section>
    <section class="card dlv-piece-card" id="dlvPieceCard">${piece}</section>
    ${dlvPastHtml(["invitation", "route"])}`;
}

function dlvMatchedText() {
  return `<p class="dlv-story">${cakeEsc(dlvT("matched_text"))}</p>
    <p class="dlv-report">${cakeEsc(dlvT("report"))}</p>`;
}

function dlvMergeHtml(state) {
  const p = (dlvAsset("piece") || {}).pos || [0, 0.73, 1];
  const np = dlvAsset("namepatch");
  const npos = np && np.pos ? np.pos : null;
  return `<div class="dlv-merge ${state}" id="dlvMerge">
      <img class="torn" data-dlv="slip" alt="注文票">
      <img class="piece" data-dlv="piece" alt="" style="left:${(p[0] * 100).toFixed(3)}%;top:${(p[1] * 100).toFixed(3)}%;width:${(p[2] * 100).toFixed(3)}%">
      <div class="seam" style="top:${(p[1] * 100 - 4).toFixed(2)}%"></div>
      ${npos ? `<img class="namepatch" data-dlv="namepatch" alt="" style="left:${(npos[0] * 100).toFixed(3)}%;top:${(npos[1] * 100).toFixed(3)}%;width:${(npos[2] * 100).toFixed(3)}%;height:${(npos[3] * 100).toFixed(3)}%">
      <canvas class="nametext" id="dlvNameCanvas"></canvas>
      <div class="nameglow" style="top:${((npos[1] + npos[3] / 2) * 100).toFixed(2)}%"></div>` : ""}
    </div>`;
}

// 段階4
function dlvStage4(d) {
  const lines = Array.isArray(dlvT("done_lines")) ? dlvT("done_lines") : [];
  return `<section class="card dlv-done">
      <div class="dlv-eyebrow center">DELIVERED</div>
      <h2 class="center">${cakeEsc(dlvT("done_title"))}</h2>
      ${dlvMergeHtml("merged")}
      <p class="small muted center dlv-name-note" id="dlvNameNote">${cakeEsc(dlvT("name_note"))}</p>
      <div class="dlv-done-lines">${lines.map((l) => `<p>${cakeEsc(l)}</p>`).join("")}</div>
    </section>
    <section class="card dlv-reward">
      <h2>${cakeEsc(dlvT("reward_title"))}</h2>
      <div class="dlv-reward-body"><div class="dlv-reward-img"><img data-dlv="reward" alt=""></div>
        <div><div class="dlv-reward-name">${cakeEsc(dlvT("reward_name"))}</div><p class="small muted">${cakeEsc(dlvT("reward_note"))}</p>
        <div class="small dlv-rank">配達員 No.${String(d.no).padStart(3, "0")} ・ ${d.rank || "?"}番目の配達完了</div></div></div>
    </section>
    <section class="card">
      <h2>${cakeEsc(dlvT("cert_title"))}</h2>
      <p class="small muted" style="margin:0 0 8px">${cakeEsc(dlvT("cert_note"))}</p>
      <div class="save-panel"><img class="preview" id="dlvCertPreview" alt="配達完了証"><button class="btn block" type="button" data-dlv-act="cert" id="dlvCertBtn">画像を保存</button></div>
    </section>
    ${dlvPastHtml(["invitation", "route"])}`;
}

// これまでの配達の記録（たたんで表示）
function dlvPastHtml(parts) {
  const route = Array.isArray(dlvT("route")) ? dlvT("route") : [];
  let html = "";
  if (parts.includes("slip") && dlvAsset("slip")) html += `<button type="button" class="dlv-photo" data-zoom="slip"><img data-dlv="slip" alt="注文票"></button>`;
  if (parts.includes("invitation") && dlvAsset("invitation")) html += `<button type="button" class="dlv-photo" data-zoom="invitation"><img data-dlv="invitation" alt="招待状"></button>`;
  if (parts.includes("route")) html += route.map((r) => `<button type="button" class="dlv-photo" data-zoom="${cakeEsc(r.asset)}"><img data-dlv="${cakeEsc(r.asset)}" alt=""></button>`).join("");
  if (!html) return "";
  return `<details class="card dlv-past"><summary>配達の記録</summary><div class="dlv-past-grid">${html}</div></details>`;
}

// ---------- 操作 ----------
async function dlvSubmitAddress() {
  const input = $("dlvAddress");
  const msg = $("dlvAddressMsg");
  const v = input.value.trim();
  if (!v) { msg.textContent = "番地を入れてください"; return; }
  if (dlvBusy) return;
  dlvBusy = true;
  const btn = $("dlvAddressForm").querySelector("button");
  btn.disabled = true;
  try {
    const r = await cakeRpc("cake_delivery_address", { p_code: code, p_address: v, ...testArgs() });
    if (r && r.ok) {
      album.delivery = r.delivery;
      renderDelivery(true);
      renderDeliveryTab();
      $("dlvRoot").querySelector(".dlv-invite")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    msg.textContent = (r && r.message) || "その番地ではないみたい";
    dlvShake(input);
  } catch (e) {
    msg.textContent = e.message;
  } finally {
    dlvBusy = false;
    if (btn.isConnected) btn.disabled = false;
  }
}

async function dlvSubmitAnswer() {
  const input = $("dlvAnswer");
  const msg = $("dlvAnswerMsg");
  const v = input.value.trim();
  if (!v) { msg.textContent = "答えを入れてください"; return; }
  if (dlvBusy) return;
  dlvBusy = true;
  const btn = $("dlvAnswerForm").querySelector("button");
  btn.disabled = true;
  try {
    const r = await cakeRpc("cake_delivery_answer", { p_code: code, p_answer: v, ...testArgs() });
    if (r && r.ok) {
      input.classList.add("right");
      msg.className = "dlv-msg ok";
      msg.textContent = "……！";
      await dlvWait(900);
      album.delivery = r.delivery;
      renderDelivery(true);
      renderDeliveryTab();
      $("dlvRoot").querySelector(".dlv-solved")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    msg.className = "dlv-msg";
    msg.textContent = (r && r.message) || "ちがうみたい……";
    dlvShake(input);
  } catch (e) {
    msg.textContent = e.message;
  } finally {
    dlvBusy = false;
    if (btn.isConnected) btn.disabled = false;
  }
}

function dlvShake(el) {
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
}

function dlvWait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 段階2の演出
async function dlvOpenEnvelope(btn) {
  const env = $("dlvEnvelope");
  if (!env || dlvBusy) return;
  dlvBusy = true;
  btn.disabled = true;
  await dlvHydrate(env);
  env.classList.add("open");
  await dlvWait(1500);
  dlvFlag("opened", true);
  dlvBusy = false;
  const body = $("dlvInviteBody");
  body.innerHTML = dlvInvitationHtml();
  body.classList.add("appear");
  dlvHydrate(body);
}

function dlvFlip() {
  const flip = $("dlvFlip");
  if (!flip) return;
  const now = !flip.classList.contains("flipped");
  flip.classList.toggle("flipped", now);
  dlvFlag("flipped", now);
  const b = $("dlvRoot").querySelector('[data-dlv-act="flip"]');
  if (b) b.textContent = `↻ ${now ? "表を見る" : "裏を見る"}`;
  if (now && !dlvFlag("backseen")) {
    dlvFlag("backseen", true);
    setTimeout(() => { $("dlvAnswerForm")?.classList.remove("hidden"); }, 700);
  }
}

// 段階3の演出（1）
async function dlvPick() {
  dlvFlag("picked", true);
  const card = $("dlvPieceCard");
  card.innerHTML = `${dlvMergeHtml("loose drop")}
    <p class="dlv-story appear">${cakeEsc(dlvT("match_text"))}</p>
    <button class="btn block glow" type="button" data-dlv-act="match">${cakeEsc(dlvT("match_button") || "つぎへ")}</button>`;
  await dlvHydrate(card);
  // 動きが終わったら指定を外しておく（次の動きを滑らかにするため）
  setTimeout(() => $("dlvMerge")?.classList.remove("drop"), 950);
}

// 段階3の演出（2）
async function dlvMatch(btn) {
  const m = $("dlvMerge");
  if (!m || dlvBusy) return;
  dlvBusy = true;
  btn.disabled = true;
  await dlvHydrate(m);
  if (m.classList.contains("drop")) {
    m.classList.remove("drop");
    void m.offsetWidth;
  }
  m.classList.add("merging");
  m.classList.remove("loose");
  await dlvWait(1150);
  m.classList.add("merged", "flash");
  dlvFlag("matched", true);
  btn.remove();
  const story = $("dlvPieceCard").querySelector(".dlv-story");
  if (story) story.remove();
  await dlvWait(700);
  m.insertAdjacentHTML("afterend", `<div class="appear">${dlvMatchedText()}</div>`);
  dlvBusy = false;
}

// 段階4の演出（はじめて見るときだけゆっくり）
async function dlvAfterDoneShown() {
  const m = $("dlvMerge");
  const cv = $("dlvNameCanvas");
  const np = dlvAsset("namepatch");
  if (!m || !cv || !np || !np.text) return;
  await dlvDrawName(cv, np.text);
  if (dlvFlag("revealed")) {
    m.classList.add("named", "instant");
    return;
  }
  await dlvWait(700);
  m.classList.add("named");
  dlvFlag("revealed", true);
  const note = $("dlvNameNote");
  if (note) note.classList.add("show");
}

async function dlvDrawName(cv, t) {
  const rect = cv.getBoundingClientRect();
  const W = Math.max(1, Math.round(rect.width * (window.devicePixelRatio || 1)));
  const H = Math.max(1, Math.round(rect.height * (window.devicePixelRatio || 1)));
  cv.width = W;
  cv.height = H;
  const name = album.name || "";
  const font = (px) => `400 ${px}px "Klee One","Hiragino Maru Gothic ProN","Yu Gothic",sans-serif`;
  try { await document.fonts.load(font(40), `${name}様`); } catch {}
  const ctx = cv.getContext("2d");
  let px = t.px * W;
  const maxW = t.maxw * W;
  ctx.font = font(px);
  let text = `${name}　様`;
  if (ctx.measureText(text).width > maxW) text = name;
  while (ctx.measureText(text).width > maxW && px > t.px * W * 0.55) {
    px *= 0.94;
    ctx.font = font(px);
  }
  ctx.fillStyle = "#39332e";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, t.x * W, t.base * H);
}

// ---------- 配達完了証 ----------
function dlvDateText(iso) {
  const parts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(iso));
  const get = (t) => (parts.find((p) => p.type === t) || {}).value || "";
  return `${get("year")}年${get("month")}月${get("day")}日`;
}

async function dlvMakeCert() {
  const d = dlv();
  const name = album.name || "";
  const no = String(d.no).padStart(3, "0");
  const rank = d.rank || 1;
  const date = d.done_at ? dlvDateText(d.done_at) : "";
  const body = ["宛先不明のケーキ便を、最後まで", "届けてくれた配達員であることを、", "ここに証します。"];
  await imgFonts(`${name}配達完了証さま${body.join("")}番目の配達員年月日${date}`);
  const W = 1080, H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  imgBackground(ctx, W, H, 27, 150);
  imgFrame(ctx, W, H, "moon");
  ctx.textAlign = "center";
  ctx.fillStyle = "#cdb170";
  ctx.font = `500 25px ${IMG_EN}`;
  imgSpaced(ctx, "CERTIFICATE OF DELIVERY", W / 2, 150, 7);
  ctx.fillStyle = imgGold(ctx, 300, 0, 780, 0);
  ctx.font = `600 86px ${IMG_FONT}`;
  imgSpaced(ctx, "配達完了証", W / 2, 262, 14);

  const reward = await imgLoad(await dlvAssetUrl(dlvAsset("reward")).catch(() => ""));
  const glow = ctx.createRadialGradient(W / 2, 500, 10, W / 2, 500, 260);
  glow.addColorStop(0, "rgba(255,236,190,.28)");
  glow.addColorStop(1, "rgba(255,236,190,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(W / 2 - 280, 240, 560, 520);
  if (reward) ctx.drawImage(reward, W / 2 - 200, 300, 400, 400);

  ctx.fillStyle = "#f4e7c4";
  ctx.font = `600 58px ${IMG_FONT}`;
  const nameW = Math.min(W - 260, ctx.measureText(name).width);
  imgCenterText(ctx, name, W / 2 - 26, 790, W - 260);
  ctx.font = `500 32px ${IMG_FONT}`;
  ctx.textAlign = "left";
  ctx.fillText("さま", W / 2 - 26 + nameW / 2 + 12, 790);
  ctx.textAlign = "center";
  imgRule(ctx, W / 2, 822, 300);

  ctx.fillStyle = "#e9e1c9";
  ctx.font = `500 34px ${IMG_FONT}`;
  body.forEach((line, i) => imgCenterText(ctx, line, W / 2, 890 + i * 58, W - 200));

  imgRuns(ctx, [
    { text: "No.", font: `italic 500 34px ${IMG_EN}`, color: "#b8c1d6" },
    { text: no, font: `600 36px ${IMG_FONT}`, color: "#f4e7c4" },
    { text: "　・　", font: `500 30px ${IMG_FONT}`, color: "#8f9ab3" },
    { text: String(rank), font: `600 52px ${IMG_FONT}`, color: "#f3dfa8", dy: 4 },
    { text: " 番目の配達員", font: `500 32px ${IMG_FONT}`, color: "#e9e1c9" }
  ], W / 2, 1100);
  ctx.fillStyle = "#cdb170";
  ctx.font = `500 28px ${IMG_FONT}`;
  if (date) ctx.fillText(date, W / 2, 1156);
  await imgFooter(ctx, W, H);
  return cv;
}

async function dlvRenderCert() {
  try {
    const cv = await dlvMakeCert();
    const img = $("dlvCertPreview");
    if (img) img.src = cv.toDataURL("image/jpeg", 0.8);
  } catch {}
}

async function dlvSaveCert(btn) {
  btn.disabled = true;
  toast("画像を作っています…");
  try {
    const r = await saveCanvas(await dlvMakeCert(), "moonlight-cake-delivery.png");
    if (r === "downloaded") toast("画像を保存しました");
  } catch (e) {
    toast(e.message || "保存できませんでした");
  } finally {
    btn.disabled = false;
  }
}

// 写真や注文票を大きく見る
function dlvZoom(name) {
  if (!dlvAsset(name)) return;
  saveState = null;
  $("modalCard").className = "modal-card dlv-zoom";
  $("modalCard").dataset.night = "";
  $("modalCard").innerHTML = `<img data-dlv="${cakeEsc(name)}" alt=""><div class="actions"><button class="btn" type="button" data-act="close">閉じる</button></div>`;
  $("modal").classList.remove("hidden");
  dlvHydrate($("modalCard"));
}

// ---------- 起動（album.js の start から呼ぶ） ----------
function dlvInit() {
  const root = $("dlvRoot");
  root.addEventListener("click", (e) => {
    const z = e.target.closest("[data-zoom]");
    if (z) { dlvZoom(z.dataset.zoom); return; }
    const b = e.target.closest("[data-dlv-act]");
    if (!b) return;
    const act = b.dataset.dlvAct;
    if (act === "open") dlvOpenEnvelope(b);
    else if (act === "flip") dlvFlip();
    else if (act === "pick") dlvPick();
    else if (act === "match") dlvMatch(b);
    else if (act === "cert") dlvSaveCert(b);
  });
  root.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "dlvAddressForm") dlvSubmitAddress();
    else if (e.target.id === "dlvAnswerForm") dlvSubmitAnswer();
  });
  root.addEventListener("input", (e) => {
    if (e.target.id === "dlvAddress") $("dlvAddressMsg").textContent = "";
    if (e.target.id === "dlvAnswer") $("dlvAnswerMsg").textContent = "";
  });
  // 段階3の間は、店員が「完了」を押すのを早めに拾う
  clearInterval(dlvPollTimer);
  dlvPollTimer = setInterval(() => {
    const d = dlv();
    if (!d || d.stage !== 3 || activeTab !== "delivery" || document.hidden || dlvBusy || saveState) return;
    openAlbum(code, { quiet: true });
  }, 12000);
}
