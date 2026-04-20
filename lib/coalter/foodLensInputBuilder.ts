/**
 * CoAlter F-5 — FoodLensInput Builder
 *
 * 位置づけ:
 *   Stage 1 Understand の出力 (`TwoPersonLensToday` / `FoodLensToday`) と
 *   Layer 0 brief (`ConversationBrief`) を合流させて、
 *   `foodQueryBuilder` が要求する `FoodQueryBuilderInput` を組み立てる薄い adapter。
 *
 * 契約:
 *   - **logic のみ**。純関数。LLM・I/O 禁止。
 *   - brief > lens の優先順位を固定する（CEO lock 2026-04-20 F-5 条件 2）:
 *       時間軸 (requestedTimeSlots / targetLocalTime / timeWindow) は
 *       brief 由来が存在する限り lens 由来で **上書きしない**。
 *       lens はあくまで brief の欠損を埋めるだけ。
 *   - occasion / atmosphere / moodTags は brief に相当情報がないため lens 由来。
 *   - F-5 scope: output 復活まで。`requestedTimeSlots / targetLocalTime / occasion`
 *     を populate して FoodQuery に乗せるが、foodTierExpander 側での consumption は
 *     F-6 以降。
 *
 * 優先表（CEO lock）:
 *   requestedTimeSlots
 *     (a) brief.approximateTime.preferredStartHour (explicit hour) — 最優先
 *     (b) brief.approximateTime.timeSlot (coarse enum) — brief 内の粗指定
 *     (c) foodLensToday.foodContext.timeWindow (lens) — fallback only
 *   targetLocalTime
 *     brief.approximateTime.preferredStartHour が存在するときのみ "HH:00" を返す
 *     （lens からは生成しない — 時刻の権威は brief）
 *   timeWindow（FoodQuery.timeWindow 列挙）
 *     (a) brief.approximateTime.timeSlot を mapping — 最優先
 *     (b) foodLensToday.foodContext.timeWindow — fallback
 *   occasion / atmosphere / moodTags
 *     foodLensToday のみ（brief 側には観測が無いため衝突しない）
 */

import type { FoodQueryBuilderInput } from "./foodQueryBuilder";
import type { ConversationBrief, FoodOccasion, FoodQuery, RequestedTimeSlot } from "./types";
import type { FoodLensToday } from "./understanding/foodLensAdapter";
import type { TodayMode } from "./understanding/types";

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

export interface BuildFoodLensInputParams {
  brief: ConversationBrief;
  /** Stage 1 Understand が失敗したときは undefined。brief-only 経路に落ちる。 */
  foodLensToday?: FoodLensToday;
}

/**
 * brief + foodLensToday → FoodQueryBuilderInput（純関数）。
 *
 * 戻り値は buildFoodQuery にそのまま渡せる形。時刻の優先順位は brief > lens。
 */
export function buildFoodLensInput(
  params: BuildFoodLensInputParams,
): FoodQueryBuilderInput {
  const { brief, foodLensToday } = params;

  const timeFromBrief = deriveTimeFromBrief(brief);
  const timeFromLens = foodLensToday
    ? deriveTimeFromLens(foodLensToday)
    : null;

  // brief > lens: brief 側に 1 件でも RequestedTimeSlot があれば lens は使わない
  const requestedTimeSlots: RequestedTimeSlot[] =
    timeFromBrief.slots.length > 0
      ? timeFromBrief.slots
      : timeFromLens?.slots ?? [];

  const targetLocalTime = timeFromBrief.targetLocalTime;

  const timeWindow: FoodQuery["timeWindow"] =
    timeFromBrief.timeWindow ?? timeFromLens?.timeWindow ?? null;

  const exactTimeSource =
    timeFromBrief.slots.length > 0
      ? "brief.approximateTime"
      : timeFromLens?.slots && timeFromLens.slots.length > 0
        ? "foodContext.timeWindow"
        : undefined;

  const occasion = foodLensToday ? deriveOccasion(foodLensToday) : null;

  return {
    area: brief.area ?? null,
    areaSource: brief.area ? "brief.area" : undefined,

    cuisineHints: [],
    excludeCuisines: [],

    priceBand: null,

    requestedTimeSlots,
    targetLocalTime,
    timeWindow,
    exactTimeSource,

    occasion,
    occasionSource: occasion ? "todayReading.mode" : undefined,

    atmosphere:
      foodLensToday?.foodContext.atmosphereDesire ?? {
        quietness: "either",
        density: "either",
        lighting: "either",
      },
    moodTags: foodLensToday?.foodContext.moodTags ?? [],
    moodAtmosphereSource: foodLensToday ? "foodContext" : undefined,

    reservationUrgency: "flexible",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Brief-side derivations (priority)
// ═══════════════════════════════════════════════════════════════════════════

interface DerivedTime {
  slots: RequestedTimeSlot[];
  targetLocalTime: string | null;
  timeWindow: FoodQuery["timeWindow"] | null;
}

/**
 * brief.approximateTime から時刻情報を取り出す。
 *
 * - preferredStartHour があれば 1 時間幅 `[h, h+1]` を 1 件だけ返す（confidence=explicit）
 * - 無いが timeSlot がある場合は粗い帯を返す（confidence=approximate）
 * - date は `localDate` に反映、targetLocalTime は explicit hour 時のみ "HH:00"
 */
function deriveTimeFromBrief(brief: ConversationBrief): DerivedTime {
  const approx = brief.approximateTime;
  const date = normalizeDate(approx.date);

  if (typeof approx.preferredStartHour === "number") {
    const h = clampHour(approx.preferredStartHour);
    const endH = Math.min(24, h + 1);
    const hh = String(h).padStart(2, "0");
    const slot: RequestedTimeSlot = {
      localDate: date,
      startHour: h,
      endHour: endH,
      confidence: "explicit",
    };
    return {
      slots: [slot],
      targetLocalTime: `${hh}:00`,
      timeWindow: mapBriefTimeSlotToFoodWindow(approx.timeSlot),
    };
  }

  if (approx.timeSlot !== null) {
    const range = briefTimeSlotHours(approx.timeSlot);
    const slot: RequestedTimeSlot = {
      localDate: date,
      startHour: range.start,
      endHour: range.end,
      confidence: "approximate",
    };
    return {
      slots: [slot],
      targetLocalTime: null,
      timeWindow: mapBriefTimeSlotToFoodWindow(approx.timeSlot),
    };
  }

  return { slots: [], targetLocalTime: null, timeWindow: null };
}

function briefTimeSlotHours(
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

function mapBriefTimeSlotToFoodWindow(
  slot: "morning" | "afternoon" | "evening" | "night" | null,
): FoodQuery["timeWindow"] | null {
  if (slot === null) return null;
  switch (slot) {
    case "morning":
      return "breakfast";
    case "afternoon":
      return "lunch";
    case "evening":
      return "dinner";
    case "night":
      return "late_night";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Lens-side fallbacks
// ═══════════════════════════════════════════════════════════════════════════

/**
 * foodLensToday.foodContext.timeWindow から粗い時間帯を生成（fallback only）。
 * brief 側に何も無いときだけ使われる。
 */
function deriveTimeFromLens(today: FoodLensToday): DerivedTime {
  const win = today.foodContext.timeWindow;
  const range = lensTimeWindowHours(win);
  const slot: RequestedTimeSlot = {
    localDate: null,
    startHour: range.start,
    endHour: range.end,
    confidence: "inferred",
  };
  return {
    slots: [slot],
    targetLocalTime: null,
    timeWindow: win,
  };
}

function lensTimeWindowHours(
  win: FoodLensToday["foodContext"]["timeWindow"],
): { start: number; end: number } {
  switch (win) {
    case "breakfast":
      return { start: 7, end: 9 };
    case "lunch":
      return { start: 12, end: 13 };
    case "late_lunch":
      return { start: 14, end: 15 };
    case "tea":
      return { start: 15, end: 17 };
    case "dinner":
      return { start: 19, end: 20 };
    case "late_night":
      return { start: 22, end: 24 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Occasion
// ═══════════════════════════════════════════════════════════════════════════

const MODE_TO_OCCASION_LABEL: Record<TodayMode, string> = {
  recover: "疲労回復の夜",
  celebrate: "お祝い",
  connect: "近づく時間",
  challenge: "刺激のある時間",
  maintain: "日常",
};

function deriveOccasion(today: FoodLensToday): FoodOccasion | null {
  const mode = today.lens.todayReading.mode;
  const label = MODE_TO_OCCASION_LABEL[mode];
  if (!label) return null;
  return {
    label,
    confidence: "inferred",
    source: "s1_derivation",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function normalizeDate(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // YYYY-MM-DD のみ `localDate` として採用。それ以外の「今週末」等は null にする。
  // foodQueryBuilder の localDate は ISO 形式期待のため。
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function clampHour(h: number): number {
  if (!Number.isFinite(h)) return 0;
  if (h < 0) return 0;
  if (h > 23) return 23;
  return Math.trunc(h);
}

// ═══════════════════════════════════════════════════════════════════════════
// Test-only exports
// ═══════════════════════════════════════════════════════════════════════════

export const __internal = {
  deriveTimeFromBrief,
  deriveTimeFromLens,
  deriveOccasion,
  mapBriefTimeSlotToFoodWindow,
  briefTimeSlotHours,
  lensTimeWindowHours,
  normalizeDate,
  clampHour,
  MODE_TO_OCCASION_LABEL,
};
