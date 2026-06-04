import { describe, expect, it } from "vitest";

import {
  parseStartTimeToMinutes,
  resolveFocusLegIndex,
  resolveLegState,
} from "@/lib/plan/map/legState";

const pin = (startTime: string) => ({ anchor: { startTime } });

describe("parseStartTimeToMinutes", () => {
  it("HH:MM → 分", () => {
    expect(parseStartTimeToMinutes("09:00")).toBe(540);
    expect(parseStartTimeToMinutes("9:05")).toBe(545);
    expect(parseStartTimeToMinutes("23:59")).toBe(1439);
    expect(parseStartTimeToMinutes("12:00:30")).toBe(720);
  });
  it("不正は null", () => {
    expect(parseStartTimeToMinutes("")).toBeNull();
    expect(parseStartTimeToMinutes("foo")).toBeNull();
  });
});

describe("resolveFocusLegIndex (= 次に動く leg・FH 忠実)", () => {
  const pins = [pin("09:00"), pin("12:00"), pin("14:00")]; // leg0(9→12), leg1(12→14)
  it("開始前(全 pin 未来) → 最初の leg 0", () => {
    expect(resolveFocusLegIndex(pins, 8 * 60)).toBe(0);
  });
  it("9:00 着後・12:00 前 → 次は 12:00 着 = leg 0", () => {
    expect(resolveFocusLegIndex(pins, 10 * 60)).toBe(0);
  });
  it("12:00 着後・14:00 前 → 次は 14:00 着 = leg 1", () => {
    expect(resolveFocusLegIndex(pins, 13 * 60)).toBe(1);
  });
  it("全て過去 → 最終 leg(len-2)", () => {
    expect(resolveFocusLegIndex(pins, 15 * 60)).toBe(1);
  });
  it("pin < 2 → -1 (focus なし)", () => {
    expect(resolveFocusLegIndex([pin("09:00")], 600)).toBe(-1);
    expect(resolveFocusLegIndex([], 600)).toBe(-1);
  });
});

describe("resolveLegState (= focus 中心の階層・FH 忠実)", () => {
  it("focus<0 → 全 ahead", () => expect(resolveLegState(0, -1)).toBe("ahead"));
  it("focus と同じ → current", () => expect(resolveLegState(2, 2)).toBe("current"));
  it("focus の1個前 → previous", () => expect(resolveLegState(1, 2)).toBe("previous"));
  it("focus の2個以上前 → done(過去=実績)", () => {
    expect(resolveLegState(0, 2)).toBe("done");
    expect(resolveLegState(1, 4)).toBe("done");
  });
  it("focus より後 → ahead", () => expect(resolveLegState(3, 2)).toBe("ahead"));
});
