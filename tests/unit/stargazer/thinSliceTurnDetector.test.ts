/**
 * P1.5 Thin-Slice: Turn Detector 静的テスト
 *
 * assessTurnValue() が正しく critical / elevated / standard を判定するか検証。
 * GPT 最終条件: rollout 前に以下を確認
 *   - 追加12パターンが想定どおり elevated/critical になる
 *   - 通常の knowledge / emotional / judgment が誤爆しない
 */
import { describe, it, expect, vi } from "vitest";

// server-only / supabase / AI modules are server-side; stub them for unit tests
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({ runAI: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/stargazer/studentTrack", () => ({ makeStargazerRunMetadata: vi.fn(() => ({})) }));

import {
  assessTurnValue,
  _testPatterns,
  type TurnBudget,
} from "@/lib/stargazer/alterThinSlice";
import type { Reaction } from "@/lib/stargazer/alterHomeAdapter";

// ── helper ──
function assess(
  message: string,
  overrides: {
    responseMode?: "conclude" | "branch" | "clarify" | "direct_response" | "repair";
    questionType?: "emotional" | "self_understanding" | "knowledge" | "strategy" | "judgment";
    detectedReaction?: Reaction | null;
    conversationLength?: number;
  } = {},
) {
  return assessTurnValue(
    overrides.responseMode ?? "conclude",
    overrides.questionType ?? "judgment",
    overrides.detectedReaction ?? null,
    message,
    overrides.conversationLength ?? 1,
    null,
  );
}

function expectBudget(
  message: string,
  expected: TurnBudget,
  overrides: Parameters<typeof assess>[1] = {},
) {
  const result = assess(message, overrides);
  expect(result.budget).toBe(expected);
  if (expected === "standard") {
    expect(result.invoke_insight).toBe(false);
  } else {
    expect(result.invoke_insight).toBe(true);
  }
  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Critical: 最高知能予算
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("critical ターン判定", () => {
  it("repair mode → critical", () => {
    expectBudget("そういうことじゃない", "critical", { responseMode: "repair" });
  });

  it("protest: 押し付けないで → critical", () => {
    expectBudget("押し付けないでよ、決めつけてる", "critical");
  });

  it("protest: ずれてる → critical", () => {
    expectBudget("ずれてるよ、そういう話じゃない", "critical");
  });

  it("protest: 的外れ → critical", () => {
    expectBudget("全然的外れなんだけど", "critical");
  });

  it("protest: 聞いてない → critical", () => {
    expectBudget("そんなこと聞いてないんだけど", "critical");
  });

  it("delegation rejection: あなたに聞いてる → critical", () => {
    expectBudget("調べるんじゃなくて、あなたに聞いてるの", "critical");
  });

  it("delegation rejection: 君がやって → critical", () => {
    expectBudget("君がやってよ", "critical");
  });

  it("delegation rejection: 丸投げ → critical", () => {
    expectBudget("それ丸投げじゃない？", "critical");
  });

  it("deep co-think: self_understanding + 4ターン → critical", () => {
    expectBudget("結局自分が何をしたいのかわからなくなってきた", "critical", {
      questionType: "self_understanding",
      conversationLength: 4,
    });
  });

  it("existential: 人生 → critical", () => {
    expectBudget("人生で本当に大事なものって何だと思う？", "critical");
  });

  it("existential: 本質 → critical", () => {
    expectBudget("仕事の本質ってなんだろう", "critical");
  });

  it("existential: 自分が何者 → critical", () => {
    expectBudget("自分って何者なんだろう", "critical");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Elevated: 追加知能あり
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("elevated ターン判定", () => {
  it("co-think insistence: 一緒に考えて → elevated", () => {
    expectBudget("わからないから一緒に考えてほしい", "elevated");
  });

  it("co-think insistence: 二人で → elevated", () => {
    expectBudget("二人で考えようよ", "elevated");
  });

  it("direct demand: 具体的に聞いてる → elevated", () => {
    expectBudget("具体的に聞いてるんだけど、ふわっとしすぎ", "elevated");
  });

  it("direct demand: 答えになってない → elevated", () => {
    expectBudget("それ答えになってないよ", "elevated");
  });

  it("direct demand: 抽象的すぎ → elevated", () => {
    expectBudget("抽象的すぎてわからん", "elevated");
  });

  it("self_understanding: 自分がよくわからない → elevated", () => {
    expectBudget("最近、自分のことがよくわからない", "elevated", {
      questionType: "self_understanding",
    });
  });

  it("disagree recovery → elevated", () => {
    expectBudget("うーん、ちょっと違うかも", "elevated", {
      detectedReaction: { type: "disagree", disagree_strength: "weak", confidence: 0.8 },
    });
  });

  it("deep judgment: 3ターン + judgment → elevated", () => {
    expectBudget("それで、どうしたらいいと思う？", "elevated", {
      questionType: "judgment",
      conversationLength: 3,
    });
  });

  it("core-drive: 価値観 → elevated", () => {
    expectBudget("自分の価値観ってなんだろう", "elevated");
  });

  it("core-drive: 譲れないもの → elevated", () => {
    expectBudget("自分が本当に譲れないものって何だろう", "elevated");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Standard: 誤爆しないこと
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("standard ターン（誤爆なし）", () => {
  it("通常 judgment: 飲み会行くべき → standard", () => {
    expectBudget("飲み会行くべきかな", "standard");
  });

  it("knowledge: 企業の特徴 → standard", () => {
    expectBudget("この企業の特徴教えて", "standard", { questionType: "knowledge" });
  });

  it("emotional: 疲れた → standard", () => {
    expectBudget("もう疲れた", "standard", { questionType: "emotional" });
  });

  it("agree + deepen → standard (reaction は elevated だが deepen は reaction 経由)", () => {
    // deepen は detectedReaction ではないので standard
    // (detectedReaction が deepen の場合は agree/deepen reaction で、turn detector とは別)
    expectBudget("そうそう、まさにそれ。もっと聞かせて", "standard");
  });

  it("simple greeting → standard", () => {
    expectBudget("おはよう", "standard");
  });

  it("短い同意 → standard", () => {
    expectBudget("なるほどね", "standard");
  });

  it("strategy 質問 → standard", () => {
    expectBudget("面接はどう攻めればいい？", "standard", { questionType: "strategy" });
  });

  it("concrete direct request → standard (short, not demand pattern)", () => {
    expectBudget("おすすめの本教えて", "standard", { questionType: "knowledge" });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Regex パターン単体チェック（誤爆しないこと）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("regex パターン誤爆チェック", () => {
  const { CO_THINK_INSISTENCE, PROTEST_PATTERNS, DIRECT_DEMAND_PATTERNS, DELEGATION_REJECTION } = _testPatterns;

  it("co-think: 普通の文に誤爆しない", () => {
    expect(CO_THINK_INSISTENCE.test("今日は天気がいいね")).toBe(false);
    expect(CO_THINK_INSISTENCE.test("ランチどこ行こう")).toBe(false);
    expect(CO_THINK_INSISTENCE.test("飲み会行くべき？")).toBe(false);
  });

  it("protest: 普通の文に誤爆しない", () => {
    expect(PROTEST_PATTERNS.test("転職について考えてる")).toBe(false);
    expect(PROTEST_PATTERNS.test("給料が上がらない")).toBe(false);
    expect(PROTEST_PATTERNS.test("最近忙しい")).toBe(false);
  });

  it("direct demand: 普通の質問に誤爆しない", () => {
    expect(DIRECT_DEMAND_PATTERNS.test("どんな仕事が向いてるかな")).toBe(false);
    expect(DIRECT_DEMAND_PATTERNS.test("友達と喧嘩した")).toBe(false);
    expect(DIRECT_DEMAND_PATTERNS.test("来週の予定どうしよう")).toBe(false);
  });

  it("delegation rejection: 普通の文に誤爆しない", () => {
    expect(DELEGATION_REJECTION.test("今日は何もしたくない")).toBe(false);
    expect(DELEGATION_REJECTION.test("仕事の調子が悪い")).toBe(false);
    expect(DELEGATION_REJECTION.test("彼女に意見を言いたい")).toBe(false);
  });
});
