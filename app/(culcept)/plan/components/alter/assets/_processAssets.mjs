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

  // 器フィル: CEO 透過アセットの陰影（解剖学的ボリューム）を保持しつつ、ややクールトーン + 軽い
  // コントラスト。白飛びさせず「白〜薄グレーの器」。色は液体レイヤーが持つので強い色は入れない。
  const rgb = await sharp(file).removeAlpha().linear(0.96, 6).tint({ r: 230, g: 234, b: 247 }).png().toBuffer();
  // ① clean alpha で切り抜く（dest-in）
  const fillRGBA = await sharp(rgb).ensureAlpha().composite([{ input: cleanMask, blend: "dest-in" }]).png().toBuffer();
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
}

await keyBody();
await keyOut(path.join(here, "heart-mask.png"), "heart.png", { floor: 218, alphaBoost: 2.6, alphaBlur: 24 });
await keyOut(path.join(here, "glow-noise-texture.png"), "glow.png", { floor: 200, alphaBoost: 1.6, alphaBlur: 8 });
console.log("done");
