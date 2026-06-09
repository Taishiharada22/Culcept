import { describe, it, expect } from "vitest";
import {
  energyRhythmReasonForTimeband,
  isEnergyRhythmReasonUiEnabled,
  ENERGY_RHYTHM_REASON_UI_ENABLED,
} from "@/lib/plan/mobility/energyRhythmReasonUi";
import type { MobilityObservation, Timeband } from "@/lib/plan/mobility/mobilityObservationStore";

function obs(timeband: Timeband): MobilityObservation {
  return { mode: "train", timeband, weekday: "weekday", originKey: "home", destKey: "x", privacyClass: "normal" };
}
function many(timeband: Timeband, n: number): MobilityObservation[] {
  return Array.from({ length: n }, () => obs(timeband));
}
// 朝集中（朝8/昼2/夕1/夜1=12）: 朝 high・夕/夜 low・昼 typical
const MORNING_HEAVY = [...many("morning", 8), ...many("afternoon", 2), ...many("evening", 1), ...many("night", 1)];

describe("flag / gate", () => {
  it("★default OFF", () => {
    expect(ENERGY_RHYTHM_REASON_UI_ENABLED).toBe(false);
    expect(isEnergyRhythmReasonUiEnabled()).toBe(false); // flag false ゆえ常に false
  });
});

describe("energyRhythmReasonForTimeband — leg timeband 一致時のみ 1 行", () => {
  it("★leg が朝(high timeband) → 「朝は活動の記録が多い…」", () => {
    expect(energyRhythmReasonForTimeband(MORNING_HEAVY, "morning")).toBe("朝は活動の記録が多い時間帯のようです。");
  });
  it("★leg が夕方(low timeband) → 「…少なめ…」", () => {
    expect(energyRhythmReasonForTimeband(MORNING_HEAVY, "evening")).toBe("夕方は活動の記録が少なめの時間帯のようです。");
  });
  it("★leg が昼(typical) → null（沈黙）", () => {
    expect(energyRhythmReasonForTimeband(MORNING_HEAVY, "afternoon")).toBeNull();
  });
  it("★not_enough（<12）→ null（沈黙）", () => {
    expect(energyRhythmReasonForTimeband(many("morning", 5), "morning")).toBeNull();
  });
  it("★trait（朝型/夜型/型）・数字を含まない", () => {
    const line = energyRhythmReasonForTimeband(MORNING_HEAVY, "morning")!;
    expect(line).not.toMatch(/朝型|夜型|タイプ|性格|型|[0-9]/);
  });
});
