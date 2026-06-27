/**
 * P17 — CoAlter PlanIntelligenceLivePanel 温度ラベル test（live path）
 *
 * 目的: live engine 駆動の Plan Intelligence Live panel（CoAlterTab で flag ON 時に表示される本番 surface）
 *   の LiveCandidateCard に display-only の「守り/中間/攻め」chip が出ることを担保する。
 *
 * CEO 制約遵守:
 *   - ranking / personalization / DB write / action behavior に影響しない（純粋 index ベース）
 *   - vm.candidates の順序は変えない（map の callback 引数 index を読むだけ）
 *   - PlanIntelligencePanel (fixture path) と同一意味論（fixture と live で同じ温度語）
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { PlanIntelligenceLivePanel } from "@/app/(culcept)/plan/tabs/coalter/PlanIntelligenceLivePanel";
import type {
  PlanIntelligenceLiveReadyVM,
  PlanIntelligenceLiveVM,
  CandidateVM,
} from "@/app/(culcept)/plan/tabs/coalter/planIntelligenceLiveViewModel";

function makeCandidate(over: Partial<CandidateVM> = {}): CandidateVM {
  return {
    candidateId: "c-1",
    angle: "relaxed",
    angleLabel: "ゆったり",
    title: "ゆったりカフェ案",
    why: "二人とも会話の時間を望んでいる",
    area: "都内",
    paceFit: "fit",
    paceFitLabel: "合う",
    mobilityFit: "fit",
    mobilityFitLabel: "合う",
    softMatchLabels: [],
    uncertainty: "low",
    uncertaintyLabel: "確度: 高",
    missingLabels: [],
    budgetBandLabel: "ミディアム",
    recommended: false,
    ...over,
  };
}

function makeReadyVM(candidates: CandidateVM[]): PlanIntelligenceLiveVM {
  const vm: PlanIntelligenceLiveReadyVM = {
    status: "ready",
    candidates,
    decision: {
      recommendedProposalId: candidates[0]?.candidateId ?? null,
      why: "demo why",
      nextActionLabel: "選んでください",
    },
    questions: [],
    confirmations: [],
    risks: [],
    rejected: [],
    physical: { resolved: false, note: "場所確定後に算出します" },
  };
  return vm;
}

function render(vm: PlanIntelligenceLiveVM): string {
  return renderToStaticMarkup(createElement(PlanIntelligenceLivePanel, { vm }));
}

describe("P17 — live panel proposal temperature chip", () => {
  it("3 案: 守り/中間/攻め の3 chip が全て DOM に出る", () => {
    const vm = makeReadyVM([
      makeCandidate({ candidateId: "c-a", angle: "relaxed", angleLabel: "ゆったり", title: "案A" }),
      makeCandidate({ candidateId: "c-b", angle: "food_focused", angleLabel: "食重視", title: "案B" }),
      makeCandidate({ candidateId: "c-c", angle: "active", angleLabel: "アクティブ", title: "案C" }),
    ]);
    const html = render(vm);
    expect(html).toContain("守り");
    expect(html).toContain("中間");
    expect(html).toContain("攻め");
    // aria-label で display-only intent を担保
    expect(html).toContain('aria-label="案の温度: 守り"');
    expect(html).toContain('aria-label="案の温度: 中間"');
    expect(html).toContain('aria-label="案の温度: 攻め"');
  });

  it("2 案: 先頭=守り・末尾=攻め（中間 chip は出さない）", () => {
    const vm = makeReadyVM([
      makeCandidate({ candidateId: "c-a", title: "案A" }),
      makeCandidate({ candidateId: "c-b", title: "案B" }),
    ]);
    const html = render(vm);
    expect(html).toContain("守り");
    expect(html).toContain("攻め");
    expect(html).not.toContain('aria-label="案の温度: 中間"');
  });

  it("1 案: 温度 chip は出ない（差が無い）", () => {
    const vm = makeReadyVM([makeCandidate({ candidateId: "c-only", title: "唯一の案" })]);
    const html = render(vm);
    expect(html).not.toContain('aria-label="案の温度: 守り"');
    expect(html).not.toContain('aria-label="案の温度: 中間"');
    expect(html).not.toContain('aria-label="案の温度: 攻め"');
  });

  it("4 案以上: 3 段モデル破綻のため chip 非表示（fail-safe）", () => {
    const vm = makeReadyVM([
      makeCandidate({ candidateId: "c-a" }),
      makeCandidate({ candidateId: "c-b" }),
      makeCandidate({ candidateId: "c-c" }),
      makeCandidate({ candidateId: "c-d" }),
    ]);
    const html = render(vm);
    expect(html).not.toContain('aria-label="案の温度: 守り"');
    expect(html).not.toContain('aria-label="案の温度: 中間"');
    expect(html).not.toContain('aria-label="案の温度: 攻め"');
  });

  it("vm.candidates の順序は変わらない（title が index 順に DOM 出現）", () => {
    const vm = makeReadyVM([
      makeCandidate({ candidateId: "c-a", title: "FIRST_TITLE" }),
      makeCandidate({ candidateId: "c-b", title: "SECOND_TITLE" }),
      makeCandidate({ candidateId: "c-c", title: "THIRD_TITLE" }),
    ]);
    const html = render(vm);
    const p1 = html.indexOf("FIRST_TITLE");
    const p2 = html.indexOf("SECOND_TITLE");
    const p3 = html.indexOf("THIRD_TITLE");
    expect(p1).toBeGreaterThanOrEqual(0);
    expect(p2).toBeGreaterThan(p1);
    expect(p3).toBeGreaterThan(p2);
  });

  it("angleLabel と recommended chip を上書きしない（共存する）", () => {
    const vm = makeReadyVM([
      makeCandidate({ candidateId: "c-a", angleLabel: "ゆったり", recommended: true }),
      makeCandidate({ candidateId: "c-b", angleLabel: "食重視" }),
      makeCandidate({ candidateId: "c-c", angleLabel: "アクティブ" }),
    ]);
    const html = render(vm);
    expect(html).toContain("ゆったり");
    expect(html).toContain("食重視");
    expect(html).toContain("アクティブ");
    expect(html).toContain("おすすめ"); // recommended chip 不変
    expect(html).toContain("守り");
  });
});
