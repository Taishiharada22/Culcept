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
 * 人体ベース処理（CEO が透過済みの human-body-base.png を直接使う = keying 不要）:
 *   ① 既存の clean alpha をそのままシルエットに使う（連続輪郭・内部均一）
 *   ② 器フィル = 合成グラデ（白〜薄ブルーグレー + 縦シリンダー陰影）を dest-in でマスク（市松を出さない）
 *   ③ alpha 境界から連続 rim（輪郭線）を焼き込み → 器として立たせる
 *   body.png の alpha = clean シルエット（液体クリップ用 mask も兼ねる）。
 */
async function keyBody() {
  const file = path.join(here, "human-body-base.png");
  const meta = await sharp(file).metadata();
  const { width: w, height: h } = meta;
  // CEO 透過済み alpha をそのまま使用（軽い median で微ノイズのみ除去）。
  const cleanMask = await sharp(file).ensureAlpha().extractChannel(3).median(3).png().toBuffer();

  // rim（連続輪郭線）: clean alpha の境界帯
  const maskBlur = await sharp(cleanMask).blur(2.4).raw().toBuffer();
  const rim = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) {
    const b = maskBlur[i];
    rim[i] = Math.max(0, Math.min(255, Math.round((255 - Math.abs(b * 2 - 255)) * 1.45)));
  }
  const rimAlphaPng = await sharp(rim, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();

  // 器フィル: CEO 透過アセットの陰影を保持しつつクールトーン。
  // ★flatten(白): 透明域の下に残る黒 RGB と、元画像に焼き込まれた周囲グロー輪を白に落とす
  //   （alpha が壊れても黒が出ない二重防御。「二重の頭」に見えたグロー輪の構造的排除）
  const rgb = await sharp(file)
    .flatten({ background: "#ffffff" })
    .linear(0.96, 6)
    .tint({ r: 230, g: 234, b: 247 })
    .removeAlpha()
    .png()
    .toBuffer();
  // ① clean alpha を joinChannel で最終 alpha に結合（dest-in は greyscale 無alpha 入力で無言失敗するため廃止）
  const fillRGBA = await sharp(rgb).joinChannel(cleanMask).png().toBuffer();
  // ② rim を上に重ねる
  const rimLayer = await sharp({ create: { width: w, height: h, channels: 3, background: "#f3f5ff" } }).png().toBuffer();
  const rimRGBA = await sharp(rimLayer).joinChannel(rimAlphaPng).png().toBuffer();
  const composedBody = await sharp(fillRGBA).composite([{ input: rimRGBA, blend: "over" }]).png().toBuffer();
  // ③ 決定論的 bbox crop（alpha>20）。PNG 再読込が多 channel 化するため stride を考慮。
  const mr = await sharp(cleanMask).raw().toBuffer({ resolveWithObject: true });
  const maskRaw = mr.data;
  const ch = mr.info.channels;
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (maskRaw[(y * w + x) * ch] > 20) {
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

  // ④ 自動検証（PASS しなければ throw — 黒背景/不透明余白の再発防止）
  const v = await sharp(path.join(out, "body.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const vd = v.data, vw = v.info.width, vh = v.info.height, vc = v.info.channels;
  const aAt = (xf, yf) => vd[(Math.floor(vh * yf) * vw + Math.floor(vw * xf)) * vc + 3];
  for (const [xf, yf] of [[0.01, 0.01], [0.99, 0.01], [0.01, 0.99], [0.99, 0.99]]) {
    if (aAt(xf, yf) > 8) throw new Error("VERIFY FAIL: corner not transparent a=" + aAt(xf, yf));
  }
  let dark = 0;
  for (let i = 0; i < vw * vh; i++) {
    const o = i * vc;
    if (vd[o + 3] > 200 && vd[o] + vd[o + 1] + vd[o + 2] < 120) dark++;
  }
  if (dark > 50) throw new Error("VERIFY FAIL: dark pixels inside opaque body = " + dark);
  console.log("VERIFY PASS: corners transparent / dark-in-body=" + dark);

  // ⑤ ゾーン定数を crop 後フレームで機械算出（手動目測の廃止 — HumanBatteryFigure へ転記する値）
  const mm = await sharp(path.join(out, "body-mask.png")).raw().toBuffer({ resolveWithObject: true });
  const md = mm.data, mw = mm.info.width, mh = mm.info.height, mc = mm.info.channels;
  const rowWidth = (y) => {
    let lo = -1, hi = -1;
    for (let x = 0; x < mw; x++) if (md[(y * mw + x) * mc] > 128) { if (lo < 0) lo = x; hi = x; }
    return lo < 0 ? 0 : hi - lo;
  };
  let topY = -1, botY = -1;
  for (let y = 0; y < mh; y++) if (rowWidth(y) > 0) { topY = y; break; }
  for (let y = mh - 1; y >= 0; y--) if (rowWidth(y) > 0) { botY = y; break; }
  let headMax = 0;
  for (let y = topY; y < topY + Math.floor(mh * 0.15); y++) headMax = Math.max(headMax, rowWidth(y));
  let chinY = -1, minW = 1e9;
  for (let y = topY; y < topY + Math.floor(mh * 0.25); y++) {
    const ww = rowWidth(y);
    if (ww > 0 && ww < minW && y > topY + Math.floor(mh * 0.05)) { minW = ww; chinY = y; }
    if (ww > headMax * 1.6) break;
  }
  let shoulderY = -1;
  for (let y = chinY; y < mh; y++) if (rowWidth(y) > headMax * 1.8) { shoulderY = y; break; }
  const p = (y) => +(y / mh * 100).toFixed(1);
  const heartY = p(shoulderY + (botY - shoulderY) * 0.10);
  console.log("ZONES(crop後・転記用): HEAD_TOP=" + p(topY), "CHIN(NECK)=" + p(chinY), "SHOULDER(BODY_TOP)=" + p(shoulderY), "FEET=" + p(botY), "HEART_Y=" + heartY);
}

/**
 * heart: CEO 透過済み heart-mask.png（2026-06-12 置き直し版）を直接使用（keying 不要）。
 * 横方向のリング弧が alpha に含まれるため、行/列の alpha 質量プロファイルでコア（ハート本体の
 * グロー）だけを crop する — 胸に「リング＝ズレた頭の輪」を出さないため。
 */
async function keyHeart() {
  const file = path.join(here, "heart-mask.png");
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const colMass = new Array(w).fill(0);
  const rowMass = new Array(h).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * c + 3] > 120) { colMass[x]++; rowMass[y]++; }
    }
  }
  const cut = (arr) => {
    const mx = Math.max(...arr);
    const th = mx * 0.12; // 薄い弧（数行分）を捨て、本体だけ残す
    let lo = arr.findIndex((v) => v > th);
    let hi = arr.length - 1 - [...arr].reverse().findIndex((v) => v > th);
    return [lo, hi];
  };
  const [x0, x1] = cut(colMass);
  const [y0, y1] = cut(rowMass);
  const ext = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  const alphaPng = await sharp(file).ensureAlpha().extractChannel(3).extract(ext).png().toBuffer();
  const am = await sharp(alphaPng).metadata();
  const white = await sharp({ create: { width: am.width, height: am.height, channels: 3, background: "#ffffff" } }).png().toBuffer();
  await sharp(white).joinChannel(alphaPng).png().toFile(path.join(out, "heart.png"));
  console.log("heart.png(core)", am.width + "x" + am.height, "crop x", (x0 / w).toFixed(2) + "-" + (x1 / w).toFixed(2), "y", (y0 / h).toFixed(2) + "-" + (y1 / h).toFixed(2));
}

await keyBody();
await keyHeart();
await keyOut(path.join(here, "glow-noise-texture.png"), "glow.png", { floor: 200, alphaBoost: 1.6, alphaBlur: 8 });
console.log("done");
