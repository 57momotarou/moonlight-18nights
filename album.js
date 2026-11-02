// album.js — お客さん用ページ：夜空（誰でも）と、4桁の番号で開くアルバム（図鑑・画像と飾り・寄せ書きのタブ）。画像は album-image.js。
"use strict";

const CODE_KEY = "moonlight-album-code";
const $ = (id) => document.getElementById(id);
let pub = null;      // cake_public の結果
let album = null;    // cake_album の結果
let code = "";
let pollTimer = null;
let saveState = null; // カード画像の保存パネル { night, names:[{name, on}], frame, shooting, timer }
let activeTab = "collection";
let albumPreviewTimer = null;

const TITLES = [
  [18, "満月の住人"],
  [12, "十三夜の常連"],
  [7, "月見の常連"],
  [3, "宵の客"],
  [1, "はじめての夜"]
];

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add("hidden"), 2600);
}

function testArgs() {
  const t = cakeTestNight();
  return t === null ? {} : { p_test_night: t };
}

function rand(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// 欠けた月（frac: 0=新月, 1=満月。右から満ちる）
function moonSvg(frac, size = 76, glow = true) {
  const r = 40, cx = 50, cy = 50;
  const f = Math.max(0, Math.min(1, frac));
  let lit = "";
  if (f >= 0.995) {
    lit = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#mg)"/>`;
  } else if (f > 0.005) {
    const rx = Math.abs(1 - 2 * f) * r;
    const sweep = f < 0.5 ? 0 : 1;
    lit = `<path d="M${cx},${cy - r} A${r},${r} 0 0 1 ${cx},${cy + r} A${rx},${r} 0 0 ${sweep} ${cx},${cy - r}Z" fill="url(#mg)"/>`;
  }
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
    <defs><radialGradient id="mg" cx="40%" cy="38%"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#e9d9a8"/></radialGradient>
    <filter id="mglow"><feGaussianBlur stdDeviation="${glow ? 4 : 0}"/></filter></defs>
    ${glow && f > 0.3 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#f6e7b6" opacity="${0.18 * f}" filter="url(#mglow)"/>` : ""}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#1a2440" stroke="rgba(244,236,210,.18)"/>
    ${lit}
  </svg>`;
}

function stageFrac(stars, thresholds) {
  const last = thresholds[thresholds.length - 1] || 1;
  return Math.max(0.04, Math.min(1, stars / last));
}

function paintBgStars() {
  let html = "";
  for (let i = 0; i < 60; i++) {
    html += `<i style="left:${(rand(i) * 100).toFixed(2)}%;top:${(rand(i + 99) * 100).toFixed(2)}%;animation-delay:${(rand(i + 7) * 4).toFixed(2)}s;opacity:${(0.2 + rand(i + 3) * 0.5).toFixed(2)}"></i>`;
  }
  $("bgStars").innerHTML = html;
}

// ---------- 夜空（みんなの星） ----------
function renderSky() {
  if (!pub) return;
  const { stars, thresholds, stage, night, total_nights: total, start_date: start, tonight_stars: tonight } = pub;
  document.body.className = `stage-${stage}${CAKE_TEST ? " is-demo" : ""}`;

  let badge;
  if (night < 1) badge = `🌑 ${cakeNightDate(start, 1)} 開幕`;
  else if (night > total) badge = "🌕 18夜、ありがとうございました";
  else if (night === total) badge = `🌕 最終夜 ${cakeNightDate(start, night)}`;
  else badge = `🌙 第${night}夜 ${cakeNightDate(start, night)}`;
  $("nightBadge").textContent = (CAKE_TEST ? "🧪 " : "") + badge;

  const shown = Math.min(stars, 320);
  let dots = "";
  for (let i = 0; i < shown; i++) {
    const x = 4 + rand(i + 1) * 92;
    const y = 6 + rand(i + 501) * 76;
    if (x > 60 && y < 46) continue;
    const s = 0.35 + rand(i + 901) * 0.75;
    const isNew = i >= stars - tonight;
    dots += `<circle class="star-dot" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${s.toFixed(2)}" fill="${isNew ? "#ffe9a8" : "#ffffff"}" opacity="${(0.55 + rand(i + 33) * 0.45).toFixed(2)}" style="animation-delay:${(rand(i + 77) * 5).toFixed(2)}s"/>`;
  }
  const moon = moonSvg(stageFrac(stars, thresholds), 100, true).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  $("sky").innerHTML = `<svg viewBox="0 0 100 69" preserveAspectRatio="xMidYMid slice">
      ${dots}
      <g transform="translate(68,4) scale(.3)">${moon}</g>
    </svg>
    <div class="sky-label">
      <div><div class="sky-count">${stars}<small>の星</small></div>みんなで灯した星${night >= 1 && night <= total ? `（今夜 +${tonight}）` : ""}</div>
      <div style="text-align:right">${CAKE_STAGES[stage].icon} いまは${CAKE_STAGES[stage].name}</div>
    </div>`;

  const next = thresholds.find((t) => stars < t);
  const prev = [...thresholds].reverse().find((t) => stars >= t) || 0;
  if (next) {
    $("skyNext").textContent = `${CAKE_STAGES[stage + 1].icon} ${CAKE_STAGES[stage + 1].name}まで、あと${next - stars}個の星`;
    $("skyBar").style.width = `${((stars - prev) / (next - prev)) * 100}%`;
  } else {
    $("skyNext").textContent = "🌕 満月がのぼりました。みんな、ありがとう。";
    $("skyBar").style.width = "100%";
  }
  $("stages").innerHTML = thresholds.map((t, i) =>
    `<div class="${stars >= t ? "done" : ""}"><b>${CAKE_STAGES[i + 1].icon}</b>${CAKE_STAGES[i + 1].name}<br>${t}</div>`).join("");

  if (night < 1) {
    $("tonightTitle").textContent = `${cakeNightDate(start, 1)}の夜から始まります`;
    $("tonightText").textContent = "毎晩ちがうケーキセットが登場します。中身はMoonlightで頼んだ人だけのひみつ。";
  } else if (night > total) {
    $("tonightTitle").textContent = "18夜のケーキセットは終わりました";
    $("tonightText").textContent = "来てくれたみなさん、本当にありがとうございました。アルバムはこれからも開けます。";
  } else {
    $("tonightTitle").textContent = night === total ? "最終夜のケーキは、お店で" : "今夜のケーキは、お店でのお楽しみ";
    $("tonightText").textContent = "中身はMoonlightでケーキセットを頼んだ人だけのひみつです。";
  }

  if (album && album.tonight) renderTonightCard();

}

// 「今夜のケーキ」欄：今夜買った（記録された）人がアルバムを開いているときだけ、？がケーキに変わる
// 「今夜のケーキ」欄：今夜買った（記録された）人には「今夜のケーキを見る」ボタン。押すと？がケーキに変わる（図鑑の開封と同じ扱い）
function renderTonightCard(reveal = false) {
  const t = album && album.tonight;
  const dome = document.querySelector("#tonightCard .dome");
  const btn = $("tonightRevealBtn");
  if (!t) {
    btn.classList.add("hidden");
    if (dome.classList.contains("got") || dome.dataset.night) {
      dome.classList.remove("got", "reveal");
      dome.dataset.night = "";
      dome.textContent = "？";
      renderSky();
    }
    return;
  }
  const opened = getSeen().has(t.night);
  if (!opened) {
    dome.classList.remove("got");
    dome.dataset.night = "";
    dome.textContent = "？";
    $("tonightTitle").textContent = "今夜のケーキセットが届いています";
    $("tonightText").textContent = "ボタンを押して、今夜のケーキを見てみましょう。";
    btn.classList.remove("hidden");
    return;
  }
  btn.classList.add("hidden");
  dome.classList.add("got");
  dome.classList.toggle("reveal", reveal);
  if (dome.dataset.night !== String(t.night)) {
    dome.dataset.night = String(t.night);
    dome.innerHTML = `<img data-cake-night="${t.night}" alt="${cakeEsc(t.cake)}">`;
    cakeHydrateImages(dome);
  }
  $("tonightTitle").textContent = t.cake;
  $("tonightText").textContent = `＋ ${t.drink}　今夜のケーキセットがアルバムに入りました。`;
}

function revealTonight() {
  const t = album && album.tonight;
  if (!t) return;
  markSeen(t.night);
  renderTonightCard(true);
  renderAlbum();
}

async function loadPublic() {
  try {
    pub = await cakeRpc("cake_public", testArgs());
    renderSky();
  } catch (e) {
    $("nightBadge").textContent = "⚠ " + e.message;
  }
}

// ---------- アルバム ----------
function seenKey() { return `moonlight-album-seen-${code}`; }
function getSeen() {
  try { return new Set(JSON.parse(cakeStore(seenKey()) || "[]")); } catch { return new Set(); }
}
function markSeen(night) {
  const s = getSeen();
  s.add(night);
  cakeStore(seenKey(), JSON.stringify([...s]));
}

function titleFor(count) {
  const hit = TITLES.find(([n]) => count >= n);
  return hit ? hit[1] : "";
}

// 前の夜から続けて来た夜に印を付ける（連続来店）
function annotateStreaks(a) {
  const nights = new Set(a.visits.map((v) => v.night));
  let best = 0, run = 0;
  for (let n = 1; n <= a.total_nights; n++) {
    run = nights.has(n) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  a.visits.forEach((v) => { v.streak = nights.has(v.night - 1); });
  a.maxStreak = best;
}

function hasStreak() {
  return Boolean(album && album.maxStreak >= 2);
}

function frameKey() { return `moonlight-album-frame-${code}`; }

function unlockedFrames() {
  const count = album ? album.visits.length : 0;
  return CAKE_FRAMES.filter((f) => count >= f.need);
}

function currentFrame() {
  const ok = unlockedFrames();
  const saved = cakeStore(frameKey());
  if (saved && ok.some((f) => f.id === saved)) return saved;
  return ok.length ? ok[ok.length - 1].id : "moon";
}

function frameChipsHtml(selected, attr) {
  const count = album.visits.length;
  return CAKE_FRAMES.map((f) => {
    const ok = count >= f.need;
    return `<button type="button" class="frame-chip${f.id === selected ? " active" : ""}" ${attr}="${f.id}"${ok ? "" : " disabled"}>
      <b>${cakeEsc(f.name)}</b><small>${ok ? `${f.need}夜で解放` : `あと${f.need - count}夜`}</small></button>`;
  }).join("");
}

function renderImagesTab() {
  if (!album) return;
  $("framePicker").innerHTML = frameChipsHtml(currentFrame(), "data-frame");
  const sh = $("optShooting");
  sh.disabled = !hasStreak();
  if (!hasStreak()) sh.checked = false;
  sh.parentElement.style.opacity = hasStreak() ? "1" : ".45";
  renderCert();
  if (activeTab === "images") refreshAlbumPreview();
}

function albumImageOptions() {
  return { showName: $("optName").checked, showTitle: $("optTitle").checked, frame: currentFrame(), shooting: $("optShooting").checked };
}

function refreshAlbumPreview() {
  clearTimeout(albumPreviewTimer);
  albumPreviewTimer = setTimeout(async () => {
    if (!album) return;
    const cv = await makeAlbumImage(album, titleFor(album.visits.length), albumImageOptions());
    $("albumPreview").src = cv.toDataURL("image/jpeg", 0.75);
  }, 150);
}

function certReady() {
  return Boolean(album && album.night >= album.total_nights && album.visits.length >= 1);
}

function renderCert() {
  const a = album;
  if (!certReady()) {
    $("certBody").innerHTML = `<div class="cert-lock"><b>🔒</b><div>最終夜（${cakeNightDate(a.start_date, a.total_nights)}）に届きます。<br>来てくれた夜の数で月の形が変わる、あなただけの証明書です。<br>いまは「${certPhase(a.visits.length, a.total_nights).name}証明書」。18夜すべて来ると「満月証明書」になります。</div></div>`;
    return;
  }
  if (!$("certPreview")) {
    $("certBody").innerHTML = `<div class="save-panel"><img class="preview" id="certPreview" alt="満月証明書"><button class="btn block" type="button" id="saveCertBtn">証明書を保存</button></div>`;
  }
  makeCertificate(a, titleFor(a.visits.length), { frame: a.visits.length >= a.total_nights ? "full" : currentFrame() })
    .then((cv) => { const im = $("certPreview"); if (im) im.src = cv.toDataURL("image/jpeg", 0.8); });
}

function setTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tabs .tab").forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll("[data-panel]").forEach((el) => el.classList.toggle("hidden", el.dataset.panel !== tab));
  if (tab === "images") renderImagesTab();
}

// みんなの寄せ書き（最終夜から。アルバムを開いた人だけに届く）
function renderAllMessages() {
  const names = album && Array.isArray(album.names) ? album.names : null;
  $("finalCard").classList.toggle("hidden", !names);
  if (names) $("finalNames").innerHTML = names.map((n) => `<span>${cakeEsc(n)}</span>`).join("") || '<span class="muted">まだいません</span>';
  const msgs = album && Array.isArray(album.messages) ? album.messages : null;
  $("allMessagesCard").classList.toggle("hidden", !msgs);
  if (!msgs) return;
  $("allMessages").innerHTML = msgs.map((m) => `<div><b>${cakeEsc(m.name)}</b>${cakeEsc(m.message)}</div>`).join("")
    || '<div class="small muted">まだ寄せ書きはありません</div>';
}

function renderMessageStatus() {
  const el = $("messageStatus");
  if (!album || !album.message) { el.textContent = ""; el.className = "small"; return; }
  const st = album.message_status;
  const text = st === "hidden" ? "このひとことは公開されません" : "✓ 最終夜に、アルバムを持っている人だけが見られる寄せ書きとして公開されます";
  el.textContent = text;
  el.className = `small msg-${st === "hidden" ? "hidden" : "approved"}`;
}

function renderAlbum() {
  if (!album) return;
  const a = album;
  const total = a.total_nights;
  const count = a.visits.length;
  const byNight = new Map(a.visits.map((v) => [v.night, v]));
  const seen = getSeen();

  $("albumName").textContent = a.name;
  $("albumCode").textContent = a.code ? `No. ${a.code}` : "";
  $("nameReq").innerHTML = a.name_request
    ? `名前の変更を確認中：「${cakeEsc(a.name_request.new_name)}」`
    : `<button type="button" class="linklike small" id="nameFixBtn">名前がまちがっているときは</button>`;
  $("albumTitle").textContent = `${titleFor(count)}　・　${count} / ${total}夜${a.maxStreak >= 2 ? `　・　✦ 最長${a.maxStreak}夜連続` : ""}`;
  $("myMoon").innerHTML = moonSvg(count / total, 76, true);
  $("gridCard").classList.toggle("complete", count >= total);

  let html = "";
  for (let n = 1; n <= total; n++) {
    const v = byNight.get(n);
    const date = cakeNightDate(a.start_date, n);
    const finalCls = n === total ? " final" : "";
    if (v && !seen.has(n)) {
      html += `<button class="tile sealed${finalCls}" data-open="${n}" type="button"><span class="n">第${n}夜</span><b>✉</b>開けてみる</button>`;
    } else if (v) {
      html += `<button class="tile got${v.together.length ? " pair" : ""}${v.streak ? " streak" : ""}${finalCls}" data-show="${n}" type="button"><span class="n">${date}</span>
        <img data-cake-night="${v.night}" alt=""><span class="t">${cakeEsc(v.cake)}</span></button>`;
    } else if (n === a.night) {
      html += `<div class="tile today${finalCls}"><span class="n">${date}</span>今夜<br>？</div>`;
    } else if (n < a.night) {
      html += `<div class="tile passed${finalCls}"><span class="n">${date}</span>🌫<br>夜空の向こう</div>`;
    } else {
      html += `<div class="tile${finalCls}"><span class="n">${date}</span>？</div>`;
    }
  }
  $("grid").innerHTML = html;

  const pairs = a.visits.filter((v) => v.together.length && seen.has(v.night));
  $("pairCard").classList.toggle("hidden", !pairs.length);
  $("pairs").innerHTML = pairs.map((v) => `<button type="button" class="pair-card" data-show="${v.night}"><img data-cake-night="${v.night}" alt="">
      <div style="text-align:left"><div class="small muted">第${v.night}夜 ${cakeNightDate(a.start_date, v.night)}</div>
      <div class="names">${cakeEsc(a.name)} と ${v.together.map(cakeEsc).join("、")}</div>
      <div class="small">${cakeEsc(v.cake)}</div></div></button>`).join("");

  const t = a.teaser;
  if (t) {
    $("teaser").innerHTML = `<img data-cake-night="${t.night}" data-cake-kind="silhouette" alt="明日のケーキのシルエット">
      <div><div class="small muted">第${t.night}夜 ${cakeNightDate(a.start_date, t.night)}</div>
      <div class="hint">${cakeEsc(t.hint)}</div>
      <div class="small muted" style="margin-top:6px">正体は、明日の夜Moonlightで。</div></div>`;
    $("teaserCard").classList.remove("hidden");
  } else {
    $("teaserCard").classList.add("hidden");
  }

  if (document.activeElement !== $("messageInput")) {
    $("messageInput").value = a.message || "";
    updateCount();
  }
  renderMessageStatus();
  renderAllMessages();
  renderTonightCard();
  cakeHydrateImages($("albumView"));
  if (activeTab === "images") renderImagesTab();
}

// ---------- カードの詳細と画像保存 ----------
function cardInfoHtml(v, n, reveal) {
  const isFinal = n === album.total_nights;
  return `
    <div class="kicker">第${n}夜 ・ ${cakeNightDate(album.start_date, n)}${isFinal ? " ・ 満月の夜" : ""}</div>
    <img data-cake-night="${v.night}" alt="${cakeEsc(v.cake)}">
    ${v.streak ? `<div class="streak-badge">✦ 連続来店ボーナス：流れ星</div>` : ""}
    <h3>${cakeEsc(v.cake)}</h3>
    <p class="drink">＋ ${cakeEsc(v.drink)}</p>
    <p class="pr">${cakeEsc(v.pr)}</p>
    ${v.together.length ? `<div class="with">🫖 ${v.together.map(cakeEsc).join("、")} と一緒に</div>` : ""}
    ${isFinal ? `<p class="small" style="color:var(--gold2)">満月の夜に来てくれて、ありがとう。</p>` : ""}
    <div class="actions">
      <button class="btn ghost" type="button" data-act="save">画像を保存</button>
      <button class="btn" type="button" data-act="close">${reveal ? "アルバムにしまう" : "閉じる"}</button>
    </div>`;
}

function showTonight() {
  const t = album?.tonight;
  if (!t) return;
  saveState = null;
  $("modalCard").className = "modal-card reveal";
  $("modalCard").dataset.night = "";
  $("modalCard").innerHTML = `
    <div class="kicker">第${t.night}夜 ・ ${cakeNightDate(album.start_date, t.night)} ・ 今夜のケーキセット</div>
    <img data-cake-night="${t.night}" alt="${cakeEsc(t.cake)}">
    <h3>${cakeEsc(t.cake)}</h3>
    <p class="drink">＋ ${cakeEsc(t.drink)}</p>
    <p class="pr">${cakeEsc(t.pr)}</p>
    <div class="tonight-note">Moonlightで頼むと、このカードがアルバムに入ります</div>
    <div class="actions"><button class="btn" type="button" data-act="close">閉じる</button></div>`;
  $("modal").classList.remove("hidden");
  cakeHydrateImages($("modalCard"));
}

function showNameRequest() {
  saveState = null;
  $("modalCard").className = "modal-card";
  $("modalCard").dataset.night = "";
  $("modalCard").innerHTML = `
    <div class="kicker">名前の変更</div>
    <h3>正しい名前を教えてください</h3>
    <p class="small muted">いまの名前：${cakeEsc(album.name)}<br>店長が確認してから、アルバムとお店の記録の名前が変わります。</p>
    <div class="save-panel"><div class="add"><input type="text" id="newNameInput" maxlength="30" value="${cakeEsc(album.name)}"></div></div>
    <p class="error" id="nameReqError"></p>
    <div class="actions">
      <button class="btn" type="button" data-act="sendname">送る</button>
      <button class="btn ghost" type="button" data-act="close">やめる</button>
    </div>`;
  $("modal").classList.remove("hidden");
  $("newNameInput").focus();
}

async function sendNameRequest() {
  const name = $("newNameInput").value.trim();
  try {
    await cakeRpc("cake_request_name", { p_code: code, p_name: name, ...testArgs() });
    closeModal();
    toast("名前の変更を送りました。店長の確認をお待ちください");
    await openAlbum(code, { quiet: true });
  } catch (e) {
    $("nameReqError").textContent = e.message;
  }
}

function showCard(n, reveal) {
  const v = album?.visits.find((x) => x.night === n);
  if (!v) return;
  saveState = null;
  $("modalCard").className = "modal-card" + (reveal ? " reveal" : "");
  $("modalCard").innerHTML = cardInfoHtml(v, n, reveal);
  $("modalCard").dataset.night = String(n);
  $("modal").classList.remove("hidden");
  cakeHydrateImages($("modalCard"));
  $("modalCard").querySelector('[data-act="close"]').focus();
  if (reveal) markSeen(n);
}

function openSavePanel(n) {
  const v = album.visits.find((x) => x.night === n);
  saveState = {
    night: n,
    names: [{ name: album.name, on: false }, ...v.together.map((name) => ({ name, on: true }))],
    frame: currentFrame(),
    shooting: Boolean(v.streak),
    timer: null
  };
  $("modalCard").className = "modal-card";
  $("modalCard").innerHTML = `
    <div class="kicker">第${n}夜の画像を保存</div>
    <div class="save-panel">
      <img class="preview" id="savePreview" alt="保存する画像のプレビュー">
      <div class="small muted" style="margin:0 0 6px">画像に入れる名前（入れなくてもOK）</div>
      <div class="checks" id="saveChecks"></div>
      <div class="small muted" style="margin:0 0 6px">フレーム</div>
      <div class="frames" id="saveFrames"></div>
      <div class="checks"><label style="${hasStreak() ? "" : "opacity:.45"}"><input type="checkbox" id="saveShooting"${saveState.shooting ? " checked" : ""}${hasStreak() ? "" : " disabled"}>流れ星を入れる${hasStreak() ? "" : '<span class="small muted">（2夜続けて来ると使えます）</span>'}</label></div>
      <div class="actions">
        <button class="btn" type="button" data-act="download">保存する</button>
        <button class="btn ghost" type="button" data-act="back">もどる</button>
      </div>
    </div>`;
  renderSaveChecks();
  $("saveFrames").innerHTML = frameChipsHtml(saveState.frame, "data-save-frame");
  refreshPreview();
}

function renderSaveChecks() {
  $("saveChecks").innerHTML = saveState.names.map((x, i) =>
    `<label><input type="checkbox" data-i="${i}"${x.on ? " checked" : ""}>${i === 0 ? "" : '<span class="small muted">with</span>'}${cakeEsc(x.name)}${i === 0 ? '<span class="small muted">（あなた）</span>' : ""}</label>`).join("");
}

function chosenNames() {
  const [self, ...others] = saveState.names;
  return { selfName: self.on ? self.name : "", withNames: others.filter((x) => x.on).map((x) => x.name) };
}

function refreshPreview() {
  if (!saveState) return;
  clearTimeout(saveState.timer);
  saveState.timer = setTimeout(async () => {
    const v = album.visits.find((x) => x.night === saveState.night);
    const cv = await makeCardImage({ visit: v, ...chosenNames(), startDate: album.start_date, total: album.total_nights, frame: saveState.frame, shooting: saveState.shooting });
    const img = $("savePreview");
    if (img) img.src = cv.toDataURL("image/jpeg", 0.8);
    saveState.canvas = cv;
  }, 120);
}

async function downloadCard() {
  const btn = $("modalCard").querySelector('[data-act="download"]');
  btn.disabled = true;
  try {
    const v = album.visits.find((x) => x.night === saveState.night);
    const cv = await makeCardImage({ visit: v, ...chosenNames(), startDate: album.start_date, total: album.total_nights, frame: saveState.frame, shooting: saveState.shooting });
    const r = await saveCanvas(cv, `moonlight-18nights-${String(saveState.night).padStart(2, "0")}.png`);
    if (r === "downloaded") toast("画像を保存しました");
  } catch (e) {
    toast(e.message || "保存できませんでした");
  } finally {
    btn.disabled = false;
  }
}

function closeModal() {
  saveState = null;
  $("modal").classList.add("hidden");
  renderAlbum();
}

async function saveWhole(kind) {
  const btn = kind === "sky" ? $("saveSkyBtn") : kind === "cert" ? $("saveCertBtn") : $("saveAlbumBtn");
  btn.disabled = true;
  toast("画像を作っています…");
  try {
    const cv = kind === "sky" ? await makeSkyImage(pub)
      : kind === "cert" ? await makeCertificate(album, titleFor(album.visits.length), { frame: album.visits.length >= album.total_nights ? "full" : currentFrame() })
      : await makeAlbumImage(album, titleFor(album.visits.length), albumImageOptions());
    const r = await saveCanvas(cv, kind === "sky" ? "moonlight-sky.png" : kind === "cert" ? "moonlight-certificate.png" : "moonlight-album.png");
    if (r === "downloaded") toast("画像を保存しました");
  } catch (e) {
    toast(e.message || "保存できませんでした");
  } finally {
    btn.disabled = false;
  }
}

// ---------- 開く・閉じる ----------
async function openAlbum(c, { quiet = false } = {}) {
  code = c;
  try {
    album = await cakeRpc("cake_album", { p_code: c, ...testArgs() });
    cakeSetImageCode(c);
    annotateStreaks(album);
    cakeStore(CODE_KEY, c);
    $("openCard").classList.add("hidden");
    $("aboutCard").classList.add("hidden");
    $("albumView").classList.remove("hidden");
    $("codeError").textContent = "";
    if (pub && album.test === pub.test) { pub.stars = album.stars; pub.stage = album.stage; renderSky(); }
    renderAlbum();
    return true;
  } catch (e) {
    if (!quiet) $("codeError").textContent = e.message;
    if (/見つかりません/.test(e.message)) cakeStore(CODE_KEY, null);
    return false;
  }
}

function closeAlbum() {
  album = null;
  code = "";
  cakeStore(CODE_KEY, null);
  $("albumView").classList.add("hidden");
  renderTonightCard();
  setTab("collection");
  $("certBody").innerHTML = "";
  $("openCard").classList.remove("hidden");
  $("aboutCard").classList.remove("hidden");
  $("codeInput").value = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateCount() {
  $("messageCount").textContent = `${$("messageInput").value.length} / 80`;
}

async function saveMessage() {
  const btn = $("messageBtn");
  btn.disabled = true;
  try {
    const r = await cakeRpc("cake_set_message", { p_code: code, p_message: $("messageInput").value, ...testArgs() });
    if (album) { album.message = r.message; album.message_status = r.message_status; }
    renderMessageStatus();
    toast(r.message ? "ひとことを残しました" : "ひとことを消しました");
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
  }
}

async function refresh() {
  await loadPublic();
  if (code && !saveState) await openAlbum(code, { quiet: true });
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (!document.hidden) refresh(); }, 45000);
}

// ---------- 起動 ----------
function start() {
  paintBgStars();
  if (CAKE_TEST) {
    cakeMarkDemo();
    $("testBanner").classList.remove("hidden");
    const sel = $("testNightSelect");
    sel.innerHTML = cakeTestOptions(18);
    sel.value = String(cakeTestNight());
    sel.addEventListener("change", () => { setCakeTestNight(Number(sel.value)); refresh(); });
  }
  $("codeInput").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
    $("codeError").textContent = "";
  });
  $("codeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const c = $("codeInput").value;
    if (!/^\d{4}$/.test(c)) { $("codeError").textContent = "4桁の数字を入れてください"; return; }
    openAlbum(c);
  });
  $("grid").addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    const show = e.target.closest("[data-show]");
    if (open) showCard(Number(open.dataset.open), true);
    else if (show) showCard(Number(show.dataset.show), false);
  });
  $("pairs").addEventListener("click", (e) => {
    const show = e.target.closest("[data-show]");
    if (show) showCard(Number(show.dataset.show), false);
  });
  $("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") return closeModal();
    const act = e.target.closest("[data-act]")?.dataset.act;
    const n = Number($("modalCard").dataset.night);
    if (act === "close") closeModal();
    else if (act === "save") openSavePanel(n);
    else if (act === "back") showCard(n, false);
    else if (act === "download") downloadCard();
    else if (act === "sendname") sendNameRequest();
  });
  $("modal").addEventListener("change", (e) => {
    if (!saveState) return;
    if (e.target.id === "saveShooting") { saveState.shooting = e.target.checked; refreshPreview(); return; }
    const cb = e.target.closest('input[type="checkbox"][data-i]');
    if (!cb) return;
    saveState.names[Number(cb.dataset.i)].on = cb.checked;
    refreshPreview();
  });
  $("modal").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-save-frame]");
    if (!chip || !saveState || chip.disabled) return;
    saveState.frame = chip.dataset.saveFrame;
    $("saveFrames").innerHTML = frameChipsHtml(saveState.frame, "data-save-frame");
    refreshPreview();
  });
  document.querySelectorAll(".tabs .tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  $("framePicker").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-frame]");
    if (!chip || chip.disabled) return;
    cakeStore(frameKey(), chip.dataset.frame);
    renderImagesTab();
  });
  ["optName", "optTitle", "optShooting"].forEach((id) => $(id).addEventListener("change", refreshAlbumPreview));
  $("certBody").addEventListener("click", (e) => { if (e.target.id === "saveCertBtn") saveWhole("cert"); });
  $("modal").addEventListener("keydown", (e) => {
    if (e.target.id === "newNameInput" && e.key === "Enter" && !e.isComposing) { e.preventDefault(); sendNameRequest(); }
  });
  $("nameReq").addEventListener("click", (e) => { if (e.target.id === "nameFixBtn") showNameRequest(); });
  $("tonightRevealBtn").addEventListener("click", revealTonight);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("modal").classList.contains("hidden")) closeModal(); });
  $("closeBtn").addEventListener("click", closeAlbum);
  $("reloadBtn").addEventListener("click", async () => { await refresh(); toast("最新の状態にしました"); });
  $("saveAlbumBtn").addEventListener("click", () => saveWhole("album"));
  $("saveSkyBtn").addEventListener("click", () => saveWhole("sky"));
  $("messageInput").addEventListener("input", updateCount);
  $("messageBtn").addEventListener("click", saveMessage);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

  loadPublic().then(() => {
    const saved = cakeStore(CODE_KEY);
    if (saved && /^\d{4}$/.test(saved)) openAlbum(saved, { quiet: true });
  });
  startPolling();
}

start();
