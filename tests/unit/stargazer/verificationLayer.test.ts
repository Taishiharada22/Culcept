/**
 * Verification Layer (P1) Tests
 *
 * HDM v1 検証層の4機構をテスト:
 * 1. Rupture Detection — 断裂の検出
 * 2. Abstention — 「分からない」の第一級化
 * 3. Prediction Crash Alert — 予測暴落
 * 4. Negative Capability — 不確実性保持
 */
import { vi, describe, it, expect } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: {} }));

import {
  detectRupture,
  type RuptureDetectionInput,
} from "@/lib/stargazer/ruptureDetection";

import {
  evaluateAbstention,
  type AbstentionInput,
} from "@/lib/stargazer/abstentionEngine";

import {
  evaluateNegativeCapability,
  type NegativeCapabilityInput,
} from "@/lib/stargazer/negativeCapability";

import type { QuestionType, ResponseMode } from "@/lib/stargazer/alterHomeAdapter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Rupture Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectRupture()", () => {
  const baseInput: RuptureDetectionInput = {
    recentMessages: [
      { role: "assistant", content: "最初の話題について話そう" },
      { role: "user", content: "最近ちょっと悩んでることがあって" },
      { role: "assistant", content: "君の中に矛盾が見えるよ" },
      { role: "user", content: "そうだね" },
      { role: "assistant", content: "もう少し深く話してみよう" },
      { role: "user", content: "うん" },
    ],
    turnSignal: null,
    rallyCritic: null,
    recentFeedbacks: [],
  };

  it("短い同意メッセージ + neutral streak + ignoring → withdrawal 検出", () => {
    // 注意: session opening ガード (recentMessages.length < 6) を超える6メッセージ
    // + compliance_word ("うん") + neutral streak + ignoring で閾値超え
    const result = detectRupture({
      ...baseInput,
      recentFeedbacks: ["ignoring", "neutral"],
    });
    expect(result.type).toBe("withdrawal");
    expect(result.severity).toBeGreaterThan(0);
    expect(result.repairStrategy).not.toBeNull();
    expect(result.triggers.length).toBeGreaterThan(0);
  });

  it("短くてもエンゲージメントのあるメッセージは withdrawal にならない", () => {
    const result = detectRupture({
      recentMessages: [
        { role: "assistant", content: "最初の話題について話そう" },
        { role: "user", content: "仕事どうしよう" },
        { role: "assistant", content: "もう少し教えて" },
        { role: "user", content: "起業したい" },
        { role: "assistant", content: "それは面白いね" },
        { role: "user", content: "何がいい？" },
      ],
      turnSignal: null,
      rallyCritic: null,
      recentFeedbacks: ["neutral", "neutral"],
    });
    // 短文だが質問・意思表明 → engaged → consecutive_short_messages が発火しない
    expect(result.type).toBe("none");
  });

  it("user_disengaging + ignoring → withdrawal (高 severity)", () => {
    const result = detectRupture({
      ...baseInput,
      rallyCritic: {
        status: "user_disengaging",
        depth: 0.1,
        turn_count: 5,
        same_theme_streak: 3,
        recommendation: "test",
        loop_detected: false,
      },
      recentFeedbacks: ["ignoring"],
    });
    expect(result.type).toBe("withdrawal");
    expect(result.severity).toBeGreaterThanOrEqual(0.6);
    expect(result.promptBlock).toContain("引きこもり型断裂");
  });

  it("correction + challenge_alter → confrontation 検出", () => {
    const result = detectRupture({
      recentMessages: [
        { role: "assistant", content: "君は本当はこう思っている" },
        { role: "user", content: "全然違う。わかってないよ" },
      ],
      turnSignal: {
        intent: "challenge_alter",
        explicit: [],
        implicit: [],
        feedback_on_last_turn: "correction",
        emotional_temperature: 0.8,
        urgency: 0.5,
        question_type: null as unknown as QuestionType,
        response_mode: null as unknown as ResponseMode,
        reaction: null,
      },
      rallyCritic: null,
      recentFeedbacks: ["correction"],
    });
    expect(result.type).toBe("confrontation");
    expect(result.repairStrategy).toBe("acknowledge_error");
    expect(result.promptBlock).toContain("対立型断裂");
    expect(result.promptBlock).toContain("間違えたかもしれない");
  });

  it("会話が短すぎる場合は検出しない", () => {
    const result = detectRupture({
      recentMessages: [{ role: "user", content: "うん" }],
      turnSignal: null,
      rallyCritic: null,
      recentFeedbacks: [],
    });
    expect(result.type).toBe("none");
  });

  it("正常な会話では rupture なし", () => {
    const result = detectRupture({
      recentMessages: [
        { role: "assistant", content: "どう思う？" },
        { role: "user", content: "それは面白い視点だね。確かにそういう面もあるかもしれない。でも私は別の角度から考えていて..." },
      ],
      turnSignal: {
        intent: "co_think_request",
        explicit: [],
        implicit: [],
        feedback_on_last_turn: "building_on",
        emotional_temperature: 0.5,
        urgency: 0.3,
        question_type: null as unknown as QuestionType,
        response_mode: null as unknown as ResponseMode,
        reaction: null,
      },
      rallyCritic: { status: "advancing", depth: 0.6, turn_count: 3, same_theme_streak: 1, recommendation: "", loop_detected: false },
      recentFeedbacks: ["building_on"],
    });
    expect(result.type).toBe("none");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Abstention
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("evaluateAbstention()", () => {
  const baseInput: AbstentionInput = {
    observationDepth: 50,
    sessionCount: 10,
    trustLevel: 2,
    topicAccuracy: 0.6,
    hasConflictingHypotheses: false,
    questionType: null,
    psychologicalCapacity: 0.7,
  };

  it("十分な観測 + 正常な精度 → abstention しない", () => {
    const result = evaluateAbstention(baseInput);
    expect(result.shouldAbstain).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("観測不足 + 少ないセッション → abstention (insufficient_observation)", () => {
    const result = evaluateAbstention({
      ...baseInput,
      observationDepth: 10,
      sessionCount: 2,
    });
    expect(result.shouldAbstain).toBe(true);
    expect(result.reason).toBe("insufficient_observation");
    expect(result.promptBlock).toContain("観測深度注意");
  });

  it("矛盾する仮説 → abstention (conflicting_evidence)", () => {
    const result = evaluateAbstention({
      ...baseInput,
      hasConflictingHypotheses: true,
    });
    expect(result.shouldAbstain).toBe(true);
    expect(result.reason).toBe("conflicting_evidence");
  });

  it("領域外の質問 → abstention (out_of_scope)", () => {
    const result = evaluateAbstention({
      ...baseInput,
      questionType: "factual_recall",
    });
    expect(result.shouldAbstain).toBe(true);
    expect(result.reason).toBe("out_of_scope");
  });

  it("低精度トピック → abstention", () => {
    const result = evaluateAbstention({
      ...baseInput,
      topicAccuracy: 0.15,
    });
    expect(result.shouldAbstain).toBe(true);
    expect(result.reason).toBe("low_confidence_topic");
  });

  it("心理的容量が低い + Trust < 3 → dignity_risk", () => {
    const result = evaluateAbstention({
      ...baseInput,
      psychologicalCapacity: 0.2,
      trustLevel: 1,
    });
    expect(result.shouldAbstain).toBe(true);
    expect(result.reason).toBe("dignity_risk");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Prediction Crash & 4. Negative Capability
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("evaluateNegativeCapability()", () => {
  const baseInput: NegativeCapabilityInput = {
    overallPredictionRate: 0.55,
    predictionTrend: "stable",
    categoryAccuracies: [],
    recentMissStreak: 0,
    avgHypothesisStaleness: 5,
    highConfidenceRatio: 0.3,
    sessionCount: 15,
  };

  it("正常状態 → 全て none", () => {
    const result = evaluateNegativeCapability(baseInput);
    expect(result.crash.severity).toBe("none");
    expect(result.overfit.severity).toBe("none");
    expect(result.hypothesisShakeNeeded).toBe(false);
    expect(result.promptBlock).toBeNull();
  });

  it("精度暴落 (critical) → Phase 降格 + 緊急プロンプト", () => {
    const result = evaluateNegativeCapability({
      ...baseInput,
      overallPredictionRate: 0.15,
      predictionTrend: "declining",
      recentMissStreak: 6,
    });
    expect(result.crash.severity).toBe("critical");
    expect(result.crash.phaseDemotion).toBe(true);
    expect(result.promptBlock).toContain("予測精度暴落アラート");
  });

  it("精度低下 (warning) → 注意プロンプト", () => {
    const result = evaluateNegativeCapability({
      ...baseInput,
      overallPredictionRate: 0.3,
      predictionTrend: "declining",
    });
    expect(result.crash.severity).toBe("warning");
    expect(result.crash.phaseDemotion).toBe(false);
    expect(result.promptBlock).toContain("予測精度低下注意");
  });

  it("連続外し → warning", () => {
    const result = evaluateNegativeCapability({
      ...baseInput,
      recentMissStreak: 4,
    });
    expect(result.crash.severity).toBe("warning");
  });

  it("高すぎる精度 → overfitting 警戒", () => {
    const result = evaluateNegativeCapability({
      ...baseInput,
      overallPredictionRate: 0.9,
      highConfidenceRatio: 0.85,
    });
    expect(result.overfit.severity).toBe("warning");
    expect(result.promptBlock).toContain("過学習警戒");
  });

  it("少ないセッションでは overfitting 判定しない", () => {
    const result = evaluateNegativeCapability({
      ...baseInput,
      overallPredictionRate: 0.95,
      highConfidenceRatio: 0.9,
      sessionCount: 5,
    });
    expect(result.overfit.severity).toBe("none");
  });

  it("古い仮説 + 高確信度 → 揺さぶり推奨", () => {
    const result = evaluateNegativeCapability({
      ...baseInput,
      avgHypothesisStaleness: 20,
      highConfidenceRatio: 0.7,
    });
    expect(result.hypothesisShakeNeeded).toBe(true);
    expect(result.promptBlock).toContain("仮説再検証推奨");
  });

  it("低精度カテゴリ → 不確実ドメイン検出", () => {
    const result = evaluateNegativeCapability({
      ...baseInput,
      categoryAccuracies: [
        { category: "relationship", rate: 0.2, attempts: 5 },
        { category: "career", rate: 0.6, attempts: 10 },
        { category: "emotion", rate: 0.15, attempts: 4 },
      ],
    });
    expect(result.uncertainDomains).toContain("relationship");
    expect(result.uncertainDomains).toContain("emotion");
    expect(result.uncertainDomains).not.toContain("career");
  });
});
