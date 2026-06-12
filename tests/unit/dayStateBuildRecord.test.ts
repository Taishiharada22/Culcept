/**
 * buildDayStateRecord — facts 導出・凍結不変・frozenKind・夜勤・unknown 規律の必須 fixture
 */
import { applyUserCorrection, buildDayStateRecord } from "@/lib/plan/dayState/buildDayStateRecord";
import { isNightShiftSpan, toFrozenKind, toSubjectiveMin } from "@/lib/plan/dayState/timeOfDay";
import type { DayStateBuildInput } from "@/lib/plan/dayState/dayStateTypes";

function input(over: Partial<DayStateBuildInput> = {}): DayStateBuildInput {
  return {
    date: "2026-06-11",
    nowHHMM: "07:00",
    segments: [
      { kind: "event", startHHMM: "10:00", endHHMM: "11:30", durationMin: 90, timeBucket: "morning", latencyTolerance: "flexible" },
      { kind: "travel", startHHMM: "13:30", endHHMM: "14:00", durationMin: 30, timeBucket: "noon" },
      { kind: "event", startHHMM: "14:00", endHHMM: "16:00", durationMin: 120, timeBucket: "afternoon", latencyTolerance: "strict" },
      { kind: "gap", startHHMM: "17:00", endHHMM: "19:00", durationMin: 120, timeBucket: "evening" },
      { kind: "gap", startHHMM: "20:30", endHHMM: "22:00", durationMin: 90, timeBucket: "night" },
    ],
    shift: { kind: "none" },
    weather: null,
    ...over,
  };
}

describe("facts の導出（事実は数値で保持してよい）", () => {
  it("anchorCount / bookedMin / travelChainMin / eveningSlackMin / largestFreeBlockMin", () => {
    const r = buildDayStateRecord(input());
    expect(r.facts.anchorCount).toBe(2);
    expect(r.facts.bookedMin).toBe(210);
    expect(r.facts.travelChainMin).toBe(30);
    expect(r.facts.eveningSlackMin).toBe(210); // evening 120 + night 90
    expect(r.facts.largestFreeBlockMin).toBe(120);
    expect(r.facts.density).toBe("balanced"); // fallback: 2 events
  });

  it("travelChainMin の null 正直性: 未解決移動の日は null（捏造禁止）", () => {
    const r = buildDayStateRecord(input({ hasUnresolvedTravel: true }));
    expect(r.facts.travelChainMin).toBeNull();
  });
});

describe("夜勤判定（主観日跨ぎ含む）", () => {
  it("22:00-06:00 / 21:00-06:00 / 01:00-06:00 → 夜勤", () => {
    expect(isNightShiftSpan("22:00", "06:00")).toBe(true);
    expect(isNightShiftSpan("21:00", "06:00")).toBe(true);
    expect(isNightShiftSpan("01:00", "06:00")).toBe(true);
  });
  it("09:00-17:00 → 夜勤ではない / 時刻欠如・ゼロ長 → null（捏造しない）", () => {
    expect(isNightShiftSpan("09:00", "17:00")).toBe(false);
    expect(isNightShiftSpan(undefined, "17:00")).toBeNull();
    expect(isNightShiftSpan("09:00", "09:00")).toBeNull();
  });
  it("夜勤 work シフト → energyLevel low（inferred 0.5）+ evidence shift_night", () => {
    const r = buildDayStateRecord(input({ shift: { kind: "work", startTime: "22:00", endTime: "06:00" } }));
    expect(r.facts.shift.isNightShift).toBe(true);
    expect(r.estimates.energyLevel).toEqual({ value: "low", confidence: 0.5, source: "inferred" });
    expect(r.evidence).toContain("shift_night");
  });
});

describe("frozenKind と主観日境界（05:00）", () => {
  it("06:00→morning_baseline / 13:00→first_open_snapshot / 18:00・02:00→late_snapshot", () => {
    expect(toFrozenKind("06:00")).toBe("morning_baseline");
    expect(toFrozenKind("10:59")).toBe("morning_baseline");
    expect(toFrozenKind("11:00")).toBe("first_open_snapshot");
    expect(toFrozenKind("13:00")).toBe("first_open_snapshot");
    expect(toFrozenKind("17:00")).toBe("late_snapshot");
    expect(toFrozenKind("02:00")).toBe("late_snapshot");
  });
  it("02:00 は主観日の終盤に属する（前日 date のレコード扱い — 主観分が大きい）", () => {
    expect(toSubjectiveMin("02:00")).toBe(21 * 60); // 05:00 起点で 21 時間後
    expect(toSubjectiveMin("05:00")).toBe(0);
    expect(toSubjectiveMin("04:59")).toBe(1439);
  });
  it("レコードの frozenKind は構築時刻から決まる", () => {
    expect(buildDayStateRecord(input({ nowHHMM: "07:00" })).estimatesFrozen.frozenKind).toBe("morning_baseline");
    expect(buildDayStateRecord(input({ nowHHMM: "13:00" })).estimatesFrozen.frozenKind).toBe("first_open_snapshot");
    expect(buildDayStateRecord(input({ nowHHMM: "02:00" })).estimatesFrozen.frozenKind).toBe("late_snapshot");
  });
});

describe("凍結の不変性（HIGH-2 対応の中核）", () => {
  it("補正後も estimatesFrozen は不変・estimates（現在値）だけが変わる", () => {
    const r0 = buildDayStateRecord(input({ moodCode: "tired" })); // energy low (user_confirmed)
    const frozenBefore = JSON.parse(JSON.stringify(r0.estimatesFrozen));
    const r1 = applyUserCorrection(r0, { at: "12:00", field: "energyLevel", direction: "higher" });
    expect(r1.estimates.energyLevel.value).toBe("medium"); // low → 1 段上げ
    expect(r1.estimates.energyLevel.source).toBe("user_confirmed");
    expect(r1.estimatesFrozen).toEqual(frozenBefore); // 凍結不変
    expect(r1.userInputs.corrections).toHaveLength(1);
    expect(r1.evidence).toContain("user_correction");
  });
  it("unknown への match 補正は中央値の本人確認になる", () => {
    const r0 = buildDayStateRecord(input()); // focusReserve unknown（free block 120 だが…）
    const r1 = applyUserCorrection(r0, { at: "09:00", field: "emotionalReserve", direction: "match" });
    expect(r1.estimates.emotionalReserve.value).toBe("medium");
    expect(r1.estimates.emotionalReserve.source).toBe("user_confirmed");
  });
});

describe("unknown 規律（薄い入力で推定しない）", () => {
  it("outingTolerance: grounded signal 2 未満 → unknown", () => {
    // shift=none, weather=null, walk なし, social なし → travel のみ = 1 signal
    const r = buildDayStateRecord(input({ shift: { kind: "none" }, weather: null }));
    expect(r.estimates.outingTolerance.value).toBe("unknown");
    expect(r.estimates.outingTolerance.confidence).toBe(0);
  });
  it("outingTolerance: 2 signal 以上で導出（雨 + 長い移動 → low）", () => {
    const r = buildDayStateRecord(
      input({
        weather: { condition: "rainy", pop: 80 },
        segments: [
          ...input().segments.filter((s) => s.kind !== "travel"),
          { kind: "travel", startHHMM: "12:00", endHHMM: "14:30", durationMin: 150, timeBucket: "noon" },
        ],
      }),
    );
    expect(r.estimates.outingTolerance.value).toBe("low");
    expect(r.estimates.outingTolerance.source).toBe("derived");
  });
  it("入力ゼロの日: energyLevel / emotionalReserve は unknown（confidence 0）", () => {
    const r = buildDayStateRecord(input());
    expect(r.estimates.energyLevel.value).toBe("unknown");
    expect(r.estimates.emotionalReserve.value).toBe("unknown");
  });
  it("segments ゼロの日: dayFeasibility は unknown", () => {
    const r = buildDayStateRecord(input({ segments: [] }));
    expect(r.estimates.dayFeasibility.value).toBe("unknown");
  });
});

describe("optional input の受領（import しない既存系）", () => {
  it("heartHint は confidence 0.3 上限で emotionalReserve に効く", () => {
    const r = buildDayStateRecord(input({ heartHint: { psychologicalCapacity: 0.8, emotionalLoad: 0.2 } }));
    expect(r.estimates.emotionalReserve.value).toBe("high");
    expect(r.estimates.emotionalReserve.confidence).toBeLessThanOrEqual(0.3);
  });
  it("bodyEcho.chest（本人入力）は heartHint より優先", () => {
    const r = buildDayStateRecord(
      input({ bodyEchoChest: "tight", heartHint: { psychologicalCapacity: 0.9, emotionalLoad: 0.1 } }),
    );
    expect(r.estimates.emotionalReserve).toEqual({ value: "low", confidence: 0.85, source: "user_confirmed" });
  });
  it("interpersonalLoadHint=high → emotionalReserve low（inferred 0.3 上限・§3.3 ③）", () => {
    const r = buildDayStateRecord(input({ interpersonalLoadHint: "high" }));
    expect(r.estimates.emotionalReserve).toEqual({ value: "low", confidence: 0.3, source: "inferred" });
  });
  it("personaCoefficients は受領のみ・estimates へ未適用（Stage D まで）", () => {
    const base = buildDayStateRecord(input());
    const withPersona = buildDayStateRecord(
      input({ personaCoefficients: { socialEventDrain: "high", driftSensitivity: "high", confidenceDamping: true } }),
    );
    expect(withPersona.estimates).toEqual(base.estimates); // 影響ゼロ
  });
});

describe("dailyModeHint 供給契約（C-2: 固定 0.5 廃止）", () => {
  it("dailyModeHintConfidence を反映する", () => {
    const r = buildDayStateRecord(input({ dailyModeHint: "advance", dailyModeHintConfidence: 0.85 }));
    expect(r.estimates.dailyMode).toEqual({ value: "advance", confidence: 0.85, source: "derived" });
  });
  it("hint ありで confidence 未指定 → 暫定 0.5", () => {
    const r = buildDayStateRecord(input({ dailyModeHint: "social" }));
    expect(r.estimates.dailyMode).toEqual({ value: "social", confidence: 0.5, source: "derived" });
  });
  it("不正な confidence は 0-1 に clamp", () => {
    expect(buildDayStateRecord(input({ dailyModeHint: "recover", dailyModeHintConfidence: 1.7 })).estimates.dailyMode.confidence).toBe(1);
    expect(buildDayStateRecord(input({ dailyModeHint: "recover", dailyModeHintConfidence: -0.3 })).estimates.dailyMode.confidence).toBe(0);
  });
  it("hint なし → 保守的 fallback（confidence 引数の影響なし）", () => {
    const r = buildDayStateRecord(input({ dailyModeHintConfidence: 0.9 }));
    expect(r.estimates.dailyMode.source).toBe("inferred");
    expect(r.estimates.dailyMode.confidence).toBeLessThanOrEqual(0.3);
  });
});
