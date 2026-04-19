/**
 * statusResolver.test.ts — Phase 6.D (2026-04-19)
 *
 * CEO 6.D 次 gate で見る 4 項目を pure function 層で固定する。
 *
 *   1) activeCard が status API から返ること
 *      → resolver が metadata.card を採用し activeCard に写すこと
 *   2) negotiate / clarify が再読込で復元されること
 *      → resolver が mode を潰さず、そのまま activeCard に流すこと
 *   3) legacy client が壊れないこと
 *      → activeProposal が ProposalCard として取れ続けること
 *         （decision では card 本体、負e 時は null）
 *   4) metadata.card 欠損時だけ fallback が走ること
 *      → usedFallback フラグで明示
 */

import { describe, it, expect } from "vitest";
import { resolveActiveFromMetadata } from "@/lib/coalter/statusResolver";
import type {
  ProposalCard,
  CoAlterCard,
  DecisionCard,
  NegotiateCard,
  ClarifyCard,
} from "@/lib/coalter/types";

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

function makeProposalCard(): ProposalCard {
  return {
    summary: "今夜の映画を決めたい",
    twoEmphasis: { a: ["話題性"], b: ["安定感"] },
    commonGround: ["長すぎない"],
    candidates: [
      {
        rank: 1,
        title: "作品A",
        oneLiner: "外しにくい話題作",
        practicalInfo: "2h10m",
        axisScores: {},
      },
    ],
    reasoning: "2人の軸の中間",
    closing: "あとは2人で",
  } as unknown as ProposalCard;
}

function makeDecisionCard(): DecisionCard {
  return { ...makeProposalCard(), mode: "decision" };
}

function makeNegotiateCard(): NegotiateCard {
  return {
    mode: "negotiate",
    summary: "A は新作重視 / B は安心感重視",
    interests: {
      a: { nonNegotiable: ["話題性"], negotiable: [] },
      b: { nonNegotiable: ["ハズレ回避"], negotiable: [] },
    },
    pieExpansion: {
      axisShift: "話題性と安定感の中間で探す",
      timeShift: null,
      placeShift: null,
    },
    proposals: [],
    closing: "軸をずらして選び直してみる？",
  };
}

function makeClarifyCard(): ClarifyCard {
  return {
    mode: "clarify",
    summary: "2人の論点がずれている可能性",
    pointList: {
      facts: ["A は SF を挙げている", "B は恋愛を挙げている"],
      feelings: [],
    },
    neutralTranslation: {
      aToB: "SF のスケール感が見たい",
      bToA: "しっとり楽しみたい",
    },
    question: null,
    closing: "まず聞いてみる？",
  };
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe("statusResolver.resolveActiveFromMetadata — Phase 6.D gate 条件", () => {
  // ── 条件 1 & 3: activeCard 返却 + legacy activeProposal 並行維持（decision） ──
  it("metadata.card が DecisionCard のとき、activeCard と activeProposal の両方を返す（後方互換）", () => {
    const card = makeDecisionCard();
    const proposal = makeProposalCard();
    const result = resolveActiveFromMetadata({
      card: card as unknown as Record<string, unknown>,
      proposalCard: proposal as unknown as Record<string, unknown>,
    });

    expect(result.activeCard).not.toBeNull();
    expect(result.activeCard?.mode).toBe("decision");
    expect(result.activeProposal).not.toBeNull();
    expect(result.activeProposal?.summary).toBe(proposal.summary);
    expect(result.usedFallback).toBe(false);
  });

  // ── 条件 2: negotiate が再読込で復元される ──
  it("metadata.card が NegotiateCard のとき、activeCard に mode='negotiate' をそのまま返す", () => {
    const card = makeNegotiateCard();
    const result = resolveActiveFromMetadata({
      card: card as unknown as Record<string, unknown>,
      // engine.ts は後方互換として proposalCard スタブも書き込む想定
      proposalCard: makeProposalCard() as unknown as Record<string, unknown>,
    });

    expect(result.activeCard?.mode).toBe("negotiate");
    // mode 潰し無し（CEO 条件 #3: mode 非依存）
    const negotiate = result.activeCard as NegotiateCard;
    expect(negotiate.pieExpansion.axisShift).toBe(card.pieExpansion.axisShift);
    expect(negotiate.interests.a.nonNegotiable).toEqual(card.interests.a.nonNegotiable);
    expect(result.usedFallback).toBe(false);
  });

  // ── 条件 2: clarify が再読込で復元される ──
  it("metadata.card が ClarifyCard のとき、activeCard に mode='clarify' をそのまま返す", () => {
    const card = makeClarifyCard();
    const result = resolveActiveFromMetadata({
      card: card as unknown as Record<string, unknown>,
      proposalCard: makeProposalCard() as unknown as Record<string, unknown>,
    });

    expect(result.activeCard?.mode).toBe("clarify");
    const clarify = result.activeCard as ClarifyCard;
    expect(clarify.pointList.facts).toEqual(card.pointList.facts);
    expect(clarify.neutralTranslation.aToB).toBe(card.neutralTranslation.aToB);
    expect(result.usedFallback).toBe(false);
  });

  // ── 条件 3: negotiate/clarify のとき legacy activeProposal は proposalCard スタブで維持 ──
  it("negotiate/clarify でも proposalCard スタブがあれば activeProposal は返る（legacy client 非破壊）", () => {
    const negotiate = makeNegotiateCard();
    const proposal = makeProposalCard();
    const result = resolveActiveFromMetadata({
      card: negotiate as unknown as Record<string, unknown>,
      proposalCard: proposal as unknown as Record<string, unknown>,
    });

    expect(result.activeProposal).not.toBeNull();
    expect(result.activeProposal?.summary).toBe(proposal.summary);
    // Phase 2 client は activeCard.mode === "negotiate" を見て描画を切り替える
    expect(result.activeCard?.mode).toBe("negotiate");
  });

  // ── 条件 4: metadata.card 欠損時だけ fallback が走る ──
  it("metadata.card 欠損時は proposalCard から DecisionCard を再合成し usedFallback=true を立てる", () => {
    const proposal = makeProposalCard();
    const result = resolveActiveFromMetadata({
      // card フィールド無し
      proposalCard: proposal as unknown as Record<string, unknown>,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.activeCard).not.toBeNull();
    expect(result.activeCard?.mode).toBe("decision");
    expect(result.activeProposal?.summary).toBe(proposal.summary);
  });

  // ── 条件 4: metadata.card 不正値でも fallback が走る ──
  it("metadata.card が壊れている（mode が未知）ときも proposalCard から fallback 合成", () => {
    const proposal = makeProposalCard();
    const result = resolveActiveFromMetadata({
      card: { mode: "reflect", random: "garbage" } as unknown as Record<string, unknown>,
      proposalCard: proposal as unknown as Record<string, unknown>,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.activeCard?.mode).toBe("decision");
  });

  // ── 条件 4: 両方欠損は全て null + usedFallback=false ──
  it("metadata.card も proposalCard も無いときは全て null、fallback は走らない", () => {
    const result = resolveActiveFromMetadata({});
    expect(result.activeCard).toBeNull();
    expect(result.activeProposal).toBeNull();
    expect(result.usedFallback).toBe(false);
  });

  // ── null / undefined メタデータでも落ちない ──
  it("metadata が null でも例外にならず全 null を返す", () => {
    const result = resolveActiveFromMetadata(null);
    expect(result.activeCard).toBeNull();
    expect(result.activeProposal).toBeNull();
    expect(result.usedFallback).toBe(false);
  });

  it("metadata が undefined でも例外にならず全 null を返す", () => {
    const result = resolveActiveFromMetadata(undefined);
    expect(result.activeCard).toBeNull();
    expect(result.activeProposal).toBeNull();
    expect(result.usedFallback).toBe(false);
  });

  // ── mode 非依存の保証: 3 mode 分ループ ──
  it("mode 非依存: decision / negotiate / clarify で等しく扱う（CEO 条件 #3）", () => {
    const cards: CoAlterCard[] = [
      makeDecisionCard(),
      makeNegotiateCard(),
      makeClarifyCard(),
    ];
    for (const card of cards) {
      const result = resolveActiveFromMetadata({
        card: card as unknown as Record<string, unknown>,
      });
      expect(result.activeCard?.mode).toBe(card.mode);
      expect(result.usedFallback).toBe(false);
    }
  });
});
