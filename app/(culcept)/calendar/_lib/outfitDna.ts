/**
 * Outfit DNA ベクトル化エンジン
 *
 * 各コーデを多次元ベクトルとして表現し、
 * スタイル重心の追跡・冒険度スコア・スタイル進化の可視化を実現する。
 *
 * 12次元ベクトル:
 *   [0] formality        (0=casual ~ 1=dress)
 *   [1] warmth           (0=薄手 ~ 1=厚手)
 *   [2] colorBrightness  (0=暗 ~ 1=明)
 *   [3] colorSaturation  (0=彩度低 ~ 1=彩度高)
 *   [4] patternDensity   (0=無地 ~ 1=柄物)
 *   [5] silhouetteVolume (0=タイト ~ 1=ルーズ)
 *   [6] materialWeight   (0=軽 ~ 1=重)
 *   [7] trendiness       (0=定番 ~ 1=トレンド)
 *   [8] layerCount       (0=少 ~ 1=多)
 *   [9] weatherFit       (0=不適合 ~ 1=最適)
 *   [10] monochromeRatio (0=カラフル ~ 1=モノクロ)
 *   [11] textureContrast (0=均一 ~ 1=対比)
 */

import type { WardrobeItem } from "@/app/my-style/_lib/types";
import type { ExtendedWeatherContext } from "./materialWeather";
import { inferMaterial, scoreMaterialWeather } from "./materialWeather";

/* ── DNA ベクトル型 ── */
export type OutfitDnaVector = [number, number, number, number, number, number, number, number, number, number, number, number];

export const DNA_LABELS = [
  "フォーマリティ", "保温性", "明度", "彩度",
  "柄密度", "ボリューム", "素材重量感", "トレンド度",
  "レイヤー数", "天候適合", "モノクロ度", "テクスチャ対比",
] as const;

/* ── アウトフィットのDNA算出 ── */
export function computeOutfitDna(
  items: WardrobeItem[],
  extWeather?: ExtendedWeatherContext | null,
): OutfitDnaVector {
  if (items.length === 0) return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  // [0] formality
  const formalityMap: Record<string, number> = { casual: 0.2, smart: 0.6, dress: 1.0 };
  const formality = avg(items.map(i => formalityMap[i.formality ?? "casual"] ?? 0.3));

  // [1] warmth (厚み)
  const thicknessMap: Record<string, number> = { thin: 0.15, mid: 0.5, thick: 0.9 };
  const warmth = avg(items.map(i => thicknessMap[i.thickness ?? "mid"] ?? 0.5));

  // [2],[3] colorBrightness, colorSaturation
  let brightness = 0.5;
  let saturation = 0.3;
  const hslValues = items.map(i => hexToHsl(i.colorHex || i.color || "")).filter(Boolean) as Array<{ h: number; s: number; l: number }>;
  if (hslValues.length > 0) {
    brightness = avg(hslValues.map(v => v.l));
    saturation = avg(hslValues.map(v => v.s));
  }

  // [4] patternDensity
  const patternMap: Record<string, number> = { solid: 0, stripe: 0.4, check: 0.5, plaid: 0.6, dot: 0.3, floral: 0.7, graphic: 0.8, camo: 0.7 };
  const patternDensity = avg(items.map(i => patternMap[i.pattern ?? "solid"] ?? 0));

  // [5] silhouetteVolume
  const silhouetteMap: Record<string, number> = { tight: 0.1, slim: 0.3, regular: 0.5, relaxed: 0.7, oversized: 0.9 };
  const silhouetteVolume = avg(items.map(i => silhouetteMap[i.silhouette ?? "regular"] ?? 0.5));

  // [6] materialWeight
  const weightMap: Record<string, number> = {
    mesh: 0.05, silk: 0.1, linen: 0.15, rayon: 0.2, cotton: 0.3,
    polyester: 0.35, nylon: 0.4, knit: 0.5, denim: 0.6, fleece: 0.65,
    wool: 0.7, tweed: 0.75, leather: 0.8, suede: 0.8, cashmere: 0.7,
    "gore-tex": 0.6, down: 0.85, unknown: 0.4,
  };
  const materialWeight = avg(items.map(i => weightMap[inferMaterial(i)] ?? 0.4));

  // [7] trendiness (推定 — season属性 + 名前ベース)
  const trendHints = items.filter(i => {
    const name = (i.name ?? "").toLowerCase();
    return name.includes("トレンド") || name.includes("オーバーサイズ") || name.includes("ワイド");
  }).length;
  const trendiness = Math.min(1, trendHints / items.length + 0.2);

  // [8] layerCount
  const layerCount = Math.min(1, items.length / 5);

  // [9] weatherFit
  let weatherFit = 0.5;
  if (extWeather) {
    const scores = items.map(i => {
      const mat = inferMaterial(i);
      return scoreMaterialWeather(mat, extWeather).score;
    });
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    weatherFit = Math.max(0, Math.min(1, (avgScore + 3) / 6)); // -3~+3 → 0~1
  }

  // [10] monochromeRatio
  let monochromeRatio = 0.5;
  if (hslValues.length > 0) {
    const monoCount = hslValues.filter(v => v.s < 0.15).length;
    monochromeRatio = monoCount / hslValues.length;
  }

  // [11] textureContrast
  const materials = items.map(i => inferMaterial(i));
  const uniqueMats = new Set(materials.filter(m => m !== "unknown"));
  const textureContrast = Math.min(1, uniqueMats.size / Math.max(1, items.length) * 1.5);

  return [
    clamp(formality),
    clamp(warmth),
    clamp(brightness),
    clamp(saturation),
    clamp(patternDensity),
    clamp(silhouetteVolume),
    clamp(materialWeight),
    clamp(trendiness),
    clamp(layerCount),
    clamp(weatherFit),
    clamp(monochromeRatio),
    clamp(textureContrast),
  ];
}

/* ── スタイル重心 (centroid) ── */
export function computeStyleCentroid(dnaVectors: OutfitDnaVector[]): OutfitDnaVector {
  if (dnaVectors.length === 0) return [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
  const sum: OutfitDnaVector = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const v of dnaVectors) {
    for (let i = 0; i < 12; i++) sum[i] += v[i];
  }
  return sum.map(s => s / dnaVectors.length) as OutfitDnaVector;
}

/* ── 冒険度スコア (centroidからの距離) ── */
export function computeAdventureScore(
  dna: OutfitDnaVector,
  centroid: OutfitDnaVector,
): number {
  // ユークリッド距離
  let sumSq = 0;
  for (let i = 0; i < 12; i++) {
    sumSq += (dna[i] - centroid[i]) ** 2;
  }
  const dist = Math.sqrt(sumSq / 12); // 正規化距離
  // 0~1 にスケール (距離の理論最大は1)
  return Math.min(100, Math.round(dist * 200));
}

/* ── DNA間の類似度 (コサイン類似度) ── */
export function dnaSimilarity(a: OutfitDnaVector, b: OutfitDnaVector): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < 12; i++) {
    dot += a[i] * b[i];
    magA += a[i] ** 2;
    magB += b[i] ** 2;
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  if (mag === 0) return 0;
  return Math.round((dot / mag) * 100);
}

/* ── スタイル進化度 (2つのcentroid間の距離) ── */
export function computeStyleEvolution(
  prevCentroid: OutfitDnaVector,
  currentCentroid: OutfitDnaVector,
): { distance: number; shifts: Array<{ dimension: string; from: number; to: number; delta: number }> } {
  let sumSq = 0;
  const shifts: Array<{ dimension: string; from: number; to: number; delta: number }> = [];

  for (let i = 0; i < 12; i++) {
    const delta = currentCentroid[i] - prevCentroid[i];
    sumSq += delta ** 2;
    if (Math.abs(delta) >= 0.1) {
      shifts.push({
        dimension: DNA_LABELS[i],
        from: Math.round(prevCentroid[i] * 100),
        to: Math.round(currentCentroid[i] * 100),
        delta: Math.round(delta * 100),
      });
    }
  }

  shifts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    distance: Math.round(Math.sqrt(sumSq / 12) * 100),
    shifts: shifts.slice(0, 3),
  };
}

/* ── スタイルプロファイルサマリ ── */
export function describeStyleProfile(centroid: OutfitDnaVector): string {
  const traits: string[] = [];

  if (centroid[0] >= 0.6) traits.push("きれいめ");
  else if (centroid[0] <= 0.3) traits.push("カジュアル");

  if (centroid[2] >= 0.6) traits.push("ライトトーン");
  else if (centroid[2] <= 0.3) traits.push("ダークトーン");

  if (centroid[3] >= 0.5) traits.push("鮮やか");
  else if (centroid[3] <= 0.2) traits.push("落ち着いた色味");

  if (centroid[5] >= 0.6) traits.push("リラックスシルエット");
  else if (centroid[5] <= 0.3) traits.push("タイトシルエット");

  if (centroid[10] >= 0.6) traits.push("モノトーン志向");

  if (traits.length === 0) traits.push("バランス型");

  return traits.join(" × ");
}

/* ── ヘルパー ── */
function avg(nums: number[]): number {
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0.5;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}
