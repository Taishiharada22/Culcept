/**
 * deriveMomentState — 14 フィールド・境界 15/45 分・夜勤/主観日・Night Check 窓の必須 fixture
 */
import {
  deriveMomentState,
  TIME_PRESSURE_HIGH_MIN,
  TIME_PRESSURE_MEDIUM_MIN,
} from "@/lib/plan/dayState/deriveMomentState";
import type { DaySegmentLite } from "@/lib/plan/dayState/dayStateTypes";

const SEGMENTS: DaySegmentLite[] = [
  { kind: "event", startHHMM: "10:00", endHHMM: "11:00", durationMin: 60, timeBucket: "morning", latencyTolerance: "flexible" },
  { kind: "gap", startHHMM: "11:00", endHHMM: "13:30", durationMin: 150, timeBucket: "noon" },
  { kind: "travel", startHHMM: "13:30", endHHMM: "14:00", durationMin: 30, timeBucket: "noon" },
  { kind: "event", startHHMM: "14:00", endHHMM: "16:00", durationMin: 120, timeBucket: "afternoon", latencyTolerance: "strict" },
  { kind: "gap", startHHMM: "17:00", endHHMM: "20:00", durationMin: 180, timeBucket: "evening" },
  { kind: "gap", startHHMM: "20:30", endHHMM: "23:00", durationMin: 150, timeBucket: "night" },
];

describe("14 フィールドの存在と基本導出", () => {
  it("全フィールドが返る（凍結 14 — 勝手な増減禁止）", () => {
    const m = deriveMomentState({ nowHHMM: "12:00", segments: SEGMENTS });
    expect(Object.keys(m).sort()).toEqual(
      [
        "nowHHMM", "timeBucket", "nowSegment", "nextFixedEventAt", "minutesUntilNextFixedEvent",
        "departureDeadlineHHMM", "minutesUntilDeparture", "eveningSlackRemainingMin", "timePressure",
        "currentMode", "interruptibility", "receptivity", "interventionWindow", "isNightCheckWindow",
      ].sort(),
    );
  });

  it("fixed = strict|tight のみ（flexible な 10:00 は fixed ではない）", () => {
    const m = deriveMomentState({ nowHHMM: "09:00", segments: SEGMENTS });
    expect(m.nextFixedEventAt).toBe("14:00");
    expect(m.minutesUntilNextFixedEvent).toBe(300);
    expect(m.departureDeadlineHHMM).toBe("13:30");
    expect(m.minutesUntilDeparture).toBe(270);
  });

  it("departureDeadline の null 正直性: travel segment なし → null（分数の捏造禁止）", () => {
    const noTravel = SEGMENTS.filter((s) => s.kind !== "travel");
    const m = deriveMomentState({ nowHHMM: "12:00", segments: noTravel });
    expect(m.departureDeadlineHHMM).toBeNull();
    expect(m.minutesUntilDeparture).toBeNull();
    expect(m.minutesUntilNextFixedEvent).toBe(120); // fixed event は見えている
  });
});

describe("timePressure / interventionWindow の 15/45 分境界", () => {
  // 出発 13:30 に対して now を動かす
  it("出発まで 15 分（13:15）→ high / closing", () => {
    const m = deriveMomentState({ nowHHMM: "13:15", segments: SEGMENTS });
    expect(m.minutesUntilDeparture).toBe(TIME_PRESSURE_HIGH_MIN);
    expect(m.timePressure).toBe("high");
    expect(m.interventionWindow).toBe("closing");
  });
  it("出発まで 16 分（13:14）→ medium / narrowing", () => {
    const m = deriveMomentState({ nowHHMM: "13:14", segments: SEGMENTS });
    expect(m.timePressure).toBe("medium");
    expect(m.interventionWindow).toBe("narrowing");
  });
  it("出発まで 45 分（12:45）→ medium / narrowing、46 分（12:44）→ low / open", () => {
    expect(deriveMomentState({ nowHHMM: "12:45", segments: SEGMENTS }).timePressure).toBe("medium");
    expect(deriveMomentState({ nowHHMM: "12:45", segments: SEGMENTS }).minutesUntilDeparture).toBe(
      TIME_PRESSURE_MEDIUM_MIN,
    );
    const m = deriveMomentState({ nowHHMM: "12:44", segments: SEGMENTS });
    expect(m.timePressure).toBe("low");
    expect(m.interventionWindow).toBe("open");
  });
  it("fixed event が無い日 → pressure low / window open", () => {
    const flexOnly = SEGMENTS.map((s) =>
      s.kind === "event" ? { ...s, latencyTolerance: "flexible" as const } : s,
    );
    const m = deriveMomentState({ nowHHMM: "12:00", segments: flexOnly });
    expect(m.timePressure).toBe("low");
    expect(m.interventionWindow).toBe("open");
    expect(m.nextFixedEventAt).toBeNull();
  });
});

describe("currentMode 遷移（open → pre_event → in_event → post_event → evening_recovery）", () => {
  it("12:00 = open（gap 内・出発まで 90 分）", () => {
    const m = deriveMomentState({ nowHHMM: "12:00", segments: SEGMENTS });
    expect(m.currentMode).toBe("open");
    expect(m.nowSegment?.kind).toBe("gap");
  });
  it("13:40 = pre_event（出発期限超過）→ interruptibility low → receptivity silent", () => {
    const m = deriveMomentState({ nowHHMM: "13:40", segments: SEGMENTS });
    expect(m.currentMode).toBe("pre_event");
    expect(m.timePressure).toBe("high"); // 期限超過 = 負値 ≤ 15
    expect(m.interruptibility).toBe("low");
    expect(m.receptivity).toBe("silent");
  });
  it("15:00 = in_event → silent", () => {
    const m = deriveMomentState({ nowHHMM: "15:00", segments: SEGMENTS });
    expect(m.currentMode).toBe("in_event");
    expect(m.interruptibility).toBe("low");
    expect(m.receptivity).toBe("silent");
  });
  it("16:10 = post_event（終了 20 分以内）→ medium / on_open", () => {
    const m = deriveMomentState({ nowHHMM: "16:10", segments: SEGMENTS });
    expect(m.currentMode).toBe("post_event");
    expect(m.interruptibility).toBe("medium");
    expect(m.receptivity).toBe("on_open");
  });
  it("18:00 = evening_recovery（evening gap 内・余白あり）→ high / on_open", () => {
    const m = deriveMomentState({ nowHHMM: "18:00", segments: SEGMENTS });
    expect(m.currentMode).toBe("evening_recovery");
    expect(m.interruptibility).toBe("high");
    expect(m.receptivity).toBe("on_open");
  });
});

describe("eveningSlackRemainingMin（now 以降の残存分）", () => {
  it("18:00 時点 = evening 残り 120 + night 150 = 270", () => {
    expect(deriveMomentState({ nowHHMM: "18:00", segments: SEGMENTS }).eveningSlackRemainingMin).toBe(270);
  });
  it("21:00 時点 = night 残り 120 のみ", () => {
    expect(deriveMomentState({ nowHHMM: "21:00", segments: SEGMENTS }).eveningSlackRemainingMin).toBe(120);
  });
});

describe("Night Check 窓と主観日（夜勤対応）", () => {
  it("16:59 → 窓外 / 17:00 → 窓内（evening 開始境界）", () => {
    expect(deriveMomentState({ nowHHMM: "16:59", segments: SEGMENTS }).isNightCheckWindow).toBe(false);
    expect(deriveMomentState({ nowHHMM: "17:00", segments: SEGMENTS }).isNightCheckWindow).toBe(true);
  });
  it("02:00 → late_night = 窓内（夜勤の当日回答） / 05:00 → early_morning = 窓外", () => {
    const m2 = deriveMomentState({ nowHHMM: "02:00", segments: SEGMENTS });
    expect(m2.timeBucket).toBe("late_night");
    expect(m2.isNightCheckWindow).toBe(true);
    const m5 = deriveMomentState({ nowHHMM: "05:00", segments: SEGMENTS });
    expect(m5.timeBucket).toBe("early_morning");
    expect(m5.isNightCheckWindow).toBe(false);
  });
});

describe("parse 不能な now → unknown（偽の状態を作らない）", () => {
  it("不正時刻は unknown 群を返す", () => {
    const m = deriveMomentState({ nowHHMM: "ab:cd", segments: SEGMENTS });
    expect(m.timePressure).toBe("unknown");
    expect(m.currentMode).toBe("unknown");
    expect(m.receptivity).toBe("unknown");
  });
  it("C-1: timeBucket は placeholder でなく \"unknown\"（旧 late_night 廃止）", () => {
    const m = deriveMomentState({ nowHHMM: "99:99", segments: SEGMENTS });
    expect(m.timeBucket).toBe("unknown");
    expect(m.isNightCheckWindow).toBe(false); // unknown は窓を開かない
  });
  it("C-1: 正常時は実バケットを返す（unknown にならない）", () => {
    expect(deriveMomentState({ nowHHMM: "12:00", segments: SEGMENTS }).timeBucket).toBe("noon");
  });
});
