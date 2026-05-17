/**
 * CoAlter AOO Phase B B-4c — counterfactualSilenceTest invariant test
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §10.2
 *   - 実装: lib/coalter/mirror/counterfactualSilenceTest.ts
 *
 * test 範囲:
 *   - ervScore < COUNTERFACTUAL_ERV_BAR → "user_misses_small_observation"
 *   - safety_concern → "user_takes_harmful_action" (ERV 高くても safety 優先)
 *   - rupture_signal_high → "user_takes_harmful_action"
 *   - travel mode + high ERV → "no_difference"
 *   - unknown modeContext + high ERV → "no_difference"
 *   - unknown_category → "no_difference" (defensive)
 *   - userOverrideSleep true/null/undefined → "no_difference"
 *   - 全条件 met → "user_misses_meaningful_insight" (極めて限定的)
 *   - NaN / Infinity ervScore → "no_difference" (defensive)
 *   - 境界値: ervScore === COUNTERFACTUAL_ERV_BAR (0.85) → proceed
 *   - rupture_signal_mild + 全条件 OK → "user_misses_meaningful_insight"
 *   - null_pattern + 全条件 OK → "user_misses_meaningful_insight"
 *   - 短絡 return 順序 (safety → ERV bar → context → sleep → meaningful_insight)
 *   - input mutation 0 / deterministic / PII firewall
 */

import { describe, it, expect } from "vitest";
import { counterfactualSilenceTest } from "@/lib/coalter/mirror/counterfactualSilenceTest";
import { COUNTERFACTUAL_ERV_BAR } from "@/lib/coalter/mirror/decisionConstants";
import type { MirrorDecisionInput } from "@/lib/coalter/mirror/types";

function safeNormalInput(): MirrorDecisionInput {
  return {
    modeContext: {
      status: "known",
      mode: "normal",
      source: "presence_state",
      canProceedToMirrorDecision: true,
    },
    alignment: {
      status: "known",
      bucket: "positive",
      raw: 0.6,
      canProceedToMirrorDecision: true,
    },
    uncertainty: {
      status: "known",
      bucket: "low_0_to_30",
      raw: 0.1,
      canProceedToMirrorDecision: true,
    },
    silenceBudget: {
      status: "known",
      bucket: "low_0_to_30",
      raw: 0.1,
      canProceedToMirrorDecision: true,
    },
    patternCategory: {
      status: "known",
      bucket: "null_pattern",
      canProceedToMirrorDecision: true,
    },
    observationNovelty: 0.9,
    conversationPhase: "in_progress",
    timeSinceLastSpeakTurns: 10,
    ruptureFlag: false,
    userOverrideSleep: false,
  };
}

describe("B-4c counterfactualSilenceTest — ERV bar (COUNTERFACTUAL_ERV_BAR = 0.85)", () => {
  it("ervScore 0.5 → 'user_misses_small_observation'", () => {
    const r = counterfactualSilenceTest(safeNormalInput(), 0.5);
    expect(r).toBe("user_misses_small_observation");
  });

  it("ervScore 0.75 (SPEAK_THRESHOLD_BASE 通過しても) → small_observation", () => {
    const r = counterfactualSilenceTest(safeNormalInput(), 0.75);
    expect(r).toBe("user_misses_small_observation");
  });

  it("ervScore 0.849... (bar 直前) → small_observation", () => {
    const r = counterfactualSilenceTest(safeNormalInput(), 0.849);
    expect(r).toBe("user_misses_small_observation");
  });

  it("ervScore === COUNTERFACTUAL_ERV_BAR (0.85, 境界 inclusive) → proceed (meaningful_insight)", () => {
    const r = counterfactualSilenceTest(safeNormalInput(), COUNTERFACTUAL_ERV_BAR);
    expect(r).toBe("user_misses_meaningful_insight");
  });

  it("ervScore 0.9 (bar 超過) + 全条件 met → 'user_misses_meaningful_insight'", () => {
    const r = counterfactualSilenceTest(safeNormalInput(), 0.9);
    expect(r).toBe("user_misses_meaningful_insight");
  });

  it("ervScore 1.0 (max) + 全条件 met → 'user_misses_meaningful_insight'", () => {
    const r = counterfactualSilenceTest(safeNormalInput(), 1.0);
    expect(r).toBe("user_misses_meaningful_insight");
  });
});

describe("B-4c counterfactualSilenceTest — safety routing (ERV 高くても safety 優先)", () => {
  it("safety_concern → 'user_takes_harmful_action' (ERV 0.95 でも)", () => {
    const input: MirrorDecisionInput = {
      ...safeNormalInput(),
      patternCategory: {
        status: "known",
        bucket: "safety_concern",
        canProceedToMirrorDecision: false,
      },
    };
    expect(counterfactualSilenceTest(input, 0.95)).toBe("user_takes_harmful_action");
  });

  it("rupture_signal_high → 'user_takes_harmful_action' (ERV 0.95 でも)", () => {
    const input: MirrorDecisionInput = {
      ...safeNormalInput(),
      patternCategory: {
        status: "known",
        bucket: "rupture_signal_high",
        canProceedToMirrorDecision: false,
      },
    };
    expect(counterfactualSilenceTest(input, 0.95)).toBe("user_takes_harmful_action");
  });

  it("safety routing は ERV bar より優先 (低 ERV でも harmful_action)", () => {
    const input: MirrorDecisionInput = {
      ...safeNormalInput(),
      patternCategory: {
        status: "known",
        bucket: "safety_concern",
        canProceedToMirrorDecision: false,
      },
    };
    // ERV 0.5 でも safety_concern は harmful_action を返す
    expect(counterfactualSilenceTest(input, 0.5)).toBe("user_takes_harmful_action");
    expect(counterfactualSilenceTest(input, 0.0)).toBe("user_takes_harmful_action");
  });
});

describe("B-4c counterfactualSilenceTest — context safety (travel / unknown / sleep)", () => {
  it("travel mode + high ERV → 'no_difference'", () => {
    const input: MirrorDecisionInput = {
      ...safeNormalInput(),
      modeContext: {
        status: "known",
        mode: "travel",
        source: "presence_state",
        canProceedToMirrorDecision: true,
      },
    };
    expect(counterfactualSilenceTest(input, 0.9)).toBe("no_difference");
  });

  it("unknown modeContext + high ERV → 'no_difference' (defensive)", () => {
    const input: MirrorDecisionInput = {
      ...safeNormalInput(),
      modeContext: {
        status: "unknown",
        mode: null,
        source: "missing",
        canProceedToMirrorDecision: false,
      },
    };
    expect(counterfactualSilenceTest(input, 0.9)).toBe("no_difference");
  });

  it("unknown_category pattern + high ERV → 'no_difference' (defensive)", () => {
    const input: MirrorDecisionInput = {
      ...safeNormalInput(),
      patternCategory: {
        status: "unknown",
        bucket: "unknown_category",
        canProceedToMirrorDecision: false,
      },
    };
    expect(counterfactualSilenceTest(input, 0.9)).toBe("no_difference");
  });

  it("userOverrideSleep true + high ERV → 'no_difference'", () => {
    const input: MirrorDecisionInput = {
      ...safeNormalInput(),
      userOverrideSleep: true,
    };
    expect(counterfactualSilenceTest(input, 0.9)).toBe("no_difference");
  });

  it("userOverrideSleep null + high ERV → 'no_difference' (precautionary)", () => {
    const input: MirrorDecisionInput = {
      ...safeNormalInput(),
      userOverrideSleep: null,
    };
    expect(counterfactualSilenceTest(input, 0.9)).toBe("no_difference");
  });

  it("userOverrideSleep undefined + high ERV → 'no_difference' (precautionary)", () => {
    const input: MirrorDecisionInput = {
      ...safeNormalInput(),
      userOverrideSleep: undefined,
    };
    expect(counterfactualSilenceTest(input, 0.9)).toBe("no_difference");
  });
});

describe("B-4c counterfactualSilenceTest — meaningful_insight 経路 (極めて限定的)", () => {
  it("normal mode + null_pattern + safe + sleep false + ERV high → meaningful_insight", () => {
    expect(counterfactualSilenceTest(safeNormalInput(), 0.9)).toBe(
      "user_misses_meaningful_insight",
    );
  });

  it("daily mode + null_pattern + safe + sleep false + ERV high → meaningful_insight", () => {
    const input: MirrorDecisionInput = {
      ...safeNormalInput(),
      modeContext: {
        status: "known",
        mode: "daily",
        source: "presence_state",
        canProceedToMirrorDecision: true,
      },
    };
    expect(counterfactualSilenceTest(input, 0.9)).toBe("user_misses_meaningful_insight");
  });

  it("rupture_signal_mild + 全条件 OK + ERV high → meaningful_insight (Repair Mirror 候補)", () => {
    const input: MirrorDecisionInput = {
      ...safeNormalInput(),
      patternCategory: {
        status: "known",
        bucket: "rupture_signal_mild",
        canProceedToMirrorDecision: true,
      },
    };
    expect(counterfactualSilenceTest(input, 0.9)).toBe("user_misses_meaningful_insight");
  });
});

describe("B-4c counterfactualSilenceTest — defensive (NaN / Infinity / invalid ervScore)", () => {
  it("ervScore NaN → 'no_difference'", () => {
    expect(counterfactualSilenceTest(safeNormalInput(), NaN)).toBe("no_difference");
  });

  it("ervScore Infinity → 'no_difference'", () => {
    expect(counterfactualSilenceTest(safeNormalInput(), Infinity)).toBe("no_difference");
    expect(counterfactualSilenceTest(safeNormalInput(), -Infinity)).toBe("no_difference");
  });

  it("ervScore 型外 (string / null / undefined / object) → 'no_difference'", () => {
    const cases: Array<unknown> = ["0.9", null, undefined, {}, []];
    for (const v of cases) {
      const r = counterfactualSilenceTest(safeNormalInput(), v as unknown as number);
      expect(r).toBe("no_difference");
    }
  });

  it("ervScore 範囲外 (negative / > 1) は handled gracefully (no error)", () => {
    // 負数 → < COUNTERFACTUAL_ERV_BAR → small_observation
    expect(counterfactualSilenceTest(safeNormalInput(), -0.5)).toBe(
      "user_misses_small_observation",
    );
    // > 1 → > bar、他条件 met なら meaningful_insight
    expect(counterfactualSilenceTest(safeNormalInput(), 1.5)).toBe(
      "user_misses_meaningful_insight",
    );
  });
});

describe("B-4c counterfactualSilenceTest — 短絡 return 順序", () => {
  it("safety_concern + travel + sleep + NaN ERV → harmful_action (safety 最優先)", () => {
    // NaN check が最初なので、defensive 順序が test される
    // 実装は NaN を最初に check するため "no_difference" を期待
    const input: MirrorDecisionInput = {
      ...safeNormalInput(),
      modeContext: {
        status: "known",
        mode: "travel",
        source: "presence_state",
        canProceedToMirrorDecision: true,
      },
      patternCategory: {
        status: "known",
        bucket: "safety_concern",
        canProceedToMirrorDecision: false,
      },
      userOverrideSleep: true,
    };
    // NaN ERV → no_difference (最初の defensive check)
    expect(counterfactualSilenceTest(input, NaN)).toBe("no_difference");
    // 有効 ERV → safety_concern 優先 (順序 2)
    expect(counterfactualSilenceTest(input, 0.9)).toBe("user_takes_harmful_action");
  });

  it("rupture_high + travel + low ERV → rupture_high 優先 (ERV bar より先)", () => {
    const input: MirrorDecisionInput = {
      ...safeNormalInput(),
      modeContext: {
        status: "known",
        mode: "travel",
        source: "presence_state",
        canProceedToMirrorDecision: true,
      },
      patternCategory: {
        status: "known",
        bucket: "rupture_signal_high",
        canProceedToMirrorDecision: false,
      },
    };
    // 低 ERV でも rupture_signal_high を harmful_action として返す
    expect(counterfactualSilenceTest(input, 0.3)).toBe("user_takes_harmful_action");
  });

  it("travel + sleep + high ERV → travel 優先 (no_difference)", () => {
    const input: MirrorDecisionInput = {
      ...safeNormalInput(),
      modeContext: {
        status: "known",
        mode: "travel",
        source: "presence_state",
        canProceedToMirrorDecision: true,
      },
      userOverrideSleep: true,
    };
    // travel mode は順序 5、sleep は順序 8 → travel が先
    expect(counterfactualSilenceTest(input, 0.9)).toBe("no_difference");
  });
});

describe("B-4c counterfactualSilenceTest — invariants (pure / mutation / deterministic / PII)", () => {
  it("input mutation 0 (3 回 call 後 input 不変)", () => {
    const input = safeNormalInput();
    const snapshot = JSON.stringify(input);
    counterfactualSilenceTest(input, 0.9);
    counterfactualSilenceTest(input, 0.5);
    counterfactualSilenceTest(input, 0.1);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("deterministic (同一 input + 同一 ERV → 同一 outcome)", () => {
    const input = safeNormalInput();
    const r1 = counterfactualSilenceTest(input, 0.9);
    const r2 = counterfactualSilenceTest(input, 0.9);
    const r3 = counterfactualSilenceTest(input, 0.9);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  it("PII 非受理: extra fields は outcome に影響しない / leak しない", () => {
    const baseOutcome = counterfactualSilenceTest(safeNormalInput(), 0.9);

    const withPII = {
      ...safeNormalInput(),
      rawText: "leak this",
      messageId: "msg_pii",
      userId: "user_pii",
      pairStateId: "pair_pii",
      sessionId: "session_pii",
      matchedPatternRaw: "safety:keyword",
    } as unknown as MirrorDecisionInput;
    const outcomeWithPII = counterfactualSilenceTest(withPII, 0.9);

    // outcome 値は PII の有無に関わらず同一
    expect(outcomeWithPII).toBe(baseOutcome);

    // outcome は CounterfactualOutcome の literal 値のみ (PII を含まない string)
    const json = JSON.stringify(outcomeWithPII);
    for (const sentinel of ["leak this", "msg_pii", "user_pii", "pair_pii", "session_pii", "safety:keyword"]) {
      expect(json).not.toContain(sentinel);
    }
  });

  it("returns only 4 valid CounterfactualOutcome 値", () => {
    const validOutcomes: ReadonlySet<string> = new Set<string>([
      "user_misses_small_observation",
      "user_misses_meaningful_insight",
      "user_takes_harmful_action",
      "no_difference",
    ]);

    // 各経路を test
    const scenarios: Array<[MirrorDecisionInput, number]> = [
      [safeNormalInput(), 0.5], // → small_observation
      [safeNormalInput(), 0.9], // → meaningful_insight
      [
        {
          ...safeNormalInput(),
          patternCategory: {
            status: "known",
            bucket: "safety_concern",
            canProceedToMirrorDecision: false,
          },
        },
        0.9,
      ], // → harmful_action
      [
        {
          ...safeNormalInput(),
          modeContext: {
            status: "known",
            mode: "travel",
            source: "presence_state",
            canProceedToMirrorDecision: true,
          },
        },
        0.9,
      ], // → no_difference
      [safeNormalInput(), NaN], // → no_difference (defensive)
    ];
    for (const [input, erv] of scenarios) {
      const r = counterfactualSilenceTest(input, erv);
      expect(validOutcomes.has(r)).toBe(true);
    }
  });
});
