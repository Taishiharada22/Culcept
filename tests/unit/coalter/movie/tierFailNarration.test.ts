/**
 * D-2-c tierFailNarration 単体テスト (B3 構造 gate 担保 + lens 引用 verify)。
 *
 * 検証軸 (mainstream plan §3.3 元 D-3-c / D-2 設計レビュー §4.4 / handover §6):
 *   1. **B3 構造 gate**: state="tier2_fail" + altSignal=true literal 固定
 *   2. shape verify (TierFailState 6 fields + narration 3 fields)
 *   3. lens 引用優先順序: dominantDynamic > todayReading.mode > fallback
 *   4. lens full (dominantDynamic non-empty) → apology に引用 + citedLensFields 記録
 *   5. lens 観測薄 (dominantDynamic 空 + mode != "maintain") → mode を引用
 *   6. lens 空 (新規ペア、両方空) → generic fallback、citedLensFields=[]
 *   7. failedTitle / area が message + narration に embed
 *   8. altSuggestion non-empty (B3 別作品提案 担保)
 *   9. apologyForToday non-empty (B3 lens 根拠 narration 担保)
 *  10. 決定論 (同 input → 同 output)
 *  11. immutability (入力 lens / failedTitle / area を mutate しない)
 *
 * CEO 採用 L1: template only、LLM 不使用 → test 直接 string assertion で挙動 verify。
 */

import { describe, it, expect } from "vitest";
import {
  buildTierFailNarration,
  type TierFailInput,
  type TierFailState,
} from "@/lib/coalter/movie/tierFailNarration";
import type {
  PersonalLens,
  TwoPersonLensToday,
  UserId,
} from "@/lib/coalter/understanding/types";

// ═══════════════════════════════════════════════════════════════════════════
// fixture builders
// ═══════════════════════════════════════════════════════════════════════════

function buildPersonalLens(suffix: "a" | "b"): PersonalLens {
  return {
    userId: `user-${suffix}` as UserId,
    displayName: suffix === "a" ? "Aさん" : "Bさん",
    coreDecisionPrinciples: [`${suffix}-原理-1`],
    currentEmotionalHue: `${suffix}-情調`,
    todaySensitivities: [],
    comfortPathways: [`${suffix}-回復`],
    sourcedFrom: { stargazer: [], alter: [], behavioral: [] },
  };
}

function buildLens(
  overrides: Partial<{
    dominantDynamic: string;
    mode: "recover" | "celebrate" | "connect" | "challenge" | "maintain";
  }> = {},
): TwoPersonLensToday {
  return {
    personalLenses: { a: buildPersonalLens("a"), b: buildPersonalLens("b") },
    relationalLens: {
      temperature: "warm",
      dominantDynamic: overrides.dominantDynamic ?? "今日は A 主導 B 受容",
      careAxes: [],
      avoidElements: [],
      interactionPace: "steady",
    },
    todayReading: {
      mode: overrides.mode ?? "recover",
      energyBudget: "low",
      timeBudget: "limited",
      implicitIntent: "",
      latentNeeds: [],
      confidence: 0.7,
    },
    fairnessAdjustment: {
      favorSide: null,
      rationale: null,
      strength: 0,
      basedOnSessionCount: 0,
    },
    understanding_confidence: 0.7,
    dataGaps: [],
    computedAt: "2026-05-11T00:00:00Z",
    lensVersion: "1.0.0",
  };
}

function buildInput(
  overrides: Partial<TierFailInput> = {},
): TierFailInput {
  return {
    failedTitle: "テスト作品",
    area: "渋谷",
    lens: buildLens(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. B3 構造 gate (state / altSignal literal 固定)
// ═══════════════════════════════════════════════════════════════════════════

describe("B3 構造 gate — state / altSignal literal 固定", () => {
  it('state は "tier2_fail" literal で固定', () => {
    const result = buildTierFailNarration(buildInput());
    expect(result.state).toBe("tier2_fail");
  });

  it("altSignal は true literal で固定 (false の余地なし、別作品再起動 UI の signal)", () => {
    const result = buildTierFailNarration(buildInput());
    expect(result.altSignal).toBe(true);
  });

  it("lens 観測薄でも altSignal は true (常に別作品提案を促す)", () => {
    const lens = buildLens({ dominantDynamic: "", mode: "maintain" });
    const result = buildTierFailNarration(buildInput({ lens }));
    expect(result.altSignal).toBe(true);
  });

  it("narration.altSuggestion non-empty (B3 別作品提案担保)", () => {
    const result = buildTierFailNarration(buildInput());
    expect(result.narration.altSuggestion.length).toBeGreaterThan(0);
  });

  it("narration.apologyForToday non-empty (B3 lens 根拠 narration 担保)", () => {
    const result = buildTierFailNarration(buildInput());
    expect(result.narration.apologyForToday.length).toBeGreaterThan(0);
  });

  it("lens 観測薄でも narration 2 field non-empty (常に fallback narration)", () => {
    const lens = buildLens({ dominantDynamic: "", mode: "maintain" });
    const result = buildTierFailNarration(buildInput({ lens }));
    expect(result.narration.apologyForToday.length).toBeGreaterThan(0);
    expect(result.narration.altSuggestion.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. shape verify
// ═══════════════════════════════════════════════════════════════════════════

describe("buildTierFailNarration — shape", () => {
  it("TierFailState は 6 fields (state / altSignal / message / narration / failedTitle / area)", () => {
    const result: TierFailState = buildTierFailNarration(buildInput());
    expect(Object.keys(result).sort()).toEqual([
      "altSignal",
      "area",
      "failedTitle",
      "message",
      "narration",
      "state",
    ]);
  });

  it("narration は 3 fields (apologyForToday / altSuggestion / citedLensFields)", () => {
    const result = buildTierFailNarration(buildInput());
    expect(Object.keys(result.narration).sort()).toEqual([
      "altSuggestion",
      "apologyForToday",
      "citedLensFields",
    ]);
  });

  it("citedLensFields は array of string", () => {
    const result = buildTierFailNarration(buildInput());
    expect(Array.isArray(result.narration.citedLensFields)).toBe(true);
    for (const field of result.narration.citedLensFields) {
      expect(typeof field).toBe("string");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3-5. lens 引用優先順序 (G6 pattern 継承)
// ═══════════════════════════════════════════════════════════════════════════

describe("lens 引用優先順序 (dominantDynamic > mode > fallback)", () => {
  it("dominantDynamic non-empty → apologyForToday に引用 + citedLensFields に 'relationalLens.dominantDynamic'", () => {
    const lens = buildLens({
      dominantDynamic: "今日は B 主導 A 共感受容",
      mode: "recover",
    });
    const result = buildTierFailNarration(buildInput({ lens }));
    expect(result.narration.apologyForToday).toContain("今日は B 主導 A 共感受容");
    expect(result.narration.citedLensFields).toContain(
      "relationalLens.dominantDynamic",
    );
    // mode より dominantDynamic 優先 (mode は引用しない)
    expect(result.narration.citedLensFields).not.toContain("todayReading.mode");
  });

  it("dominantDynamic 空 + mode != 'maintain' → mode 引用 + citedLensFields に 'todayReading.mode'", () => {
    const lens = buildLens({
      dominantDynamic: "",
      mode: "challenge",
    });
    const result = buildTierFailNarration(buildInput({ lens }));
    expect(result.narration.apologyForToday).toContain("challenge");
    expect(result.narration.citedLensFields).toEqual(["todayReading.mode"]);
  });

  it("dominantDynamic 空 + mode='maintain' → fallback、citedLensFields=[]", () => {
    const lens = buildLens({
      dominantDynamic: "",
      mode: "maintain",
    });
    const result = buildTierFailNarration(buildInput({ lens }));
    expect(result.narration.citedLensFields).toEqual([]);
    // fallback narration は lens kw を含まないが non-empty
    expect(result.narration.apologyForToday.length).toBeGreaterThan(0);
  });

  it("各 mode (recover / celebrate / connect / challenge) で apologyForToday に mode embed", () => {
    const modes: Array<"recover" | "celebrate" | "connect" | "challenge"> = [
      "recover",
      "celebrate",
      "connect",
      "challenge",
    ];
    for (const mode of modes) {
      const lens = buildLens({ dominantDynamic: "", mode });
      const result = buildTierFailNarration(buildInput({ lens }));
      expect(result.narration.apologyForToday).toContain(mode);
      expect(result.narration.citedLensFields).toEqual(["todayReading.mode"]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. failedTitle / area の embed
// ═══════════════════════════════════════════════════════════════════════════

describe("failedTitle / area の embed", () => {
  it("message に area + failedTitle 両方 embed", () => {
    const result = buildTierFailNarration(
      buildInput({ failedTitle: "君の名は。", area: "新宿" }),
    );
    expect(result.message).toContain("新宿");
    expect(result.message).toContain("君の名は。");
  });

  it("apologyForToday に failedTitle が embed (lens full の場合)", () => {
    const lens = buildLens({ dominantDynamic: "穏やかな日" });
    const result = buildTierFailNarration(
      buildInput({ failedTitle: "ある映画", area: "渋谷", lens }),
    );
    expect(result.narration.apologyForToday).toContain("ある映画");
    expect(result.narration.apologyForToday).toContain("渋谷");
  });

  it("apologyForToday に failedTitle が embed (lens 空 fallback の場合)", () => {
    const lens = buildLens({ dominantDynamic: "", mode: "maintain" });
    const result = buildTierFailNarration(
      buildInput({ failedTitle: "別作品", area: "梅田", lens }),
    );
    expect(result.narration.apologyForToday).toContain("別作品");
    expect(result.narration.apologyForToday).toContain("梅田");
  });

  it("altSuggestion に area embed", () => {
    const result = buildTierFailNarration(
      buildInput({ area: "横浜" }),
    );
    expect(result.narration.altSuggestion).toContain("横浜");
  });

  it("failedTitle / area が TierFailState top-level field にも propagate", () => {
    const result = buildTierFailNarration(
      buildInput({ failedTitle: "TKM", area: "京都" }),
    );
    expect(result.failedTitle).toBe("TKM");
    expect(result.area).toBe("京都");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. 決定論性 (同 input → 同 output)
// ═══════════════════════════════════════════════════════════════════════════

describe("buildTierFailNarration — 決定論性", () => {
  it("同 input を 2 回呼ぶと deep-equal 結果が返る", () => {
    const input = buildInput({
      lens: buildLens({ dominantDynamic: "穏やか", mode: "recover" }),
    });
    const r1 = buildTierFailNarration(input);
    const r2 = buildTierFailNarration(input);
    expect(r1).toEqual(r2);
  });

  it("同 lens / failedTitle / area で連続呼び出し → narration 完全一致", () => {
    const input = buildInput();
    const results = [
      buildTierFailNarration(input),
      buildTierFailNarration(input),
      buildTierFailNarration(input),
    ];
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. immutability
// ═══════════════════════════════════════════════════════════════════════════

describe("buildTierFailNarration — immutability", () => {
  it("入力 lens を mutate しない", () => {
    const lens = buildLens({ dominantDynamic: "ダイナミック値" });
    const snapshot = JSON.parse(JSON.stringify(lens));
    buildTierFailNarration(buildInput({ lens }));
    expect(lens).toEqual(snapshot);
  });

  it("入力 input オブジェクト全体を mutate しない", () => {
    const input = buildInput();
    const snapshot = JSON.parse(JSON.stringify(input));
    buildTierFailNarration(input);
    expect(input).toEqual(snapshot);
  });

  it("出力 citedLensFields を mutate しても次回呼び出しに影響しない", () => {
    const input = buildInput();
    const r1 = buildTierFailNarration(input);
    // mutate するため readonly cast を外す
    (r1.narration.citedLensFields as string[]).push("汚染");
    const r2 = buildTierFailNarration(input);
    expect(r2.narration.citedLensFields).not.toContain("汚染");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. LLM 不使用 verify (CEO 採用 L1)
// ═══════════════════════════════════════════════════════════════════════════

describe("buildTierFailNarration — LLM 不使用 (CEO 採用 L1)", () => {
  it("関数は同期的 (Promise を返さない、async 不使用)", () => {
    const result = buildTierFailNarration(buildInput());
    // Promise であれば then が存在
    expect(typeof (result as unknown as { then?: unknown }).then).toBe(
      "undefined",
    );
  });

  it("関数は sync で即時 return (実行時間 < 10ms、template only)", () => {
    const started = Date.now();
    for (let i = 0; i < 100; i++) {
      buildTierFailNarration(buildInput());
    }
    const elapsed = Date.now() - started;
    // 100 回実行で 1 秒以下 (template only、LLM 不使用の verify proxy)
    expect(elapsed).toBeLessThan(1000);
  });
});
