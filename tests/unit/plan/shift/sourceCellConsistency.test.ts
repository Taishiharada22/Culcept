import { describe, it, expect } from "vitest";

import {
  detectSourceMismatches,
  sourceMismatchDays,
  DEFAULT_CONTENT_HIGH,
  DEFAULT_CONTENT_LOW,
} from "../../../../lib/plan/shift/sourceCellConsistency";

describe("sourceCellConsistency / detectSourceMismatches", () => {
  it("P1: 空欄 rawCode + 高 content → blank_with_content（day28 実ケース）", () => {
    const h = detectSourceMismatches([{ day: 28, rawCode: "", contentScore: 0.95 }]);
    expect(h).toHaveLength(1);
    expect(h[0].kind).toBe("blank_with_content");
    expect(h[0].severity).toBe("soft");
    expect(h[0].day).toBe(28);
    expect(h[0].message).toContain("原稿");
  });

  it("非空 + 高 content → hint なし（整合）", () => {
    expect(detectSourceMismatches([{ day: 5, rawCode: "L", contentScore: 0.95 }])).toHaveLength(0);
  });

  it("空欄 + 低 content → hint なし（確実な休み = 高 conf 空欄）", () => {
    expect(detectSourceMismatches([{ day: 5, rawCode: "", contentScore: 0.0 }])).toHaveLength(0);
  });

  it("空白のみの rawCode は空欄扱い（normalizeRawCode）", () => {
    const h = detectSourceMismatches([{ day: 3, rawCode: "   ", contentScore: 0.9 }]);
    expect(h).toHaveLength(1);
    expect(h[0].kind).toBe("blank_with_content");
  });

  it("P2 は既定 OFF: 非空 + 低 content → hint なし", () => {
    expect(detectSourceMismatches([{ day: 7, rawCode: "H", contentScore: 0.0 }])).toHaveLength(0);
  });

  it("P2 ON: 非空 + 低 content → filled_but_empty", () => {
    const h = detectSourceMismatches([{ day: 7, rawCode: "H", contentScore: 0.0 }], {
      detectFilledButEmpty: true,
    });
    expect(h).toHaveLength(1);
    expect(h[0].kind).toBe("filled_but_empty");
    expect(h[0].severity).toBe("soft");
  });

  it("contentHighThreshold を尊重する", () => {
    const sig = [{ day: 1, rawCode: "", contentScore: 0.15 }];
    expect(detectSourceMismatches(sig, { contentHighThreshold: 0.5 })).toHaveLength(0); // 0.15 < 0.5
    expect(detectSourceMismatches(sig, { contentHighThreshold: 0.1 })).toHaveLength(1); // 0.15 ≥ 0.1
  });

  it("既定閾値は high > low（健全性）", () => {
    expect(DEFAULT_CONTENT_HIGH).toBeGreaterThan(DEFAULT_CONTENT_LOW);
  });

  it("hint を day 昇順に返す", () => {
    const h = detectSourceMismatches([
      { day: 28, rawCode: "", contentScore: 0.9 },
      { day: 3, rawCode: "", contentScore: 0.9 },
    ]);
    expect(h.map((x) => x.day)).toEqual([3, 28]);
  });

  it("malformed 入力で throw しない", () => {
    expect(() =>
      detectSourceMismatches([
        null as unknown as { day: number; rawCode: string; contentScore: number },
        { day: 1, rawCode: null as unknown as string, contentScore: NaN },
        { rawCode: "", contentScore: 0.9 } as unknown as {
          day: number;
          rawCode: string;
          contentScore: number;
        },
      ])
    ).not.toThrow();
  });

  it("NaN contentScore は 0 扱い（P1 出ない）", () => {
    expect(
      detectSourceMismatches([{ day: 1, rawCode: "", contentScore: NaN }])
    ).toHaveLength(0);
  });

  it("rawCode null + 高 content → P1（null = 空欄扱い）", () => {
    const h = detectSourceMismatches([
      { day: 1, rawCode: null as unknown as string, contentScore: 0.9 },
    ]);
    expect(h).toHaveLength(1);
    expect(h[0].kind).toBe("blank_with_content");
  });

  it("contentScore > 1 は 1 に clamp（throw しない）", () => {
    const h = detectSourceMismatches([{ day: 1, rawCode: "", contentScore: 5 }]);
    expect(h).toHaveLength(1);
  });
});

describe("sourceCellConsistency / sourceMismatchDays", () => {
  it("day set を返す", () => {
    const h = detectSourceMismatches([
      { day: 28, rawCode: "", contentScore: 0.9 },
      { day: 3, rawCode: "", contentScore: 0.9 },
    ]);
    expect(sourceMismatchDays(h)).toEqual(new Set([3, 28]));
  });

  it("空 → 空 set", () => {
    expect(sourceMismatchDays([])).toEqual(new Set());
  });
});
