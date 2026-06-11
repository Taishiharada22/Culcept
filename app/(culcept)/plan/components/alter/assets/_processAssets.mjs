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

await keyOut(path.join(here, "human-body-base.png"), "body.png", { alphaBoost: 2.0, brighten: 1.06, alphaBlur: 9 });
await keyOut(path.join(here, "heart-mask.png"), "heart.png", { floor: 218, alphaBoost: 2.6, alphaBlur: 24 });
await keyOut(path.join(here, "glow-noise-texture.png"), "glow.png", { floor: 200, alphaBoost: 1.6, alphaBlur: 8 });
await keyOut(path.join(here, "body-mask.png"), "body-nohead.png", { alphaBoost: 1.9, alphaBlur: 7 });
console.log("done");
