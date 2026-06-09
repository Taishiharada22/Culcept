import { describe, it, expect } from "vitest";
import {
  movementToleranceReasonForContext,
  isMovementToleranceReasonUiEnabled,
  MOVEMENT_TOLERANCE_REASON_UI_ENABLED,
  MOVEMENT_TOLERANCE_CORROBORATION_UI_LINE,
} from "@/lib/plan/mobility/movementToleranceReasonUi";
import {
  type MobilityObservation,
  type Timeband,
  type WeekdayBucket,
} from "@/lib/plan/mobility/mobilityObservationStore";
import {
  HYPOTHESIS_FEEDBACK_SCHEMA_VERSION,
  type HypothesisFeedbackStore,
  type HypothesisFeedbackEntry,
  type MobilityReason,
} from "@/lib/plan/mobility/hypothesisFeedbackStore";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";
import type { WeatherKind } from "@/lib/plan/context/contextModifier";

function obs(mode: RouteTransportMode, over: { weatherKind?: WeatherKind; timeband?: Timeband; weekday?: WeekdayBucket } = {}): MobilityObservation {
  return {
    mode,
    timeband: over.timeband ?? "morning",
    weekday: over.weekday ?? "weekday",
    originKey: "home",
    destKey: "x",
    privacyClass: "normal",
    ...(over.weatherKind !== undefined ? { weatherKind: over.weatherKind } : {}),
  };
}
function many(mode: RouteTransportMode, over: Parameters<typeof obs>[1], n: number): MobilityObservation[] {
  return Array.from({ length: n }, () => obs(mode, over));
}
const EMPTY_FEEDBACK: HypothesisFeedbackStore = { version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION, byDay: {} };
function feedbackOf(reasons: MobilityReason[]): HypothesisFeedbackStore {
  const byDay: Record<string, Record<string, HypothesisFeedbackEntry>> = {};
  reasons.forEach((r, i) => {
    byDay[`2026-06-${String((i % 27) + 1).padStart(2, "0")}`] = {
      [`leg-${i}`]: { kind: "explicitCorrection", surfacedMode: "walk", chosenMode: "train", reason: r },
    };
  });
  return { version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION, byDay };
}
// 雨で train(low-load) に偏る観測（非雨 8 walk / 雨 4 train）→ weather:rain signal。
const RAIN_SKEW = [...many("walk", {}, 8), ...many("train", { weatherKind: "rain" }, 4)];

describe("flag / gate", () => {
  it("★default OFF", () => {
    expect(MOVEMENT_TOLERANCE_REASON_UI_ENABLED).toBe(false);
    expect(isMovementToleranceReasonUiEnabled()).toBe(false); // flag false ゆえ常に false
  });
});

describe("movementToleranceReasonForContext — 1 行・条件優先・融合しない", () => {
  it("★今日が雨で雨 signal あり → conditional 行（条件一致）", () => {
    const line = movementToleranceReasonForContext(RAIN_SKEW, EMPTY_FEEDBACK, { weather: "rain" });
    expect(line).toContain("雨の日");
    expect(line).toContain("移動負荷の少ない手段を選びやすい");
  });

  it("★weather と timeband 両方一致しうる時 weather 優先（1 行のみ）", () => {
    // 雨 signal + 夜 signal 両方立つ観測。weather=rain & timeband=night context → weather 行。
    const obsBoth = [
      ...many("walk", {}, 8),
      ...many("train", { weatherKind: "rain" }, 4),
      ...many("train", { timeband: "night" }, 4),
    ];
    const line = movementToleranceReasonForContext(obsBoth, EMPTY_FEEDBACK, { weather: "rain", timeband: "night" });
    expect(line).toContain("雨の日"); // weather 優先
    expect(line).not.toContain("夜");
  });

  it("★今日の条件に一致する signal が無い → conditional は出さない（corroboration なければ null=沈黙）", () => {
    // 雨 signal のみ。今日は晴れ（normal）→ 一致なし・feedback 空 → null。
    const line = movementToleranceReasonForContext(RAIN_SKEW, EMPTY_FEEDBACK, { weather: "normal", timeband: "morning" });
    expect(line).toBeNull();
  });

  it("★条件一致なし + corroboration 立つ → corroboration 行（fallback・条件語なし）", () => {
    const line = movementToleranceReasonForContext(
      RAIN_SKEW,
      feedbackOf(["tired", "tired", "tired", "scenery", "cheap"]),
      { weather: "normal" }, // 条件一致なし
    );
    expect(line).toBe(MOVEMENT_TOLERANCE_CORROBORATION_UI_LINE);
    expect(line).not.toMatch(/雨|夜|平日|週末/); // ★条件に言及しない
  });

  it("★条件一致 conditional が corroboration より優先（融合せず conditional 1 行）", () => {
    const line = movementToleranceReasonForContext(
      RAIN_SKEW,
      feedbackOf(["tired", "tired", "tired", "scenery", "cheap"]),
      { weather: "rain" }, // 条件一致あり
    );
    expect(line).toContain("雨の日");
    expect(line).not.toContain("自己申告"); // corroboration と混ぜない
  });

  it("★観測 sparse(not_enough) + feedback 空 → null（沈黙）", () => {
    expect(movementToleranceReasonForContext(many("walk", {}, 3), EMPTY_FEEDBACK, { weather: "rain" })).toBeNull();
  });

  it("★出力 1 行に raw 数字 / trait 語を含まない", () => {
    const a = movementToleranceReasonForContext(RAIN_SKEW, EMPTY_FEEDBACK, { weather: "rain" })!;
    const b = MOVEMENT_TOLERANCE_CORROBORATION_UI_LINE;
    for (const line of [a, b]) {
      expect(line).not.toMatch(/[0-9]/);
      expect(line).not.toMatch(/苦手|嫌い|タイプ|性格/);
    }
  });
});
