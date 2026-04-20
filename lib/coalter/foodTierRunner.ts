/**
 * CoAlter F-6 — Food Tier Runner (2026-04-20)
 *
 * 位置づけ:
 *   foodOrchestrator Layer 2 の中で、単発 `rankFood` の代わりに
 *   Tier 0 → 1a → 1b → 2 を **順次試行**する retry loop。
 *
 * 契約（CEO lock 2026-04-20 F-6）:
 *   1. Tier 入力は **query 主体 + brief fallback**
 *        area:  query.area → brief.area
 *        time:  query.requestedTimeSlots / targetLocalTime
 *               → brief.approximateTime.preferredStartHour → timeSlot (coarse)
 *   2. 成功閾値は `ranked.length >= 1`
 *        （"豊富" 閾値 3 は diagnostics / narration 用。件数より精度優先）
 *   3. Tier 結果は **混ぜない**。最初に成功した Tier の ranked をそのまま採用。
 *      Tier 間の union / merge は一切行わない。
 *
 * 非スコープ:
 *   - re-search（Tier ごとに webConnector を叩き直さない。catalog は Tier 0 取得分を使い回す）
 *   - bookingResolver の予約 API / 営業時間 API filter（未配線）
 *   - daily / travel orchestrator
 *   - density / lighting の ranker 負債
 *
 * Skip 条件（tier loop を走らせない）:
 *   - area / primary time のいずれかが null → null を返す（caller は plain rankFood にフォールバック）
 *
 * 純関数。I/O 禁止。LLM 禁止。
 */

import type {
  ActivityCandidate,
  CoAlterPersonProfile,
  ConversationBrief,
  FoodQuery,
  FoodRankOutput,
  FoodVenue,
  RequestedTimeSlot,
} from "./types";
import { rankFood } from "./foodRanker";
import {
  buildFoodTierPlans,
  type FoodTier,
  type FoodTierPlan,
  type TimeWindowRange,
} from "./foodTierExpander";

// ═══════════════════════════════════════════════════════════════════════════
// Public types
// ═══════════════════════════════════════════════════════════════════════════

export interface RunTieredRankingInput {
  brief: ConversationBrief;
  /** F-5 で復活した結晶化 query。供給時は area / opening hours が query 優先で評価される */
  query?: FoodQuery;
  catalog: ActivityCandidate<FoodVenue>[];
  avoidKeys: string[];
  profileA: CoAlterPersonProfile;
  profileB: CoAlterPersonProfile;
}

export interface FoodTierAttempt {
  tier: FoodTier;
  areas: string[];
  timeSlots: TimeWindowRange[];
  rankedCount: number;
  thinReason?: FoodTierPlan["thinReason"];
}

export interface RunTieredRankingOutput extends FoodRankOutput {
  /** 最終的に採用した tier。全 tier が 0 件のときは "T2" */
  appliedTier: FoodTier;
  /** 各 tier の試行結果（diagnostics / narration 用） */
  tierAttempts: FoodTierAttempt[];
  /** T2 で採用したときの「薄い」理由（それ以外は undefined） */
  tierThinReason?: FoodTierPlan["thinReason"];
}

/**
 * 成功閾値（CEO 指示）: ranked が 1 件でも取れていれば Tier を広げない。
 * 件数より精度を優先するための単一ソース。
 */
export const FOOD_TIER_SUCCESS_THRESHOLD = 1;

/**
 * "豊富" 閾値（diagnostics / narration 用）。
 * ここでは tier escalation には使わない — あくまで下流の観測用。
 */
export const FOOD_TIER_ABUNDANT_THRESHOLD = 3;

// ═══════════════════════════════════════════════════════════════════════════
// Input derivation (query > brief)
// ═══════════════════════════════════════════════════════════════════════════

function deriveArea(
  brief: ConversationBrief,
  query: FoodQuery | undefined,
): string | null {
  const q = query?.area?.trim();
  if (q) return q;
  const b = brief.area?.trim();
  return b ? b : null;
}

/**
 * Tier 生成用の primary time を決める（query > brief）。
 *
 *   1) query.requestedTimeSlots[0] — 最優先（F-5 で復活した explicit range）
 *   2) brief.approximateTime.preferredStartHour — explicit hour → [h, h+1]
 *   3) brief.approximateTime.timeSlot — coarse enum → 粗い window
 *   4) 何も無ければ null → tier loop skip
 */
function derivePrimaryTimeSlot(
  brief: ConversationBrief,
  query: FoodQuery | undefined,
): TimeWindowRange | null {
  if (query && query.requestedTimeSlots.length > 0) {
    const s = query.requestedTimeSlots[0];
    const start = clampHour(s.startHour);
    const end = clampEndHour(s.endHour);
    if (start >= end) return null;
    return { startHour: start, endHour: end, dayOffset: 0 };
  }
  const h = brief.approximateTime.preferredStartHour;
  if (typeof h === "number" && Number.isFinite(h)) {
    const start = clampHour(h);
    const end = Math.min(24, start + 1);
    return { startHour: start, endHour: end, dayOffset: 0 };
  }
  const slot = brief.approximateTime.timeSlot;
  if (slot) {
    const win = coarseTimeSlotHours(slot);
    return { startHour: win.start, endHour: win.end, dayOffset: 0 };
  }
  return null;
}

function clampHour(h: number): number {
  if (!Number.isFinite(h)) return 0;
  return Math.max(0, Math.min(23, Math.trunc(h)));
}

function clampEndHour(h: number): number {
  if (!Number.isFinite(h)) return 0;
  return Math.max(0, Math.min(24, Math.trunc(h)));
}

function coarseTimeSlotHours(
  slot: "morning" | "afternoon" | "evening" | "night",
): { start: number; end: number } {
  switch (slot) {
    case "morning":
      return { start: 7, end: 10 };
    case "afternoon":
      return { start: 12, end: 14 };
    case "evening":
      return { start: 18, end: 20 };
    case "night":
      return { start: 20, end: 23 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Per-tier ranking
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 1 tier 内での rank 実行。
 *
 *   - plan.areas を順に試す（AREA_ADJACENCY は重要度順）。最初に ranked >= 1 を
 *     得た area の結果を採用し、以降の area は試さない（**tier 内でも union しない**）。
 *   - どの area でも 0 件 → 最後に試した area の結果（0 件）を返す。
 *   - query の area / requestedTimeSlots を tier 値で override し、rankFood に渡す。
 *     opening hours の判定はその query.requestedTimeSlots を消費（F-6 explicit-hour 昇格）。
 */
function rankWithinTier(args: {
  plan: FoodTierPlan;
  brief: ConversationBrief;
  query?: FoodQuery;
  catalog: ActivityCandidate<FoodVenue>[];
  avoidKeys: string[];
  profileA: CoAlterPersonProfile;
  profileB: CoAlterPersonProfile;
}): FoodRankOutput {
  const { plan, brief, query, catalog, avoidKeys, profileA, profileB } = args;
  const tierSlots: RequestedTimeSlot[] = plan.timeSlots.map((tw) => ({
    localDate: null,
    startHour: tw.startHour,
    endHour: tw.endHour,
    confidence: "approximate" as const,
  }));

  let lastResult: FoodRankOutput | null = null;
  for (const area of plan.areas) {
    const overrideBrief: ConversationBrief = { ...brief, area };
    const overrideQuery: FoodQuery = query
      ? { ...query, area, requestedTimeSlots: tierSlots }
      : synthesizeMinimalQuery(area, tierSlots);

    const result = rankFood({
      brief: overrideBrief,
      catalog,
      avoidKeys,
      profileA,
      profileB,
      query: overrideQuery,
    });
    if (result.ranked.length >= FOOD_TIER_SUCCESS_THRESHOLD) {
      return result;
    }
    lastResult = result;
  }

  // plan.areas は builder が最低 1 件保証するので lastResult は必ず非 null
  return lastResult as FoodRankOutput;
}

function synthesizeMinimalQuery(
  area: string,
  tierSlots: RequestedTimeSlot[],
): FoodQuery {
  return {
    cuisines: [],
    excludeCuisines: [],
    priceBand: null,
    area,
    timeWindow: null,
    requestedTimeSlots: tierSlots,
    targetLocalTime: null,
    occasion: null,
    atmosphere: { quietness: "either", density: "either", lighting: "either" },
    moodTags: [],
    reservationUrgency: "flexible",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tier 0 → 1a → 1b → 2 を順次試行。**最初に ranked >= 1 を得た tier を採用**。
 * 全 tier が 0 件なら T2 の結果（0 件）と thinReason を返す。
 *
 * area / time が derive 不能な場合は null を返す（caller は plain rankFood に fallback）。
 *
 * brief / query は mutate しない（shallow override のみ）。純関数。
 */
export function runTieredRanking(
  input: RunTieredRankingInput,
): RunTieredRankingOutput | null {
  const area = deriveArea(input.brief, input.query);
  const primarySlot = derivePrimaryTimeSlot(input.brief, input.query);
  if (!area || !primarySlot) return null;

  const plans = buildFoodTierPlans({ area, timeSlot: primarySlot });
  const attempts: FoodTierAttempt[] = [];

  let lastResult: FoodRankOutput | null = null;
  let lastPlan: FoodTierPlan | null = null;

  for (const plan of plans) {
    const result = rankWithinTier({
      plan,
      brief: input.brief,
      query: input.query,
      catalog: input.catalog,
      avoidKeys: input.avoidKeys,
      profileA: input.profileA,
      profileB: input.profileB,
    });
    attempts.push({
      tier: plan.tier,
      areas: plan.areas,
      timeSlots: plan.timeSlots,
      rankedCount: result.ranked.length,
      thinReason: plan.thinReason,
    });
    if (result.ranked.length >= FOOD_TIER_SUCCESS_THRESHOLD) {
      return {
        ...result,
        appliedTier: plan.tier,
        tierAttempts: attempts,
        tierThinReason: plan.thinReason,
      };
    }
    lastResult = result;
    lastPlan = plan;
  }

  // 全 tier 0 件: 最後（T2）の結果を採用 + thinReason を返す
  const finalPlan = lastPlan as FoodTierPlan;
  const finalResult = lastResult as FoodRankOutput;
  return {
    ...finalResult,
    appliedTier: finalPlan.tier,
    tierAttempts: attempts,
    tierThinReason: finalPlan.thinReason ?? "both_thin",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Test-only exports
// ═══════════════════════════════════════════════════════════════════════════

export const __internal = {
  deriveArea,
  derivePrimaryTimeSlot,
  rankWithinTier,
  synthesizeMinimalQuery,
  coarseTimeSlotHours,
  clampHour,
  clampEndHour,
};
