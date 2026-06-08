/**
 * lib/plan/compose/placeAffinitySafetyJournal.ts — Place Affinity 検証基盤（dogfood safety journal・local-only）
 *
 * ★目的（A1-13 dogfood safety journal 型を Place Affinity に適用）:
 *   dogfood で観測が貯まるにつれ、shadow ranking の **安全不変条件**（bounded nudge による clamp で
 *   候補が大きく動かない＝maxRankShift が小さい）が実データでも保たれるかを **派生サマリーのみ** で記録・検証する。
 *   over-personalization（ranking が暴れる）が起きていないかを蓄積後に確認できる枠。
 *
 * ★安全境界:
 *   - **派生サマリーのみ保存**: place 名/placeKey/座標/raw score/visitCount を保存しない（counts と boolean のみ）。
 *   - local-only / fail-open / DB・network なし / 件数上限あり。pure 判定。
 *   - 記録は dogfood（reason flag ON ∧ dev）のみ（呼び側 gate）。production は記録しない。
 */
import type { PlaceAffinityReadiness } from "@/lib/plan/compose/placeAffinityReadiness";
import type { ShadowRankingResult } from "@/lib/plan/compose/placeAffinityShadowRanking";

export const PLACE_AFFINITY_SAFETY_KEY = "aneurasync.plan.placeAffinitySafety.v1";
export const MAX_SAFETY_ENTRIES = 200;

/** 1 回の観測の派生サマリー（★raw なし・place 名なし・counts と boolean のみ）。 */
export interface PlaceAffinitySafetyEntry {
  readonly p2Ready: boolean;
  readonly profileCount: number;
  readonly candidateCount: number;
  readonly orderChanged: boolean;
  readonly maxRankShift: number;
  readonly personalAppliedCount: number;
  /** ★安全不変条件違反: maxRankShift が許容超（clamp が効いていれば起きないはず）。 */
  readonly excessiveShift: boolean;
  readonly anyConcern: boolean;
}

export interface PlaceAffinitySafetyConfig {
  /** これを超える maxRankShift は懸念（clamp の bounded 性検証）。 */
  readonly maxAllowedRankShift: number;
}
export const DEFAULT_PLACE_AFFINITY_SAFETY_CONFIG: PlaceAffinitySafetyConfig = {
  maxAllowedRankShift: 2,
};

/** shadow + p2 readiness → 派生サマリー（pure・raw を持たない）。 */
export function summarizePlaceAffinityShadow(
  shadow: ShadowRankingResult,
  p2: PlaceAffinityReadiness,
  config: PlaceAffinitySafetyConfig = DEFAULT_PLACE_AFFINITY_SAFETY_CONFIG,
): PlaceAffinitySafetyEntry {
  const excessiveShift = shadow.maxRankShift > config.maxAllowedRankShift;
  return {
    p2Ready: p2.status === "ready",
    profileCount: p2.profiles.length,
    candidateCount: shadow.combinedOrder.length,
    orderChanged: shadow.orderChanged,
    maxRankShift: shadow.maxRankShift,
    personalAppliedCount: shadow.personalAppliedCount,
    excessiveShift,
    anyConcern: excessiveShift,
  };
}

// ───────────────────────── localStorage（fail-open・capped） ─────────────────────────

function isSafetyEntry(v: unknown): v is PlaceAffinitySafetyEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.p2Ready === "boolean" &&
    typeof e.profileCount === "number" &&
    typeof e.candidateCount === "number" &&
    typeof e.orderChanged === "boolean" &&
    typeof e.maxRankShift === "number" &&
    typeof e.personalAppliedCount === "number" &&
    typeof e.excessiveShift === "boolean" &&
    typeof e.anyConcern === "boolean"
  );
}

function getStorage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** journal を読む（fail-open・derived のみ・raw 排除 parse）。 */
export function loadPlaceAffinitySafetyJournal(): PlaceAffinitySafetyEntry[] {
  const ls = getStorage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(PLACE_AFFINITY_SAFETY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSafetyEntry).slice(-MAX_SAFETY_ENTRIES);
  } catch {
    return [];
  }
}

/** entry を追記（dogfood のみ・呼び側 gate・fail-open・capped）。 */
export function recordPlaceAffinitySafetyEntry(entry: PlaceAffinitySafetyEntry): void {
  const ls = getStorage();
  if (!ls) return;
  try {
    const next = [...loadPlaceAffinitySafetyJournal(), entry].slice(-MAX_SAFETY_ENTRIES);
    ls.setItem(PLACE_AFFINITY_SAFETY_KEY, JSON.stringify(next));
  } catch {
    /* quota 等は fail-open */
  }
}

// ───────────────────────── assessment ─────────────────────────

export type PlaceAffinitySafetyStatus = "insufficient" | "unstable" | "stable_safe";

export interface PlaceAffinitySafetyAssessment {
  readonly status: PlaceAffinitySafetyStatus;
  readonly entryCount: number;
  readonly concernCount: number;
}

export interface PlaceAffinityAssessConfig {
  readonly minEntries: number;
}
export const DEFAULT_PLACE_AFFINITY_ASSESS_CONFIG: PlaceAffinityAssessConfig = { minEntries: 10 };

/** journal を評価（pure）。≥minEntries ∧ 懸念ゼロ で stable_safe。 */
export function assessPlaceAffinitySafety(
  journal: readonly PlaceAffinitySafetyEntry[],
  config: PlaceAffinityAssessConfig = DEFAULT_PLACE_AFFINITY_ASSESS_CONFIG,
): PlaceAffinitySafetyAssessment {
  const entryCount = journal.length;
  const concernCount = journal.filter((e) => e.anyConcern).length;
  let status: PlaceAffinitySafetyStatus;
  if (entryCount < config.minEntries) status = "insufficient";
  else if (concernCount > 0) status = "unstable";
  else status = "stable_safe";
  return { status, entryCount, concernCount };
}

/** ★rollback 条件（ranking flag を OFF に戻すべき兆候）。 */
export const PLACE_AFFINITY_ROLLBACK_CONDITIONS: readonly string[] = [
  "maxRankShift が許容超（excessiveShift）= clamp が効いていない → ranking flag OFF",
  "未訪問の良候補が体感で沈む = nudge 配分を下げる or OFF",
  "reason と上位化が整合しない = signal 整合を見直す",
];
