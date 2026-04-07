/**
 * P1.5 Verification Constraints Tests
 *
 * P1 は prompt-injection のみだった。
 * P1.5 はこれらを構造的制約に昇格させる。
 * このテストは「制約が実際にパイプライン変数を書き換えること」を固定する。
 */
import { describe, it, expect } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: {} }));

import {
  computeVerificationConstraints,
  applyClaimStrengthCap,
  buildHedgingPromptBlock,
  computeHypothesisStats,
  type P15VerificationConstraints,
} from "@/lib/stargazer/verificationConstraints";
import type { RuptureAssessment } from "@/lib/stargazer/ruptureDetection";
import type { AbstentionSignal } from "@/lib/stargazer/abstentionEngine";
import type { NegativeCapabilityState } from "@/lib/stargazer/negativeCapability";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const noRupture: RuptureAssessment = {
  type: "none",
  severity: 0,
  confidence: 0,
  triggers: [],
  repairStrategy: null,
  phaseDemotion: false,
  promptBlock: null,
};

const noAbstention: AbstentionSignal = {
  shouldAbstain: false,
  reason: null,
  confidence: 0,
  promptBlock: null,
};

const noNegCap: NegativeCapabilityState = {
  crash: { severity: "none", currentRate: 0.5, trend: "stable", phaseDemotion: false, promptBlock: null },
  overfit: { severity: "none", currentRate: 0.5, promptBlock: null },
  hypothesisShakeNeeded: false,
  uncertainDomains: [],
  promptBlock: null,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 全て正常 → 制約なし
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeVerificationConstraints()", () => {
  it("全て正常 → 制約なし", () => {
    const result = computeVerificationConstraints(noRupture, noAbstention, noNegCap);
    expect(result.claimStrengthCap).toBeNull();
    expect(result.forcedResponseMode).toBeNull();
    expect(result.hedgingRequired).toBe(false);
    expect(result.phaseDemotionRequested).toBe(false);
    expect(result.activeConstraints).toHaveLength(0);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. P1.5-1: Abstention → 構造的制約
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("P1.5-1: Abstention", () => {
    it("insufficient_observation → claim cap = probe + hedging", () => {
      const abstention: AbstentionSignal = {
        shouldAbstain: true,
        reason: "insufficient_observation",
        confidence: 0.7,
        promptBlock: "...",
      };
      const result = computeVerificationConstraints(noRupture, abstention, noNegCap);
      expect(result.claimStrengthCap).toBe("probe");
      expect(result.hedgingRequired).toBe(true);
      expect(result.forcedResponseMode).toBeNull(); // mode は変えない
    });

    it("conflicting_evidence → claim cap = probe + mode = branch", () => {
      const abstention: AbstentionSignal = {
        shouldAbstain: true,
        reason: "conflicting_evidence",
        confidence: 0.7,
        promptBlock: "...",
      };
      const result = computeVerificationConstraints(noRupture, abstention, noNegCap);
      expect(result.claimStrengthCap).toBe("probe");
      expect(result.forcedResponseMode).toBe("branch");
      expect(result.modeOverrideReason).toBe("abstention_conflicting_evidence");
    });

    it("out_of_scope → claim cap = hold (最も厳しい)", () => {
      const abstention: AbstentionSignal = {
        shouldAbstain: true,
        reason: "out_of_scope",
        confidence: 0.8,
        promptBlock: "...",
      };
      const result = computeVerificationConstraints(noRupture, abstention, noNegCap);
      expect(result.claimStrengthCap).toBe("hold");
    });

    it("dignity_risk → claim cap = hold + mode = direct_response", () => {
      const abstention: AbstentionSignal = {
        shouldAbstain: true,
        reason: "dignity_risk",
        confidence: 0.65,
        promptBlock: "...",
      };
      const result = computeVerificationConstraints(noRupture, abstention, noNegCap);
      expect(result.claimStrengthCap).toBe("hold");
      expect(result.forcedResponseMode).toBe("direct_response");
      expect(result.modeOverrideReason).toBe("abstention_dignity_risk");
    });

    it("shouldAbstain = false → 制約なし", () => {
      const result = computeVerificationConstraints(noRupture, noAbstention, noNegCap);
      expect(result.activeConstraints).toHaveLength(0);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. P1.5-2: Rupture → 構造的修復
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("P1.5-2: Rupture", () => {
    it("confrontation → mode = repair + claim = hold + hedging", () => {
      const rupture: RuptureAssessment = {
        type: "confrontation",
        severity: 0.7,
        confidence: 0.8,
        triggers: ["feedback_correction", "intent_challenge_alter"],
        repairStrategy: "acknowledge_error",
        phaseDemotion: false,
        promptBlock: "...",
      };
      const result = computeVerificationConstraints(rupture, noAbstention, noNegCap);
      expect(result.forcedResponseMode).toBe("repair");
      expect(result.modeOverrideReason).toBe("rupture_confrontation");
      expect(result.claimStrengthCap).toBe("hold");
      expect(result.hedgingRequired).toBe(true);
    });

    it("withdrawal → mode = repair + claim = probe", () => {
      const rupture: RuptureAssessment = {
        type: "withdrawal",
        severity: 0.5,
        confidence: 0.6,
        triggers: ["consecutive_short_messages", "compliance_word"],
        repairStrategy: "hold_space",
        phaseDemotion: false,
        promptBlock: "...",
      };
      const result = computeVerificationConstraints(rupture, noAbstention, noNegCap);
      expect(result.forcedResponseMode).toBe("repair");
      expect(result.claimStrengthCap).toBe("probe");
    });

    it("高 severity rupture → phase demotion 要求", () => {
      const rupture: RuptureAssessment = {
        type: "withdrawal",
        severity: 0.8,
        confidence: 0.9,
        triggers: ["rally_user_disengaging", "feedback_ignoring", "emotional_flatness"],
        repairStrategy: "retreat_to_safety",
        phaseDemotion: true,
        promptBlock: "...",
      };
      const result = computeVerificationConstraints(rupture, noAbstention, noNegCap);
      expect(result.phaseDemotionRequested).toBe(true);
    });

    it("rupture は abstention の mode を上書きする（rupture 優先）", () => {
      const rupture: RuptureAssessment = {
        type: "confrontation",
        severity: 0.7,
        confidence: 0.8,
        triggers: ["feedback_correction"],
        repairStrategy: "acknowledge_error",
        phaseDemotion: false,
        promptBlock: "...",
      };
      const abstention: AbstentionSignal = {
        shouldAbstain: true,
        reason: "conflicting_evidence",
        confidence: 0.7,
        promptBlock: "...",
      };
      const result = computeVerificationConstraints(rupture, abstention, noNegCap);
      // rupture (repair) が abstention (branch) を上書き
      expect(result.forcedResponseMode).toBe("repair");
      // claim cap は合成される: abstention → probe, rupture confrontation → hold
      // hold < probe なので hold が勝つ
      expect(result.claimStrengthCap).toBe("hold");
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4. P1.5-3: Prediction Crash → confidence 低下
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("P1.5-3: Prediction Crash", () => {
    it("crash critical → claim = hold + hedging + phase demotion", () => {
      const negCap: NegativeCapabilityState = {
        ...noNegCap,
        crash: { severity: "critical", currentRate: 0.15, trend: "declining", phaseDemotion: true, promptBlock: "..." },
      };
      const result = computeVerificationConstraints(noRupture, noAbstention, negCap);
      expect(result.claimStrengthCap).toBe("hold");
      expect(result.hedgingRequired).toBe(true);
      expect(result.phaseDemotionRequested).toBe(true);
      expect(result.structuralPromptBlocks.length).toBeGreaterThan(0);
      expect(result.activeConstraints).toContain("crash:critical");
    });

    it("crash warning → claim = probe + hedging（phase demotion なし）", () => {
      const negCap: NegativeCapabilityState = {
        ...noNegCap,
        crash: { severity: "warning", currentRate: 0.3, trend: "declining", phaseDemotion: false, promptBlock: "..." },
      };
      const result = computeVerificationConstraints(noRupture, noAbstention, negCap);
      expect(result.claimStrengthCap).toBe("probe");
      expect(result.hedgingRequired).toBe(true);
      expect(result.phaseDemotionRequested).toBe(false);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 5. P1.5-4: Negative Capability → 断定抑制
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("P1.5-4: Negative Capability", () => {
    it("overfit warning → claim = lean_in + 構造的プロンプト", () => {
      const negCap: NegativeCapabilityState = {
        ...noNegCap,
        overfit: { severity: "warning", currentRate: 0.9, promptBlock: "..." },
      };
      const result = computeVerificationConstraints(noRupture, noAbstention, negCap);
      expect(result.claimStrengthCap).toBe("lean_in");
      expect(result.structuralPromptBlocks.some(b => b.includes("過学習警戒"))).toBe(true);
    });

    it("hypothesis shake → hedging + claim = lean_in", () => {
      const negCap: NegativeCapabilityState = {
        ...noNegCap,
        hypothesisShakeNeeded: true,
      };
      const result = computeVerificationConstraints(noRupture, noAbstention, negCap);
      expect(result.hedgingRequired).toBe(true);
      expect(result.claimStrengthCap).toBe("lean_in");
      expect(result.activeConstraints).toContain("hypothesis_shake");
    });

    it("uncertain domains → hedging（mode/claim は直接変えない）", () => {
      const negCap: NegativeCapabilityState = {
        ...noNegCap,
        uncertainDomains: ["relationship", "emotion"],
      };
      const result = computeVerificationConstraints(noRupture, noAbstention, negCap);
      expect(result.hedgingRequired).toBe(true);
      expect(result.activeConstraints.some(c => c.includes("uncertain_domains"))).toBe(true);
      // uncertain domains 単独では claim cap は設定されない
      expect(result.claimStrengthCap).toBeNull();
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 6. 複合シナリオ: 複数制約の合成
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("複合シナリオ", () => {
    it("abstention + crash warning → より厳しい cap が勝つ", () => {
      const abstention: AbstentionSignal = {
        shouldAbstain: true,
        reason: "low_confidence_topic", // → probe
        confidence: 0.6,
        promptBlock: "...",
      };
      const negCap: NegativeCapabilityState = {
        ...noNegCap,
        crash: { severity: "warning", currentRate: 0.3, trend: "declining", phaseDemotion: false, promptBlock: "..." },
        // crash warning → probe
      };
      const result = computeVerificationConstraints(noRupture, abstention, negCap);
      // 両方 probe なので probe
      expect(result.claimStrengthCap).toBe("probe");
      expect(result.activeConstraints).toHaveLength(2);
    });

    it("rupture + crash critical → hold + repair + phase demotion", () => {
      const rupture: RuptureAssessment = {
        type: "withdrawal",
        severity: 0.8,
        confidence: 0.9,
        triggers: ["rally_user_disengaging"],
        repairStrategy: "retreat_to_safety",
        phaseDemotion: true,
        promptBlock: "...",
      };
      const negCap: NegativeCapabilityState = {
        ...noNegCap,
        crash: { severity: "critical", currentRate: 0.1, trend: "declining", phaseDemotion: true, promptBlock: "..." },
      };
      const result = computeVerificationConstraints(rupture, noAbstention, negCap);
      expect(result.forcedResponseMode).toBe("repair");
      expect(result.claimStrengthCap).toBe("hold"); // crash critical → hold が withdrawal probe より厳しい
      expect(result.phaseDemotionRequested).toBe(true);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// applyClaimStrengthCap
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyClaimStrengthCap()", () => {
  it("cap = null → 変更なし", () => {
    expect(applyClaimStrengthCap("assert", null)).toBe("assert");
  });

  it("assert + cap=probe → probe に降格", () => {
    expect(applyClaimStrengthCap("assert", "probe")).toBe("probe");
  });

  it("probe + cap=assert → 変更なし（cap の方が緩い）", () => {
    expect(applyClaimStrengthCap("probe", "assert")).toBe("probe");
  });

  it("lean_in + cap=hold → hold に降格", () => {
    expect(applyClaimStrengthCap("lean_in", "hold")).toBe("hold");
  });

  it("hold + cap=hold → 変更なし", () => {
    expect(applyClaimStrengthCap("hold", "hold")).toBe("hold");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildHedgingPromptBlock
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildHedgingPromptBlock()", () => {
  it("hedgingRequired = false → null", () => {
    const constraints = computeVerificationConstraints(noRupture, noAbstention, noNegCap);
    expect(buildHedgingPromptBlock(constraints)).toBeNull();
  });

  it("hedgingRequired = true → 断定語禁止のブロックを返す", () => {
    const abstention: AbstentionSignal = {
      shouldAbstain: true,
      reason: "insufficient_observation",
      confidence: 0.7,
      promptBlock: "...",
    };
    const constraints = computeVerificationConstraints(noRupture, abstention, noNegCap);
    const block = buildHedgingPromptBlock(constraints);
    expect(block).not.toBeNull();
    expect(block).toContain("ヘッジング必須");
    expect(block).toContain("断定語を使わない");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// computeHypothesisStats
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeHypothesisStats()", () => {
  it("null → デフォルト値", () => {
    const stats = computeHypothesisStats(null);
    expect(stats.highConfidenceRatio).toBe(0);
    expect(stats.hasConflictingHypotheses).toBe(false);
    expect(stats.avgStaleness).toBe(0);
  });

  it("空配列 → デフォルト値", () => {
    const stats = computeHypothesisStats([]);
    expect(stats.highConfidenceRatio).toBe(0);
    expect(stats.hasConflictingHypotheses).toBe(false);
  });

  it("高確信仮説の割合を正しく計算", () => {
    const stats = computeHypothesisStats([
      { confidence: 0.9, status: "stable" },
      { confidence: 0.85, status: "stable" },
      { confidence: 0.5, status: "strengthening" },
      { confidence: 0.3, status: "emerging" },
    ]);
    // 2/4 = 0.5
    expect(stats.highConfidenceRatio).toBe(0.5);
  });

  it("weakening status → hasConflictingHypotheses = true", () => {
    const stats = computeHypothesisStats([
      { confidence: 0.5, status: "weakening" },
      { confidence: 0.7, status: "stable" },
    ]);
    expect(stats.hasConflictingHypotheses).toBe(true);
  });

  it("contradiction_count > 0 → hasConflictingHypotheses = true", () => {
    const stats = computeHypothesisStats([
      { confidence: 0.7, status: "stable", contradiction_count: 2 },
    ]);
    expect(stats.hasConflictingHypotheses).toBe(true);
  });

  it("全て stable + contradiction_count = 0 → hasConflictingHypotheses = false", () => {
    const stats = computeHypothesisStats([
      { confidence: 0.7, status: "stable", contradiction_count: 0 },
      { confidence: 0.6, status: "strengthening", contradiction_count: 0 },
    ]);
    expect(stats.hasConflictingHypotheses).toBe(false);
  });

  it("updated_at から staleness を計算", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const stats = computeHypothesisStats([
      { confidence: 0.7, status: "stable", updated_at: twoDaysAgo },
    ]);
    // 約2日
    expect(stats.avgStaleness).toBeGreaterThanOrEqual(1.9);
    expect(stats.avgStaleness).toBeLessThanOrEqual(2.1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P1.5 制約優先順位監査（CEO 最終確認 — 2026-04-07）
//
// 合成ルール:
//   1. claimStrengthCap: 常に「より厳しい方」が残る（単調降格合成）
//      hold < probe < lean_in < assert の順。
//      capDown(current, new) = min(current, new)
//
//   2. forcedResponseMode: 後勝ち。評価順は abstention → rupture → (crash/negcap は mode を変えない)
//      → rupture が検出されれば必ず repair が最終値になる。
//      → abstention は rupture がなければ branch or direct_response を設定可能。
//
//   3. phaseDemotionRequested: OR 合成。どれか1つでも true なら true。
//
//   4. hedgingRequired: OR 合成。どれか1つでも true なら true。
//
//   5. structuralPromptBlocks: 全て加算。衝突しない（各ブロックは独立した指示）。
//
//   6. tone（warm/provocative/analytical）: P1.5 のスコープ外。
//      hedgingRequired が間接的に tone を制約する（断定語禁止 → provocative の鋭さが鈍る）。
//      直接的な tone 制御は P2（Phase/Trust 制御）で行う。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P1.5 制約優先順位監査", () => {

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ケースA: rupture(confrontation) + abstention(conflicting_evidence)
  //
  // 期待:
  //   mode = repair（rupture が abstention の branch を上書き）
  //   claimStrengthCap = hold（confrontation=hold が conflicting=probe より厳しい）
  //   hedging = true（両方が要求）
  //   phaseDemotion = false（severity が閾値未満）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("ケースA: rupture(confrontation) + abstention(conflicting_evidence)", () => {
    const rupture: RuptureAssessment = {
      type: "confrontation",
      severity: 0.65,
      confidence: 0.75,
      triggers: ["feedback_correction", "intent_challenge_alter", "confrontation_keyword"],
      repairStrategy: "acknowledge_error",
      phaseDemotion: false, // severity < 0.7
      promptBlock: "...",
    };
    const abstention: AbstentionSignal = {
      shouldAbstain: true,
      reason: "conflicting_evidence",
      confidence: 0.7,
      promptBlock: "...",
    };

    const result = computeVerificationConstraints(rupture, abstention, noNegCap);

    // mode: abstention が branch を設定 → rupture が repair で上書き
    expect(result.forcedResponseMode).toBe("repair");
    expect(result.modeOverrideReason).toBe("rupture_confrontation");

    // claim cap: abstention → probe, rupture confrontation → hold
    // hold(0) < probe(1) なので hold が最終値
    expect(result.claimStrengthCap).toBe("hold");

    // hedging: abstention=true, rupture=true → true
    expect(result.hedgingRequired).toBe(true);

    // phase demotion: rupture.phaseDemotion=false → false
    expect(result.phaseDemotionRequested).toBe(false);

    // 両方の制約が記録される
    expect(result.activeConstraints).toContain("abstention:conflicting_evidence");
    expect(result.activeConstraints.some(c => c.startsWith("rupture:confrontation"))).toBe(true);
    expect(result.activeConstraints).toHaveLength(2);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ケースB: predictionCrash(critical) + negativeCapability(overfit)
  //
  // 期待:
  //   mode = null（crash/overfit は mode を変えない。mode はパイプラインの既存選択が残る）
  //   claimStrengthCap = hold（crash critical=hold が overfit=lean_in より厳しい）
  //   hedging = true
  //   phaseDemotion = true（crash critical が要求）
  //   structuralPromptBlocks = 2件（crash + overfit）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("ケースB: predictionCrash(critical) + negativeCapability(overfit)", () => {
    const negCap: NegativeCapabilityState = {
      crash: {
        severity: "critical",
        currentRate: 0.12,
        trend: "declining",
        phaseDemotion: true,
        promptBlock: "...",
      },
      overfit: {
        severity: "warning",
        currentRate: 0.12, // crash と overfit が同時に来るのは稀だが、テストとして
        promptBlock: "...",
      },
      hypothesisShakeNeeded: false,
      uncertainDomains: [],
      promptBlock: "...",
    };

    const result = computeVerificationConstraints(noRupture, noAbstention, negCap);

    // mode: crash も overfit も mode を強制しない
    expect(result.forcedResponseMode).toBeNull();

    // claim cap: crash critical → hold, overfit → lean_in
    // hold(0) < lean_in(2) なので hold が最終値
    expect(result.claimStrengthCap).toBe("hold");

    // hedging: crash critical = true
    expect(result.hedgingRequired).toBe(true);

    // phase demotion: crash critical = true
    expect(result.phaseDemotionRequested).toBe(true);

    // 構造的プロンプト: crash + overfit = 2件
    expect(result.structuralPromptBlocks).toHaveLength(2);
    expect(result.structuralPromptBlocks.some(b => b.includes("予測精度 critical"))).toBe(true);
    expect(result.structuralPromptBlocks.some(b => b.includes("過学習警戒"))).toBe(true);

    // 両方の制約が記録される
    expect(result.activeConstraints).toContain("crash:critical");
    expect(result.activeConstraints).toContain("overfit:warning");
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ケースC: 全制約同時発火（最悪ケース）
  //
  // rupture(confrontation, high severity)
  // + abstention(dignity_risk)
  // + crash(critical)
  // + overfit(warning)
  // + hypothesis_shake
  // + uncertain_domains
  //
  // 最終状態:
  //   mode = repair（rupture が全てを上書き）
  //   claimStrengthCap = hold（最も厳しい制約が残る）
  //   hedging = true
  //   phaseDemotion = true（rupture + crash の両方が要求）
  //   structuralPromptBlocks ≥ 2（crash + overfit）
  //   activeConstraints = 6件
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("ケースC: 全制約同時発火 → 各軸の最終値を検証", () => {
    const rupture: RuptureAssessment = {
      type: "confrontation",
      severity: 0.85,
      confidence: 0.9,
      triggers: ["feedback_correction", "intent_challenge_alter", "confrontation_keyword", "high_emotional_temperature"],
      repairStrategy: "acknowledge_error",
      phaseDemotion: true,
      promptBlock: "...",
    };
    const abstention: AbstentionSignal = {
      shouldAbstain: true,
      reason: "dignity_risk",
      confidence: 0.65,
      promptBlock: "...",
    };
    const negCap: NegativeCapabilityState = {
      crash: {
        severity: "critical",
        currentRate: 0.1,
        trend: "declining",
        phaseDemotion: true,
        promptBlock: "...",
      },
      overfit: {
        severity: "warning",
        currentRate: 0.1,
        promptBlock: "...",
      },
      hypothesisShakeNeeded: true,
      uncertainDomains: ["relationship", "career"],
      promptBlock: "...",
    };

    const result = computeVerificationConstraints(rupture, abstention, negCap);

    // ── 最終 mode ──
    // abstention(dignity_risk) → direct_response
    // rupture(confrontation) → repair（上書き）
    // crash/overfit → mode 変更なし
    // 最終値: repair
    expect(result.forcedResponseMode).toBe("repair");
    expect(result.modeOverrideReason).toBe("rupture_confrontation");

    // ── 最終 claimStrengthCap ──
    // abstention(dignity_risk) → hold
    // rupture(confrontation) → capDown(hold, hold) = hold
    // crash(critical) → capDown(hold, hold) = hold
    // overfit(warning) → capDown(hold, lean_in) = hold（hold は lean_in より厳しい）
    // hypothesis_shake → capDown(hold, lean_in) = hold
    // 最終値: hold
    expect(result.claimStrengthCap).toBe("hold");

    // ── hedging ──
    // abstention=true, rupture=true, crash=true, shake=true, uncertain=true
    // OR 合成: true
    expect(result.hedgingRequired).toBe(true);

    // ── phase demotion ──
    // rupture.phaseDemotion=true, crash→phaseDemotionRequested=true
    // OR 合成: true
    expect(result.phaseDemotionRequested).toBe(true);

    // ── structural prompt blocks ──
    // crash critical → 1件, overfit warning → 1件
    // (abstention, rupture, shake, uncertain は prompt block を直接追加しない)
    expect(result.structuralPromptBlocks).toHaveLength(2);

    // ── activeConstraints: 全6件 ──
    expect(result.activeConstraints).toContain("abstention:dignity_risk");
    expect(result.activeConstraints.some(c => c.startsWith("rupture:confrontation"))).toBe(true);
    expect(result.activeConstraints).toContain("crash:critical");
    expect(result.activeConstraints).toContain("overfit:warning");
    expect(result.activeConstraints).toContain("hypothesis_shake");
    expect(result.activeConstraints.some(c => c.startsWith("uncertain_domains"))).toBe(true);
    expect(result.activeConstraints).toHaveLength(6);
  });
});
