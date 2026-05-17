/**
 * CoAlter AOO Phase B B-4c — computeERV invariant test
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §3.1
 *   - 実装: lib/coalter/mirror/erv.ts
 *
 * test 範囲:
 *   - finite number 保証 / [0, 1] clamp
 *   - 全 unknown → ≈ 0 (defensive)
 *   - 全 perfect → ≈ 0.85+ (COUNTERFACTUAL_ERV_BAR 到達可能)
 *   - calibration 期待値 (普通 / 良好 / 例外的)
 *   - high uncertainty → ERV 低下
 *   - high silenceBudget → ERV 低下
 *   - travel mode → normal mode より ERV 低
 *   - ruptureFlag true → ERV 大幅低下
 *   - alignment 絶対値: strongly_negative === strongly_positive 同等
 *   - invalid numeric (NaN / Infinity / out of range / 型外) → defensive default
 *   - input mutation 0 / idempotent / deterministic / PII firewall
 */

import { describe, it, expect } from "vitest";
import {
  computeERV,
  ERV_NOVELTY_WEIGHT,
  ERV_ALIGNMENT_WEIGHT,
  ERV_CONFIDENCE_WEIGHT,
  ERV_ATTENTION_WEIGHT,
  ERV_AUTONOMY_COST_TRAVEL,
  ERV_AUTONOMY_COST_BASE,
  ERV_TRUST_WEIGHT,
  ERV_RUPTURE_PENALTY,
  ERV_SAFETY_MARGIN,
} from "@/lib/coalter/mirror/erv";
import {
  COUNTERFACTUAL_ERV_BAR,
  SPEAK_THRESHOLD_BASE,
} from "@/lib/coalter/mirror/decisionConstants";
import type { MirrorDecisionInput } from "@/lib/coalter/mirror/types";

function perfectInput(): MirrorDecisionInput {
  return {
    modeContext: {
      status: "known",
      mode: "normal",
      source: "presence_state",
      canProceedToMirrorDecision: true,
    },
    alignment: {
      status: "known",
      bucket: "strongly_positive",
      raw: 1.0,
      canProceedToMirrorDecision: true,
    },
    uncertainty: {
      status: "known",
      bucket: "low_0_to_30",
      raw: 0,
      canProceedToMirrorDecision: true,
    },
    silenceBudget: {
      status: "known",
      bucket: "low_0_to_30",
      raw: 0,
      canProceedToMirrorDecision: true,
    },
    patternCategory: {
      status: "known",
      bucket: "null_pattern",
      canProceedToMirrorDecision: true,
    },
    observationNovelty: 1.0,
    conversationPhase: "in_progress",
    timeSinceLastSpeakTurns: 100,
    ruptureFlag: false,
    userOverrideSleep: false,
  };
}

function normalInput(): MirrorDecisionInput {
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
      raw: 0.2,
      canProceedToMirrorDecision: true,
    },
    silenceBudget: {
      status: "known",
      bucket: "low_0_to_30",
      raw: 0.3,
      canProceedToMirrorDecision: true,
    },
    patternCategory: {
      status: "known",
      bucket: "null_pattern",
      canProceedToMirrorDecision: true,
    },
    observationNovelty: 0.7,
    conversationPhase: "in_progress",
    timeSinceLastSpeakTurns: 10,
    ruptureFlag: false,
    userOverrideSleep: false,
  };
}

function unknownInput(): MirrorDecisionInput {
  return {
    modeContext: {
      status: "unknown",
      mode: null,
      source: "missing",
      canProceedToMirrorDecision: false,
    },
    alignment: {
      status: "unknown",
      bucket: "unknown",
      raw: null,
      canProceedToMirrorDecision: false,
    },
    uncertainty: {
      status: "unknown",
      bucket: "unknown",
      raw: null,
      canProceedToMirrorDecision: false,
    },
    silenceBudget: {
      status: "unknown",
      bucket: "unknown",
      raw: null,
      canProceedToMirrorDecision: false,
    },
    patternCategory: {
      status: "unknown",
      bucket: "unknown_category",
      canProceedToMirrorDecision: false,
    },
  };
}

describe("B-4c computeERV — output guarantees", () => {
  it("returns finite number for all inputs", () => {
    const inputs = [perfectInput(), normalInput(), unknownInput()];
    for (const input of inputs) {
      const erv = computeERV(input);
      expect(Number.isFinite(erv)).toBe(true);
    }
  });

  it("output is clamped to [0, 1]", () => {
    const inputs = [perfectInput(), normalInput(), unknownInput()];
    for (const input of inputs) {
      const erv = computeERV(input);
      expect(erv).toBeGreaterThanOrEqual(0);
      expect(erv).toBeLessThanOrEqual(1);
    }
  });
});

describe("B-4c computeERV — calibration (tentative, B-5 canary 対象)", () => {
  it("全 unknown → ERV ≈ 0 (defensive fail-closed)", () => {
    const erv = computeERV(unknownInput());
    expect(erv).toBeLessThan(0.1);
  });

  it("perfect input → ERV >= COUNTERFACTUAL_ERV_BAR (0.85)", () => {
    const erv = computeERV(perfectInput());
    expect(erv).toBeGreaterThanOrEqual(COUNTERFACTUAL_ERV_BAR);
  });

  it("良好 input (novelty 0.9, |align| 0.9, uncertainty 0.1, silence 0.1, normal) → ERV >= SPEAK_THRESHOLD_BASE (0.75)", () => {
    const goodInput: MirrorDecisionInput = {
      ...normalInput(),
      alignment: {
        status: "known",
        bucket: "strongly_positive",
        raw: 0.9,
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
      observationNovelty: 0.9,
    };
    const erv = computeERV(goodInput);
    expect(erv).toBeGreaterThanOrEqual(SPEAK_THRESHOLD_BASE);
  });

  it("普通 input → ERV < SPEAK_THRESHOLD_BASE (Mirror conservative default)", () => {
    const erv = computeERV(normalInput());
    expect(erv).toBeLessThan(SPEAK_THRESHOLD_BASE);
  });
});

describe("B-4c computeERV — sensitivity (各 axis 変動による ERV 変化)", () => {
  it("uncertainty 増 → ERV 減", () => {
    const lowU = { ...perfectInput(), uncertainty: { status: "known" as const, bucket: "low_0_to_30" as const, raw: 0.1, canProceedToMirrorDecision: true as const } };
    const highU = { ...perfectInput(), uncertainty: { status: "known" as const, bucket: "high_70_to_100" as const, raw: 0.9, canProceedToMirrorDecision: false as const } };
    expect(computeERV(lowU)).toBeGreaterThan(computeERV(highU));
  });

  it("silenceBudget 増 → ERV 減", () => {
    const lowS = { ...perfectInput(), silenceBudget: { status: "known" as const, bucket: "low_0_to_30" as const, raw: 0.1, canProceedToMirrorDecision: true as const } };
    const highS = { ...perfectInput(), silenceBudget: { status: "known" as const, bucket: "high_70_to_100" as const, raw: 0.9, canProceedToMirrorDecision: false as const } };
    expect(computeERV(lowS)).toBeGreaterThan(computeERV(highS));
  });

  it("travel mode → normal mode より ERV 低", () => {
    const normal = perfectInput();
    const travel: MirrorDecisionInput = {
      ...perfectInput(),
      modeContext: {
        status: "known",
        mode: "travel",
        source: "presence_state",
        canProceedToMirrorDecision: true,
      },
    };
    expect(computeERV(normal)).toBeGreaterThan(computeERV(travel));
  });

  it("daily mode === normal mode の ERV (両方とも base autonomy cost)", () => {
    const normal = perfectInput();
    const daily: MirrorDecisionInput = {
      ...perfectInput(),
      modeContext: {
        status: "known",
        mode: "daily",
        source: "presence_state",
        canProceedToMirrorDecision: true,
      },
    };
    expect(computeERV(normal)).toBeCloseTo(computeERV(daily), 10);
  });

  it("ruptureFlag true → ERV 大幅低下", () => {
    const noRupture = perfectInput();
    const withRupture: MirrorDecisionInput = { ...perfectInput(), ruptureFlag: true };
    expect(computeERV(noRupture) - computeERV(withRupture)).toBeGreaterThanOrEqual(
      ERV_RUPTURE_PENALTY - 0.001,
    );
  });

  it("novelty 増 → ERV 増", () => {
    const lowN: MirrorDecisionInput = { ...perfectInput(), observationNovelty: 0.0 };
    const highN: MirrorDecisionInput = { ...perfectInput(), observationNovelty: 1.0 };
    expect(computeERV(highN)).toBeGreaterThan(computeERV(lowN));
  });

  it("alignment 絶対値: strongly_negative === strongly_positive (同等 informative)", () => {
    const stronglyPositive: MirrorDecisionInput = {
      ...perfectInput(),
      alignment: { status: "known", bucket: "strongly_positive", raw: 0.9, canProceedToMirrorDecision: true },
    };
    const stronglyNegative: MirrorDecisionInput = {
      ...perfectInput(),
      alignment: { status: "known", bucket: "strongly_negative", raw: -0.9, canProceedToMirrorDecision: true },
    };
    expect(computeERV(stronglyPositive)).toBeCloseTo(computeERV(stronglyNegative), 10);
  });

  it("alignment neutral (|raw|=0) → ERV 低 (informative gain なし)", () => {
    const neutral: MirrorDecisionInput = {
      ...perfectInput(),
      alignment: { status: "known", bucket: "neutral", raw: 0, canProceedToMirrorDecision: true },
    };
    const stronglyPositive: MirrorDecisionInput = {
      ...perfectInput(),
      alignment: { status: "known", bucket: "strongly_positive", raw: 0.9, canProceedToMirrorDecision: true },
    };
    expect(computeERV(stronglyPositive)).toBeGreaterThan(computeERV(neutral));
  });
});

describe("B-4c computeERV — invalid numeric defensive", () => {
  it("novelty undefined → 0 として扱う (ΔU 寄与なし)", () => {
    const inputWithoutNovelty: MirrorDecisionInput = {
      ...perfectInput(),
      observationNovelty: undefined,
    };
    const inputWithZeroNovelty: MirrorDecisionInput = {
      ...perfectInput(),
      observationNovelty: 0,
    };
    expect(computeERV(inputWithoutNovelty)).toBeCloseTo(computeERV(inputWithZeroNovelty), 10);
  });

  it("novelty NaN / Infinity / 範囲外 → 0 扱い", () => {
    const baseERV = computeERV({ ...perfectInput(), observationNovelty: 0 });
    for (const v of [NaN, Infinity, -Infinity, -0.1, 1.1, 100]) {
      const erv = computeERV({ ...perfectInput(), observationNovelty: v });
      expect(erv).toBeCloseTo(baseERV, 10);
    }
  });

  it("novelty 型外 (string / object / bool) → 0 扱い", () => {
    const baseERV = computeERV({ ...perfectInput(), observationNovelty: 0 });
    const cases: Array<unknown> = ["0.5", true, false, {}, []];
    for (const v of cases) {
      const erv = computeERV({
        ...perfectInput(),
        observationNovelty: v as unknown as number,
      });
      expect(erv).toBeCloseTo(baseERV, 10);
    }
  });

  it("uncertainty unknown → max risk (1) 扱い → ERV 大幅低下", () => {
    const known: MirrorDecisionInput = {
      ...perfectInput(),
      uncertainty: { status: "known", bucket: "low_0_to_30", raw: 0, canProceedToMirrorDecision: true },
    };
    const unknown: MirrorDecisionInput = {
      ...perfectInput(),
      uncertainty: { status: "unknown", bucket: "unknown", raw: null, canProceedToMirrorDecision: false },
    };
    expect(computeERV(known)).toBeGreaterThan(computeERV(unknown));
  });

  it("silenceBudget unknown → max consumed (1) 扱い → ERV 大幅低下", () => {
    const known: MirrorDecisionInput = {
      ...perfectInput(),
      silenceBudget: { status: "known", bucket: "low_0_to_30", raw: 0, canProceedToMirrorDecision: true },
    };
    const unknown: MirrorDecisionInput = {
      ...perfectInput(),
      silenceBudget: { status: "unknown", bucket: "unknown", raw: null, canProceedToMirrorDecision: false },
    };
    expect(computeERV(known)).toBeGreaterThan(computeERV(unknown));
  });

  it("modeContext unknown → travel cost 扱い (conservative)", () => {
    const normal = perfectInput();
    const unknownMode: MirrorDecisionInput = {
      ...perfectInput(),
      modeContext: { status: "unknown", mode: null, source: "missing", canProceedToMirrorDecision: false },
    };
    expect(computeERV(normal)).toBeGreaterThan(computeERV(unknownMode));

    // travel mode と unknown mode の autonomy cost は同じ
    const travel: MirrorDecisionInput = {
      ...perfectInput(),
      modeContext: { status: "known", mode: "travel", source: "presence_state", canProceedToMirrorDecision: true },
    };
    expect(computeERV(travel)).toBeCloseTo(computeERV(unknownMode), 10);
  });

  it("ruptureFlag null / undefined → 0 扱い (no penalty)", () => {
    const baseERV = computeERV({ ...perfectInput(), ruptureFlag: false });
    for (const v of [null, undefined]) {
      const erv = computeERV({ ...perfectInput(), ruptureFlag: v });
      expect(erv).toBeCloseTo(baseERV, 10);
    }
  });
});

describe("B-4c computeERV — formula weight invariants", () => {
  it("ΔU weight 合計 === 1.0 (novelty + alignment + confidence)", () => {
    const total = ERV_NOVELTY_WEIGHT + ERV_ALIGNMENT_WEIGHT + ERV_CONFIDENCE_WEIGHT;
    expect(total).toBeCloseTo(1.0, 10);
  });

  it("ERV_AUTONOMY_COST_TRAVEL > ERV_AUTONOMY_COST_BASE (travel コストが高い)", () => {
    expect(ERV_AUTONOMY_COST_TRAVEL).toBeGreaterThan(ERV_AUTONOMY_COST_BASE);
  });

  it("全 weight / margin が finite + 非負", () => {
    const weights = [
      ERV_NOVELTY_WEIGHT,
      ERV_ALIGNMENT_WEIGHT,
      ERV_CONFIDENCE_WEIGHT,
      ERV_ATTENTION_WEIGHT,
      ERV_AUTONOMY_COST_TRAVEL,
      ERV_AUTONOMY_COST_BASE,
      ERV_TRUST_WEIGHT,
      ERV_RUPTURE_PENALTY,
      ERV_SAFETY_MARGIN,
    ];
    for (const w of weights) {
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("B-4c computeERV — purity invariants", () => {
  it("input mutation 0 (3 回 call 後 input 不変)", () => {
    const input = perfectInput();
    const snapshot = JSON.stringify(input);
    computeERV(input);
    computeERV(input);
    computeERV(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("deterministic (同一入力 → 同一出力)", () => {
    const input = perfectInput();
    const r1 = computeERV(input);
    const r2 = computeERV(input);
    const r3 = computeERV(input);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  it("PII 非受理: extra fields は computation に影響しない (ERV 値が PII 値に依存しない)", () => {
    const baseERV = computeERV(perfectInput());

    const withPII = {
      ...perfectInput(),
      rawText: "leak",
      messageId: "msg_pii",
      userId: "user_pii",
      pairStateId: "pair_pii",
      sessionId: "session_pii",
    } as unknown as MirrorDecisionInput;
    const ervWithPII = computeERV(withPII);
    // ERV 値は PII 値の有無に関わらず同一
    expect(ervWithPII).toBeCloseTo(baseERV, 10);

    // 数値 PII (例: 過去の messageCount) を入れても影響しない
    const withNumericPII = {
      ...perfectInput(),
      messageCount: 9999,
      sessionDurationMs: 12345,
    } as unknown as MirrorDecisionInput;
    expect(computeERV(withNumericPII)).toBeCloseTo(baseERV, 10);
  });
});
