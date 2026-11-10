// futari.js — 「ふたりの月」：受付で参加を登録したふたり（カップル・夫婦）のアルバムにだけ出るタブ。
// 流れ：心理テスト（ひとりずつ・相手には見えない）→ ふたりの月のタイプとお題3つ → お題の写真のURLを貼る（相手の写真は開けるまで見えない）
//       → ふたりそろって「ふたりで開ける」（サーバーの時刻で同時にカウントダウン）→ 箱からケーキ・ふたりのアルバム → 店頭でケーキ（2個セット）を受け取る。
// 進み具合・相手の写真・ケーキの名前と画像の鍵は Supabase から届く（cake_futari ほか）。ケーキの画像は assets/*.bin（暗号化済み）。
"use strict";

// ---------- タイプ・お題・心理テスト ----------
const FT_TYPES = {
  yoizuki: {
    name: "宵月", kana: "よいづき", tag: "いつもの場所が好きなふたり", moon: 0.3,
    text: "夕方の空に、いつもと同じように浮かぶ月。ふたりにとって大切なのは、特別な場所より「いつもの場所」。",
    prompts: [["ふたりが帰る場所", "家でも、いつもの溜まり場でも"], ["いつもの指定席", "ソファでも、ベンチでも、車の助手席でも"], ["ほっとする場所", "ここにいると落ち着く、というところ"]]
  },
  izayoi: {
    name: "十六夜", kana: "いざよい", tag: "寄り道が好きなふたり", moon: 0.92,
    text: "満月の次の夜、少しためらうように遅れて昇る月。まっすぐ帰らずに、寄り道を楽しめるふたり。",
    prompts: [["ドライブ中の車内", "助手席から見た景色でも"], ["行ったことのない道の先", "いつもは曲がらない角の、その先へ"], ["寄り道して見つけた場所", "まっすぐ帰らなかったから、見つけた場所"]]
  },
  ariake: {
    name: "有明", kana: "ありあけ", tag: "夜明けまで話していたいふたり", moon: 0.22, flip: true,
    text: "夜が明けても、空に残っている月。話しはじめると、気づけば朝になっているふたり。",
    prompts: [["海", "波の音が聞こえる場所"], ["ずっと話していられる場所", "時間を忘れて話せるところ"], ["高い所", "街を見下ろせる場所"]]
  },
  oborozuki: {
    name: "朧月", kana: "おぼろづき", tag: "言葉がなくても通じ合うふたり", moon: 1, blur: true,
    text: "雲ににじむ、やわらかな月。言葉にしなくても、隣にいるだけで伝わるふたり。",
    prompts: [["静かな湖", "音のない水辺で"], ["相手に見せたい景色", "言葉の代わりに、この景色を"], ["月が見える場所", "同じ月を見ているふたりへ"]]
  },
  matsuyoi: {
    name: "待宵", kana: "まつよい", tag: "これからが楽しみなふたり", moon: 0.88,
    text: "満月を待つ、前の夜の月。いちばんきれいな夜は、これから。未来が楽しみなふたり。",
    prompts: [["はじめて会った場所", "ふたりの物語が始まった場所"], ["夜景がきれいな場所", "いつか一緒に見たい夜景でも"], ["相手を思い出す場所", "ここに来ると、あの人を思い出す"]]
  }
};
const FT_KEYS = ["yoizuki", "izayoi", "ariake", "oborozuki", "matsuyoi"];
// 答えの並びは FT_KEYS と同じ順（画面では人ごとに並べかえる）
const FT_QUESTIONS = [
  { q: "夜、ふたりで出かけるなら？", a: ["いつものお店でのんびり", "行き先を決めずにドライブ", "朝日が見られる海", "人のいない静かな湖", "まだ行ったことのない夜景"] },
  { q: "相手に言われてうれしいのは？", a: ["「おかえり」", "「ちょっと寄り道しよう」", "「もう少し話してたい」", "言葉はなくても、隣にいてくれたら", "「次はどこに行く？」"] },
  { q: "好きな月は？", a: ["夕方の空に見える、いつもの月", "少し遅れて昇ってくる月", "明け方の空に残る白い月", "雲ににじんだ、やわらかな月", "明日の満月を待つ、前の夜の月"] },
  { q: "ふたりの思い出を1枚だけ残すなら？", a: ["ふたりの部屋", "車の窓から見た景色", "朝焼けの空", "暗い中に灯った明かり", "はじめて会った場所"] },
  { q: "今、食べたい甘さは？", a: ["やさしい甘さ", "甘酸っぱいフルーツ", "さっぱり爽やか", "ふんわり香る", "きらきら華やか"] }
];
const FT_BEAT_MS = 2500;    // 「ふたりで開ける」を押して待っている間の合図の間隔

let ft = null;              // cake_futari の結果（参加していなければ null）
let ftShown = "";           // いま描いている状態。同じなら描き直さない（入力中・演出中を消さない）
let ftDirty = false;        // 入力中で描き直しを後回しにした
let ftBusy = false;
let ftQuiz = null;          // 心理テストの途中 { i, picks }
let ftEditSlot = null;      // 差し替え中のお題
let ftOffset = 0;           // サーバーの時刻 − 端末の時刻（ミリ秒）
let ftWaiting = false;      // 「ふたりで開ける」を押して相手を待っている
let ftBeat = null;
let ftCountTimer = null;
let ftPollTimer = null;
let ftLoadSeq = 0;
let ftLastLoad = 0;
let ftAutoTab = "";
let ftRevealing = false;
let ftMoreOpen = false;      // 「写真を見なおす・差し替える」を開いているか
const ftUrlCache = new Map();
const ftPhotoCache = new Map();
const ftCopyTried = new Set();   // このページで控えを取りに行った写真（番号:側:お題:URL）
let ftCopyOff = false;           // Supabase で控えを取れない（http 拡張がない）とわかった

// ---------- 小物 ----------
function ftFlag(name, value) {
  const key = `moonlight-ft-${name}-${code}${CAKE_TEST ? "-demo" : ""}`;
  if (value === undefined) return cakeStore(key);
  cakeStore(key, value === null ? null : String(value));
  return value;
}

function ftSleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function ftNow() { return Date.now() + ftOffset; }
function ftType() { return ft && ft.type ? FT_TYPES[ft.type] : null; }
function ftMine() { return ft ? ft.me.photos.filter(Boolean).length : 0; }
function ftTheirs() { return ft ? (ft.partner.slots || []).filter(Boolean).length : 0; }
function ftPn() { return cakeEsc(ft.partner.name); }

// 箱のラベルなどは、ふたりとも同じ順（登録した順）
function ftPairNames() {
  return ft.me.side === "b" ? [ft.partner.name, ft.me.name] : [ft.me.name, ft.partner.name];
}

function ftStage() {
  if (!ft) return "";
  if (ft.opened) return ft.received_at ? "received" : "opened";
  if (!ft.type) return "quiz";
  if (ftMine() < 3 || ftTheirs() < 3) return "photos";
  return "ready";
}

function ftDateText(iso) {
  return new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" });
}

function ftDeadline() {
  return album ? cakeNightDate(album.start_date, album.total_nights) : "11/18";
}

// 心理テストの選択肢の並び（番号ごとに決まった並び）
function ftOrder(qi) {
  let s = 7;
  for (const ch of `${code}:${qi}`) s = (Math.imul(s, 31) + ch.charCodeAt(0)) >>> 0;
  const idx = [0, 1, 2, 3, 4];
  for (let i = idx.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const j = s % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

function ftMoonHtml(key, size = 64) {
  const t = FT_TYPES[key];
  return `<span class="ft-moon${t.flip ? " flip" : ""}${t.blur ? " blur" : ""}">${moonSvg(t.moon, size, true)}</span>`;
}

// ---------- 読み込み ----------
async function futariLoad() {
  if (!code || !album) return;
  const c = code, seq = ++ftLoadSeq, t0 = Date.now();
  ftLastLoad = t0;
  try {
    const r = await cakeRpc("cake_futari", { p_code: c, ...testArgs() });
    if (seq !== ftLoadSeq || c !== code) return;
    ftApply(r, t0);
  } catch {
    // 通信の失敗は前の状態のまま（次の更新で取り直す）
  }
}

function ftApply(r, t0 = Date.now()) {
  if (r && r.now) ftOffset = Date.parse(r.now) - (t0 + Date.now()) / 2;
  ft = r && r.me ? r : null;
  if (!ft) ftStopWait(false);
  futariOnAlbum();
  ftEnsureCopies();
}

// 写真の控え：ページで作れなかった写真は、Supabase から写真の置き場所へ取りに行ってもらう（1枚につき、このページで1回）。
// 控えがあると、元のURLが開けなくなっても写真が見られ、アルバムの画像にも写真が入る。
async function ftEnsureCopies() {
  if (!ft || ftCopyOff || !code) return;
  const jobs = [];
  ft.me.photos.forEach((ph, i) => { if (ph && !ph.copied) jobs.push(["me", i, ph.url]); });
  if (ft.opened) (ft.partner.photos || []).forEach((ph, i) => { if (ph && !ph.copied) jobs.push(["partner", i, ph.url]); });
  let changed = false;
  for (const [side, slot, url] of jobs) {
    const key = `${code}:${side}:${slot}:${url}`;
    if (ftCopyTried.has(key)) continue;
    ftCopyTried.add(key);
    try {
      const r = await cakeRpc("cake_futari_photo_copy", { p_code: code, p_side: side, p_slot: slot, ...testArgs() });
      if (r && r.copied) {
        changed = true;
        ftPhotoCache.delete(`${code}:${side}:${slot}`);
      } else if (r && r.reason === "unavailable") {
        ftCopyOff = true;
        break;
      }
    } catch {
      // 取れなくても写真の表示には困らない（次にページを開いたときにもう一度）
    }
  }
  if (changed) futariLoad();
}

function ftLoadSoon() {
  if (Date.now() - ftLastLoad > 3000) futariLoad();
}

function ftPollTick() {
  if (!ft || !code || activeTab !== "futari" || document.hidden || ftWaiting || ftRevealing || ftCountTimer || saveState) return;
  const st = ftStage();
  const every = st === "ready" ? 4000 : st === "opened" ? 20000 : st === "received" ? 60000 : 12000;
  if (Date.now() - ftLastLoad >= every) futariLoad();
}

// ---------- タブ ----------
function ftTabBtn() {
  return document.querySelector('.tabs .tab[data-tab="futari"]');
}

function ftTabsLayout() {
  const tabs = document.querySelector(".tabs");
  if (!tabs) return;
  const n = [...tabs.querySelectorAll(".tab")].filter((b) => !b.classList.contains("hidden")).length;
  tabs.classList.toggle("four", n === 4);
  tabs.classList.toggle("five", n >= 5);
}

function ftNewsKey() {
  if (!ft) return "";
  return [ft.type || "", ft.partner.answered ? 1 : 0, ftTheirs(), ft.open_at ? 1 : 0, ft.opened ? 1 : 0, ft.received_at ? 1 : 0].join("|");
}

function renderFutariTab() {
  const btn = ftTabBtn();
  if (!btn) return;
  btn.classList.toggle("hidden", !ft);
  ftTabsLayout();
  if (!ft) {
    if (activeTab === "futari") setTab("collection");
    ftShown = "";
    return;
  }
  btn.classList.toggle("has-news", activeTab !== "futari" && ftFlag("news") !== ftNewsKey());
  if (ftAutoTab !== code) {
    ftAutoTab = code;
    // ケーキセットを買っていない参加者は「ふたりの月」から見せる
    if (album && !album.visits.length && !album.delivery && activeTab === "collection") setTab("futari");
  }
}

// album.js から呼ぶ：アルバムを描いたとき・タブを切り替えたとき
function futariOnAlbum() {
  renderFutariTab();
  if (activeTab === "futari") renderFutari();
}

function futariOnTab(tab) {
  renderFutariTab();
  if (tab === "futari") {
    renderFutari();
    ftLoadSoon();
  } else if (ftWaiting) {
    ftStopWait(true);
  }
}

function futariReset() {
  ftStopWait(false);
  clearInterval(ftCountTimer);
  ftCountTimer = null;
  ft = null;
  ftShown = "";
  ftQuiz = null;
  ftEditSlot = null;
  ftMoreOpen = false;
  ftRevealing = false;
  ftLoadSeq++;
  const root = $("ftRoot");
  if (root) root.innerHTML = "";
  ftTabBtn()?.classList.add("hidden");
  ftTabsLayout();
}

// ---------- 画面 ----------
function renderFutari(force = false) {
  const root = $("ftRoot");
  if (!root || !ft || activeTab !== "futari") return;
  ftFlag("news", ftNewsKey());
  ftTabBtn()?.classList.remove("has-news");
  if (ftRevealing) return;
  if (ft.type) ftQuiz = null;
  const st = ftStage();
  const key = [code, st, ft.type, ft.me.answered, ft.partner.answered, JSON.stringify(ft.me.photos), (ft.partner.slots || []).join(","),
    ft.open_at || "", ft.received_at || "", ftQuiz ? `${ftQuiz.i}:${ftQuiz.picks.join(",")}` : "-", ftEditSlot ?? "-"].join("|");
  const typing = root.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
  if (!force && (key === ftShown || typing)) {
    if (key !== ftShown) ftDirty = true;
    if (st === "ready") ftSyncWaitUi();
    return;
  }
  ftShown = key;
  ftDirty = false;
  let body;
  if (st === "quiz") body = ftQuizHtml();
  else if (st === "photos") body = ftTypeCardHtml() + ftPhotosHtml(false);
  else if (st === "ready") body = ftReadyHtml() + ftTypeCardHtml(true) + ftPhotosHtml(true);
  else body = ftOpenedHtml();
  root.innerHTML = ftHeadHtml(st) + body;
  ftHydrate(root);
  if (st === "ready") ftSyncWaitUi();
  if ((st === "opened" || st === "received") && !ftFlag("revealed")) ftPlayReveal();
}

function ftHeadHtml(st) {
  const order = { quiz: 1, photos: 2, ready: 3, opened: 4, received: 5 }[st];
  const steps = ["心理テスト", "写真", "箱を開ける", "受け取り"];
  const [a, b] = ftPairNames();
  return `<section class="card ft-id">
    <div class="ft-id-top"><span class="ft-eyebrow">FUTARI NO TSUKI ・ ふたりの月</span><span class="ft-no">No.${String(ft.no).padStart(3, "0")}</span></div>
    <div class="ft-id-names${[...`${a}${b}`].length > 20 ? " long" : ""}"><span>${cakeEsc(a)}</span><i class="ft-amp">&amp;</i><span>${cakeEsc(b)}</span></div>
    ${ft.type ? `<div class="ft-id-type">${ftMoonHtml(ft.type, 22)}${FT_TYPES[ft.type].name}のふたり</div>` : ""}
    <ol class="dlv-steps ft-steps">${steps.map((s, i) => {
      const n = i + 1;
      const cls = n < order ? "done" : n === order ? "cur" : "";
      return `<li class="${cls}"><i></i><span>${s}</span></li>`;
    }).join("")}</ol>
  </section>`;
}

// ---------- 心理テスト ----------
function ftQuizHtml() {
  const pn = ftPn();
  if (ft.me.answered && !ftQuiz) {
    return `<section class="card ft-wait-card center">
      <div class="ft-wait-moon" aria-hidden="true">${moonSvg(0.5, 70, true)}</div>
      <h2>答えは届いています</h2>
      <p class="ft-story">${pn}さんが答えると、<br>ふたりの月が決まります。</p>
      <p class="small muted">相手の答えは、ふたりとも見られません。</p>
      <button class="linklike" type="button" data-ft-act="redo">答えなおす</button>
    </section>`;
  }
  if (!ftQuiz) ftQuiz = { i: 0, picks: [] };
  const total = FT_QUESTIONS.length;
  const dots = FT_QUESTIONS.map((_, i) => `<i class="${i < ftQuiz.i ? "done" : i === ftQuiz.i ? "cur" : ""}"></i>`).join("");
  if (ftQuiz.i >= total) {
    const rows = FT_QUESTIONS.map((q, i) => `<li><span class="small muted">Q${i + 1} ${cakeEsc(q.q)}</span><b>${cakeEsc(q.a[FT_KEYS.indexOf(ftQuiz.picks[i])])}</b></li>`).join("");
    return `<section class="card ft-quiz appear">
      <div class="ft-q-top"><span class="ft-eyebrow">心理テスト</span><span class="ft-q-num">確認</span></div>
      <div class="ft-q-dots">${dots}</div>
      <h2>この答えで送りますか？</h2>
      <ol class="ft-q-sum">${rows}</ol>
      <button class="btn block glow" type="button" data-ft-act="qsend">送る</button>
      <div class="ft-q-nav"><button class="linklike" type="button" data-ft-act="qback">ひとつ前へ</button><button class="linklike" type="button" data-ft-act="redo">はじめから</button></div>
    </section>`;
  }
  const i = ftQuiz.i;
  const q = FT_QUESTIONS[i];
  const intro = i === 0
    ? `<p class="ft-q-intro">5つの質問に、<b>ひとりで</b>答えてください。相手の答えは見えません。ふたりの答えから「ふたりの月」が決まります。${ft.partner.answered ? `<br><span class="ft-q-partner">${pn}さんは、もう答えました。</span>` : ""}</p>`
    : "";
  return `<section class="card ft-quiz">
    <div class="ft-q-top"><span class="ft-eyebrow">心理テスト</span><span class="ft-q-num">Q${i + 1} / ${total}</span></div>
    <div class="ft-q-dots">${dots}</div>
    ${intro}
    <h3 class="ft-q appear">${cakeEsc(q.q)}</h3>
    <div class="ft-q-opts appear">${ftOrder(i).map((k) => `<button type="button" class="ft-opt${ftQuiz.picks[i] === FT_KEYS[k] ? " on" : ""}" data-ft-pick="${FT_KEYS[k]}">${cakeEsc(q.a[k])}</button>`).join("")}</div>
    <div class="ft-q-nav">${i > 0 ? `<button class="linklike" type="button" data-ft-act="qback">ひとつ前へ</button>` : "<span></span>"}${ft.me.answered ? `<button class="linklike" type="button" data-ft-act="qcancel">やめる</button>` : ""}</div>
  </section>`;
}

function ftPick(key) {
  if (!ftQuiz || !FT_KEYS.includes(key)) return;
  ftQuiz.picks[ftQuiz.i] = key;
  ftQuiz.i += 1;
  renderFutari(true);
}

function ftQuizBack() {
  if (!ftQuiz || ftQuiz.i === 0) return;
  ftQuiz.i -= 1;
  renderFutari(true);
}

async function ftSendAnswers(btn) {
  if (!ftQuiz || ftBusy) return;
  ftBusy = true;
  btn.disabled = true;
  try {
    const r = await cakeRpc("cake_futari_answer", { p_code: code, p_answers: ftQuiz.picks.slice(0, FT_QUESTIONS.length), ...testArgs() });
    ftQuiz = null;
    ftApply(r);
    toast(r && r.type ? "ふたりの月が決まりました" : "答えを送りました");
    $("ftRoot").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    toast(e.message);
    btn.disabled = false;
  } finally {
    ftBusy = false;
  }
}

// ---------- タイプとお題・写真 ----------
function ftTypeCardHtml(compact = false) {
  const t = ftType();
  const first = !ftFlag("typeseen");
  if (first) ftFlag("typeseen", "1");
  return `<section class="card ft-type${first ? " reveal" : ""}${compact ? " compact" : ""}">
    <div class="ft-eyebrow center">ふたりの月は</div>
    <div class="ft-type-moon">${ftMoonHtml(ft.type, compact ? 56 : 92)}</div>
    <div class="ft-type-name"><ruby>${t.name}<rt>${t.kana}</rt></ruby></div>
    <div class="ft-type-tag">${t.tag}</div>
    ${compact ? "" : `<p class="ft-type-text">${t.text}</p>`}
  </section>`;
}

function ftPhotosHtml(collapsed) {
  const t = ftType();
  const pn = ftPn();
  const head = `<section class="card ft-howto">
    <h2>お題に合わせて、写真を撮ろう</h2>
    <p class="small" style="margin:0 0 8px">ゲームの中で写真を撮って、写真のURLを貼ってください。ふたりで同じ場所で撮っても、別々に思い思いの写真を撮っても大丈夫です。</p>
    <p class="small ft-lock">🔒 相手の写真は、ふたりで箱を開けるまで見えません。</p>
    <div class="ft-progress"><span>あなた <b>${ftMine()}</b> / 3</span><span>${pn}さん <b>${ftTheirs()}</b> / 3</span></div>
    <details class="ft-help"><summary>写真のURLって？</summary>
      <p class="small">ゲームの中で写真を撮ると、写真のURL（<code>https://r2.fivemanage.com/…</code> のような文字）がコピーできます。それを下の欄にそのまま貼り付けて「貼る」を押してください。</p></details>
  </section>`;
  const cards = t.prompts.map((p, i) => ftPromptHtml(p, i)).join("");
  if (!collapsed) return head + cards;
  return `<details class="ft-more"${ftMoreOpen || ftEditSlot !== null ? " open" : ""}><summary>写真を見なおす・差し替える</summary>${cards}</details>`;
}

function ftPromptHtml(p, i) {
  const ph = ft.me.photos[i];
  const done = Boolean((ft.partner.slots || [])[i]);
  const editing = !ph || ftEditSlot === i;
  const mine = editing
    ? `<form class="ft-form" data-slot="${i}" autocomplete="off">
        <input name="url" type="url" inputmode="url" placeholder="写真のURLを貼る（https://…）" value="${ph && ftEditSlot === i ? cakeEsc(ph.url) : ""}" enterkeyhint="done">
        <input name="note" type="text" maxlength="30" placeholder="ひとこと（なくてもOK・30文字まで）" value="${ph && ph.note ? cakeEsc(ph.note) : ""}">
        <div class="ft-form-row"><button class="btn sm" type="submit">貼る</button>${ph ? `<button class="btn ghost sm" type="button" data-ft-act="cancel">やめる</button>` : ""}</div>
        <p class="ft-msg" aria-live="polite"></p>
      </form>`
    : `<button type="button" class="ft-thumb" data-ft-zoom="me:${i}" aria-label="大きく見る"><img data-ft-photo="me:${i}" alt=""></button>
       ${ph.note ? `<div class="ft-note">${cakeEsc(ph.note)}</div>` : ""}
       <div class="ft-slot-tools"><button class="linklike small" type="button" data-ft-act="edit" data-slot="${i}">差し替える</button><button class="linklike small" type="button" data-ft-act="clear" data-slot="${i}">外す</button></div>`;
  return `<section class="card ft-prompt${ph ? " has" : ""}">
    <div class="ft-prompt-head">
      <span class="ft-num">${i + 1}</span>
      <div class="ft-prompt-title"><h3>${cakeEsc(p[0])}</h3><p class="small muted">${cakeEsc(p[1])}</p></div>
    </div>
    <div class="ft-mine">${mine}</div>
    <div class="ft-partner${done ? " done" : ""}"><span>${ftPn()}さん</span><b>${done ? "✓ 撮影済み" : "まだ"}</b></div>
  </section>`;
}

async function ftCheckImage(url) {
  return new Promise((resolve) => {
    const im = new Image();
    const timer = setTimeout(() => { im.src = ""; resolve(false); }, 12000);
    im.onload = () => { clearTimeout(timer); resolve(im.naturalWidth > 0); };
    im.onerror = () => { clearTimeout(timer); resolve(false); };
    im.src = url;
  });
}

function ftUrlOk(url) {
  if (/^https:\/\/\S+$/i.test(url)) return true;
  return location.protocol === "http:" && /^http:\/\/\S+$/i.test(url);   // 手元の確認用
}

// 写真の控え：街が終わって元のURLが開けなくなっても残るように、縮めたものを Supabase にも置く。
// 写真の置き場所が許していないときは控えを作れない（URLだけ残す。ページでは元のURLで見える）。
async function ftCopyOf(url) {
  try {
    const res = await fetch(url, { mode: "cors", cache: "force-cache" });
    if (!res.ok) return null;
    const im = await imgLoad(URL.createObjectURL(await res.blob()));
    if (!im || !im.naturalWidth) return null;
    const s = Math.min(1, 1280 / Math.max(im.naturalWidth, im.naturalHeight));
    const cv = document.createElement("canvas");
    cv.width = Math.round(im.naturalWidth * s);
    cv.height = Math.round(im.naturalHeight * s);
    cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
    const data = cv.toDataURL("image/jpeg", 0.82);
    const b64 = data.slice(data.indexOf(",") + 1);
    return b64.length > 700000 ? null : { data: b64, mime: "image/jpeg" };
  } catch {
    return null;
  }
}

async function ftSubmitPhoto(form) {
  const slot = Number(form.dataset.slot);
  const url = form.elements.url.value.trim();
  const note = form.elements.note.value.trim();
  const msg = form.querySelector(".ft-msg");
  if (!url) { msg.textContent = "写真のURLを貼ってください"; return; }
  if (!ftUrlOk(url) || url.length > 800) { msg.textContent = "https:// から始まる写真のURLを、そのまま貼ってください"; return; }
  if (ftBusy) return;
  ftBusy = true;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  msg.className = "ft-msg";
  msg.textContent = "写真を確かめています…";
  try {
    if (!(await ftCheckImage(url))) {
      msg.textContent = "写真を開けませんでした。ゲームでコピーしたURLを、そのまま貼ってください";
      return;
    }
    const copy = await ftCopyOf(url);
    const r = await cakeRpc("cake_futari_photo", { p_code: code, p_slot: slot, p_url: url, p_note: note, p_copy: copy ? copy.data : null, p_copy_mime: copy ? copy.mime : null, ...testArgs() });
    ftPhotoCache.delete(`${code}:me:${slot}`);
    if (document.activeElement && form.contains(document.activeElement)) document.activeElement.blur();
    ftEditSlot = null;
    ft = r && r.me ? r : ft;
    renderFutari(true);
    futariOnAlbum();
    ftEnsureCopies();
    toast(ftMine() >= 3 ? "3枚そろいました" : "写真を貼りました");
  } catch (e) {
    msg.textContent = e.message;
  } finally {
    ftBusy = false;
    if (btn.isConnected) btn.disabled = false;
  }
}

async function ftClearPhoto(slot) {
  if (ftBusy || !confirm("この写真を外しますか？")) return;
  ftBusy = true;
  try {
    const r = await cakeRpc("cake_futari_photo", { p_code: code, p_slot: slot, p_url: "", p_note: "", p_copy: null, p_copy_mime: null, ...testArgs() });
    ftPhotoCache.delete(`${code}:me:${slot}`);
    ftEditSlot = null;
    ft = r && r.me ? r : ft;
    renderFutari(true);
  } catch (e) {
    toast(e.message);
  } finally {
    ftBusy = false;
  }
}

// ---------- 写真・ケーキの画像 ----------
function ftPhotoOf(ref) {
  const [side, i] = String(ref).split(":");
  const list = side === "me" ? ft.me.photos : ft.partner.photos || [];
  return { side, slot: Number(i), ph: list[Number(i)] || null };
}

// Supabase に取っておいた写真の控え（元のURLが開けないとき・画像に保存するとき）
async function ftPhotoData(side, slot) {
  const key = `${code}:${side}:${slot}`;
  if (!ftPhotoCache.has(key)) {
    const p = cakeRpc("cake_futari_photo_data", { p_code: code, p_side: side, p_slot: slot, ...testArgs() })
      .then((r) => (r && r.data ? `data:${r.mime || "image/webp"};base64,${r.data}` : ""))
      .catch(() => "");
    ftPhotoCache.set(key, p);
  }
  return ftPhotoCache.get(key);
}

function ftHydrate(root) {
  root.querySelectorAll("img[data-ft-photo]").forEach((img) => {
    const { side, slot, ph } = ftPhotoOf(img.dataset.ftPhoto);
    if (!ph || img.dataset.url === ph.url) return;
    img.dataset.url = ph.url;
    img.onerror = () => {
      img.onerror = null;
      ftPhotoData(side, slot).then((src) => { if (src) img.src = src; else img.closest(".ft-thumb")?.classList.add("broken"); });
    };
    img.src = ph.url;
  });
  return ftHydrateCakes(root);
}

function ftAssetUrl(a) {
  if (!a) return Promise.resolve("");
  if (a.src) return Promise.resolve(a.src);
  if (!a.file || !a.key) return Promise.resolve("");
  if (!ftUrlCache.has(a.file)) {
    const p = (async () => {
      if (!window.crypto || !crypto.subtle) throw new Error("このブラウザでは画像を開けません");
      let res = await fetch(`assets/${a.file}`, { cache: "force-cache" }).catch(() => null);
      if (!res || !res.ok) res = await fetch(`assets/${a.file}?r=${Date.now()}`, { cache: "reload" });
      if (!res.ok) throw new Error("画像を読み込めませんでした");
      const buf = new Uint8Array(await res.arrayBuffer());
      const raw = Uint8Array.from(atob(a.key), (c) => c.charCodeAt(0));
      const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
      return URL.createObjectURL(new Blob([plain], { type: a.mime || "image/webp" }));
    })();
    p.catch(() => ftUrlCache.delete(a.file));
    ftUrlCache.set(a.file, p);
  }
  return ftUrlCache.get(a.file);
}

function ftHydrateCakes(root) {
  const jobs = [...root.querySelectorAll("img[data-ft-cake]")].map((img) => {
    const c = ft && ft.cakes ? ft.cakes[Number(img.dataset.ftCake)] : null;
    if (!c || img.dataset.loaded === "1") return Promise.resolve();
    img.dataset.loaded = "1";
    img.alt = c.name || "";
    return ftAssetUrl(c.asset).then((src) => new Promise((resolve) => {
      if (!src) return resolve();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = src;
    })).catch(() => {});
  });
  return Promise.all(jobs);
}

function ftZoom(ref) {
  const { side, slot, ph } = ftPhotoOf(ref);
  if (!ph) return;
  const t = ftType();
  const who = side === "me" ? ft.me.name : ft.partner.name;
  saveState = null;
  $("modalCard").className = "modal-card ft-zoom";
  $("modalCard").dataset.night = "";
  $("modalCard").innerHTML = `<div class="kicker">お題 ${slot + 1} ・ ${cakeEsc(t ? t.prompts[slot][0] : "")}</div>
    <img data-ft-photo="${side}:${slot}" alt="">
    <p class="ft-zoom-cap"><b>${cakeEsc(who)}</b>${ph.note ? `　${cakeEsc(ph.note)}` : ""}</p>
    <p class="small muted" style="margin:0 0 10px">長押し（パソコンは右クリック）で、この写真を保存できます。</p>
    <div class="actions"><button class="btn" type="button" data-act="close">閉じる</button></div>`;
  $("modal").classList.remove("hidden");
  ftHydrate($("modalCard"));
}

// ---------- 箱 ----------
function ftBoxHtml(state) {
  const [a, b] = ftPairNames();
  const len = [...`${a}${b}`].length;
  const size = len > 24 ? " xlong" : len > 13 ? " long" : "";
  return `<div class="ft-box ${state}" id="ftBox">
    <div class="ft-box-glow"></div>
    <div class="ft-box-3d">
      <div class="ft-box-top"><span class="ft-box-emblem">☾</span></div>
      <div class="ft-box-body">
        <div class="ft-box-in"><div class="ft-box-cakes"><img class="c1" data-ft-cake="0" alt=""><img class="c2" data-ft-cake="1" alt=""></div></div>
        <div class="ft-box-flap">
          <div class="ft-flap-out"><div class="ft-box-label${size}"><small>Moonlight より</small><b><span>${cakeEsc(a)}さん・</span><span>${cakeEsc(b)}さんへ</span></b></div></div>
          <div class="ft-flap-in"></div>
        </div>
      </div>
    </div>
    <div class="ft-count" id="ftCount" aria-live="assertive"></div>
  </div>`;
}
function ftReadyHtml() {
  return `<section class="card ft-ready">
    <div class="ft-eyebrow center">6枚の写真がそろいました</div>
    <h2 class="center">ふたりの箱が届いています</h2>
    ${ftBoxHtml("closed")}
    <p class="ft-wait-msg center" id="ftWaitMsg"></p>
    <button class="btn block glow" type="button" id="ftOpenBtn" data-ft-act="open">ふたりで開ける</button>
    <button class="btn ghost block hidden" type="button" id="ftStopBtn" data-ft-act="stop" style="margin-top:8px">やめる</button>
    <p class="small muted center" style="margin:10px 0 0">ふたりがそれぞれ自分のアルバムで「ふたりで開ける」を押すと、同じ時間に箱が開きます。写真とケーキは、そのときまでのお楽しみです。</p>
  </section>`;
}

function ftSyncWaitUi() {
  const box = $("ftBox"), btn = $("ftOpenBtn"), msg = $("ftWaitMsg"), stop = $("ftStopBtn");
  if (!box || !btn || !ft) return;
  if (ft.open_at && !ft.opened) {
    btn.disabled = true;
    btn.textContent = "まもなく開きます";
    stop.classList.add("hidden");
    ftStartCount();
    return;
  }
  const pr = Boolean(ft.partner.ready);
  box.classList.toggle("partner-ready", pr || ftWaiting);
  if (ftWaiting) {
    btn.disabled = true;
    btn.textContent = `${ft.partner.name}さんを待っています…`;
    msg.innerHTML = `${ftPn()}さんも自分のアルバムで「ふたりで開ける」を押すと、同時に開きます。<br><span class="small muted">この画面を開いたままにしてください。</span>`;
    stop.classList.remove("hidden");
  } else {
    btn.disabled = false;
    btn.textContent = "ふたりで開ける";
    msg.innerHTML = pr ? `<b class="ft-hot">${ftPn()}さんが待っています。</b><br>「ふたりで開ける」を押すと、すぐに開きます。` : "";
    stop.classList.add("hidden");
  }
}

async function ftStartWait() {
  if (ftWaiting || !ft) return;
  ftWaiting = true;
  ftSyncWaitUi();
  await ftBeatOnce();
  if (!ftWaiting) return;
  clearInterval(ftBeat);
  ftBeat = setInterval(ftBeatOnce, FT_BEAT_MS);
}

async function ftBeatOnce() {
  if (!ftWaiting || !ft) return;
  const t0 = Date.now();
  try {
    const r = await cakeRpc("cake_futari_ready", { p_code: code, p_on: true, ...testArgs() });
    if (!ftWaiting) return;
    if (r && r.me) {
      if (r.now) ftOffset = Date.parse(r.now) - (t0 + Date.now()) / 2;
      ft = r;
    }
    if (ft.open_at || ft.opened) ftStopWait(false);
    renderFutari();
  } catch (e) {
    toast(e.message);
  }
}

function ftStopWait(send) {
  const was = ftWaiting;
  ftWaiting = false;
  clearInterval(ftBeat);
  ftBeat = null;
  if (send && was && code) cakeRpc("cake_futari_ready", { p_code: code, p_on: false, ...testArgs() }).catch(() => {});
  if ($("ftOpenBtn")) ftSyncWaitUi();
}

// サーバーが決めた「開く時刻」に向けて、ふたりの画面で同じ数字を出す
function ftStartCount() {
  const box = $("ftBox");
  if (!box) return;
  box.classList.add("counting");
  if (ftCountTimer) return;
  const tick = () => {
    const el = $("ftCount");
    if (!el || !ft || !ft.open_at) { clearInterval(ftCountTimer); ftCountTimer = null; return; }
    const left = Date.parse(ft.open_at) - ftNow();
    if (left <= 0) {
      clearInterval(ftCountTimer);
      ftCountTimer = null;
      el.textContent = "";
      ftFinishOpen();
      return;
    }
    const n = Math.ceil(left / 1000);
    const txt = n > 3 ? "" : String(n);
    if (el.dataset.n !== txt) {
      el.dataset.n = txt;
      el.textContent = txt;
      el.classList.remove("pop");
      void el.offsetWidth;
      if (txt) el.classList.add("pop");
    }
    const msg = $("ftWaitMsg");
    if (msg) msg.innerHTML = n > 3 ? "<b class=\"ft-hot\">ふたりがそろいました。</b><br>まもなく開きます…" : "";
  };
  tick();
  ftCountTimer = setInterval(tick, 100);
}

async function ftFinishOpen() {
  for (let i = 0; i < 15; i++) {
    await futariLoad();
    if (!ft || ft.opened) return;   // 開いた状態が届くと、描き直しで演出が始まる
    await ftSleep(700);
  }
  toast("箱を開けられませんでした。「更新」を押してください");
}

// ---------- 開けたあと ----------
function ftOpenedHtml() {
  const t = ftType();
  const revealed = Boolean(ftFlag("revealed"));
  const hide = revealed ? "" : " hidden";
  const cakes = ft.cakes || [];
  const recv = ft.received_at
    ? `<div class="ft-received">✓ ${ftDateText(ft.received_at)}に受け取りました</div>`
    : `<div class="ft-receive"><b>ふたりでMoonlightに来て、店員に「ふたりの月」と伝えてください。</b>このケーキ（2個セット）をお渡しします。<small>${ftDeadline()}まで ・ お代はいりません</small></div>`;
  return `<section class="card ft-gift">
      <div class="ft-eyebrow center">FOR TWO ・ ふたりへ</div>
      <h2 class="center">${t.name}のケーキ</h2>
      ${ftBoxHtml(revealed ? "opened" : "closed")}
      <div class="ft-after${hide}">
        <div class="ft-cake-names"><span>${cakeEsc(cakes[0] ? cakes[0].name : "")}</span><span>${cakeEsc(cakes[1] ? cakes[1].name : "")}</span></div>
        ${recv}
        <button class="ft-to-album" type="button" data-ft-act="toalbum"><span class="nw">↓ ふたりのアルバムを見る</span>・<span class="nw">保存する</span></button>
      </div>
    </section>
    <div class="ft-after${hide}">${ftAlbumHtml()}</div>`;
}

function ftAlbumHtml() {
  const t = ftType();
  const rows = t.prompts.map((p, i) => `<div class="ft-row">
      <div class="ft-row-title"><span>${IMG_KANJI_NUM[i + 1]}</span>${cakeEsc(p[0])}</div>
      <div class="ft-pair">${ftFigHtml("me", i, ft.me.name, ft.me.photos[i])}${ftFigHtml("partner", i, ft.partner.name, (ft.partner.photos || [])[i])}</div>
    </div>`).join("");
  return `<section class="card ft-album">
    <div class="ft-eyebrow center">FUTARI NO TSUKI</div>
    <h2 class="center">ふたりの月アルバム</h2>
    <div class="ft-album-sub center">${t.name}のふたり ・ ${cakeEsc(ft.me.name)} と ${ftPn()}</div>
    ${rows}
    ${ftKeepHtml()}
  </section>`;
}

// 保存のおすすめ（ゲームの写真は、街が終わると見られなくなることがある）
function ftKeepHtml() {
  const saved = Boolean(ftFlag("saved"));
  return `<div class="ft-keep${saved ? " saved" : ""}" id="ftKeep">
      <b class="ft-keep-title">${saved ? "✓ 画像で保存しました" : "📷 アルバムを画像で保存しましょう"}</b>
      <p>ゲームの写真は、街が終わると見られなくなることがあります。ふたりの写真とケーキを<span class="nw">1枚の画像</span>にまとめて、スマホやパソコンに残せます。</p>
      <button class="btn block${saved ? "" : " glow"}" type="button" data-ft-act="save" id="ftSaveBtn">${saved ? "もう一度保存する" : "アルバムを画像で保存"}</button>
      <p class="small muted">写真をタップすると大きく見られます。長押し（パソコンは右クリック）で、写真を<span class="nw">1枚ずつ</span>保存することもできます。</p>
    </div>`;
}

function ftFigHtml(side, i, name, ph) {
  return `<figure class="ft-fig">
    ${ph ? `<button type="button" class="ft-thumb" data-ft-zoom="${side}:${i}" aria-label="大きく見る"><img data-ft-photo="${side}:${i}" alt=""></button>` : `<div class="ft-thumb empty">写真なし</div>`}
    <figcaption><b>${cakeEsc(name)}</b>${ph && ph.note ? `<span>${cakeEsc(ph.note)}</span>` : ""}</figcaption>
  </figure>`;
}

async function ftPlayReveal() {
  const box = $("ftBox");
  if (!box || ftRevealing) return;
  ftRevealing = true;
  try {
    await Promise.race([ftHydrateCakes(box), ftSleep(6000)]);   // ケーキの画像を先に開いておく
    box.scrollIntoView({ behavior: "smooth", block: "center" });
    await ftSleep(500);
    box.classList.remove("closed", "counting");
    box.classList.add("opening");
    await ftSleep(2400);
    box.classList.remove("opening");
    box.classList.add("opened");
    ftFlag("revealed", "1");
    document.querySelectorAll("#ftRoot .ft-after").forEach((el, i) => {
      el.classList.remove("hidden");
      el.classList.add("appear");
      el.style.animationDelay = `${i * 0.35}s`;
    });
  } finally {
    ftRevealing = false;
  }
}

// ---------- アルバムを画像で保存 ----------
async function ftPhotoBitmap(side, slot, ph) {
  if (!ph) return null;
  try {
    const res = await fetch(ph.url, { mode: "cors", cache: "force-cache" });
    if (res.ok) {
      const im = await imgLoad(URL.createObjectURL(await res.blob()));
      if (im) return im;
    }
  } catch {}
  const src = await ftPhotoData(side, slot);
  return src ? imgLoad(src) : null;
}

function ftDrawCover(ctx, im, x, y, w, h) {
  const s = Math.max(w / im.naturalWidth, h / im.naturalHeight);
  const sw = w / s, sh = h / s;
  ctx.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

async function ftMakeImage() {
  const t = ftType();
  const me = ft.me, pa = ft.partner;
  const cakes = ft.cakes || [];
  const notes = [...me.photos, ...(pa.photos || [])].map((p) => (p && p.note) || "").join("");
  await imgFonts(`ふたりの月アルバム${t.name}${t.kana}のふたり（）${me.name}${pa.name}＆${t.prompts.map((p) => p[0]).join("")}${notes}${cakes.map((c) => c.name).join("")}ケーキ（2個セット）写真はページで`);
  const W = 1080, H = 2110;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  imgBackground(ctx, W, H, 23, 180);
  imgFrame(ctx, W, H, "moon");

  ctx.textAlign = "center";
  ctx.fillStyle = "#cdb170";
  ctx.font = `500 24px ${IMG_EN}`;
  imgSpaced(ctx, "FUTARI NO TSUKI", W / 2, 140, 7);
  ctx.fillStyle = imgGold(ctx, 300, 0, 780, 0);
  ctx.font = `600 76px ${IMG_FONT}`;
  imgSpaced(ctx, "ふたりの月", W / 2, 232, 12);
  ctx.fillStyle = "#e8d096";
  ctx.font = `500 32px ${IMG_FONT}`;
  ctx.fillText(`${t.name}（${t.kana}）のふたり`, W / 2, 290);
  ctx.fillStyle = "#f4e7c4";
  // ふたりの名前：1行に入らなければ2行（ひとりめ ＆ / ふたりめ）にして、入る大きさまで小さくする
  const pairText = `${me.name}  ＆  ${pa.name}`;
  const lines = [`${me.name}  ＆`, pa.name];
  let shift = 0;
  ctx.font = `600 42px ${IMG_FONT}`;
  if (ctx.measureText(pairText).width <= W - 220) {
    ctx.fillText(pairText, W / 2, 352);
  } else {
    let size = 36;
    const fits = () => lines.every((l) => ctx.measureText(l).width <= W - 220);
    for (; size > 20; size -= 2) {
      ctx.font = `600 ${size}px ${IMG_FONT}`;
      if (fits()) break;
    }
    ctx.fillText(lines[0], W / 2, 334, W - 220);
    ctx.fillText(lines[1], W / 2, 334 + size + 6, W - 220);
    shift = size - 12;
  }
  imgRule(ctx, W / 2, 382 + shift, 260);

  const pw = 446, ph = 251, gap = 28;
  const x1 = (W - (pw * 2 + gap)) / 2, x2 = x1 + pw + gap;
  let y = 412 + shift;
  for (let i = 0; i < 3; i++) {
    imgRuns(ctx, [
      { text: IMG_KANJI_NUM[i + 1], font: `600 30px ${IMG_FONT}`, color: "#e3c886" },
      { text: `  ${t.prompts[i][0]}`, font: `500 30px ${IMG_FONT}`, color: "#f4ecd2" }
    ], x1 + 2, y + 32, "left");
    y += 50;
    const cols = [["me", x1, me.name, me.photos[i]], ["partner", x2, pa.name, (pa.photos || [])[i]]];
    for (const [side, x, who, p] of cols) {
      const im = await ftPhotoBitmap(side, i, p);
      ctx.save();
      imgRoundRectPath(ctx, x, y, pw, ph, 16);
      ctx.fillStyle = "#0d1630";
      ctx.fill();
      ctx.clip();
      if (im) ftDrawCover(ctx, im, x, y, pw, ph);
      else {
        ctx.fillStyle = "#56627d";
        ctx.font = `500 24px ${IMG_FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(p ? "写真はページで" : "写真なし", x + pw / 2, y + ph / 2 + 8);
      }
      ctx.restore();
      ctx.save();
      imgRoundRectPath(ctx, x, y, pw, ph, 16);
      ctx.strokeStyle = "rgba(214,179,101,.55)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      ctx.textAlign = "left";
      ctx.fillStyle = "#e3c886";
      let ws = 23;
      ctx.font = `600 ${ws}px ${IMG_FONT}`;
      while (ctx.measureText(who).width > pw - 8 && ws > 14) { ws -= 1; ctx.font = `600 ${ws}px ${IMG_FONT}`; }
      ctx.fillText(who, x + 4, y + ph + 34, pw - 8);
      if (p && p.note) {
        ctx.fillStyle = "#cfd6e6";
        ctx.font = `500 21px ${IMG_FONT}`;
        imgWrapLines(ctx, p.note, pw - 8).slice(0, 2).forEach((line, k) => ctx.fillText(line, x + 4, y + ph + 64 + k * 28));
      }
    }
    y += ph + 104;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#cdb170";
  ctx.font = `500 26px ${IMG_FONT}`;
  ctx.fillText(`ふたりへのケーキ ・ ${t.name}`, W / 2, y + 22);
  const cy = y + 44, size = 210;
  for (let k = 0; k < 2; k++) {
    const c = cakes[k];
    const cx = W / 2 + (k === 0 ? -1 : 1) * 190;
    const glow = ctx.createRadialGradient(cx, cy + size / 2, 10, cx, cy + size / 2, size * 0.7);
    glow.addColorStop(0, "rgba(255,236,190,.22)");
    glow.addColorStop(1, "rgba(255,236,190,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(cx - size, cy - 20, size * 2, size + 40);
    const im = c ? await imgLoad(await ftAssetUrl(c.asset).catch(() => "")) : null;
    if (im) {
      const s = Math.min(size / im.naturalWidth, size / im.naturalHeight);
      ctx.drawImage(im, cx - (im.naturalWidth * s) / 2, cy + (size - im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s);
    }
    ctx.fillStyle = "#f4ecd2";
    ctx.font = `500 23px ${IMG_FONT}`;
    if (c) imgCenterText(ctx, c.name, cx, cy + size + 30, 360);
  }
  await imgFooter(ctx, W, H);
  return cv;
}

async function ftSave(btn) {
  btn.disabled = true;
  toast("画像を作っています…");
  try {
    const r = await saveCanvas(await ftMakeImage(), "moonlight-futari.png");
    if (r === "downloaded") toast("画像を保存しました");
    ftFlag("saved", "1");
    const keep = $("ftKeep");
    if (keep) keep.outerHTML = ftKeepHtml();
  } catch (e) {
    toast(e.message || "保存できませんでした");
  } finally {
    if (btn.isConnected) btn.disabled = false;
  }
}

// ---------- 起動（album.js の start から呼ぶ） ----------
function futariInit() {
  const root = $("ftRoot");
  if (!root) return;
  root.addEventListener("click", (e) => {
    const z = e.target.closest("[data-ft-zoom]");
    if (z) { ftZoom(z.dataset.ftZoom); return; }
    const pick = e.target.closest("[data-ft-pick]");
    if (pick) { ftPick(pick.dataset.ftPick); return; }
    const b = e.target.closest("[data-ft-act]");
    if (!b) return;
    const act = b.dataset.ftAct;
    if (act === "qback") ftQuizBack();
    else if (act === "qsend") ftSendAnswers(b);
    else if (act === "redo") { ftQuiz = { i: 0, picks: [] }; renderFutari(true); }
    else if (act === "qcancel") { ftQuiz = null; renderFutari(true); }
    else if (act === "edit") {
      ftEditSlot = Number(b.dataset.slot);
      renderFutari(true);
      $("ftRoot").querySelector(`.ft-form[data-slot="${ftEditSlot}"] input[name="url"]`)?.focus();
    }
    else if (act === "cancel") { ftEditSlot = null; renderFutari(true); }
    else if (act === "clear") ftClearPhoto(Number(b.dataset.slot));
    else if (act === "open") ftStartWait();
    else if (act === "stop") ftStopWait(true);
    else if (act === "save") ftSave(b);
    else if (act === "toalbum") document.querySelector("#ftRoot .ft-album")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  root.addEventListener("submit", (e) => {
    const f = e.target.closest(".ft-form");
    if (!f) return;
    e.preventDefault();
    ftSubmitPhoto(f);
  });
  root.addEventListener("input", (e) => {
    const m = e.target.closest(".ft-form")?.querySelector(".ft-msg");
    if (m) m.textContent = "";
  });
  root.addEventListener("toggle", (e) => { if (e.target.classList?.contains("ft-more")) ftMoreOpen = e.target.open; }, true);
  root.addEventListener("focusout", () => {
    setTimeout(() => { if (ftDirty && !root.contains(document.activeElement)) renderFutari(); }, 0);
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden && ftWaiting) ftStopWait(true); });
  clearInterval(ftPollTimer);
  ftPollTimer = setInterval(ftPollTick, 1000);
}
