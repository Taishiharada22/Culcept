/**
 * historyPreviousDayFactory (OP-3B) — pure factory test
 *
 * 検証観点:
 *   1. previousDayPlan null / undefined → 空配列
 *   2. previousDayPlan.journeyEnd が unknown → 空配列
 *   3. previousDayPlan.journeyEnd.source が PREVIOUS_DAY_ORIGIN_SOURCES (= cascade
 *      guard 対象) → null から空配列
 *   4. confirmed end (= 通常 source) → 1 envelope (priority 400 / medium)
 *   5. assumed end (= default_round_trip) → 1 envelope (priority 300 / low)
 *   6. payload.source は previousEndToOrigin で変換後 (= previous_day_endpoint /
 *      previous_day_assumed_endpoint)
 *   7. pure
 */

import { describe, it, expect } from "vitest";
import {
  historyPreviousDayFactory,
  type HistoryPreviousDayInput,
} from "@/lib/alter-morning/comprehension/operationFactories/historyPreviousDayFactory";
import type { MorningPlan } from "@/lib/alter-morning/types";
import type { JourneyAnchorState } from "@/lib/alter-morning/journey/anchorState";

function makePlan(
  journeyEnd: JourneyAnchorState,
  date = "2026-05-04",
): MorningPlan {
  return {
    date,
    items: [],
    dayConditions: {} as MorningPlan["dayConditions"],
    createdAt: "2026-05-04T00:00:00.000Z",
    confirmed: false,
    status: "provisional",
    journeyOrigin: { kind: "unknown", reason: "no_baseline" },
    journeyEnd,
  };
}

const END_USER_EXPLICIT: JourneyAnchorState = {
  kind: "known_exact",
  label: "ホテル",
  lat: 35.5,
  lng: 139.5,
  source: "user_explicit_endpoint",
};

const END_DEFAULT_ROUND_TRIP: JourneyAnchorState = {
  kind: "known_exact",
  label: "自宅",
  lat: 35.6812,
  lng: 139.7671,
  source: "default_round_trip",
};

const END_UNKNOWN: JourneyAnchorState = {
  kind: "unknown",
  reason: "no_endpoint_signal",
};

const END_CASCADE_GUARDED: JourneyAnchorState = {
  // origin 専用 source が journeyEnd に出るのは型レベル不正 (= cascade guard 対象)
  // previousEndToOrigin が null を返す
  kind: "known_exact",
  label: "X",
  lat: 0,
  lng: 0,
  source: "previous_day_endpoint",
};

describe("historyPreviousDayFactory (OP-3B)", () => {
  it("previousDayPlan null → 空配列", () => {
    const result = historyPreviousDayFactory({ previousDayPlan: null });
    expect(result).toEqual([]);
  });

  it("previousDayPlan undefined → 空配列", () => {
    const result = historyPreviousDayFactory({ previousDayPlan: undefined });
    expect(result).toEqual([]);
  });

  it("previousDayPlan.journeyEnd が unknown → 空配列", () => {
    const plan = makePlan(END_UNKNOWN);
    const result = historyPreviousDayFactory({ previousDayPlan: plan });
    expect(result).toEqual([]);
  });

  it("previousDayPlan.journeyEnd.source = previous_day_endpoint (cascade guard) → 空配列", () => {
    const plan = makePlan(END_CASCADE_GUARDED);
    const result = historyPreviousDayFactory({ previousDayPlan: plan });
    expect(result).toEqual([]);
  });

  it("confirmed end (= user_explicit_endpoint) → 1 envelope (priority 400 / medium)", () => {
    const plan = makePlan(END_USER_EXPLICIT);
    const result = historyPreviousDayFactory({ previousDayPlan: plan });
    expect(result).toHaveLength(1);
    const env = result[0];
    expect(env.type).toBe("set_journey_origin");
    expect(env.source).toBe("code_history");
    expect(env.priority).toBe(400);
    expect(env.confidence).toBe("medium");
    // payload.source は previousEndToOrigin で previous_day_endpoint に変換
    if (env.payload.kind === "known_exact") {
      expect(env.payload.source).toBe("previous_day_endpoint");
      expect(env.payload.label).toBe("ホテル");
    }
  });

  it("assumed end (= default_round_trip) → 1 envelope (priority 300 / low)", () => {
    const plan = makePlan(END_DEFAULT_ROUND_TRIP);
    const result = historyPreviousDayFactory({ previousDayPlan: plan });
    expect(result).toHaveLength(1);
    const env = result[0];
    expect(env.priority).toBe(300);
    expect(env.confidence).toBe("low");
    // previous_day_assumed_endpoint に変換
    if (env.payload.kind === "known_exact") {
      expect(env.payload.source).toBe("previous_day_assumed_endpoint");
    }
  });

  it("trace.ruleId = 'historyPreviousDay'", () => {
    const plan = makePlan(END_USER_EXPLICIT);
    const result = historyPreviousDayFactory({ previousDayPlan: plan });
    expect(result[0].trace?.ruleId).toBe("historyPreviousDay");
  });

  it("sourceTurnIndex 反映", () => {
    const plan = makePlan(END_USER_EXPLICIT);
    const result = historyPreviousDayFactory({
      previousDayPlan: plan,
      sourceTurnIndex: 4,
    });
    expect(result[0].trace?.sourceTurnIndex).toBe(4);
  });

  it("provenance.source_type = inferred", () => {
    const plan = makePlan(END_USER_EXPLICIT);
    const result = historyPreviousDayFactory({ previousDayPlan: plan });
    expect(result[0].provenance.source_type).toBe("inferred");
    expect(result[0].provenance.from_utterance).toBe(false);
  });

  it("input mutate しない", () => {
    const plan = makePlan(END_USER_EXPLICIT);
    const input: HistoryPreviousDayInput = { previousDayPlan: plan };
    const snapshot = JSON.stringify(input);
    historyPreviousDayFactory(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
