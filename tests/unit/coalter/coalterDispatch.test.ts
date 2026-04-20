/**
 * CoAlter Phase 2 — coalterDispatch E2E (2026-04-19 v0.3 gate 6.C)
 *
 * CEO 6.C 実装固定条件 E2E 最低ライン 5 本:
 *  1. misread → clarify
 *  2. contradiction → negotiate
 *  3. negotiate proposals=0 → 次ターン decision (最優先短絡)
 *  4. emotion_heat mid → 質問 0 (tone.maxQuestion=0, trace.questionBudget=0)
 *  5. food はまだ decision fallback (G6 movie 先行)
 *
 * 固定する contract:
 *  - decision 非破壊: buildDecisionCard は gate 不通過 / theme 非 movie / decision 分岐で
 *    そのまま呼ばれ、返り値は mode="decision" を付けられるだけ
 *  - card.mode discriminated union が常に保たれる
 *  - gate 不通過時は trace=null、theme 非 movie 時でも trace は記録する
 */

import { describe, it, expect } from "vitest";

import {
  dispatchCoAlter,
  CONTRADICTION_EMPTY,
  MISREAD_NONE,
  EMOTION_HEAT_LOW,
  type CoAlterDispatchInput,
  type CoAlterDispatchMaterials,
} from "@/lib/coalter/coalterDispatch";
import type {
  ContradictionSignal,
  ConversationTurn,
  EmotionHeat,
  MisreadSignal,
  ModeRouterInput,
  PreRouterGateInput,
  ProposalCandidate,
  ProposalCard,
  StallSignal,
  ConversationTheme,
} from "@/lib/coalter/types";

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const A = "user_a";
const B = "user_b";
const NOW = new Date("2026-04-19T12:00:00.000Z");

const STALL_NONE: StallSignal = { detected: false, consecutiveTurns: 0 };

const GATE_OK: PreRouterGateInput = {
  consent: "active",
  emotionHeat: EMOTION_HEAT_LOW,
};

function turn(senderId: string, body: string, id?: string): ConversationTurn {
  return {
    id,
    senderId,
    body,
    createdAt: "2026-04-19T12:00:00.000Z",
  };
}

function makeProposalCard(): ProposalCard {
  return {
    summary: "映画3本を比較した。",
    priorities: { userA: "新しさ", userB: "安心感", common: "2人とも外したくない" },
    candidates: [
      {
        rank: 1,
        title: "作品A",
        oneLiner: "評価安定の新作",
        practicalInfo: "120分 / 19:00〜",
        url: "https://example.com/a",
      },
    ],
    reasoning: "2人とも外したくない傾向。",
    closing: "これで合うかは2人で決めてね。",
  };
}

let buildDecisionCallCount = 0;
function makeBuildDecisionCard(): () => Promise<ProposalCard> {
  buildDecisionCallCount = 0;
  return async () => {
    buildDecisionCallCount++;
    return makeProposalCard();
  };
}

function baseMaterials(
  over: Partial<CoAlterDispatchMaterials> = {},
): CoAlterDispatchMaterials {
  return {
    theme: "movie",
    userAId: A,
    userBId: B,
    recentTurns: [turn(A, "したい", "m1"), turn(B, "うん")],
    rerankedProposals: [],
    ...over,
  };
}

function baseRouterInput(
  over: Partial<ModeRouterInput> = {},
): ModeRouterInput {
  return {
    previousMode: null,
    previousClarifyTurns: 0,
    previousNegotiateNoProposal: false,
    misread: MISREAD_NONE,
    contradiction: CONTRADICTION_EMPTY,
    stall: STALL_NONE,
    ambiguityResponseMode: null,
    ...over,
  };
}

function baseInput(
  over: Partial<CoAlterDispatchInput> = {},
): CoAlterDispatchInput {
  return {
    gate: GATE_OK,
    router: baseRouterInput(),
    emotionHeat: EMOTION_HEAT_LOW,
    materials: baseMaterials(),
    buildDecisionCard: makeBuildDecisionCard(),
    now: NOW,
    ...over,
  };
}

// ═════════════════════════════════════════════════════════════════════
// E2E #1: misread → clarify
// ═════════════════════════════════════════════════════════════════════

describe("CoAlter dispatch E2E #1 — misread → clarify", () => {
  it("misread.confidence >= 0.7 のとき clarify モードの ClarifyCard を返す", async () => {
    const misread: MisreadSignal = {
      confidence: 0.8,
      direction: "a_to_b",
      anchorMessageId: "m1",
    };
    const buildDecisionCard = makeBuildDecisionCard();
    const res = await dispatchCoAlter(
      baseInput({
        router: baseRouterInput({ misread }),
        buildDecisionCard,
      }),
    );

    expect(res.card.mode).toBe("clarify");
    expect(res.trace).not.toBeNull();
    expect(res.trace!.selectedMode).toBe("clarify");
    expect(res.trace!.reason).toBe("misread_dominant");
    expect(res.executorFallbackReason).toBeNull();
    // decision executor は呼ばれていない
    expect(buildDecisionCallCount).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════
// E2E #2: contradiction → negotiate
// ═════════════════════════════════════════════════════════════════════

describe("CoAlter dispatch E2E #2 — contradiction → negotiate", () => {
  it("contradiction.detected=true のとき negotiate モードの NegotiateCard を返す", async () => {
    const contradiction: ContradictionSignal = {
      detected: true,
      axes: ["quietness"],
      stanceA: "静かな店がいい",
      stanceB: "賑やかな方がいい",
    };
    const rerankedProposals: ProposalCandidate[] = [
      {
        rank: 1,
        title: "第三案 1",
        oneLiner: "中間点の一軒",
        practicalInfo: "19:00〜",
        url: null,
      },
    ];
    const buildDecisionCard = makeBuildDecisionCard();
    const res = await dispatchCoAlter(
      baseInput({
        router: baseRouterInput({ contradiction }),
        materials: baseMaterials({ rerankedProposals }),
        buildDecisionCard,
      }),
    );

    expect(res.card.mode).toBe("negotiate");
    expect(res.trace!.selectedMode).toBe("negotiate");
    expect(res.trace!.reason).toBe("contradiction_detected");
    // NegotiateCard type narrow
    if (res.card.mode === "negotiate") {
      expect(res.card.proposals).toHaveLength(1);
      expect(res.card.interests.a.nonNegotiable).toContain("静かな店がいい");
    }
    expect(buildDecisionCallCount).toBe(0);
  });

  it("proposals=0 件でも negotiate を返す（pieExpansion 非空）", async () => {
    const contradiction: ContradictionSignal = {
      detected: true,
      axes: ["quietness"],
      stanceA: "静かな店がいい",
      stanceB: "賑やかな方がいい",
    };
    const res = await dispatchCoAlter(
      baseInput({
        router: baseRouterInput({ contradiction }),
      }),
    );
    expect(res.card.mode).toBe("negotiate");
    if (res.card.mode === "negotiate") {
      expect(res.card.proposals).toHaveLength(0);
      const nonNullCount = [
        res.card.pieExpansion.axisShift,
        res.card.pieExpansion.timeShift,
        res.card.pieExpansion.placeShift,
      ].filter((v) => v !== null).length;
      expect(nonNullCount).toBeGreaterThan(0);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// E2E #3: 前ターン negotiate proposals=0 → 次ターン decision
// ═════════════════════════════════════════════════════════════════════

describe("CoAlter dispatch E2E #3 — negotiate proposals=0 → 次ターン decision", () => {
  it("previousNegotiateNoProposal=true のとき contradiction があっても decision を優先する（最優先短絡）", async () => {
    const contradiction: ContradictionSignal = {
      detected: true,
      axes: ["quietness"],
      stanceA: "静かな店がいい",
      stanceB: "賑やかな方がいい",
    };
    const buildDecisionCard = makeBuildDecisionCard();
    const res = await dispatchCoAlter(
      baseInput({
        router: baseRouterInput({
          previousNegotiateNoProposal: true,
          previousMode: "negotiate",
          contradiction, // 依然として対立あり
        }),
        buildDecisionCard,
      }),
    );

    expect(res.card.mode).toBe("decision");
    expect(res.trace!.selectedMode).toBe("decision");
    expect(res.trace!.reason).toBe("negotiate_no_proposal_retry_decision");
    // executor が実際に decision で呼ばれた
    expect(buildDecisionCallCount).toBe(1);
    expect(res.executorFallbackReason).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════
// E2E #4: emotion_heat mid → 質問 0
// ═════════════════════════════════════════════════════════════════════

describe("CoAlter dispatch E2E #4 — emotion_heat mid → 質問 0", () => {
  it("emotion_heat.severity=mid のとき tone.maxQuestion=0 かつ trace.questionBudget=0", async () => {
    const emotionHeat: EmotionHeat = { severity: "mid", reason: null };
    const res = await dispatchCoAlter(
      baseInput({
        gate: { consent: "active", emotionHeat },
        emotionHeat,
      }),
    );
    expect(res.tone).not.toBeNull();
    expect(res.tone!.maxQuestion).toBe(0);
    expect(res.tone!.softenClosing).toBe(true);
    expect(res.trace!.questionBudget).toBe(0);
  });

  it("emotion_heat mid + misread で clarify になったとき、question は null", async () => {
    const emotionHeat: EmotionHeat = { severity: "mid", reason: null };
    const misread: MisreadSignal = {
      confidence: 0.9,
      direction: "a_to_b",
      anchorMessageId: "m1",
    };
    const res = await dispatchCoAlter(
      baseInput({
        gate: { consent: "active", emotionHeat },
        emotionHeat,
        router: baseRouterInput({ misread }),
      }),
    );
    expect(res.card.mode).toBe("clarify");
    if (res.card.mode === "clarify") {
      // tone.maxQuestion=0 が clarifyBuilder に伝播 → question=null
      expect(res.card.question).toBeNull();
    }
  });

  it("emotion_heat high では gate で弾かれ decision fallback（trace=null）", async () => {
    const emotionHeat: EmotionHeat = { severity: "high", reason: "dv_signal" };
    const buildDecisionCard = makeBuildDecisionCard();
    const res = await dispatchCoAlter(
      baseInput({
        gate: { consent: "active", emotionHeat },
        emotionHeat,
        router: baseRouterInput({
          misread: { confidence: 0.9, direction: "a_to_b", anchorMessageId: "m1" },
        }),
        buildDecisionCard,
      }),
    );
    expect(res.gate.pass).toBe(false);
    expect(res.card.mode).toBe("decision");
    expect(res.trace).toBeNull();
    expect(res.tone).toBeNull();
    expect(res.executorFallbackReason).toBe("gate_blocked");
    expect(buildDecisionCallCount).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════
// E2E #5: food はまだ decision fallback (G6 movie 先行)
// ═════════════════════════════════════════════════════════════════════

describe("CoAlter dispatch E2E #5 — food は decision fallback (G6)", () => {
  it("theme=food で contradiction があっても decision を返す（executorFallbackReason=theme_not_movie_yet）", async () => {
    const contradiction: ContradictionSignal = {
      detected: true,
      axes: ["quietness"],
      stanceA: "静かな店がいい",
      stanceB: "賑やかな方がいい",
    };
    const buildDecisionCard = makeBuildDecisionCard();
    const res = await dispatchCoAlter(
      baseInput({
        router: baseRouterInput({ contradiction }),
        materials: baseMaterials({ theme: "food" }),
        buildDecisionCard,
      }),
    );

    expect(res.card.mode).toBe("decision");
    expect(res.executorFallbackReason).toBe("theme_not_movie_yet");
    // trace は記録される（router / gate / modifier は theme 非依存で動く）
    expect(res.trace).not.toBeNull();
    expect(res.trace!.selectedMode).toBe("negotiate"); // router は negotiate と言っていた
    expect(res.trace!.reason).toBe("contradiction_detected");
    // executor は decision を実行
    expect(buildDecisionCallCount).toBe(1);
  });

  it("theme=food で misread があっても decision fallback", async () => {
    const misread: MisreadSignal = {
      confidence: 0.9,
      direction: "a_to_b",
      anchorMessageId: "m1",
    };
    const res = await dispatchCoAlter(
      baseInput({
        router: baseRouterInput({ misread }),
        materials: baseMaterials({ theme: "food" }),
      }),
    );
    expect(res.card.mode).toBe("decision");
    expect(res.executorFallbackReason).toBe("theme_not_movie_yet");
    expect(res.trace!.selectedMode).toBe("clarify"); // router の判定は残る
  });

  it("theme=activity (非 movie) も decision fallback", async () => {
    const theme: ConversationTheme = "activity";
    const contradiction: ContradictionSignal = {
      detected: true,
      axes: ["access"],
      stanceA: "近場がいい",
      stanceB: "遠出したい",
    };
    const res = await dispatchCoAlter(
      baseInput({
        router: baseRouterInput({ contradiction }),
        materials: baseMaterials({ theme }),
      }),
    );
    expect(res.card.mode).toBe("decision");
    expect(res.executorFallbackReason).toBe("theme_not_movie_yet");
  });

  it("theme=movie なら negotiate が実行される（対照実験）", async () => {
    const contradiction: ContradictionSignal = {
      detected: true,
      axes: ["tone"],
      stanceA: "重すぎない方がいい",
      stanceB: "重厚な作品がいい",
    };
    const res = await dispatchCoAlter(
      baseInput({
        router: baseRouterInput({ contradiction }),
        materials: baseMaterials({ theme: "movie" }),
      }),
    );
    expect(res.card.mode).toBe("negotiate");
    expect(res.executorFallbackReason).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════
// 非破壊契約: decision 経路は callback を素通り
// ═════════════════════════════════════════════════════════════════════

describe("CoAlter dispatch — decision 非破壊契約", () => {
  it("trace.selectedMode=decision のとき card は buildDecisionCard の結果に mode だけ付けた形", async () => {
    const res = await dispatchCoAlter(baseInput());
    expect(res.card.mode).toBe("decision");
    if (res.card.mode === "decision") {
      expect(res.card.summary).toBe("映画3本を比較した。");
      expect(res.card.candidates).toHaveLength(1);
      expect(res.card.reasoning).toContain("外したくない");
    }
  });

  it("decision 分岐では buildDecisionCard が 1 回だけ呼ばれる", async () => {
    const buildDecisionCard = makeBuildDecisionCard();
    await dispatchCoAlter(baseInput({ buildDecisionCard }));
    expect(buildDecisionCallCount).toBe(1);
  });

  it("negotiate / clarify 分岐では buildDecisionCard は呼ばれない", async () => {
    const contradiction: ContradictionSignal = {
      detected: true,
      axes: ["quietness"],
      stanceA: "静か",
      stanceB: "賑やか",
    };
    const buildDecisionCard1 = makeBuildDecisionCard();
    await dispatchCoAlter(
      baseInput({
        router: baseRouterInput({ contradiction }),
        buildDecisionCard: buildDecisionCard1,
      }),
    );
    expect(buildDecisionCallCount).toBe(0);

    const misread: MisreadSignal = {
      confidence: 0.9,
      direction: "a_to_b",
      anchorMessageId: "m1",
    };
    const buildDecisionCard2 = makeBuildDecisionCard();
    await dispatchCoAlter(
      baseInput({
        router: baseRouterInput({ misread }),
        buildDecisionCard: buildDecisionCard2,
      }),
    );
    expect(buildDecisionCallCount).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════
// discriminated union の型契約
// ═════════════════════════════════════════════════════════════════════

describe("CoAlter dispatch — discriminated union の型契約", () => {
  it("返り値の card.mode は常に 'decision' | 'negotiate' | 'clarify' のいずれか", async () => {
    const inputs = [
      // decision (default)
      baseInput(),
      // clarify
      baseInput({
        router: baseRouterInput({
          misread: { confidence: 0.9, direction: "a_to_b", anchorMessageId: "m1" },
        }),
      }),
      // negotiate
      baseInput({
        router: baseRouterInput({
          contradiction: {
            detected: true,
            axes: ["quietness"],
            stanceA: "静か",
            stanceB: "賑やか",
          },
        }),
      }),
    ];

    for (const inp of inputs) {
      const res = await dispatchCoAlter(inp);
      expect(["decision", "negotiate", "clarify"]).toContain(res.card.mode);
    }
  });

  it("NegotiateCard / ClarifyCard は decision のフィールドを混ぜない", async () => {
    const res = await dispatchCoAlter(
      baseInput({
        router: baseRouterInput({
          contradiction: {
            detected: true,
            axes: ["quietness"],
            stanceA: "静か",
            stanceB: "賑やか",
          },
        }),
      }),
    );
    expect(res.card.mode).toBe("negotiate");
    expect(res.card).not.toHaveProperty("candidates");
    expect(res.card).not.toHaveProperty("priorities");
    expect(res.card).not.toHaveProperty("reasoning");
  });

  it("ClarifyCard は candidates / proposals を一切持たない", async () => {
    const res = await dispatchCoAlter(
      baseInput({
        router: baseRouterInput({
          misread: { confidence: 0.9, direction: "a_to_b", anchorMessageId: "m1" },
        }),
      }),
    );
    expect(res.card.mode).toBe("clarify");
    expect(res.card).not.toHaveProperty("candidates");
    expect(res.card).not.toHaveProperty("proposals");
  });
});
