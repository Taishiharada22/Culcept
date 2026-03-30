import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildAdaptiveQuestionAssetRow,
  buildAdaptiveQuestionKey,
} from "../../lib/stargazer/adaptiveQuestionPool";
import type { AdaptiveQuestion, Q1Context } from "../../lib/stargazer/adaptiveQ2";

function makeContext(overrides: Partial<Q1Context> = {}): Q1Context {
  return {
    questionText: "距離が縮まるペースは早い方が自然？ゆっくりの方が自然？",
    axisId: "intimacy_pace",
    selectedOptionLabel: "慎重に近づきたい",
    score: -0.6,
    options: [
      { label: "かなり慎重", score: -0.8 },
      { label: "少し慎重", score: -0.3 },
      { label: "少し早め", score: 0.3 },
      { label: "かなり早め", score: 0.8 },
    ],
    responseTimeMs: 6200,
    averageResponseTimeMs: 3400,
    answerChanged: true,
    previousAnswerLabel: "少し早め",
    sessionDepth: 1,
    ...overrides,
  };
}

function makeQuestion(overrides: Partial<AdaptiveQuestion> = {}): AdaptiveQuestion {
  return {
    prompt: "最初は踏み込みたくても、最終的に少し引く時は何が効いている？",
    options: [
      { label: "相手の反応が読めない時", score: -0.7 },
      { label: "空気を見て調整する時", score: -0.2 },
      { label: "安心材料があれば進む", score: 0.3 },
      { label: "直感が合えば迷わない", score: 0.7 },
    ],
    targetAxisId: "intimacy_pace",
    strategy: "answer_change_probe",
    sourceAiRunId: "ai-run-1",
    isFallback: false,
    qualityScore: 0.82,
    ...overrides,
  };
}

describe("adaptiveQuestionPool", () => {
  it("builds a stable pool key for the same adaptive question", () => {
    const q1 = makeContext();
    const question = makeQuestion();

    const keyA = buildAdaptiveQuestionKey({ q1Context: q1, question });
    const keyB = buildAdaptiveQuestionKey({ q1Context: q1, question });

    expect(keyA).toBe(keyB);
    expect(keyA.startsWith("pool_adaptive_q2_intimacy_pace_")).toBe(true);
  });

  it("maps adaptive question assets into question_pool rows", () => {
    const row = buildAdaptiveQuestionAssetRow({
      q1Context: makeContext(),
      question: makeQuestion(),
    });

    expect(row.question_key).toMatch(/^pool_adaptive_q2_intimacy_pace_/);
    expect(row.observation_layer).toBe("adaptive_q2");
    expect(row.axis_id).toBe("intimacy_pace");
    expect(row.source).toBe("ai");
    expect(row.ai_run_id).toBe("ai-run-1");
    expect(row.probe_type).toBe("unchosen");
    expect(row.depth_score).toBe(3);

    const variant = row.variant_json as Record<string, unknown>;
    expect(variant.prompt).toBe("最初は踏み込みたくても、最終的に少し引く時は何が効いている？");
    expect(variant.layer).toBe("adaptive_q2");

    const snapshot = row.context_snapshot as {
      adaptiveQ2?: Record<string, unknown>;
    };
    expect(snapshot.adaptiveQ2?.sourceAxisId).toBe("intimacy_pace");
    expect(snapshot.adaptiveQ2?.strategy).toBe("answer_change_probe");
    expect(snapshot.adaptiveQ2?.answerChanged).toBe(true);
  });
});
