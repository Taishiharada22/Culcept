/**
 * _processAssets.mjs — CEO 提供アセット（チェッカーボード焼き込み・alpha なし）を実透過 PNG へ変換する一回性ツール
 *
 * 手法: 被写体はチェッカー（明るいグレー2色）より暗い側に分布するため、
 *       輝度キーイング alpha = clamp((T - L) / (T - floor)) で抽出する。
 *       T は四隅のチェッカー最小輝度から自動決定（T = cornerMin - 3）。
 * 実行: node _processAssets.mjs  （出力: ./processed/*.png）
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "processed");
mkdirSync(out, { recursive: true });

async function cornerMin(file, w, h) {
  let min = 255;
  const size = 70;
  const spots = [
    [10, 10],
    [w - size - 10, 10],
    [10, h - size - 10],
    [w - size - 10, h - size - 10],
  ];
  for (const [l, t] of spots) {
    const buf = await sharp(file).extract({ left: l, top: t, width: size, height: size }).greyscale().png().toBuffer();
    const s = await sharp(buf).stats();
    min = Math.min(min, s.channels[0].min);
  }
  return min;
}

async function keyOut(file, outName, { floor = 208, tintWhite = false, trim = true, alphaBoost = 1, brighten = 1, alphaBlur = 5 } = {}) {
  const meta = await sharp(file).metadata();
  const { width: w, height: h } = meta;
  const T = (await cornerMin(file, w, h)) - 3;
  const { data } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const alpha = Buffer.alloc(w * h);
  const denom = Math.max(T - floor, 1);
  for (let i = 0; i < w * h; i++) {
    const L = data[i];
    alpha[i] = Math.max(0, Math.min(255, Math.round(((T - L) / denom) * 255)));
  }
  // チェッカー透け残滓の除去: 強ブラーで市松周期を均してから再ブースト（被写体は柔らかい発光体なので無害）
  const alphaPng = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } })
    .blur(alphaBlur)
    .linear(alphaBoost, 0)
    .png()
    .toBuffer();
  const rgbBase = tintWhite
    ? await sharp({ create: { width: w, height: h, channels: 3, background: "#ffffff" } }).png().toBuffer()
    : await sharp(file).removeAlpha().modulate({ brightness: brighten }).png().toBuffer();
  let pipeline = sharp(rgbBase).joinChannel(alphaPng).png();
  let buf = await pipeline.toBuffer();
  if (trim) {
    buf = await sharp(buf).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 12 }).png().toBuffer();
  }
  const outPath = path.join(out, outName);
  await sharp(buf).toFile(outPath);
  const m = await sharp(outPath).metadata();
  console.log(outName, "T=" + T, m.width + "x" + m.height, "hasAlpha=" + m.hasAlpha);
}

/**
 * 人体ベースの「汚い alpha」問題（チェッカー由来の透過起こしで輪郭が途切れ・内部ムラ）を解消する。
 * CEO/GPT 指示: human-body-base を作り直す = 連続した綺麗なシルエット + 均一な内部 + 明瞭な輪郭線。
 *
 * 手法（器と液体の分離）:
 *   1. 輝度を強ブラー(6)で均し、しきい値ベースで「連続・均一なシルエットマスク」を起こす（内部 = 完全不透明）
 *   2. そのマスク alpha を持つ body.png（RGB = 陰影を残したブルーグレー）を出力 → 器（vessel）
 *   3. マスク境界から細く連続した rim（輪郭線）を焼き込む
 *   4. body-mask.png（白シルエット）も出力 → 液体クリップ用（同一シルエット）
 */
async function keyBody() {
  const file = path.join(here, "human-body-base.png");
  const meta = await sharp(file).metadata();
  const { width: w, height: h } = meta;
  // 輝度を強ブラーで均す（市松を平均化）。body 半透明体は背景よりわずかに暗い。
  const { data } = await sharp(file).greyscale().blur(6).raw().toBuffer({ resolveWithObject: true });
  // body の半透明な中心は明るく（背景に近い）= 単純しきい値だと「内部に穴」が空く。
  // → 縁から背景を flood fill し、到達しない（= 人体に囲まれた）画素を body とすることで穴を埋め、
  //   連続・均一な「塗りつぶしシルエット」を作る。
  const BG_TH = 243; // これより明るい = 背景候補（市松 + 半透明中心）
  const visited = new Uint8Array(w * h); // 1 = 縁から到達した背景
  const stack = [];
  const pushIf = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (visited[idx]) return;
    if (data[idx] <= BG_TH) return; // 人体（暗）でブロック
    visited[idx] = 1;
    stack.push(idx);
  };
  for (let x = 0; x < w; x++) { pushIf(x, 0); pushIf(x, h - 1); }
  for (let y = 0; y < h; y++) { pushIf(0, y); pushIf(w - 1, y); }
  while (stack.length) {
    const idx = stack.pop();
    const x = idx % w, y = (idx - x) / w;
    pushIf(x + 1, y); pushIf(x - 1, y); pushIf(x, y + 1); pushIf(x, y - 1);
  }
  // body = 縁背景に到達しなかった画素（人体 + 囲まれた中心）。binary 255/0。
  const filled = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) filled[i] = visited[i] ? 0 : 255;
  // 形態学的平滑化（close+open 相当）: 強 blur → threshold で「連続した綺麗な輪郭」にする。
  //（flood leak のスキャロップ・浮き島・腕の凹凸を除去。CEO「輪郭が途切れ途切れ・プルプル」対応）
  // close（dilate→erode）で穴/島を潰し、強 blur+threshold で連続輪郭に。
  const filledPng = await sharp(filled, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();
  // dilate: blur で広げて低 threshold（leak の暗い湾を埋め戻す）
  const dilated = await sharp(filledPng).blur(18).threshold(70).png().toBuffer();
  // erode: blur で縮めて高 threshold（膨らみを戻す）→ 滑らかな輪郭
  const cleanMask = await sharp(dilated).blur(14).threshold(150).blur(1.6).png().toBuffer();

  // rim（連続した輪郭線）: マスク境界帯。cleanMask が連続なので rim も連続。
  const maskBlur = await sharp(cleanMask).blur(2.2).raw().toBuffer();
  const rim = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) {
    const b = maskBlur[i];
    rim[i] = Math.max(0, Math.min(255, Math.round((255 - Math.abs(b * 2 - 255)) * 1.5)));
  }
  const rimAlphaPng = await sharp(rim, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();

  // RGB: 合成の器フィル（元写真は使わない = 平滑マスク外の市松が出ないように）。
  // 縦グラデのブルーグレー + 縦シリンダー陰影。均一で清潔な器。
  // 器フィル: 白〜ごく薄いブルーグレー（プレートのラベンダーに対し明確に明るい = 明度差を作る）+ 縦シリンダー陰影
  const fillSvg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="45%" stop-color="#f1f4fc"/>
        <stop offset="100%" stop-color="#dde5f6"/>
      </linearGradient>
      <linearGradient id="h" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#9fb0dd" stop-opacity="0.5"/>
        <stop offset="22%" stop-color="#9fb0dd" stop-opacity="0"/>
        <stop offset="78%" stop-color="#9fb0dd" stop-opacity="0"/>
        <stop offset="100%" stop-color="#92a3d6" stop-opacity="0.55"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#v)"/>
    <rect width="100%" height="100%" fill="url(#h)"/>
  </svg>`;
  const rgb = await sharp(Buffer.from(fillSvg)).removeAlpha().png().toBuffer();
  // ① 器フィルを cleanMask で切り抜く（dest-in = 標準マスク。joinChannel の dims 問題を回避）
  const fillRGBA = await sharp(rgb)
    .ensureAlpha()
    .composite([{ input: cleanMask, blend: "dest-in" }])
    .png()
    .toBuffer();
  // ② rim（連続輪郭線）を上に重ねる
  const rimLayer = await sharp({ create: { width: w, height: h, channels: 3, background: "#f3f5ff" } }).png().toBuffer();
  const rimRGBA = await sharp(rimLayer).joinChannel(rimAlphaPng).png().toBuffer();
  const composedBody = await sharp(fillRGBA).composite([{ input: rimRGBA, blend: "over" }]).png().toBuffer();
  // ③ 決定論的 bbox crop（cleanMask の alpha>20 範囲。body.png と mask を同一 bbox で切る）
  const maskRaw = await sharp(cleanMask).raw().toBuffer();
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (maskRaw[y * w + x] > 20) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const pad = 5;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const ext = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  await sharp(composedBody).extract(ext).png().toFile(path.join(out, "body.png"));
  await sharp(cleanMask).extract(ext).png().toFile(path.join(out, "body-mask.png"));
  const m = await sharp(path.join(out, "body.png")).metadata();
  console.log("body.png", m.width + "x" + m.height, "hasAlpha=" + m.hasAlpha);
  console.log("body-mask.png written");
}

await keyBody();
await keyOut(path.join(here, "heart-mask.png"), "heart.png", { floor: 218, alphaBoost: 2.6, alphaBlur: 24 });
await keyOut(path.join(here, "glow-noise-texture.png"), "glow.png", { floor: 200, alphaBoost: 1.6, alphaBlur: 8 });
console.log("done");
