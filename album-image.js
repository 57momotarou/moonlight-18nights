// album-image.js — アルバムの画像保存：ケーキカード（名前は自分で選ぶ）・アルバム全体・満月証明書・夜空。フレームは集めた夜の数で増える。
"use strict";

const IMG_FONT = '"Shippori Mincho","Hiragino Mincho ProN","Yu Mincho",serif';
const IMG_EN = '"Cormorant Garamond","Shippori Mincho","Times New Roman",serif';
const IMG_KANJI_NUM = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八"];
const IMG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const imgCache = new Map();

function imgLoad(src) {
  if (!src) return Promise.resolve(null);
  if (!imgCache.has(src)) {
    imgCache.set(src, new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = src;
    }));
  }
  return imgCache.get(src);
}

// 画像に描く文字のフォントを先に読み込む（明朝は文字ごとに分かれて届くので、描く文字そのものを渡す）
async function imgFonts(sample = "") {
  const base = "第夜月満半十三日証明書さまのとケーキセット星空夜をともに過ごした" + IMG_KANJI_NUM.join("") + sample;
  try {
    await Promise.all([
      document.fonts.load(`600 60px ${IMG_FONT}`, base),
      document.fonts.load(`500 40px ${IMG_FONT}`, base),
      document.fonts.load(`500 30px ${IMG_EN}`, "EIGHTEEN NIGHTS OF THE MOON"),
      document.fonts.load(`600 30px ${IMG_FONT}`, "0123456789"),
      document.fonts.load(`italic 500 30px ${IMG_EN}`, "November with & cafe bar Moonlight")
    ]);
  } catch {}
}

function imgNightKanji(n) {
  return IMG_KANJI_NUM[n] || String(n);
}

function imgDateEn(startDate, night) {
  const [m, d] = cakeNightDate(startDate, night).split("/").map(Number);
  return `${IMG_MONTHS[m - 1] || ""} ${d}`;
}

// 字間をあけた欧文（大文字の見出し用）
function imgSpaced(ctx, text, x, y, spacing, align = "center") {
  const chars = [...String(text)];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
  let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  const prev = ctx.textAlign;
  ctx.textAlign = "left";
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i] + spacing; });
  ctx.textAlign = prev;
  return total;
}

// 書体の違う文字を1行に並べる（例：「& チャイ」「with 名前」）
function imgRuns(ctx, runs, x, y, align = "center", maxW = 0) {
  let scale = 1;
  const measure = () => runs.reduce((t, r) => {
    ctx.font = r.font.replace(/(\d+)px/, (_, n) => `${Math.round(n * scale)}px`);
    return t + ctx.measureText(r.text).width;
  }, 0);
  let total = measure();
  while (maxW && total > maxW && scale > 0.5) { scale -= 0.05; total = measure(); }
  let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  const prev = ctx.textAlign;
  ctx.textAlign = "left";
  for (const r of runs) {
    ctx.font = r.font.replace(/(\d+)px/, (_, n) => `${Math.round(n * scale)}px`);
    ctx.fillStyle = r.color;
    ctx.fillText(r.text, cx, y + (r.dy || 0));
    cx += ctx.measureText(r.text).width;
  }
  ctx.textAlign = prev;
  return total;
}

// 細い飾り線（中央が明るく、両端へ消える）。中央に小さな菱形
function imgRule(ctx, cx, y, half, diamond = true) {
  for (const sgn of [-1, 1]) {
    const g = ctx.createLinearGradient(cx + sgn * 10, 0, cx + sgn * half, 0);
    g.addColorStop(0, "rgba(232,208,150,.85)");
    g.addColorStop(1, "rgba(232,208,150,0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx + sgn * (diamond ? 10 : 0), y); ctx.lineTo(cx + sgn * half, y); ctx.stroke();
  }
  if (diamond) {
    ctx.fillStyle = "#e8d096";
    ctx.beginPath(); ctx.moveTo(cx, y - 4); ctx.lineTo(cx + 4, y); ctx.lineTo(cx, y + 4); ctx.lineTo(cx - 4, y); ctx.closePath(); ctx.fill();
  }
}

function imgRand(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function imgBackground(ctx, w, h, seed = 1, stars = 90) {
  const g = ctx.createRadialGradient(w * 0.5, -h * 0.1, 0, w * 0.5, -h * 0.1, h * 1.2);
  g.addColorStop(0, "#1d2a5c");
  g.addColorStop(0.55, "#0a1024");
  g.addColorStop(1, "#05070f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < stars; i++) {
    const x = imgRand(seed * 31 + i) * w;
    const y = imgRand(seed * 17 + i + 500) * h;
    const r = 0.6 + imgRand(i + seed + 900) * 1.8;
    ctx.globalAlpha = 0.25 + imgRand(i + 77) * 0.6;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// 欠けた月（frac 0〜1、右から満ちる）
function imgMoon(ctx, cx, cy, r, frac) {
  const f = Math.max(0, Math.min(1, frac));
  if (f > 0.3) {
    ctx.save();
    ctx.shadowColor = "rgba(246,231,182,.55)";
    ctx.shadowBlur = r * 0.6;
    ctx.fillStyle = "rgba(246,231,182,.12)";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "#1a2440";
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  if (f <= 0.005) return;
  const lg = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.1, cx, cy, r);
  lg.addColorStop(0, "#fffaf0");
  lg.addColorStop(1, "#e9d9a8");
  ctx.fillStyle = lg;
  ctx.beginPath();
  if (f >= 0.995) {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  } else {
    const rx = Math.abs(1 - 2 * f) * r;
    ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);           // 右半分
    ctx.ellipse(cx, cy, rx, r, 0, Math.PI / 2, -Math.PI / 2, f < 0.5); // 境目（三日月は右へ、十三夜は左へふくらむ）
  }
  ctx.fill();
}

function imgCenterText(ctx, text, x, y, maxW) {
  let size = Number((ctx.font.match(/(\d+)px/) || [0, 40])[1]);
  while (ctx.measureText(text).width > maxW && size > 18) {
    size -= 2;
    ctx.font = ctx.font.replace(/\d+px/, `${size}px`);
  }
  ctx.fillText(text, x, y);
}

function imgWrapLines(ctx, text, maxW) {
  const lines = [];
  let line = "";
  for (const ch of String(text)) {
    if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; }
    else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

async function imgFooter(ctx, w, h) {
  const logo = await imgLoad("icons/icon-192.png");
  ctx.font = `italic 500 30px ${IMG_EN}`;
  const label = "cafe & bar Moonlight";
  const tw = ctx.measureText(label).width;
  const lw = logo ? 40 + 14 : 0;
  const x0 = w / 2 - (lw + tw) / 2;
  if (logo) ctx.drawImage(logo, x0, h - 104, 40, 40);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(226,201,140,.9)";
  ctx.fillText(label, x0 + lw, h - 75);
  ctx.textAlign = "center";
}

// 名前の途中で折り返さない（入りきらない長い名前だけ文字で折る）
function imgWrapNames(ctx, names, maxW) {
  const sep = "  ・  ";
  const lines = [];
  let line = "";
  for (const name of names) {
    const next = line ? line + sep + name : name;
    if (ctx.measureText(next).width <= maxW) { line = next; continue; }
    if (line) lines.push(line);
    if (ctx.measureText(name).width <= maxW) { line = name; continue; }
    const parts = imgWrapLines(ctx, name, maxW);
    line = parts.pop() || "";
    lines.push(...parts);
  }
  if (line) lines.push(line);
  return lines;
}

// ---------- フレーム（集めた夜の数で増える）と流れ星 ----------
const CAKE_FRAMES = [
  { id: "moon", name: "月あかり", need: 1 },
  { id: "stardust", name: "星くず", need: 3 },
  { id: "crescent", name: "三日月", need: 7 },
  { id: "thirteen", name: "十三夜", need: 12 },
  { id: "full", name: "満月", need: 18 }
];

function imgStar(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function imgCrescent(ctx, x, y, r, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI * 0.25, Math.PI * 1.75, false);
  ctx.arc(r * 0.45, 0, r * 0.82, Math.PI * 1.62, Math.PI * 0.38, true);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function imgGold(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, "#b8913f");
  g.addColorStop(0.45, "#f8e7b0");
  g.addColorStop(0.55, "#e6c77d");
  g.addColorStop(1, "#a9822f");
  return g;
}

// 四隅の小さな飾り（4方向の光）
function imgSparkle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

function imgRoundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

// フレーム。すべて画像の内側（外枠 m=28〜）に収める。
function imgFrame(ctx, W, H, id) {
  const m = 28;
  const gold = imgGold(ctx, 0, 0, W, H);
  const corners = (inset) => [[inset, inset], [W - inset, inset], [W - inset, H - inset], [inset, H - inset]];
  ctx.save();
  ctx.lineJoin = "round";
  if (id === "moon") {
    ctx.strokeStyle = "rgba(214,179,101,.75)";
    ctx.lineWidth = 3;
    imgRoundRectPath(ctx, m, m, W - m * 2, H - m * 2, 18); ctx.stroke();
    ctx.strokeStyle = "rgba(214,179,101,.35)";
    ctx.lineWidth = 1.5;
    imgRoundRectPath(ctx, m + 12, m + 12, W - (m + 12) * 2, H - (m + 12) * 2, 12); ctx.stroke();
    ctx.fillStyle = "#f3dfa8";
    corners(m + 6).forEach(([x, y]) => imgSparkle(ctx, x, y, 12));
  } else if (id === "stardust") {
    ctx.strokeStyle = "rgba(214,179,101,.7)";
    ctx.lineWidth = 2.5;
    imgRoundRectPath(ctx, m, m, W - m * 2, H - m * 2, 18); ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(214,179,101,.35)";
    imgRoundRectPath(ctx, m + 12, m + 12, W - (m + 12) * 2, H - (m + 12) * 2, 12); ctx.stroke();
    // 4辺に沿って星くず
    ctx.fillStyle = "#f8e7b0";
    const side = (x0, y0, x1, y1, count, seed) => {
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count + (imgRand(seed + i) - 0.5) * 0.03;
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        ctx.globalAlpha = 0.45 + imgRand(seed + i + 50) * 0.55;
        if (i % 3 === 1) imgStar(ctx, x, y, 7 + imgRand(seed + i + 9) * 4);
        else { ctx.beginPath(); ctx.arc(x, y, 2 + imgRand(seed + i + 9) * 2, 0, Math.PI * 2); ctx.fill(); }
      }
    };
    side(m + 40, m, W - m - 40, m, 15, 1);
    side(m + 40, H - m, W - m - 40, H - m, 15, 40);
    side(m, m + 40, m, H - m - 40, Math.round(15 * H / W), 80);
    side(W - m, m + 40, W - m, H - m - 40, Math.round(15 * H / W), 120);
    ctx.globalAlpha = 1;
    corners(m + 4).forEach(([x, y]) => imgSparkle(ctx, x, y, 16));
  } else if (id === "crescent") {
    ctx.strokeStyle = gold;
    ctx.lineWidth = 3;
    imgRoundRectPath(ctx, m, m, W - m * 2, H - m * 2, 22); ctx.stroke();
    ctx.lineWidth = 1.5;
    imgRoundRectPath(ctx, m + 14, m + 14, W - (m + 14) * 2, H - (m + 14) * 2, 14); ctx.stroke();
    ctx.fillStyle = gold;
    const cs = corners(m + 34);
    const rots = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
    cs.forEach(([x, y], i) => imgCrescent(ctx, x, y, 22, rots[i]));
    ctx.fillStyle = "#f8e7b0";
    [[W / 2, m], [W / 2, H - m]].forEach(([x, y]) => { imgCrescent(ctx, x, y, 14, -Math.PI / 2); });
  } else if (id === "thirteen") {
    ctx.strokeStyle = gold;
    ctx.lineWidth = 6;
    imgRoundRectPath(ctx, m, m, W - m * 2, H - m * 2, 16); ctx.stroke();
    ctx.lineWidth = 1.5;
    imgRoundRectPath(ctx, m + 16, m + 16, W - (m + 16) * 2, H - (m + 16) * 2, 10); ctx.stroke();
    ctx.fillStyle = gold;
    corners(m + 8).forEach(([x, y]) => {
      ctx.beginPath();
      ctx.moveTo(x, y - 22); ctx.lineTo(x + 22, y); ctx.lineTo(x, y + 22); ctx.lineTo(x - 22, y);
      ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = "#fffaf0";
    corners(m + 8).forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = "#f8e7b0";
    for (const y of [m, H - m]) for (const dx of [-54, 0, 54]) imgStar(ctx, W / 2 + dx, y, dx ? 8 : 13);
  } else if (id === "full") {
    imgFrameFull(ctx, W, H, m, IMG_FULL_STYLE);
  }
  ctx.restore();
}

// 満月フレームの形（hairline：細い金線と小さな満月／deco：アールデコ／arch：アーチ窓）
let IMG_FULL_STYLE = "hairline";

// 満月の小さな光（フレームの切れ目に置く）
function imgFrameMoon(ctx, x, y, r) {
  const halo = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 4);
  halo.addColorStop(0, "rgba(255,240,200,.35)");
  halo.addColorStop(1, "rgba(255,240,200,0)");
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(x, y, r * 4, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, "#fffaf0");
  g.addColorStop(0.7, "#f6e7bf");
  g.addColorStop(1, "#d9bb78");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

// 満月のフレーム（18夜すべてで使える）
function imgFrameFull(ctx, W, H, m, style) {
  const gold = imgGold(ctx, 0, 0, W, H);
  ctx.save();
  if (style === "hairline") {
    // 細い金線1本＋内側の淡い線。四隅は内へえぐれた形。上の切れ目に小さな満月、下に小さな星
    const r = 30, gapT = 44, gapB = 22;
    const box = (d, lw, alpha, gaps) => {
      const x0 = m + d, y0 = m + d, x1 = W - m - d, y1 = H - m - d, rr = r + d * 0.2;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = lw;
      ctx.strokeStyle = gold;
      ctx.beginPath();
      if (gaps) { ctx.moveTo(W / 2 + gapT, y0); } else ctx.moveTo(W / 2, y0);
      ctx.lineTo(x1 - rr, y0);
      ctx.arc(x1, y0, rr, Math.PI, Math.PI / 2, true);
      ctx.lineTo(x1, y1 - rr);
      ctx.arc(x1, y1, rr, -Math.PI / 2, Math.PI, true);
      ctx.lineTo(gaps ? W / 2 + gapB : x0 + rr, y1);
      if (gaps) ctx.moveTo(W / 2 - gapB, y1);
      ctx.lineTo(x0 + rr, y1);
      ctx.arc(x0, y1, rr, 0, -Math.PI / 2, true);
      ctx.lineTo(x0, y0 + rr);
      ctx.arc(x0, y0, rr, Math.PI / 2, 0, true);
      ctx.lineTo(gaps ? W / 2 - gapT : W / 2, y0);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    box(0, 1.8, 1, true);
    box(10, 0.9, 0.45, false);
    ctx.fillStyle = "#f3dfa8";
    [[m, m], [W - m, m], [W - m, H - m], [m, H - m]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });
    imgFrameMoon(ctx, W / 2, m, 12);
    ctx.fillStyle = "#f3dfa8";
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(W / 2 + s * 30, m, 2, 0, Math.PI * 2); ctx.fill(); }
    imgSparkle(ctx, W / 2, H - m, 9);
  } else if (style === "deco") {
    // アールデコ：二重線、四隅に段の飾り、上中央は満月から光の筋
    ctx.strokeStyle = gold;
    const rectGap = (d, lw, gt, gb) => {
      const x0 = m + d, y0 = m + d, x1 = W - m - d, y1 = H - m - d;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(W / 2 + gt, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y1); ctx.lineTo(W / 2 + gb, y1);
      ctx.moveTo(W / 2 - gb, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y0); ctx.lineTo(W / 2 - gt, y0);
      ctx.stroke();
    };
    rectGap(0, 2, 26, 16);
    rectGap(10, 1, 26, 16);
    const corner = (x, y, ux, uy) => {
      ctx.lineWidth = 1.2;
      [[22, 78], [32, 58], [42, 38]].forEach(([o, len]) => {
        ctx.beginPath();
        ctx.moveTo(x + ux * o, y + uy * (o + len));
        ctx.lineTo(x + ux * o, y + uy * o);
        ctx.lineTo(x + ux * (o + len), y + uy * o);
        ctx.stroke();
      });
      ctx.fillStyle = "#f3dfa8";
      const cx = x + ux * 56, cy = y + uy * 56;
      ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 5, cy); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 5, cy); ctx.closePath(); ctx.fill();
    };
    corner(m, m, 1, 1); corner(W - m, m, -1, 1); corner(W - m, H - m, -1, -1); corner(m, H - m, 1, -1);
    // 上中央：線を切って満月、下向きに光の筋
    const cy = m + 5;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (0.12 + 0.76 * i / 10);
      const r0 = 26, r1 = i % 2 ? 40 : 56;
      ctx.globalAlpha = i % 2 ? 0.55 : 0.9;
      ctx.beginPath();
      ctx.moveTo(W / 2 + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(W / 2 + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    imgFrameMoon(ctx, W / 2, cy, 17);
    // 下中央：菱形と短い線
    ctx.fillStyle = "#f3dfa8";
    const by = H - m - 5;
    ctx.beginPath(); ctx.moveTo(W / 2, by - 9); ctx.lineTo(W / 2 + 9, by); ctx.lineTo(W / 2, by + 9); ctx.lineTo(W / 2 - 9, by); ctx.closePath(); ctx.fill();
  } else {
    // アーチ窓：上がゆるいアーチの二重線。頂上に満月、内側に月あかりがにじむ
    const A = 150;
    const glow = ctx.createRadialGradient(W / 2, m + 40, 0, W / 2, m + 40, 460);
    glow.addColorStop(0, "rgba(246,231,182,.13)");
    glow.addColorStop(1, "rgba(246,231,182,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, 520);
    const arch = (d, lw, alpha) => {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = lw;
      ctx.strokeStyle = gold;
      ctx.beginPath();
      ctx.moveTo(m + d, H - m - d);
      ctx.lineTo(m + d, m + A);
      ctx.ellipse(W / 2, m + A, W / 2 - m - d, A - d, 0, Math.PI, Math.PI * 2);
      ctx.lineTo(W - m - d, H - m - d);
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    arch(0, 1.8, 1);
    arch(10, 0.9, 0.5);
    ctx.fillStyle = "#f3dfa8";
    [[m, H - m], [W - m, H - m], [m, m + A], [W - m, m + A]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });
    imgFrameMoon(ctx, W / 2, m + 4, 14);
    imgSparkle(ctx, W / 2, H - m, 9);
  }
  ctx.restore();
}

// 流れ星：右上から左下へ流れる（頭が左下、尾が右上へ細くなる）
function imgShootingStars(ctx, W, H, seed = 1, spots = null) {
  ctx.save();
  const stars = spots || [[0.3, 0.16, 1], [0.86, 0.09, 0.7], [0.78, 0.36, 0.55]];
  const ang = Math.atan2(-0.5, 1); // 尾の向き（右上）
  stars.forEach(([fx, fy, s], i) => {
    const x = W * (fx + (spots ? 0 : (imgRand(seed + i) - 0.5) * 0.05));
    const y = H * (fy + (spots ? 0 : (imgRand(seed + i + 9) - 0.5) * 0.03));
    const len = 260 * s, w = 7 * s;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, "rgba(255,248,220,.95)");
    g.addColorStop(0.25, "rgba(255,240,200,.5)");
    g.addColorStop(1, "rgba(255,240,200,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -w / 2);
    ctx.lineTo(len, 0);
    ctx.lineTo(0, w / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.shadowColor = "rgba(255,240,190,1)";
    ctx.shadowBlur = 22 * s;
    ctx.fillStyle = "#fffbe8";
    ctx.beginPath(); ctx.arc(x, y, 5 * s, 0, Math.PI * 2); ctx.fill();
    imgSparkle(ctx, x, y, 16 * s);
    ctx.shadowBlur = 0;
  });
  ctx.restore();
}

// ---------- ケーキカード ----------
// selfName：自分の名前（入れないときは空）／withNames：一緒の人（「with A ・ B」で入れる）
async function makeCardImage({ visit, selfName = "", withNames = [], startDate, total, frame = "moon", shooting = false }) {
  const hasNames = Boolean(selfName) || withNames.length > 0;
  await imgFonts(`${visit.cake}${visit.drink}${selfName}${withNames.join("")}`);
  const W = 1080, H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  imgBackground(ctx, W, H, visit.night, 110);

  imgFrame(ctx, W, H, frame);
  if (shooting) imgShootingStars(ctx, W, H, visit.night);

  // 見出し：字間をあけた欧文 → 第九夜（明朝）→ 日付（欧文イタリック）
  ctx.textAlign = "center";
  ctx.fillStyle = "#cdb170";
  ctx.font = `500 25px ${IMG_EN}`;
  imgSpaced(ctx, "EIGHTEEN NIGHTS OF THE MOON", W / 2, 122, 7);
  ctx.fillStyle = imgGold(ctx, W / 2 - 120, 0, W / 2 + 120, 0);
  ctx.font = `600 58px ${IMG_FONT}`;
  imgSpaced(ctx, `第${imgNightKanji(visit.night)}夜`, W / 2, 196, 6);
  imgRuns(ctx, [
    { text: `${imgDateEn(startDate, visit.night).split(" ")[0]} `, font: `italic 500 30px ${IMG_EN}`, color: "#b8c1d6" },
    { text: imgDateEn(startDate, visit.night).split(" ")[1], font: `500 27px ${IMG_FONT}`, color: "#b8c1d6" },
    ...(visit.night === total ? [{ text: "　満月の夜", font: `500 26px ${IMG_FONT}`, color: "#e8d096" }] : [])
  ], W / 2, 240);

  // 一緒に来た人の名前：人数が多いほど文字を小さくし、全員が入るようにケーキ画像を縮める
  let nameFs = 36, nameLines = [];
  if (withNames.length) {
    for (nameFs of [36, 32, 28, 25, 22]) {
      ctx.font = `500 ${nameFs}px ${IMG_FONT}`;
      nameLines = imgWrapNames(ctx, withNames, W - 300);
      if (nameLines.length <= (nameFs >= 32 ? 2 : nameFs >= 28 ? 3 : 5)) break;
    }
  }
  const nameLH = Math.round(nameFs * 1.38);
  const textH = (hasNames ? 64 : 84) + 56 + (hasNames ? 40 : 0) + (selfName ? 62 : 0)
    + (withNames.length ? (selfName ? 54 : 62) + (nameLines.length - 1) * nameLH : 0);
  const top = 272;
  const lastY = 1200;
  const size = Math.max(330, Math.min(hasNames ? 640 : 700, lastY - top - textH));

  const im = await imgLoad(await cakeImageSrc(visit.night));
  if (im) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = 40;
    ctx.drawImage(im, (W - size) / 2, top, size, size);
    ctx.restore();
  }
  let y = top + size + (hasNames ? 64 : 84);
  ctx.fillStyle = "#f4e7c4";
  let fs = 54;
  ctx.font = `500 ${fs}px ${IMG_FONT}`;
  while (fs > 30 && ctx.measureText(visit.cake).width + [...visit.cake].length * 3 > W - 200) { fs -= 2; ctx.font = `500 ${fs}px ${IMG_FONT}`; }
  imgSpaced(ctx, visit.cake, W / 2, y, 3);
  y += 56;
  imgRuns(ctx, [
    { text: "& ", font: `italic 500 34px ${IMG_EN}`, color: "#cdb170" },
    { text: visit.drink, font: `500 30px ${IMG_FONT}`, color: "#c4ccdd" }
  ], W / 2, y, "center", W - 200);

  if (hasNames) {
    y += 40;
    imgRule(ctx, W / 2, y, 150);
  }
  if (selfName) {
    y += 62;
    ctx.fillStyle = "#f4ecd2";
    ctx.font = `500 42px ${IMG_FONT}`;
    imgCenterText(ctx, selfName, W / 2, y, W - 220);
  }
  if (withNames.length) {
    y += selfName ? 54 : 62;
    const withFs = Math.round(nameFs * 0.94);
    nameLines.forEach((line, i) => {
      imgRuns(ctx, [
        ...(i === 0 ? [{ text: "with  ", font: `italic 500 ${withFs}px ${IMG_EN}`, color: "#cdb170" }] : []),
        { text: line, font: `500 ${nameFs}px ${IMG_FONT}`, color: "#f4ecd2" }
      ], W / 2, y, "center", W - 180);
      y += nameLH;
    });
  }
  ctx.textAlign = "center";
  await imgFooter(ctx, W, H);
  return cv;
}

// ---------- アルバム全体 ----------
async function makeAlbumImage(album, title, { showName = true, showTitle = true, frame = "moon", shooting = false } = {}) {
  await imgFonts(`${album.name}${title || ""}${album.visits.map((v) => v.cake).join("")}`);
  const total = album.total_nights;
  const cols = 3, rows = Math.ceil(total / cols);
  const W = 1080, tileW = 286, tileH = 228, gap = 16, top = 336;
  const H = top + rows * (tileH + gap) + 130;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  imgBackground(ctx, W, H, 7, 140);
  imgFrame(ctx, W, H, frame);
  if (shooting) imgShootingStars(ctx, W, H, 3, [[0.6, 0.05, 0.6], [0.7, 0.14, 0.45]]);

  const count = album.visits.length;
  ctx.fillStyle = "#cdb170";
  ctx.font = `500 23px ${IMG_EN}`;
  imgSpaced(ctx, "EIGHTEEN NIGHTS OF THE MOON", 110, 150, 6, "left");
  ctx.textAlign = "left";
  ctx.fillStyle = imgGold(ctx, 110, 0, 700, 0);
  ctx.font = `600 60px ${IMG_FONT}`;
  ctx.fillText(showName ? album.name : "わたしの18夜", 108, 224, 620);
  imgRuns(ctx, [
    ...(showTitle && title ? [{ text: `${title}　`, font: `500 30px ${IMG_FONT}`, color: "#e8d096" }] : []),
    { text: String(count), font: `600 34px ${IMG_FONT}`, color: "#f4e7c4" },
    { text: " / ", font: `500 28px ${IMG_FONT}`, color: "#8f9ab3" },
    { text: String(total), font: `500 28px ${IMG_FONT}`, color: "#b8c1d6" },
    { text: "  nights", font: `italic 500 30px ${IMG_EN}`, color: "#b8c1d6" }
  ], 110, 278, "left");
  imgMoon(ctx, W - 180, 204, 70, count / total);

  const byNight = new Map(album.visits.map((v) => [v.night, v]));
  const x0 = (W - (cols * tileW + (cols - 1) * gap)) / 2;
  for (let n = 1; n <= total; n++) {
    const i = n - 1;
    const x = x0 + (i % cols) * (tileW + gap);
    const y = top + Math.floor(i / cols) * (tileH + gap);
    const v = byNight.get(n);
    ctx.fillStyle = v ? "rgba(28,41,80,.85)" : "rgba(12,20,38,.75)";
    ctx.strokeStyle = v ? "rgba(214,179,101,.6)" : "rgba(42,58,88,.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, tileW, tileH, 18) : ctx.rect(x, y, tileW, tileH);
    ctx.fill(); ctx.stroke();
    imgRuns(ctx, [
      { text: `第${imgNightKanji(n)}夜`, font: `600 22px ${IMG_FONT}`, color: v ? "#e3c886" : "#56627d" },
      { text: `  ${cakeNightDate(album.start_date, n)}`, font: `500 19px ${IMG_FONT}`, color: v ? "#aab4ca" : "#4a5570" }
    ], x + 16, y + 34, "left");

    if (v) {
      const im = await imgLoad(await cakeImageSrc(v.night));
      if (im) ctx.drawImage(im, x + (tileW - 164) / 2, y + 40, 164, 164);
      ctx.textAlign = "center";
      ctx.fillStyle = "#f4ecd2";
      ctx.font = `500 22px ${IMG_FONT}`;
      imgCenterText(ctx, v.cake, x + tileW / 2, y + tileH - 12, tileW - 20);
    } else {
      ctx.textAlign = "center";
      ctx.fillStyle = "#34405c";
      ctx.font = `italic 500 72px ${IMG_EN}`;
      ctx.fillText("?", x + tileW / 2, y + tileH / 2 + 34);
    }
  }
  await imgFooter(ctx, W, H);
  return cv;
}

// ---------- 月の証明書（来た夜の数で名前と月の形が変わる。18夜すべてで満月証明書） ----------
const CERT_SIGNATURE = "ここここし ここし";

function certPhase(count, total) {
  if (count >= total) return { name: "満月", en: "FULL MOON", frac: 1 };
  if (count >= 12) return { name: "十三夜", en: "THIRTEENTH-NIGHT MOON", frac: 0.82 };
  if (count >= 6) return { name: "半月", en: "HALF MOON", frac: 0.5 };
  return { name: "三日月", en: "CRESCENT MOON", frac: 0.22 };
}

async function makeCertificate(album, title, { frame = "full" } = {}) {
  await imgFonts(`${album.name}${title || ""}${CERT_SIGNATURE}`);
  const W = 1080, H = 1350;
  const total = album.total_nights;
  const count = album.visits.length;
  const complete = count >= total;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  imgBackground(ctx, W, H, 18, 160);
  imgFrame(ctx, W, H, frame);

  ctx.textAlign = "center";
  const phase = certPhase(count, total);
  ctx.fillStyle = "#cdb170";
  ctx.font = `500 25px ${IMG_EN}`;
  imgSpaced(ctx, `CERTIFICATE OF THE ${phase.en}`, W / 2, 146, 7);
  ctx.fillStyle = imgGold(ctx, 300, 0, 780, 0);
  ctx.font = `600 84px ${IMG_FONT}`;
  imgSpaced(ctx, `${phase.name}証明書`, W / 2, 256, 10);

  imgMoon(ctx, W / 2, 400, 90, phase.frac);

  ctx.fillStyle = "#f4e7c4";
  ctx.font = `600 58px ${IMG_FONT}`;
  const nameW = Math.min(W - 260, ctx.measureText(album.name).width);
  imgCenterText(ctx, album.name, W / 2 - 26, 580, W - 260);
  ctx.font = `500 32px ${IMG_FONT}`;
  ctx.textAlign = "left";
  ctx.fillText("さま", W / 2 - 26 + nameW / 2 + 12, 580);
  ctx.textAlign = "center";
  imgRule(ctx, W / 2, 612, 300);

  ctx.fillStyle = "#e9e1c9";
  ctx.font = `500 33px ${IMG_FONT}`;
  const body = complete
    ? ["cafe＆bar Moonlight の最後の18夜を、", "ひと夜も欠かさずともに過ごした", "「満月の住人」であることをここに証します。"]
    : [`cafe＆bar Moonlight の最後の18夜のうち、`, `${count}夜をともに過ごし、${phase.name}まで月を満たした`, "あなたの月あかりに、心からの感謝を。"];
  body.forEach((line, i) => imgCenterText(ctx, line, W / 2, 680 + i * 58, W - 200));

  // 集めたケーキ
  const icons = album.visits.slice(0, 18);
  const size = 82, gap = 8, perRow = 9;
  for (let i = 0; i < icons.length; i++) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, icons.length - row * perRow);
    const x0 = (W - (inRow * size + (inRow - 1) * gap)) / 2;
    const x = x0 + (i % perRow) * (size + gap);
    const y = 880 + row * (size + gap);
    const im = await imgLoad(await cakeImageSrc(icons[i].night));
    if (im) ctx.drawImage(im, x, y, size, size);
  }

  imgRuns(ctx, [
    ...(title ? [{ text: `${title}　`, font: `500 30px ${IMG_FONT}`, color: "#c4ccdd" }] : []),
    { text: String(count), font: `600 32px ${IMG_FONT}`, color: "#f4e7c4" },
    { text: " / ", font: `500 28px ${IMG_FONT}`, color: "#8f9ab3" },
    { text: String(total), font: `500 28px ${IMG_FONT}`, color: "#b8c1d6" },
    { text: "  nights", font: `italic 500 30px ${IMG_EN}`, color: "#b8c1d6" }
  ], W / 2, 1096);
  ctx.fillStyle = "#cdb170";
  ctx.font = `500 28px ${IMG_FONT}`;
  ctx.fillText(`${cakeNightDate(album.start_date, total).replace("/", "月")}日　最後の夜に`, W / 2, 1150);
  ctx.font = `italic 500 28px ${IMG_EN}`;
  ctx.fillText("cafe & bar Moonlight 店長", W / 2, 1194);
  ctx.fillStyle = "#f4e7c4";
  ctx.font = `600 42px ${IMG_FONT}`;
  imgSpaced(ctx, CERT_SIGNATURE, W / 2, 1248, 4);
  return cv;
}

// ---------- 夜空 ----------
async function makeSkyImage(pub) {
  await imgFonts();
  const W = 1080, H = 1080;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#050816"); g.addColorStop(1, "#0c1636");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const shown = Math.min(pub.stars, 600);
  for (let i = 0; i < shown; i++) {
    const x = 40 + imgRand(i + 1) * (W - 80);
    const y = 60 + imgRand(i + 501) * (H * 0.7);
    if (x > W * 0.6 && y < H * 0.42) continue;
    ctx.globalAlpha = 0.5 + imgRand(i + 33) * 0.5;
    ctx.fillStyle = i >= pub.stars - (pub.tonight_stars || 0) ? "#ffe9a8" : "#ffffff";
    ctx.beginPath(); ctx.arc(x, y, 1.6 + imgRand(i + 901) * 2.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const last = pub.thresholds[pub.thresholds.length - 1] || 1;
  imgMoon(ctx, W * 0.78, H * 0.2, 120, Math.max(0.04, Math.min(1, pub.stars / last)));

  ctx.textAlign = "left";
  ctx.fillStyle = imgGold(ctx, 70, 0, 400, 0);
  ctx.font = `600 140px ${IMG_FONT}`;  // 数字は明朝（Cormorant の数字はローマ数字のように見えるため）
  ctx.fillText(String(pub.stars), 70, H - 190);
  const wNum = ctx.measureText(String(pub.stars)).width;
  ctx.fillStyle = "#e8d096";
  ctx.font = `500 40px ${IMG_FONT}`;
  ctx.fillText("の星", 86 + wNum, H - 196);
  ctx.fillStyle = "#c4ccdd";
  ctx.font = `500 30px ${IMG_FONT}`;
  ctx.fillText(`みんなで灯したMoonlightの夜空　・　いまは${CAKE_STAGES[pub.stage].name}`, 72, H - 130);
  await imgFooter(ctx, W, H);
  return cv;
}

// ---------- 保存 ----------
// スマホ：画像を大きく表示して「長押し →『写真に追加』」で保存（共有画面は出さない）。パソコン：そのままダウンロード。
function isTouchDevice() {
  return window.matchMedia?.("(pointer: coarse)").matches || /iPhone|iPad|Android/i.test(navigator.userAgent);
}

function showSaveOverlay(dataUrl) {
  let ov = document.getElementById("saveOverlay");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "saveOverlay";
    ov.className = "save-overlay";
    ov.innerHTML = `<div class="save-overlay-inner">
        <p class="save-overlay-tip">画像を<b>長押し</b>して<br>「"写真"に追加」（Androidは「画像をダウンロード」）で保存できます</p>
        <img alt="保存する画像">
        <button class="btn" type="button">閉じる</button>
      </div>`;
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("button")) ov.classList.add("hidden"); });
    document.body.appendChild(ov);
  }
  ov.querySelector("img").src = dataUrl;
  ov.classList.remove("hidden");
}

async function saveCanvas(cv, filename) {
  if (isTouchDevice()) {
    showSaveOverlay(cv.toDataURL("image/png"));
    return "overlay";
  }
  const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
  if (!blob) throw new Error("画像を作れませんでした");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
