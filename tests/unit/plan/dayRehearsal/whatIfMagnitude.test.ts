import { describe, it, expect } from "vitest";
import {
  magnitudeWord,
  outlookWorseningWord,
  isLevelWorsened,
} from "@/lib/plan/dayRehearsal/whatIfMagnitude";
import type { EstimateLevel } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";

describe("magnitudeWord — EstimateLevel → 定性語・数字なし", () => {
  it("★low=少し / moderate=中程度 / high=大きめ / unknown=null", () => {
    expect(magnitudeWord("low")).toBe("少し");
    expect(magnitudeWord("moderate")).toBe("中程度");
    expect(magnitudeWord("high")).toBe("大きめ");
    expect(magnitudeWord("unknown")).toBeNull(); // ★沈黙
  });
  it("★数字・%・係数・確率を含まない", () => {
    for (const lv of ["low", "moderate", "high"] as EstimateLevel[]) {
      expect(magnitudeWord(lv)).not.toMatch(/[0-9%]/);
    }
  });
});

describe("outlookWorseningWord — 悪化方向のみ・無差/改善/unknown は沈黙", () => {
  it("★1 段悪化(holds→tight)=中程度 / 2 段(holds→breaks)=大きめ", () => {
    expect(outlookWorseningWord("holds", "tight")).toBe("中程度");
    expect(outlookWorseningWord("tight", "breaks")).toBe("中程度");
    expect(outlookWorseningWord("holds", "breaks")).toBe("大きめ");
  });
  it("★同等/改善 → null（沈黙）", () => {
    expect(outlookWorseningWord("tight", "tight")).toBeNull();
    expect(outlookWorseningWord("breaks", "holds")).toBeNull(); // 改善
  });
  it("★unknown が絡む → null（捏造しない）", () => {
    expect(outlookWorseningWord("unknown", "breaks")).toBeNull();
    expect(outlookWorseningWord("holds", "unknown")).toBeNull();
  });
});

describe("isLevelWorsened — coherence gate 用", () => {
  it("★悪化方向で true・同等/改善/unknown で false", () => {
    expect(isLevelWorsened("low", "high")).toBe(true);
    expect(isLevelWorsened("moderate", "moderate")).toBe(false);
    expect(isLevelWorsened("high", "low")).toBe(false);
    expect(isLevelWorsened("unknown", "high")).toBe(false);
    expect(isLevelWorsened("high", "unknown")).toBe(false);
  });
});
