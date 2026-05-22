/**
 * Phase 3-K K-1b — StartNode / EndNode + timeFormat tests
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §5 / §22.1 / §22.7
 *
 * 検証範囲:
 *   - parseHHMMtoMinutes strict 仕様
 *   - minutesToHHMM 形式
 *   - bucketFromMinutes / bucketFromHHMM 帯分類
 *   - buildStartNode / buildEndNode default + override
 */

import { describe, expect, it } from "vitest";

import { buildEndNode, buildStartNode } from "@/lib/plan/dayGraph/startEndNodes";
import {
  bucketFromHHMM,
  bucketFromMinutes,
  minutesToHHMM,
  parseHHMMtoMinutes,
} from "@/lib/plan/dayGraph/timeFormat";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// parseHHMMtoMinutes — strict
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseHHMMtoMinutes — strict spec", () => {
  it("'06:00' → 360", () => {
    expect(parseHHMMtoMinutes("06:00")).toBe(360);
  });

  it("'23:59' → 1439", () => {
    expect(parseHHMMtoMinutes("23:59")).toBe(1439);
  });

  it("'9:00' → 540 (= 1 桁 hour 許容)", () => {
    expect(parseHHMMtoMinutes("9:00")).toBe(540);
  });

  it("'14:30:00' → 870 (= 秒部分 tolerant)", () => {
    expect(parseHHMMtoMinutes("14:30:00")).toBe(870);
  });

  it("'00:00' → 0", () => {
    expect(parseHHMMtoMinutes("00:00")).toBe(0);
  });

  it("null → null", () => {
    expect(parseHHMMtoMinutes(null)).toBeNull();
  });

  it("undefined → null", () => {
    expect(parseHHMMtoMinutes(undefined)).toBeNull();
  });

  it("空文字 → null", () => {
    expect(parseHHMMtoMinutes("")).toBeNull();
    expect(parseHHMMtoMinutes("  ")).toBeNull();
  });

  it("ISO 8601 → null (= reject)", () => {
    expect(parseHHMMtoMinutes("2026-05-22T14:00:00Z")).toBeNull();
  });

  it("不正 format → null", () => {
    expect(parseHHMMtoMinutes("abc")).toBeNull();
    expect(parseHHMMtoMinutes("9-00")).toBeNull();
    expect(parseHHMMtoMinutes("99:99")).toBeNull();
    expect(parseHHMMtoMinutes("24:00")).toBeNull(); // hour 範囲外
    expect(parseHHMMtoMinutes("12:60")).toBeNull(); // minute 範囲外
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// minutesToHHMM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("minutesToHHMM", () => {
  it("360 → '06:00'", () => {
    expect(minutesToHHMM(360)).toBe("06:00");
  });

  it("1439 → '23:59'", () => {
    expect(minutesToHHMM(1439)).toBe("23:59");
  });

  it("0 → '00:00'", () => {
    expect(minutesToHHMM(0)).toBe("00:00");
  });

  it("範囲外 (= 1440 以上) → '23:59' に cap", () => {
    expect(minutesToHHMM(1500)).toBe("23:59");
  });

  it("負数 → '00:00' に cap", () => {
    expect(minutesToHHMM(-10)).toBe("00:00");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// bucketFromMinutes / bucketFromHHMM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("bucketFromMinutes — 7 帯分類", () => {
  it("05:00 → early_morning", () => {
    expect(bucketFromMinutes(300)).toBe("early_morning");
  });

  it("08:00 → morning (= boundary 8 時 含まれる)", () => {
    expect(bucketFromMinutes(480)).toBe("morning");
  });

  it("11:00 → noon", () => {
    expect(bucketFromMinutes(660)).toBe("noon");
  });

  it("14:00 → afternoon", () => {
    expect(bucketFromMinutes(840)).toBe("afternoon");
  });

  it("17:00 → evening", () => {
    expect(bucketFromMinutes(1020)).toBe("evening");
  });

  it("20:00 → night", () => {
    expect(bucketFromMinutes(1200)).toBe("night");
  });

  it("23:00 → late_night", () => {
    expect(bucketFromMinutes(1380)).toBe("late_night");
  });

  it("00:00 → late_night (= 翌日跨ぎ含む)", () => {
    expect(bucketFromMinutes(0)).toBe("late_night");
  });

  it("04:59 → late_night (= 5 時直前)", () => {
    expect(bucketFromMinutes(299)).toBe("late_night");
  });
});

describe("bucketFromHHMM", () => {
  it("'14:30' → afternoon", () => {
    expect(bucketFromHHMM("14:30")).toBe("afternoon");
  });

  it("不正入力 → late_night (= 防御 fallback)", () => {
    expect(bucketFromHHMM("abc")).toBe("late_night");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildStartNode
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildStartNode — default + override", () => {
  it("default boundary '06:00'", () => {
    const n = buildStartNode({ date: "2026-05-22" });
    expect(n.kind).toBe("start");
    expect(n.origin).toBe("implicit");
    expect(n.startTime).toBe("06:00");
    expect(n.endTime).toBe("06:00");
    expect(n.durationMin).toBe(0);
    expect(n.id).toBe("2026-05-22_start_0");
    expect(n.boundaryRationale.type).toBe("default");
    expect(n.boundaryRationale.timezone).toBe("local");
  });

  it("user override '08:30'", () => {
    const n = buildStartNode({ date: "2026-05-22", startTime: "08:30" });
    expect(n.startTime).toBe("08:30");
    expect(n.endTime).toBe("08:30");
    expect(n.boundaryRationale.type).toBe("user_override");
  });

  it("不正 startTime → default fallback", () => {
    const n = buildStartNode({ date: "2026-05-22", startTime: "abc" });
    expect(n.startTime).toBe("06:00");
    expect(n.boundaryRationale.type).toBe("default");
  });

  it("timeBucket は startTime ベース", () => {
    expect(buildStartNode({ date: "2026-05-22" }).timeBucket).toBe("early_morning");
    expect(buildStartNode({ date: "2026-05-22", startTime: "09:00" }).timeBucket).toBe("morning");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildEndNode
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildEndNode — default + override", () => {
  it("default boundary '23:00'", () => {
    const n = buildEndNode({ date: "2026-05-22" });
    expect(n.kind).toBe("end");
    expect(n.origin).toBe("implicit");
    expect(n.startTime).toBe("23:00");
    expect(n.endTime).toBe("23:00");
    expect(n.durationMin).toBe(0);
    expect(n.id).toBe("2026-05-22_end_0");
    expect(n.boundaryRationale.type).toBe("default");
    expect(n.timeBucket).toBe("late_night");
  });

  it("user override '22:00'", () => {
    const n = buildEndNode({ date: "2026-05-22", endTime: "22:00" });
    expect(n.endTime).toBe("22:00");
    expect(n.boundaryRationale.type).toBe("user_override");
  });

  it("不正 endTime → default fallback", () => {
    const n = buildEndNode({ date: "2026-05-22", endTime: "x" });
    expect(n.endTime).toBe("23:00");
    expect(n.boundaryRationale.type).toBe("default");
  });
});
