import type { RendezvousCategory, DealbreakerProfile } from "./types";
import { similarityScore } from "./similarityScore";

/**
 * プロフィール属性ブースト
 *
 * ライフスタイルスライダー・エリア（都道府県）から追加適合スコアを算出。
 * categoryAffinity に加算ブレンドされる。
 *
 * 設計思想:
 * - ライフスタイルは partner/romantic で重要、friendship/community では軽め
 * - エリアは partner で最重要（同居前提）、community でも重要（会える前提）
 * - 未入力データは中央値（0.5）扱いでペナルティなし
 */

const LIFESTYLE_KEYS = [
  "lifestyleMorningNight",
  "lifestyleIndoorOutdoor",
  "lifestyleSoloSocial",
] as const;

/** 0-100 スライダー値を 0-1 に正規化 */
function normalizeSlider(value: number | undefined): number {
  if (value == null) return 0.5; // 未入力は中央
  return Math.max(0, Math.min(1, value / 100));
}

/** ライフスタイル適合: 3軸の平均similarityScore */
function lifestyleFit(
  a: DealbreakerProfile | undefined,
  b: DealbreakerProfile | undefined,
): number {
  if (!a && !b) return 0.5;
  const pa = a ?? {};
  const pb = b ?? {};

  let sum = 0;
  for (const key of LIFESTYLE_KEYS) {
    sum += similarityScore(
      normalizeSlider(pa[key]),
      normalizeSlider(pb[key]),
    );
  }
  return sum / LIFESTYLE_KEYS.length;
}

// 同一都道府県かどうか
function areaFit(
  a: DealbreakerProfile | undefined,
  b: DealbreakerProfile | undefined,
): number {
  if (!a?.prefecture || !b?.prefecture) return 0.5; // 未入力は中立
  return a.prefecture === b.prefecture ? 1.0 : 0.3;
}

// 会いやすさの重なり
function availabilityFit(
  a: DealbreakerProfile | undefined,
  b: DealbreakerProfile | undefined,
): number {
  if (!a?.availability?.length || !b?.availability?.length) return 0.5;
  const setB = new Set(b.availability);
  const overlap = a.availability.filter((x) => setB.has(x)).length;
  const union = new Set([...a.availability, ...b.availability]).size;
  return union > 0 ? overlap / union : 0.5;
}

/** カテゴリ別のプロフィールブーストウェイト */
const CATEGORY_PROFILE_WEIGHTS: Record<
  RendezvousCategory,
  { lifestyle: number; area: number; availability: number }
> = {
  partner: { lifestyle: 0.40, area: 0.35, availability: 0.25 },
  romantic: { lifestyle: 0.35, area: 0.30, availability: 0.35 },
  friendship: { lifestyle: 0.30, area: 0.20, availability: 0.50 },
  cocreation: { lifestyle: 0.15, area: 0.15, availability: 0.70 },
  community: { lifestyle: 0.20, area: 0.30, availability: 0.50 },
};

/**
 * プロフィール属性から追加適合スコアを算出 (0..1)
 * categoryAffinity にブレンドされる
 */
export function computeProfileBoost(params: {
  category: RendezvousCategory;
  profileA: DealbreakerProfile | undefined;
  profileB: DealbreakerProfile | undefined;
}): number {
  const { category, profileA, profileB } = params;
  const w = CATEGORY_PROFILE_WEIGHTS[category];

  const ls = lifestyleFit(profileA, profileB);
  const ar = areaFit(profileA, profileB);
  const av = availabilityFit(profileA, profileB);

  return ls * w.lifestyle + ar * w.area + av * w.availability;
}
