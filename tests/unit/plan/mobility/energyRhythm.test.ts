import { describe, it, expect } from "vitest";
import {
  buildEnergyRhythm,
  energyRhythmReasonLine,
  DEFAULT_ENERGY_RHYTHM_CONFIG,
  type TimebandRhythmSignal,
} from "@/lib/plan/mobility/energyRhythm";
import type { MobilityObservation, Timeband } from "@/lib/plan/mobility/mobilityObservationStore";

function obs(timeband: Timeband, redacted = false): MobilityObservation {
  return {
    mode: "train",
    timeband,
    weekday: "weekday",
    originKey: redacted ? null : "home",
    destKey: redacted ? null : "x",
    privacyClass: redacted ? "redacted" : "normal",
  };
}
function many(timeband: Timeband, n: number, redacted = false): MobilityObservation[] {
  return Array.from({ length: n }, () => obs(timeband, redacted));
}
// 朝集中（朝8/昼2/夕1/夜1=12）: 朝 0.67→high・夕/夜 0.083→low・昼 0.167→typical
const MORNING_HEAVY = [...many("morning", 8), ...many("afternoon", 2), ...many("evening", 1), ...many("night", 1)];

describe("buildEnergyRhythm — timeband presence・本人均等baseline比", () => {
  it("★全体 < minTotal(12) → not_enough", () => {
    expect(buildEnergyRhythm(many("morning", 11)).status).toBe("not_enough");
  });

  it("★朝集中 → 朝 high・夕/夜 low・昼 typical(沈黙)", () => {
    const r = buildEnergyRhythm(MORNING_HEAVY);
    expect(r.status).toBe("ready");
    expect(r.totalObserved).toBe(12);
    const morning = r.signals.find((s) => s.timeband === "morning");
    expect(morning?.level).toBe("high");
    expect(morning?.count).toBe(8);
    expect(r.signals.find((s) => s.timeband === "evening")?.level).toBe("low");
    expect(r.signals.find((s) => s.timeband === "night")?.level).toBe("low");
    expect(r.signals.find((s) => s.timeband === "afternoon")).toBeUndefined(); // typical=沈黙
  });

  it("★均等分布(各3) → signal なし（集中していない）", () => {
    const even = [...many("morning", 3), ...many("afternoon", 3), ...many("evening", 3), ...many("night", 3)];
    expect(buildEnergyRhythm(even).signals).toHaveLength(0);
  });

  it("★redacted 観測でも timeband は使う（OD は不扱い・presence に算入）", () => {
    const r = buildEnergyRhythm([...many("morning", 8, true), ...many("afternoon", 2, true), ...many("evening", 1, true), ...many("night", 1, true)]);
    expect(r.status).toBe("ready");
    expect(r.signals.find((s) => s.timeband === "morning")?.level).toBe("high");
  });

  it("config 既定（minTotal12/highSkew0.15/lowSkew0.15）", () => {
    expect(DEFAULT_ENERGY_RHYTHM_CONFIG).toEqual({ minTotalForReady: 12, highSkew: 0.15, lowSkew: 0.15 });
  });
});

describe("energyRhythmReasonLine — 観測トーン・trait でない", () => {
  const sig = (timeband: Timeband, level: "high" | "low"): TimebandRhythmSignal => ({ timeband, level, count: level === "high" ? 8 : 1 });
  it("★high → 「{時間帯}は活動の記録が多い時間帯のようです」", () => {
    expect(energyRhythmReasonLine(sig("morning", "high"))).toBe("朝は活動の記録が多い時間帯のようです。");
  });
  it("★low → 「…少なめの時間帯のようです」", () => {
    expect(energyRhythmReasonLine(sig("evening", "low"))).toBe("夕方は活動の記録が少なめの時間帯のようです。");
  });
  it("★人格語（朝型/夜型/タイプ/性格）・数字・「型」を含まない", () => {
    for (const tb of ["morning", "afternoon", "evening", "night"] as Timeband[]) {
      for (const lv of ["high", "low"] as const) {
        const line = energyRhythmReasonLine(sig(tb, lv))!;
        expect(line).not.toMatch(/朝型|夜型|タイプ|性格|型|[0-9]/);
      }
    }
  });
});
