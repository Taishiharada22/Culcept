// lib/stargazer/psycheSignature.ts
// Psyche Signature + Psyche Wrapped — 心理的指紋と定期サマリー
//
// 核心思想:
// ユーザーの内面の変遷を「視覚的な指紋」と「物語」に変換する。
// Spotify Wrapped のように、ある期間の自分を振り返り、
// 共有可能な形で自己理解を表現する。
//
// v2 設計原則:
// - 形状は軸スコア分布の幾何学的性質から導出（恣意的マッピングの排除）
// - 色は3層: 核色(Layer1) + 状態色(軸分布) + 気象色(天候) のブレンド
// - Wrapped は「驚き」が主役。ダッシュボード数値ではなく自己発見
// - ナラティブは潜在意識からの手紙として書く
// - 共有カードは「これ何？」と聞きたくなるミステリアスさ
//
// Signature = 視覚的指紋（色・形・複雑さ・脈動）
// Wrapped = 物語的サマリー（発見 + ナラティブ + 共有カード）

import type { ArchetypeCode } from "./archetypeTypes";
import { ARCHETYPE_DEFS, LAYER1_DEFS, LAYER2_DEFS, LAYER3_DEFS, parseArchetypeCode } from "./archetypeTypes";
import type { Layer1Code, Layer2Code, Layer3Code, CognitionCode, EmotionCode, SocialCode } from "./archetypeTypes";
import { TRAIT_AXES, type TraitAxisKey, type AxisCategory } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** サマリー期間 */
export type SignaturePeriod = "weekly" | "monthly" | "yearly";

/** シグネチャの形状 — 軸分布の幾何学的性質から導出 */
export type SignatureShape = "circle" | "star" | "crystal" | "wave" | "spiral" | "flame";

/** 形状の心理的意味 */
export interface ShapeMeaning {
  shape: SignatureShape;
  label: string;
  description: string;
  /** 共有カードに表示する一言 */
  shareTagline: string;
}

const SHAPE_MEANINGS: Record<SignatureShape, ShapeMeaning> = {
  circle: {
    shape: "circle",
    label: "まるい心",
    description: "全体的にバランスがとれてる。どこかに偏りすぎない安定感がある人。",
    shareTagline: "どこにも偏らない強さ",
  },
  star: {
    shape: "star",
    label: "いろんな方向に伸びる星",
    description: "いろんな方向に才能が伸びてる。エネルギーの出口がたくさんある人。",
    shareTagline: "一つに絞れないのが才能",
  },
  crystal: {
    shape: "crystal",
    label: "整った結晶",
    description: "考え方に筋が通ってて、内側がきれいに整理されてる人。",
    shareTagline: "頭の中がきれいに整ってる",
  },
  wave: {
    shape: "wave",
    label: "揺れる波",
    description: "感情の波が大きくて、常に変化し続けてる。その揺れ自体があなたの個性。",
    shareTagline: "揺れてること自体が強さ",
  },
  spiral: {
    shape: "spiral",
    label: "上がっていく螺旋",
    description: "変化を怖がらずに受け入れて、ずっと成長し続けてる人。",
    shareTagline: "同じ場所にはもう戻らない",
  },
  flame: {
    shape: "flame",
    label: "燃える炎",
    description: "全部の軸で「どっちでもいい」を拒否する、意志の強い人。",
    shareTagline: "中途半端が一番嫌い",
  },
};

/** Psyche Signature — 心理的指紋 */
export interface PsycheSignature {
  userId: string;
  period: SignaturePeriod;
  periodStart: string;
  periodEnd: string;
  /** ドミナントカラー (Hex) — 核色 */
  dominantColor: string;
  /** 状態色 (Hex) — 軸分布から導出 */
  stateColor: string;
  /** 気象色 (Hex) — 天候から導出 */
  weatherColor: string;
  /** アクセントカラー (2-3 Hex) */
  accentColors: string[];
  /** パターンの形状 */
  shape: SignatureShape;
  /** 形状の意味 */
  shapeMeaning: ShapeMeaning;
  /** パターンの複雑さ (1-10) */
  complexity: number;
  /** パターンの対称性 (0-1) */
  symmetry: number;
  /** 脈動の強さ (0-1) — 感情変動の大きさ。アニメーション用 */
  pulseIntensity: number;
  /** 支配的な天候 */
  dominantWeather: string;
  /** 感情の旅のナラティブ */
  moodArc: string;
  /** 期間中のトップ発見 */
  topDiscoveries: string[];
  /** 盲点の数 */
  blindSpotCount: number;
  /** 予言的中率 (0-1) */
  prophecyAccuracy: number;
  /** 地図探索率 (0-1) */
  mapProgress: number;
  /** 最も極端だった軸 */
  mostExtremeAxis?: { key: string; label: string; score: number; direction: string };
  /** 最も矛盾していた軸ペア */
  biggestContradiction?: { axis1: string; axis2: string; description: string };
  /** 共有トークン */
  shareToken: string;
}

/** Wrapped の統計エントリ — 「驚き」を主役にする */
export interface WrappedStat {
  /** カテゴリ: discovery / pattern / edge / reflection */
  category: "discovery" | "pattern" | "edge" | "reflection";
  /** ラベル */
  label: string;
  /** 値の表示文字列 */
  value: string;
  /** 補足テキスト（驚きのある一言） */
  insight: string;
  /** 他ユーザーとの比較 (任意) */
  comparison?: string;
}

/** 共有カードデータ — ミステリアスで「これ何？」と聞きたくなる設計 */
export interface ShareCardData {
  /** メインコピー（短い詩的表現） */
  headline: string;
  /** 二行目: 形状 + 期間 */
  subline: string;
  /** CSSグラデーション (3色以上) */
  gradient: string;
  /** 形状名 */
  shapeName: string;
  /** シグネチャの一言 */
  shapeTagline: string;
  /** 最も印象的な数値1つだけ */
  spotlightStat: { label: string; value: string };
  /** 小さく表示するアーキタイプ名 */
  archetypeHint: string;
  /** URL トークン */
  shareToken: string;
}

/** Psyche Wrapped — 期間サマリー */
export interface PsycheWrapped {
  period: SignaturePeriod;
  /** ページタイトル（期間を示す） */
  pageTitle: string;
  /** 冒頭の一言（最も印象的な発見） */
  openingLine: string;
  /** 統計一覧 */
  stats: WrappedStat[];
  /** 物語的ナラティブ — 潜在意識からの手紙 */
  narrative: string;
  /** 対応するシグネチャ */
  signature: PsycheSignature;
  /** 共有カード */
  shareCard: ShareCardData;
}

/** シグネチャ生成の入力 */
export interface SignatureInput {
  /** 3文字アーキタイプコード */
  archetypeCode: string;
  /** 45軸スコア (range: -1 to 1) */
  axisScores: Record<string, number>;
  /** 天候履歴 */
  weatherHistory: Array<{ date: string; type: string }>;
  /** 盲点発見数 */
  blindSpotDrops: number;
  /** 予言的中率 (0-1) */
  prophecyAccuracy: number;
  /** 地図探索率 (0-1) */
  mapProgress: number;
  /** 期間中の発見 */
  discoveries: string[];
  /** 期間種別 */
  period: SignaturePeriod;
  /** 期間開始日 (ISO) */
  periodStart: string;
  /** 期間終了日 (ISO) */
  periodEnd: string;
  /** カテゴリ別の軸スコア分布 (あれば精度向上) */
  categoryScores?: Partial<Record<AxisCategory, number[]>>;
  /** 前期のシグネチャ (差分表示用) */
  previousSignature?: PsycheSignature;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 決定論的擬似乱数 (0-1) */
function deterministicRandom(seed: string): number {
  let h = 0xdeadbeef;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 2654435761);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h >>> 0) / 0xffffffff;
}

/** seed から min-max の整数を生成 */
function deterministicInt(seed: string, min: number, max: number): number {
  return Math.floor(deterministicRandom(seed) * (max - min + 1)) + min;
}

/** seed から配列の要素を1つ選ぶ */
function deterministicPick<T>(seed: string, arr: readonly T[]): T {
  return arr[deterministicInt(seed, 0, arr.length - 1)]!;
}

/** アーキタイプ定義の取得 */
function getArchetypeDef(code: string) {
  return ARCHETYPE_DEFS.find((a) => a.code === code);
}

/** 天候の最頻値 */
function getDominantWeather(history: Array<{ date: string; type: string }>): string {
  if (history.length === 0) return "calm";
  const counts: Record<string, number> = {};
  for (const entry of history) {
    counts[entry.type] = (counts[entry.type] ?? 0) + 1;
  }
  let max = 0;
  let dominant = "calm";
  for (const [type, count] of Object.entries(counts)) {
    if (count > max) {
      max = count;
      dominant = type;
    }
  }
  return dominant;
}

/** 軸スコアの平均絶対値 */
function averageIntensity(scores: Record<string, number>): number {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + Math.abs(v), 0) / values.length;
}

/** 軸スコアの分散 */
function variance(scores: Record<string, number>): number {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
}

/** 最も極端な軸を見つける */
function findMostExtreme(scores: Record<string, number>): { key: string; score: number } | null {
  let maxKey = "";
  let maxAbs = 0;
  for (const [key, val] of Object.entries(scores)) {
    if (Math.abs(val) > maxAbs) {
      maxAbs = Math.abs(val);
      maxKey = key;
    }
  }
  if (!maxKey) return null;
  return { key: maxKey, score: scores[maxKey]! };
}

/** 最も矛盾する軸ペアを検出 (同カテゴリ内で符号が逆) */
function findBiggestContradiction(
  scores: Record<string, number>,
): { axis1: string; axis2: string; tension: number } | null {
  const axisByCategory = new Map<string, { key: string; score: number }[]>();
  for (const axisDef of TRAIT_AXES) {
    const score = scores[axisDef.id];
    if (score === undefined) continue;
    const list = axisByCategory.get(axisDef.category) ?? [];
    list.push({ key: axisDef.id, score });
    axisByCategory.set(axisDef.category, list);
  }

  let maxTension = 0;
  let result: { axis1: string; axis2: string; tension: number } | null = null;

  for (const [, axes] of Array.from(axisByCategory.entries())) {
    for (let i = 0; i < axes.length; i++) {
      for (let j = i + 1; j < axes.length; j++) {
        const a = axes[i]!;
        const b = axes[j]!;
        // 同カテゴリ内で方向が逆 = 矛盾
        if (Math.sign(a.score) !== Math.sign(b.score) && a.score !== 0 && b.score !== 0) {
          const tension = Math.abs(a.score) + Math.abs(b.score);
          if (tension > maxTension) {
            maxTension = tension;
            result = { axis1: a.key, axis2: b.key, tension };
          }
        }
      }
    }
  }
  return result;
}

/** HSL から Hex に変換 */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** 2つの Hex カラーをブレンド */
function blendColors(hex1: string, hex2: string, ratio: number): string {
  const parse = (hex: string) => {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] as const;
  };
  const [r1, g1, b1] = parse(hex1);
  const [r2, g2, b2] = parse(hex2);
  const blend = (a: number, b: number) => Math.round(a + (b - a) * ratio);
  const r = blend(r1, r2);
  const g = blend(g1, g2);
  const b = blend(b1, b2);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Color Determination — 3層モデル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 核色: アーキタイプ3層から導出。
 *
 * Layer1 → 色相 (P=紫270, B=琥珀35, H=青緑175)
 * Layer2 → 彩度 (E=高彩度, I=中彩度, S=低彩度)
 * Layer3 → 明度 (A=明るい, W=中間, D=暗い)
 *
 * これにより24タイプそれぞれが固有の核色を持つ。
 */
function calculateCoreColor(archetypeCode: string): string {
  const parsed = parseArchetypeCode(archetypeCode);

  const hueMap: Record<CognitionCode, number> = { A: 220, N: 270, S: 175 };
  const satMap: Record<EmotionCode, number> = { C: 60, V: 80 };
  const lightMap: Record<SocialCode, number> = { I: 48, E: 62 };

  return hslToHex(hueMap[parsed.cognition], satMap[parsed.emotion], lightMap[parsed.social]);
}

/**
 * 状態色: 軸スコア分布の統計的性質から色を導出。
 *
 * 色相: 最も強い軸カテゴリに対応 (core=赤, relational=橙, motion=黄,
 *        aesthetic=緑, emotional=青, safety=紺, relational_deep=藍)
 * 彩度: 平均強度 (強い = 鮮やか, 弱い = くすみ)
 * 明度: 分散 (高分散 = 明るい = 内面が多面的, 低分散 = 暗い = 一貫性)
 */
function calculateStateColor(scores: Record<string, number>): string {
  const categoryHues: Record<AxisCategory, number> = {
    core: 0,
    relational: 30,
    motion: 55,
    aesthetic: 140,
    emotional: 220,
    safety: 250,
    relational_deep: 280,
    depth: 300,
    cognitive: 190,
    expansion: 160,
  };

  // カテゴリごとの平均絶対値を算出
  const categoryIntensity: Partial<Record<AxisCategory, number>> = {};
  const categoryCount: Partial<Record<AxisCategory, number>> = {};
  for (const axisDef of TRAIT_AXES) {
    const score = scores[axisDef.id];
    if (score === undefined) continue;
    const cat = axisDef.category;
    categoryIntensity[cat] = (categoryIntensity[cat] ?? 0) + Math.abs(score);
    categoryCount[cat] = (categoryCount[cat] ?? 0) + 1;
  }

  // 最も強いカテゴリ
  let strongestCategory: AxisCategory = "core";
  let maxIntensity = 0;
  for (const [cat, total] of Object.entries(categoryIntensity) as [AxisCategory, number][]) {
    const avg = total / (categoryCount[cat] ?? 1);
    if (avg > maxIntensity) {
      maxIntensity = avg;
      strongestCategory = cat;
    }
  }

  const hue = categoryHues[strongestCategory];
  const sat = Math.round(30 + averageIntensity(scores) * 50); // 30-80
  const light = Math.round(35 + Math.min(variance(scores), 0.5) * 50); // 35-60

  return hslToHex(hue, Math.min(sat, 85), Math.min(light, 65));
}

/** 天候ごとの気象色 */
const WEATHER_COLORS: Record<string, string> = {
  storm:  "#4B0082", // 嵐 = 深い紫
  rain:   "#4169E1", // 雨 = ロイヤルブルー
  cloudy: "#778899", // 曇り = スレートグレー
  calm:   "#2E8B57", // 穏やか = シーグリーン
  sunny:  "#FF8C00", // 晴れ = ダークオレンジ
  aurora: "#DA70D6", // オーロラ = オーキッド
  fog:    "#B0C4DE", // 霧 = ライトスチールブルー
  wind:   "#00CED1", // 風 = ダークターコイズ
};

/**
 * シグネチャカラーを3層モデルで決定する。
 *
 * dominant = 核色 (アーキタイプ固有)
 * stateColor = 状態色 (軸分布)
 * weatherColor = 気象色 (天候)
 * accents = dominant と stateColor のブレンド + weatherColor の変種
 */
export function determineSignatureColors(
  archetypeCode: string,
  axisScores: Record<string, number>,
  dominantWeather: string,
): { dominant: string; stateColor: string; weatherColor: string; accents: string[] } {
  const dominant = calculateCoreColor(archetypeCode);
  const stateColor = calculateStateColor(axisScores);
  const weatherColor = WEATHER_COLORS[dominantWeather] ?? WEATHER_COLORS["calm"]!;

  // アクセントは3色のブレンドから生成
  const accent1 = blendColors(dominant, stateColor, 0.5);
  const accent2 = blendColors(stateColor, weatherColor, 0.4);
  const accent3 = blendColors(dominant, weatherColor, 0.3);

  return { dominant, stateColor, weatherColor, accents: [accent1, accent2, accent3] };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shape Determination — 幾何学的導出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 軸スコア分布の幾何学的性質から形状を決定する。
 *
 * 各形状は数学的に定義された条件に基づく:
 *
 * circle:  全軸の絶対値の標準偏差が小さい (偏りが少ない)
 * star:    |score| > 0.6 の軸が3つ以上 (複数の突出)
 * crystal: 軸間相関が高い (内部構造に秩序がある)
 * wave:    感情系軸の絶対値の和が他カテゴリより大きい + 天候変動大
 * spiral:  変化受容・新奇性軸が高い + 前期からの変化量が大きい
 * flame:   全軸の平均絶対値が0.5以上 (全方位に強い)
 */
export function determineSignatureShape(
  axisScores: Record<string, number>,
  weatherHistory: Array<{ date: string; type: string }>,
): SignatureShape {
  const get = (key: string): number => axisScores[key] ?? 0;
  const values = Object.values(axisScores);
  const absValues = values.map(Math.abs);

  // 基礎統計量
  const avgAbs = absValues.length > 0 ? absValues.reduce((a, b) => a + b, 0) / absValues.length : 0;
  const stdDev = Math.sqrt(variance(axisScores));
  const peakCount = absValues.filter((v) => v > 0.6).length;

  // カテゴリ別強度
  const categoryStrength: Record<string, number> = {};
  for (const axisDef of TRAIT_AXES) {
    const score = axisScores[axisDef.id];
    if (score === undefined) continue;
    categoryStrength[axisDef.category] = (categoryStrength[axisDef.category] ?? 0) + Math.abs(score);
  }
  const emotionalStrength = (categoryStrength["emotional"] ?? 0) + (categoryStrength["relational_deep"] ?? 0);
  const totalStrength = Object.values(categoryStrength).reduce((a, b) => a + b, 0);

  // 天候の変動性
  const weatherTypes = new Set(weatherHistory.map((w) => w.type));
  const weatherVariety = weatherHistory.length > 0
    ? weatherTypes.size / Math.min(weatherHistory.length, 7)
    : 0;

  // 各形状のスコアを正規化して計算 (全て 0-1 の範囲)
  const scores: Record<SignatureShape, number> = {
    // circle: 標準偏差が小さいほどスコアが高い
    circle: Math.max(0, 1 - stdDev * 2.5),

    // star: ピーク数が多いほどスコアが高い (3+で最大)
    star: Math.min(1, peakCount / 3),

    // crystal: 分散が中程度 (0.1-0.3) で秩序がある状態
    crystal: Math.max(0, 1 - Math.abs(stdDev - 0.35) * 4),

    // wave: 感情カテゴリが支配的 + 天候変動大
    wave: totalStrength > 0
      ? (emotionalStrength / totalStrength) * 0.6 + weatherVariety * 0.4
      : 0,

    // spiral: 変化受容 + 新奇性が高い (正規化: -1~1 を 0~1 に)
    spiral: Math.max(0, (get("change_embrace_vs_resist") + 1) / 2 * 0.5 +
      (get("tradition_vs_novelty") + 1) / 2 * 0.5),

    // flame: 平均絶対値が高い (0.5以上で最大)
    flame: Math.min(1, avgAbs * 2),
  };

  // 最高スコアの形状を選択
  let bestShape: SignatureShape = "circle";
  let bestScore = -1;
  for (const [shape, score] of Object.entries(scores) as [SignatureShape, number][]) {
    if (score > bestScore) {
      bestScore = score;
      bestShape = shape;
    }
  }

  return bestShape;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Share Token
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function generateShareToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(12);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let token = "";
  for (let i = 0; i < bytes.length; i++) {
    token += chars[bytes[i]! % chars.length];
  }
  return token;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mood Arc — 潜在意識の天気図
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const WEATHER_LABELS: Record<string, string> = {
  storm: "嵐", rain: "雨", cloudy: "曇り", calm: "凪",
  sunny: "晴れ", aurora: "極光", fog: "霧", wind: "風",
};

/**
 * 天候履歴からムードアークを生成する。
 * 天候の遷移パターンに着目し、物語的に描写する。
 */
function generateMoodArc(weatherHistory: Array<{ date: string; type: string }>): string {
  if (weatherHistory.length === 0) {
    return "まだ心の天気図は白紙だ。最初の一滴が落ちるのを、静かに待っている。";
  }

  const sorted = [...weatherHistory].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const first = WEATHER_LABELS[sorted[0]!.type] ?? sorted[0]!.type;
  const last = WEATHER_LABELS[sorted[sorted.length - 1]!.type] ?? sorted[sorted.length - 1]!.type;
  const stormCount = sorted.filter((w) => w.type === "storm").length;
  const auroraCount = sorted.filter((w) => w.type === "aurora").length;
  const calmCount = sorted.filter((w) => w.type === "calm" || w.type === "sunny").length;

  // 遷移パターンを検出
  const transitions = new Set<string>();
  for (let i = 1; i < sorted.length; i++) {
    transitions.add(`${sorted[i - 1]!.type}->${sorted[i]!.type}`);
  }
  const hasStormToCalm = transitions.has("storm->calm") || transitions.has("storm->sunny");
  const hasCalmToStorm = transitions.has("calm->storm") || transitions.has("sunny->storm");

  if (hasStormToCalm && hasCalmToStorm) {
    return `「${first}」から始まり「${last}」で終わったこの期間。嵐と凪が交互に訪れた。あなたの内側では、何かが壊れては再生するサイクルが回っていた。`;
  }
  if (stormCount > sorted.length * 0.4) {
    return `${stormCount}回の嵐。この期間のあなたは、何度も自分の底を見に行った。だがそれは崩壊ではない——深い場所に自分を探しに行く旅だった。最後に辿り着いた場所は「${last}」。`;
  }
  if (auroraCount > 0) {
    return `${auroraCount}回の極光。それは数百回の観測に一度あるかないかの稀な現象だ。あなたの内側で、無意識と意識が一瞬だけ完全に同期した。その光景を、あなたは覚えているだろうか。`;
  }
  if (calmCount > sorted.length * 0.6) {
    return `穏やかな日々が続いた。だが凪の海面の下では、目に見えない潮流が静かに方向を変えていた。「${first}」から「${last}」へ——表面上の変化は小さくとも、深層の変化は大きい。`;
  }
  return `「${first}」から「${last}」へ。${sorted.length}日間の天気図は、あなたの内側で起きていた変化の影絵だ。その影の本体が何だったのか——次の観測が教えてくれる。`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Psyche Signature Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function generatePsycheSignature(input: SignatureInput): PsycheSignature {
  const dominantWeather = getDominantWeather(input.weatherHistory);
  const shape = determineSignatureShape(input.axisScores, input.weatherHistory);
  const shapeMeaning = SHAPE_MEANINGS[shape];
  const colors = determineSignatureColors(input.archetypeCode, input.axisScores, dominantWeather);
  const moodArc = generateMoodArc(input.weatherHistory);

  // 複雑さ: 分散 + 天候の多様性 + ピーク数
  const v = variance(input.axisScores);
  const weatherTypes = new Set(input.weatherHistory.map((w) => w.type));
  const peakCount = Object.values(input.axisScores).filter((s) => Math.abs(s) > 0.6).length;
  const rawComplexity = v * 5 + weatherTypes.size * 0.4 + peakCount * 0.3;
  const complexity = Math.max(1, Math.min(10, Math.round(rawComplexity)));

  // 対称性: 全軸の正負バランス (正の数 ≈ 負の数 なら対称)
  const positiveCount = Object.values(input.axisScores).filter((s) => s > 0.1).length;
  const negativeCount = Object.values(input.axisScores).filter((s) => s < -0.1).length;
  const total = positiveCount + negativeCount;
  const symmetry = total > 0
    ? Math.round((1 - Math.abs(positiveCount - negativeCount) / total) * 100) / 100
    : 0.5;

  // 脈動: 感情系軸の絶対値平均
  const emotionalAxes: string[] = ["emotional_variability", "emotional_regulation", "reassurance_need"];
  const emotionalValues = emotionalAxes.map((k) => Math.abs(input.axisScores[k] ?? 0));
  const pulseIntensity = emotionalValues.length > 0
    ? Math.min(1, emotionalValues.reduce((a, b) => a + b, 0) / emotionalValues.length)
    : 0;

  // 最も極端な軸
  const extreme = findMostExtreme(input.axisScores);
  let mostExtremeAxis: PsycheSignature["mostExtremeAxis"];
  if (extreme) {
    const axisDef = TRAIT_AXES.find((a) => a.id === extreme.key);
    if (axisDef) {
      mostExtremeAxis = {
        key: extreme.key,
        label: extreme.score > 0 ? axisDef.labelRight : axisDef.labelLeft,
        score: extreme.score,
        direction: extreme.score > 0 ? axisDef.labelRight : axisDef.labelLeft,
      };
    }
  }

  // 最大の矛盾
  const contradiction = findBiggestContradiction(input.axisScores);
  let biggestContradiction: PsycheSignature["biggestContradiction"];
  if (contradiction) {
    const def1 = TRAIT_AXES.find((a) => a.id === contradiction.axis1);
    const def2 = TRAIT_AXES.find((a) => a.id === contradiction.axis2);
    if (def1 && def2) {
      biggestContradiction = {
        axis1: `${def1.labelLeft}/${def1.labelRight}`,
        axis2: `${def2.labelLeft}/${def2.labelRight}`,
        description: `「${def1.labelLeft}/${def1.labelRight}」と「${def2.labelLeft}/${def2.labelRight}」が相反する方向を示している`,
      };
    }
  }

  return {
    userId: "",
    period: input.period,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    dominantColor: colors.dominant,
    stateColor: colors.stateColor,
    weatherColor: colors.weatherColor,
    accentColors: colors.accents,
    shape,
    shapeMeaning,
    complexity,
    symmetry,
    pulseIntensity,
    dominantWeather,
    moodArc,
    topDiscoveries: input.discoveries.slice(0, 5),
    blindSpotCount: input.blindSpotDrops,
    prophecyAccuracy: input.prophecyAccuracy,
    mapProgress: input.mapProgress,
    mostExtremeAxis,
    biggestContradiction,
    shareToken: generateShareToken(),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Wrapped Stats — 驚きを設計する
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Wrapped の統計を生成する。
 *
 * 4カテゴリ:
 * - discovery: 新たに分かったこと
 * - pattern: あなたの行動パターン
 * - edge: あなたの際立った特徴
 * - reflection: 内省を促す問い
 */
export function generateWrappedStats(input: SignatureInput): WrappedStat[] {
  const stats: WrappedStat[] = [];

  // === discovery: 最も大きな発見 ===
  if (input.discoveries.length > 0) {
    stats.push({
      category: "discovery",
      label: "この期間で最も大きな発見",
      value: input.discoveries[0]!,
      insight: input.discoveries.length > 1
        ? `他にも${input.discoveries.length - 1}の気づきがあった`
        : "たった一つの発見が、全てを変えることがある",
    });
  }

  // === discovery: 盲点 ===
  if (input.blindSpotDrops > 0) {
    stats.push({
      category: "discovery",
      label: "見えていなかった自分",
      value: `${input.blindSpotDrops}箇所`,
      insight: input.blindSpotDrops >= 5
        ? "これだけ見つかったのは、それだけ深く潜ったという証だ"
        : "盲点は、あなたが最も成長できる場所でもある",
    });
  }

  // === pattern: 最も極端だった軸 ===
  const extreme = findMostExtreme(input.axisScores);
  if (extreme) {
    const axisDef = TRAIT_AXES.find((a) => a.id === extreme.key);
    if (axisDef) {
      const direction = extreme.score > 0 ? axisDef.labelRight : axisDef.labelLeft;
      const opposite = extreme.score > 0 ? axisDef.labelLeft : axisDef.labelRight;
      stats.push({
        category: "pattern",
        label: "あなたの中で最も強い傾向",
        value: direction,
        insight: `「${opposite}」の世界は、あなたにとってまだ未知の国だ`,
        comparison: `スコア ${(Math.abs(extreme.score) * 100).toFixed(0)}%`,
      });
    }
  }

  // === pattern: 予言的中率 ===
  const accuracy = Math.round(input.prophecyAccuracy * 100);
  stats.push({
    category: "pattern",
    label: "あなたの行動予測精度",
    value: `${accuracy}%`,
    insight: accuracy > 70
      ? "あなたのことが、かなり「読める」ようになってきた"
      : accuracy > 40
        ? "まだ予測不能な部分が多い。それは複雑さの証だ"
        : "あなたは最も予測困難なタイプかもしれない。それは褒め言葉だ",
  });

  // === edge: 矛盾 ===
  const contradiction = findBiggestContradiction(input.axisScores);
  if (contradiction) {
    const def1 = TRAIT_AXES.find((a) => a.id === contradiction.axis1);
    const def2 = TRAIT_AXES.find((a) => a.id === contradiction.axis2);
    if (def1 && def2) {
      stats.push({
        category: "edge",
        label: "あなたの中の最大の矛盾",
        value: `${def1.labelLeft}/${def1.labelRight} vs ${def2.labelLeft}/${def2.labelRight}`,
        insight: "矛盾は欠陥ではない。二つの世界を同時に見ることができる人だけが持つ力だ",
      });
    }
  }

  // === edge: 地図の進捗 ===
  const progress = Math.round(input.mapProgress * 100);
  const remaining = 100 - progress;
  stats.push({
    category: "edge",
    label: "自分の地図の探索率",
    value: `${progress}%`,
    insight: remaining > 50
      ? `まだ半分以上が霧の中。未知の自分が${remaining}%も眠っている`
      : remaining > 20
        ? `残り${remaining}%。核心に近づいている`
        : "地図のほぼ全域が見えている。だが、完全に霧が晴れることはない",
  });

  // === reflection: 天候パターンからの問い ===
  const stormCount = input.weatherHistory.filter((w) => w.type === "storm").length;
  const auroraCount = input.weatherHistory.filter((w) => w.type === "aurora").length;
  if (stormCount > 0 || auroraCount > 0) {
    stats.push({
      category: "reflection",
      label: "心の天候記録",
      value: stormCount > 0
        ? `嵐 ${stormCount}回`
        : `極光 ${auroraCount}回`,
      insight: stormCount > 0
        ? "嵐の日に下した判断を、穏やかな日の自分はどう思うだろう？"
        : "極光は、意識と無意識が一瞬だけ同期した証。何を見た？",
    });
  }

  // === reflection: 形状に基づく問い ===
  const shape = determineSignatureShape(input.axisScores, input.weatherHistory);
  const meaning = SHAPE_MEANINGS[shape];
  stats.push({
    category: "reflection",
    label: "あなたの内面の形",
    value: meaning.label,
    insight: meaning.description,
  });

  return stats;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Wrapped Narrative — 潜在意識からの手紙
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Wrapped のナラティブを生成する。
 *
 * 形式: 二人称の手紙体。「あなたの中のもう一人のあなた」が語る。
 * テンプレートではなく、入力データの組み合わせから動的に構築する。
 */
export function generateWrappedNarrative(input: SignatureInput): string {
  const archetype = getArchetypeDef(input.archetypeCode);
  const archetypeName = archetype?.name ?? input.archetypeCode;
  const l1 = input.archetypeCode[0] as Layer1Code ?? "P";
  const layer1Label = LAYER1_DEFS[l1]?.label ?? "存在証明";
  const growthKey = archetype?.growthKey ?? "";

  const dominantWeather = getDominantWeather(input.weatherHistory);
  const stormCount = input.weatherHistory.filter((w) => w.type === "storm").length;
  const auroraCount = input.weatherHistory.filter((w) => w.type === "aurora").length;
  const progress = Math.round(input.mapProgress * 100);
  const accuracy = Math.round(input.prophecyAccuracy * 100);
  const shape = determineSignatureShape(input.axisScores, input.weatherHistory);

  const extreme = findMostExtreme(input.axisScores);
  const extremeAxis = extreme ? TRAIT_AXES.find((a) => a.id === extreme.key) : null;
  const extremeDirection = extreme && extremeAxis
    ? (extreme.score > 0 ? extremeAxis.labelRight : extremeAxis.labelLeft)
    : null;

  const contradiction = findBiggestContradiction(input.axisScores);

  // --- 構成 ---

  // 書き出し: 潜在意識の声として語りかける
  const openings = [
    `やあ。あなたの中にいる、もう一人のあなただ。`,
    `しばらく黙っていたが、この期間のことを話しておきたい。`,
    `あなたが気づいていたかどうかは分からないが、この期間、あなたの内側では静かな変動があった。`,
  ];
  const opening = deterministicPick(`open:${input.periodStart}:${input.archetypeCode}`, openings);

  // 核の描写: アーキタイプの核を「あなたの中のもう一人」として描く
  const coreDescriptions: Record<string, string> = {
    P: `あなたはこの期間も「自分はここにいていいのか」という問いを抱えていた。${archetypeName}として、${layer1Label}を求め続けた。`,
    B: `あなたはこの期間、誰かとの繋がりの中に自分の輪郭を探していた。${archetypeName}として、${layer1Label}の糸を紡ぎ続けた。`,
    H: `あなたはこの期間、安全な場所を守りながら、その壁の外を気にしていた。${archetypeName}として、${layer1Label}の構築を続けた。`,
  };
  const coreDesc = coreDescriptions[l1] ?? coreDescriptions["P"]!;

  // 中盤: データに基づく具体的描写
  const middleParts: string[] = [];

  // 極端な軸への言及
  if (extremeDirection) {
    middleParts.push(
      `あなたの中で最も強く震えていたのは「${extremeDirection}」という弦だ。それはあなたの武器であり、同時に盲点でもある。`
    );
  }

  // 矛盾への言及
  if (contradiction) {
    const def1 = TRAIT_AXES.find((a) => a.id === contradiction.axis1);
    const def2 = TRAIT_AXES.find((a) => a.id === contradiction.axis2);
    if (def1 && def2) {
      middleParts.push(
        `一つ、気になっていることがある。あなたの中で「${def1.labelLeft}/${def1.labelRight}」と「${def2.labelLeft}/${def2.labelRight}」が相反する方向を指していた。これは破綻ではない。むしろ、あなたの複雑さの核心だ。`
      );
    }
  }

  // 天候への言及
  if (stormCount > 3) {
    middleParts.push(
      `${stormCount}回の嵐を越えた。そのたびにあなたは少しだけ変わった——自分では気づかないほど微かに、だが確実に。`
    );
  } else if (auroraCount > 0) {
    middleParts.push(
      `${auroraCount}回の極光があった。あれは私たち——あなたの意識と無意識が、一瞬だけ同じ空を見た瞬間だった。`
    );
  } else if (dominantWeather === "calm" || dominantWeather === "sunny") {
    middleParts.push(
      "穏やかな日々が続いた。だが、凪の海の底では何かが動いていた。あなたには見えなかったかもしれないが、私には見えていた。"
    );
  }

  // 発見への言及
  if (input.discoveries.length > 0) {
    middleParts.push(
      `「${input.discoveries[0]}」——この発見は、あなたが思っているより大きい。まだ全ての意味は見えていないが、いずれ分かるときが来る。`
    );
  }

  const middle = middleParts.join("");

  // 成長の鍵への言及
  const growthHint = growthKey
    ? `一つだけ伝えておく。あなたが次に向かうべき場所は「${growthKey}」の方角にある。怖いかもしれないが、そこにしか次の自分はいない。`
    : "";

  // 締め: 形状と地図の進捗で締める
  const shapeName = SHAPE_MEANINGS[shape].label;
  const closing = progress < 50
    ? `あなたの内面の形は今「${shapeName}」として現れている。地図の${progress}%が見えた。残りの${100 - progress}%に何があるか——それを知っているのは、未来の私たちだけだ。`
    : `あなたの内面の形は「${shapeName}」。地図の${progress}%が照らされた。${accuracy}%の精度であなたを予測できるようになった。だが、予測できない${100 - accuracy}%こそが、あなたが生きている証だ。`;

  return `${opening}\n\n${coreDesc}${middle}\n\n${growthHint}\n\n${closing}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Share Card — ミステリアスで共有したくなる
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function generateShareCard(
  signature: PsycheSignature,
  input: SignatureInput,
): ShareCardData {
  const archetype = getArchetypeDef(input.archetypeCode);
  const archetypeName = archetype?.name ?? input.archetypeCode;
  const shapeMeaning = SHAPE_MEANINGS[signature.shape];

  // グラデーション: 3色 (核色 → 状態色 → 気象色)
  const gradient = `linear-gradient(135deg, ${signature.dominantColor} 0%, ${signature.stateColor} 50%, ${signature.weatherColor} 100%)`;

  // ヘッドライン: 形状のタグラインをベースに、個人的要素を加える
  const periodLabel =
    signature.period === "weekly" ? "7日間" :
    signature.period === "monthly" ? "30日間" : "365日間";

  // 最も印象的な1つの数値を選ぶ
  let spotlightStat: { label: string; value: string };
  if (signature.blindSpotCount >= 5) {
    spotlightStat = { label: "発見した盲点", value: `${signature.blindSpotCount}` };
  } else if (signature.prophecyAccuracy > 0.7) {
    spotlightStat = { label: "行動予測精度", value: `${Math.round(signature.prophecyAccuracy * 100)}%` };
  } else if (signature.mostExtremeAxis) {
    spotlightStat = { label: "最も強い傾向", value: signature.mostExtremeAxis.direction };
  } else {
    spotlightStat = { label: "探索率", value: `${Math.round(signature.mapProgress * 100)}%` };
  }

  // ヘッドライン: ポエティックで短い
  const headlines = [
    `${shapeMeaning.shareTagline}`,
    `${periodLabel}の深層天気図`,
    `内側の${shapeMeaning.label}`,
  ];
  const headline = deterministicPick(
    `card:${input.periodStart}:${input.archetypeCode}`,
    headlines,
  );

  return {
    headline,
    subline: `${shapeMeaning.label} | ${periodLabel} | Psyche Signature`,
    gradient,
    shapeName: shapeMeaning.label,
    shapeTagline: shapeMeaning.shareTagline,
    spotlightStat,
    archetypeHint: archetypeName,
    shareToken: signature.shareToken,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Psyche Wrapped Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Psyche Wrapped を生成する。
 *
 * Spotify Wrapped のように、ある期間のユーザーの心理状態を
 * 発見・物語・視覚データとしてパッケージングする。
 */
export function generatePsycheWrapped(input: SignatureInput): PsycheWrapped {
  const signature = generatePsycheSignature(input);
  const stats = generateWrappedStats(input);
  const narrative = generateWrappedNarrative(input);
  const shareCard = generateShareCard(signature, input);

  // ページタイトル
  const periodLabel =
    input.period === "weekly" ? "今週" :
    input.period === "monthly" ? "今月" : "今年";
  const pageTitle = `${periodLabel}のPsyche Signature`;

  // 冒頭の一言: 最も印象的な要素を抽出
  let openingLine: string;
  if (signature.biggestContradiction) {
    openingLine = `あなたの中で、${signature.biggestContradiction.axis1}と${signature.biggestContradiction.axis2}が静かに対話していた`;
  } else if (signature.mostExtremeAxis) {
    openingLine = `あなたの中で最も強く響いていたのは「${signature.mostExtremeAxis.direction}」だった`;
  } else if (input.discoveries.length > 0) {
    openingLine = `「${input.discoveries[0]}」——これが、${periodLabel}のあなたを最もよく表す一言だ`;
  } else {
    openingLine = `${periodLabel}の${SHAPE_MEANINGS[signature.shape].label}。あなたの内面は、この形をしていた`;
  }

  return {
    period: input.period,
    pageTitle,
    openingLine,
    stats,
    narrative,
    signature,
    shareCard,
  };
}
