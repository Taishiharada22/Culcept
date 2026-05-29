import { describe, it, expect } from "vitest";

import {
  computeLearningEligibility,
  recomputeLearningEligibility,
  isSatisfactionLevel,
  type LearningEligibilityInput,
  type WornHistoryEntry,
} from "@/lib/shared/wornHistory";

describe("isSatisfactionLevel", () => {
  it("1-5 のみ true", () => {
    expect([1, 2, 3, 4, 5].every(isSatisfactionLevel)).toBe(true);
  });
  it("範囲外・非整数・非数値は false", () => {
    for (const v of [0, 6, 3.5, -1, Number.NaN, undefined, null, "3", "5"]) {
      expect(isSatisfactionLevel(v)).toBe(false);
    }
  });
});

describe("computeLearningEligibility — hard ban (mock / hydrated_mock)", () => {
  it("mock は満足度・実 id があっても絶対に eligible にならない", () => {
    expect(
      computeLearningEligibility(
        { source: "mock", satisfaction: 5, itemIds: ["w1"] },
        { knownWardrobeIds: ["w1"] },
      ),
    ).toBe(false);
  });
  it("hydrated_mock も絶対に eligible にならない", () => {
    expect(
      computeLearningEligibility(
        { source: "hydrated_mock", satisfaction: 5, itemIds: ["w1"] },
        { knownWardrobeIds: ["w1"] },
      ),
    ).toBe(false);
  });
});

describe("computeLearningEligibility — engine / calendar_form のみ候補", () => {
  it("engine + satisfaction + 非空 itemIds → eligible（known 未指定）", () => {
    expect(computeLearningEligibility({ source: "engine", satisfaction: 4, itemIds: ["w1"] })).toBe(
      true,
    );
  });
  it("calendar_form + satisfaction + 非空 itemIds → eligible", () => {
    expect(
      computeLearningEligibility({ source: "calendar_form", satisfaction: 3, itemIds: ["c1"] }),
    ).toBe(true);
  });
  it("satisfaction が無ければ false（着ただけ・未評価は学習しない）", () => {
    expect(
      computeLearningEligibility({ source: "engine", satisfaction: undefined, itemIds: ["w1"] }),
    ).toBe(false);
  });
  it("satisfaction が範囲外なら false（runtime guard）", () => {
    // 型上は SatisfactionLevel しか渡せないが、 防御的 runtime guard を検証するため bypass。
    const bad = { source: "engine", satisfaction: 0, itemIds: ["w1"] } as unknown as Parameters<
      typeof computeLearningEligibility
    >[0];
    expect(computeLearningEligibility(bad)).toBe(false);
  });
  it("itemIds が空なら false", () => {
    expect(computeLearningEligibility({ source: "engine", satisfaction: 5, itemIds: [] })).toBe(
      false,
    );
  });
});

describe("computeLearningEligibility — knownWardrobeIds gate（任意）", () => {
  it("known を渡すと全 id が実在のときだけ eligible", () => {
    const input: LearningEligibilityInput = { source: "engine", satisfaction: 5, itemIds: ["w1", "w2"] };
    expect(computeLearningEligibility(input, { knownWardrobeIds: ["w1", "w2", "w3"] })).toBe(true);
    expect(computeLearningEligibility(input, { knownWardrobeIds: ["w1"] })).toBe(false); // w2 不在
  });
  it("known は Set でも配列でも受ける", () => {
    const input: LearningEligibilityInput = { source: "engine", satisfaction: 5, itemIds: ["w1"] };
    expect(computeLearningEligibility(input, { knownWardrobeIds: new Set(["w1"]) })).toBe(true);
    expect(computeLearningEligibility(input, { knownWardrobeIds: ["w1"] })).toBe(true);
  });
  it("known が空集合なら実在 id なしとみなし false", () => {
    expect(
      computeLearningEligibility(
        { source: "engine", satisfaction: 5, itemIds: ["w1"] },
        { knownWardrobeIds: [] },
      ),
    ).toBe(false);
  });
});

describe("recomputeLearningEligibility", () => {
  const base: WornHistoryEntry = {
    date: "2026-05-29",
    wornAt: "2026-05-29T20:00:00.000Z",
    itemIds: ["w1", "wX"],
    satisfaction: 5,
    source: "engine",
    origin: "plan",
    learningEligible: true,
  };

  it("known を与えて不在 id があれば learningEligible を false に落とした新 entry を返す", () => {
    const next = recomputeLearningEligibility(base, { knownWardrobeIds: ["w1"] });
    expect(next.learningEligible).toBe(false);
    expect(next).not.toBe(base); // 新オブジェクト
    expect(base.learningEligible).toBe(true); // 元は不変
  });
  it("結果が変わらなければ同一参照を返す（無駄なコピーをしない）", () => {
    const next = recomputeLearningEligibility(base, { knownWardrobeIds: ["w1", "wX"] });
    expect(next.learningEligible).toBe(true);
    expect(next).toBe(base);
  });
});
