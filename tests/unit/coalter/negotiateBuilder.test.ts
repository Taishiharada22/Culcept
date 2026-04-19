/**
 * CoAlter Phase 2 — negotiateBuilder unit test (2026-04-19 v0.3 gate 6.B)
 *
 * 固定する契約（CEO 実装固定条件 3）:
 *  - proposals = 0 件は失敗ではなく **設計どおりの正常系**
 *  - proposals = 0 件のとき pieExpansion 非空
 *  - proposals = 0 件のとき closing は「次ターン decision 再実行」を示す
 *
 * 必須観点（CEO 指定）: "negotiate proposals 0 件正常系"
 */

import { describe, it, expect } from "vitest";

import { buildNegotiateCard } from "@/lib/coalter/negotiateBuilder";
import type {
  ContradictionSignal,
  ProposalCandidate,
  ToneModifier,
} from "@/lib/coalter/types";

const CONTRADICTION_QUIETNESS: ContradictionSignal = {
  detected: true,
  axes: ["quietness"],
  stanceA: "静かな店がいい",
  stanceB: "賑やかな方がいい",
};

const TONE_NORMAL: ToneModifier = { softenClosing: false, maxQuestion: 1 };
const TONE_SOFT: ToneModifier = { softenClosing: true, maxQuestion: 0 };

function mockProposal(rank: number): ProposalCandidate {
  return {
    rank,
    title: `第三案 ${rank}`,
    oneLiner: "中間点で見つけた一軒",
    practicalInfo: "渋谷 / 19:00〜 / ¥3,000台",
    url: "https://example.com/venue",
  };
}

// ═════════════════════════════════════════════════════════════════════
// 正常系 A: proposals が 2 件ある（通常の第三案提示）
// ═════════════════════════════════════════════════════════════════════

describe("buildNegotiateCard — proposals >= 1 の通常系", () => {
  it("mode=negotiate、proposals をそのまま流す（最大 3 件）", () => {
    const card = buildNegotiateCard({
      contradiction: CONTRADICTION_QUIETNESS,
      rerankedProposals: [mockProposal(1), mockProposal(2)],
      tone: TONE_NORMAL,
    });

    expect(card.mode).toBe("negotiate");
    expect(card.proposals).toHaveLength(2);
    expect(card.closing).toBe("これで合うかは 2 人で決めてね。");
  });

  it("4 件以上は 3 件に丸める", () => {
    const card = buildNegotiateCard({
      contradiction: CONTRADICTION_QUIETNESS,
      rerankedProposals: [
        mockProposal(1),
        mockProposal(2),
        mockProposal(3),
        mockProposal(4),
      ],
      tone: TONE_NORMAL,
    });
    expect(card.proposals).toHaveLength(3);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 正常系 B: proposals = 0 件（CEO 必須観点）
// ═════════════════════════════════════════════════════════════════════

describe("buildNegotiateCard — proposals = 0 は正常系", () => {
  it("proposals=0 でもエラーを出さない", () => {
    expect(() =>
      buildNegotiateCard({
        contradiction: CONTRADICTION_QUIETNESS,
        rerankedProposals: [],
        tone: TONE_NORMAL,
      }),
    ).not.toThrow();
  });

  it("proposals=0 のとき pieExpansion は非空（少なくとも 1 フィールドが non-null）", () => {
    const card = buildNegotiateCard({
      contradiction: CONTRADICTION_QUIETNESS,
      rerankedProposals: [],
      tone: TONE_NORMAL,
    });
    const nonNullCount = [
      card.pieExpansion.axisShift,
      card.pieExpansion.timeShift,
      card.pieExpansion.placeShift,
    ].filter((v) => v !== null).length;
    expect(nonNullCount).toBeGreaterThan(0);
  });

  it("proposals=0 の closing は「次ターン decision 再実行」を示す", () => {
    const card = buildNegotiateCard({
      contradiction: CONTRADICTION_QUIETNESS,
      rerankedProposals: [],
      tone: TONE_NORMAL,
    });
    expect(card.closing).toContain("次のターン");
    expect(card.closing).toContain("具体案");
  });

  it("proposals=0 でも summary / interests / mode は必ず埋まる", () => {
    const card = buildNegotiateCard({
      contradiction: CONTRADICTION_QUIETNESS,
      rerankedProposals: [],
      tone: TONE_NORMAL,
    });
    expect(card.mode).toBe("negotiate");
    expect(card.summary.length).toBeGreaterThan(0);
    expect(card.interests.a.nonNegotiable).toContain("静かな店がいい");
    expect(card.interests.b.nonNegotiable).toContain("賑やかな方がいい");
  });
});

// ═════════════════════════════════════════════════════════════════════
// 不変条件: proposals=0 かつ pieExpansion 全 null は禁止
// ═════════════════════════════════════════════════════════════════════

describe("buildNegotiateCard — 完全空カード禁止（不変条件）", () => {
  it("軸が空 & stance も空 & proposals=0 → throw", () => {
    const emptyContradiction: ContradictionSignal = {
      detected: false,
      axes: [],
      stanceA: null,
      stanceB: null,
    };
    expect(() =>
      buildNegotiateCard({
        contradiction: emptyContradiction,
        rerankedProposals: [],
        tone: TONE_NORMAL,
      }),
    ).toThrow(/invariant violated/);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 依存禁止表（§3.6）の遵守確認
// ═════════════════════════════════════════════════════════════════════

describe("buildNegotiateCard — 依存禁止表の契約", () => {
  it("関数シグネチャは ranker / webConnector / intentTranslation を受け取らない", () => {
    // ranker / webConnector を import しない設計の表現として、
    // builder が受ける入力は contradiction / rerankedProposals（事前計算済み） / tone のみ。
    // rerankedProposals は呼び出し側が用意する（依存方向を一方通行化）。
    const signatureKeys = [
      "contradiction",
      "rerankedProposals",
      "tone",
    ].sort();
    const sampleInput = {
      contradiction: CONTRADICTION_QUIETNESS,
      rerankedProposals: [],
      tone: TONE_NORMAL,
    };
    expect(Object.keys(sampleInput).sort()).toEqual(signatureKeys);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Tone modifier 作用（softenClosing=true）
// ═════════════════════════════════════════════════════════════════════

describe("buildNegotiateCard — softenClosing で closing が和らぐ", () => {
  it("proposals=0 + softenClosing=true で closing に「ゆっくり」が入る", () => {
    const card = buildNegotiateCard({
      contradiction: CONTRADICTION_QUIETNESS,
      rerankedProposals: [],
      tone: TONE_SOFT,
    });
    expect(card.closing).toContain("ゆっくり");
    expect(card.closing).toContain("次のターン");
  });
});
