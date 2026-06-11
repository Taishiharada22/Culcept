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
 * 人体ベースは輪郭が薄れる（白 on 白）問題があるため、専用処理:
 *   ① crisp な alpha（median+小blur+急峻 linear）
 *   ② alpha の境界帯から rim（縁光）を生成し、ラベンダー白で RGB に焼き込む（輪郭をはっきりさせる）
 *   ③ RGB は陰影を残したクールトーン
 *   alpha は人体シルエットのまま（液体 mask 用）。
 */
async function keyBody() {
  const file = path.join(here, "human-body-base.png");
  const meta = await sharp(file).metadata();
  const { width: w, height: h } = meta;
  const T = (await cornerMin(file, w, h)) - 3;
  const { data } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const floor = 208;
  const denom = Math.max(T - floor, 1);
  const alpha = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) {
    const L = data[i];
    alpha[i] = Math.max(0, Math.min(255, Math.round(((T - L) / denom) * 255)));
  }
  // 実績 recipe（median3 + blur3.5 + 急峻 linear）で市松残滓を除去。body は半透明のまま。
  const crispAlpha = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } })
    .median(3)
    .blur(3.5)
    .linear(2.8, -26)
    .png()
    .toBuffer();

  // rim（縁光）: 境界帯 = 255 - |blurA*2 - 255|。輪郭をはっきりさせる（CEO「輪郭が薄れている」対応）
  const blurA = await sharp(crispAlpha).blur(3.0).raw().toBuffer();
  const rim = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) {
    const b = blurA[i];
    rim[i] = Math.max(0, Math.min(255, Math.round((255 - Math.abs(b * 2 - 255)) * 1.3)));
  }
  const rimAlphaPng = await sharp(rim, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();

  // RGB: 陰影を残しつつクールトーン
  const rgb = await sharp(file).removeAlpha().linear(0.82, 30).tint({ r: 226, g: 230, b: 250 }).png().toBuffer();
  // rim を明るいラベンダー白で焼き込み
  const rimLayer = await sharp({ create: { width: w, height: h, channels: 3, background: "#f4f5ff" } }).png().toBuffer();
  const rimRGBA = await sharp(rimLayer).joinChannel(rimAlphaPng).png().toBuffer();
  // composite が alpha を残すため removeAlpha で 3ch に戻してから silhouette alpha を join する
  const composed = await sharp(rgb).composite([{ input: rimRGBA, blend: "over" }]).removeAlpha().png().toBuffer();
  // 最終 alpha = crisp body silhouette。trim threshold 12（実績）で透明縁を crop。
  let buf = await sharp(composed).joinChannel(crispAlpha).png().toBuffer();
  buf = await sharp(buf).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 12 }).png().toBuffer();
  await sharp(buf).toFile(path.join(out, "body.png"));
  const m = await sharp(path.join(out, "body.png")).metadata();
  console.log("body.png T=" + T, m.width + "x" + m.height, "hasAlpha=" + m.hasAlpha);
}

await keyBody();
await keyOut(path.join(here, "heart-mask.png"), "heart.png", { floor: 218, alphaBoost: 2.6, alphaBlur: 24 });
await keyOut(path.join(here, "glow-noise-texture.png"), "glow.png", { floor: 200, alphaBoost: 1.6, alphaBlur: 8 });
console.log("done");
