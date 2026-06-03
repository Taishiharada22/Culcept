/**
 * Place Affinity — P1A pure rerank（弱 persona-prior・行動学習なし）
 *
 * 設計書: docs/alter-plan-place-affinity-prior-phase1-design.md
 * 合意フロー: C(Step4) → P1-0設計 → **P1A-1(本ファイル)** → P1A-2(配線・別GO) → P2(行動posterior)
 *
 * 役割:
 *   場所候補の配列を (activityKey, 履歴, 弱い persona prior) で**並べ替え**、
 *   fact-based な1行理由を付ける**純関数**。副作用なし（DB / localStorage / 外部API / fetch なし）。
 *
 * 不変原則（CEO×GPT 確定）:
 *   1. persona は最弱の tie-breaker。`|personaTerm| ≤ PERSONA_EPSILON`。
 *      ⇒ base 差が **2ε(=0.10) 以上**の候補は persona で逆転しない（保証）。
 *         base 差 < 2ε の「ほぼ同点」でのみ persona が順序に影響しうる（＝意図どおり）。
 *      ※「絶対に逆転しない」ではない（base は連続値・最小段差は存在しない）— 正直な表現。
 *   2. reason は fact-gate のみ。`buildFactReason` は **persona を引数に取らない**
 *      ＝ persona 由来理由は構造的に生成不可能。
 *   3. 取れない場所性質（静か/電源/個室/雰囲気/混雑/高級…）は score にも reason にも使わない。
 *   4. `personaPrior` が無ければ完全 fail-open（履歴/距離/タイプのみ）。
 *   5. lane-agnostic：与えられた 1 配列を**安定ソート**（タイ時は入力順を保持）で rerank。
 *      レーン（よく行く/最近/この予定なら）を跨ぐ統合は呼び出し側（P1A-2）の責務。本modは混ぜない。
 */

import type { ActivityIconKey } from "./activityIcon";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 型

/** 正規化済みの場所候補（Google PlaceCandidate / 履歴チップ いずれもこの形に寄せる）。 */
export interface PlaceAffinityInput {
  /** 安定ソート鍵（placeId or 正規化 text）。 */
  id: string;
  /** 表示名（reason 照合用・log には出さない）。 */
  label: string;
  /** Google PlaceCandidate.types（あれば）。 */
  types?: string[];
  /** bias からの距離 m（あれば。null/未指定は中立）。 */
  distanceMeters?: number | null;
  /** この予定タイプでの利用回数（0 / 未指定 = 履歴なし）。 */
  historyCount?: number;
  /** title 連動で過去にこの予定で使ったか（履歴一致）。 */
  matchedThisActivity?: boolean;
  /** 直近に使ったか（"now" 基準で呼び出し側が算出。本modは wall-clock を持たない）。 */
  isRecent?: boolean;
}

/** 弱い persona prior（routine↔novelty / solo↔social の方向のみ・各 [-1,1]）。 */
export interface PlaceAffinityPrior {
  /** routine(-1) ↔ novelty(+1)。 */
  routineNovelty: number;
  /** solo(-1) ↔ social(+1)（types 弱推定への重み）。 */
  soloSocial: number;
}

export interface PlaceAffinityContext {
  activityKey: ActivityIconKey;
  /** null/未指定 = persona 無し（完全 fail-open）。 */
  personaPrior?: PlaceAffinityPrior | null;
}

export type PlaceReasonKind = "history" | "recent" | "distance" | "activity_type";

export interface RankedPlace {
  id: string;
  input: PlaceAffinityInput;
  rank: number;
  score: number;
  /** persona 非依存スコア（テスト/分析用）。 */
  baseScore: number;
  /** persona 補助項（[-ε, +ε]）。 */
  personaTerm: number;
  /** fact-based な1行理由（出せる時のみ・persona 由来は無し）。 */
  reason: string | null;
  reasonKind: PlaceReasonKind | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 定数（履歴・距離・タイプが主、persona は最弱）

export const W_HISTORY = 1.0;
export const W_DISTANCE = 0.6;
export const W_TYPE = 0.4;
export const W_FREQ = 0.15;
/** persona term の絶対上限。2*ε = 0.10 が「persona 不逆転」の base 差境界。 */
export const PERSONA_EPSILON = 0.05;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** ActivityIconKey → 想定 Google place types（実在 type のみ・保守的）。 */
const ACTIVITY_EXPECTED_TYPES: Record<ActivityIconKey, readonly string[]> = {
  work: ["library", "book_store", "cafe"],
  food: ["restaurant", "cafe", "bakery", "bar", "meal_takeaway"],
  fitness: ["gym", "park", "stadium"],
  travel: ["train_station", "subway_station", "transit_station", "airport", "bus_station"],
  meeting: ["cafe", "restaurant"],
  generic: [],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ feature 関数（取れる情報だけ）

/** types が activityKey に整合するか（交差 1 / 非交差 0）。 */
export function activityTypeMatch(
  types: readonly string[] | undefined,
  key: ActivityIconKey,
): number {
  if (!types || types.length === 0) return 0;
  const expected = ACTIVITY_EXPECTED_TYPES[key];
  if (expected.length === 0) return 0;
  return types.some((t) => expected.includes(t)) ? 1 : 0;
}

/** 距離 m → 0..1（近いほど高・null は中立 0.5）。 */
export function distanceFit(m: number | null | undefined): number {
  if (m == null || !Number.isFinite(m)) return 0.5;
  if (m <= 500) return 1;
  if (m >= 10000) return 0.1;
  return clamp(1 - ((m - 500) / (10000 - 500)) * 0.9, 0.1, 1);
}

/** 頻度 → 0..1（log スケール・常連を少しだけ上に）。c=1→0.33, 3→0.67, 7→1。 */
export function freqBoost(count: number | undefined): number {
  const c = count ?? 0;
  if (c <= 0) return 0;
  return clamp(Math.log2(1 + c) / 3, 0, 1);
}

/** types から solo(-1) ↔ social(+1) を弱推定（ranking-only・reason には出さない）。 */
export function soloSocialHint(types: readonly string[] | undefined): number {
  if (!types || types.length === 0) return 0;
  const SOLO = ["library", "book_store"];
  const SOCIAL = ["bar", "night_club", "banquet_hall", "restaurant"];
  let s = 0;
  if (types.some((t) => SOLO.includes(t))) s -= 1;
  if (types.some((t) => SOCIAL.includes(t))) s += 1;
  return clamp(s, -1, 1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ score

/** persona 非依存の base score。 */
export function computeBaseScore(item: PlaceAffinityInput, ctx: PlaceAffinityContext): number {
  const hist = item.matchedThisActivity ? 1 : 0;
  return (
    W_HISTORY * hist +
    W_DISTANCE * distanceFit(item.distanceMeters) +
    W_TYPE * activityTypeMatch(item.types, ctx.activityKey) +
    W_FREQ * freqBoost(item.historyCount)
  );
}

/** persona 補助項（[-ε, +ε]・弱い tie-breaker）。prior 無は 0。 */
export function computePersonaTerm(
  item: PlaceAffinityInput,
  prior: PlaceAffinityPrior | null | undefined,
): number {
  if (!prior) return 0;
  const noveltyDir = (item.historyCount ?? 0) > 0 ? -1 : 1; // 履歴外 = novelty(+1)
  const rn = clamp(prior.routineNovelty * noveltyDir, -1, 1);
  const ss = clamp(prior.soloSocial * soloSocialHint(item.types), -1, 1);
  const avg = clamp((rn + ss) / 2, -1, 1); // [-1, 1]
  return PERSONA_EPSILON * avg;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ reason（fact-gate のみ・persona を受け取らない）

/**
 * fact-based reason。**persona を引数に取らない**＝ persona 由来理由は構造的に不可能。
 * 優先順に最初の1つだけ。裏付け事実が無ければ null（捏造しない）。
 */
export function buildFactReason(
  item: PlaceAffinityInput,
  ctx: PlaceAffinityContext,
): { reason: string | null; kind: PlaceReasonKind | null } {
  if (item.matchedThisActivity) {
    const c = item.historyCount ?? 0;
    return {
      reason: c >= 2 ? "いつもの場所です" : "前回のこの予定でも選んでいます",
      kind: "history",
    };
  }
  if (item.isRecent) return { reason: "最近使った場所です", kind: "recent" };
  if (
    item.distanceMeters != null &&
    Number.isFinite(item.distanceMeters) &&
    item.distanceMeters <= 1500
  ) {
    return { reason: "近くて移動が少ない候補です", kind: "distance" };
  }
  if (activityTypeMatch(item.types, ctx.activityKey) === 1) {
    return { reason: "この予定タイプに近い場所です", kind: "activity_type" };
  }
  return { reason: null, kind: null };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ rerank（pure・安定ソート）

function distanceAsc(a: number | null | undefined, b: number | null | undefined): number {
  const av = a == null ? Infinity : a;
  const bv = b == null ? Infinity : b;
  return av - bv;
}

/** 場所候補を rerank（pure・安定：タイ時は入力順を保持＝レーンの freq/date 順を壊さない）。 */
export function rerankPlaceAffinity(
  items: readonly PlaceAffinityInput[],
  ctx: PlaceAffinityContext,
): RankedPlace[] {
  const scored = items.map((input, idx) => {
    const baseScore = computeBaseScore(input, ctx);
    const personaTerm = computePersonaTerm(input, ctx.personaPrior);
    const { reason, kind } = buildFactReason(input, ctx);
    return { input, idx, baseScore, personaTerm, score: baseScore + personaTerm, reason, kind };
  });
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (b.input.historyCount ?? 0) - (a.input.historyCount ?? 0) ||
      distanceAsc(a.input.distanceMeters, b.input.distanceMeters) ||
      a.idx - b.idx, // 安定: 入力順を最終 tiebreak（レーンの incoming 順を保持）
  );
  return scored.map((s, rank) => ({
    id: s.input.id,
    input: s.input,
    rank,
    score: s.score,
    baseScore: s.baseScore,
    personaTerm: s.personaTerm,
    reason: s.reason,
    reasonKind: s.kind,
  }));
}
