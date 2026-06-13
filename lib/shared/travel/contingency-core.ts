/**
 * T7B — 決定論 contingency core（**pure・未配線**）
 *
 * 設計: contingency-types.ts + GPT note 2026-06-12
 *
 * 入力: T5 `DecisionResult` + T6 `ReadinessResult` + T4 `ProposalComparison` + explicit `ContingencyScenario[]`
 * 出力: `ContingencyPlan`（fallback 分岐の precompute・**何も実行しない**）
 *
 * 厳守（純・決定論）:
 *   - 実 weather/route/place API・リアルタイムデータ・実 reschedule/cancel/booking なし。explicit scenario のみ。
 *   - import は travel core/types のみ。fail-closed: 高リスクで代替なし → defer/cancel + blocked。
 *   - uncertainty/fatigue/time-shrink 高 → より易しい案を優先。
 *   - ★ private scenario は fallback に影響してよいが、**shared 射影で分岐ごと除去**し漏らさない。
 */

import type { ViewerScopedRationale } from "./core-types";
import type { DecisionQuestion, DecisionResult } from "./decision-types";
import type { ReadinessResult, ReadinessState } from "./readiness-types";
import type { ProposalComparison, ProposalComparisonEntry } from "./proposal-comparison-types";
import type {
  ContingencyBranch,
  ContingencyPlan,
  ContingencyScenario,
  ContingencyTrigger,
  FallbackAction,
} from "./contingency-types";

export interface ContingencyInput {
  decision: DecisionResult;
  readiness: ReadinessResult;
  comparison: ProposalComparison;
  scenarios: ContingencyScenario[];
}

/** severity がこの値以上で「強い fallback」発火（透明・固定） */
const TRIGGER_THRESHOLD: Record<ContingencyTrigger, number> = {
  delay: 0.5,
  rain_or_weather: 0.5,
  fatigue: 0.5,
  closure: 0.34,
  budget_shock: 0.5,
  participant_unavailable: 0.34,
  time_window_shrink: 0.5,
  high_uncertainty: 0.5,
};

const TRIGGER_JA: Record<ContingencyTrigger, string> = {
  delay: "遅れ", rain_or_weather: "天候", fatigue: "疲れ", closure: "休業",
  budget_shock: "予算変動", participant_unavailable: "同行者の都合", time_window_shrink: "時間短縮", high_uncertainty: "不確実性",
};
const ACTION_JA: Record<FallbackAction, string> = {
  keep_plan: "このまま進める", ask_question: "確認する", downgrade_to_easy: "軽めの内容に調整", switch_proposal: "別の案に切替", defer: "見送る", cancel: "中止",
};

const OUTDOOR_ANGLES = ["nature", "active"];
const INDOOR_ANGLES = ["culture", "food_focused", "relaxed"];

const otherEntries = (c: ProposalComparison, currentId: string): ProposalComparisonEntry[] =>
  c.entries.filter((e) => e.candidateId !== currentId);
const findEasier = (c: ProposalComparison, currentId: string): string | null =>
  otherEntries(c, currentId).find((e) => e.role === "easy")?.candidateId ?? null;
const findIndoor = (c: ProposalComparison, currentId: string): string | null =>
  otherEntries(c, currentId).find((e) => INDOOR_ANGLES.includes(e.angle))?.candidateId ?? null;
const findAnyAlt = (c: ProposalComparison, currentId: string): string | null =>
  otherEntries(c, currentId)[0]?.candidateId ?? null;

const q = (intent: string, slotKey?: DecisionQuestion["slotKey"]): DecisionQuestion => ({
  about: "missing_slot",
  intent,
  priority: "recommended",
  ...(slotKey ? { slotKey } : {}),
});

interface BranchCore {
  action: FallbackAction;
  switchTo: string | null;
  question: DecisionQuestion | null;
  readinessImpact: ReadinessState;
}

/** trigger × severity × 代替案 → fallback（決定論・fail-closed） */
function resolveBranch(s: ContingencyScenario, currentEntry: ProposalComparisonEntry, c: ProposalComparison, readiness: ReadinessResult): BranchCore {
  const currentId = currentEntry.candidateId;
  const fired = s.severity >= TRIGGER_THRESHOLD[s.trigger];
  if (!fired) return { action: "keep_plan", switchTo: null, question: null, readinessImpact: readiness.state };

  switch (s.trigger) {
    case "delay":
    case "time_window_shrink": {
      const easier = findEasier(c, currentId);
      if (easier) return { action: "downgrade_to_easy", switchTo: easier, question: null, readinessImpact: "needs_confirmation" };
      return { action: "ask_question", switchTo: null, question: q("ask_shorten_plan"), readinessImpact: "needs_question" };
    }
    case "fatigue": {
      if (currentEntry.role === "easy") return { action: "keep_plan", switchTo: null, question: null, readinessImpact: readiness.state };
      const easier = findEasier(c, currentId);
      if (easier) return { action: "switch_proposal", switchTo: easier, question: null, readinessImpact: "needs_confirmation" };
      return { action: "downgrade_to_easy", switchTo: null, question: null, readinessImpact: "needs_confirmation" };
    }
    case "rain_or_weather": {
      if (!OUTDOOR_ANGLES.includes(currentEntry.angle)) return { action: "keep_plan", switchTo: null, question: null, readinessImpact: readiness.state };
      const indoor = findIndoor(c, currentId);
      if (indoor) return { action: "switch_proposal", switchTo: indoor, question: null, readinessImpact: "needs_confirmation" };
      return { action: "defer", switchTo: null, question: null, readinessImpact: "blocked" }; // 屋内代替なし → fail closed
    }
    case "closure": {
      const alt = findAnyAlt(c, currentId);
      if (alt) return { action: "switch_proposal", switchTo: alt, question: null, readinessImpact: "needs_confirmation" };
      return { action: "cancel", switchTo: null, question: null, readinessImpact: "blocked" }; // 代替なし → fail closed
    }
    case "budget_shock":
      return { action: "ask_question", switchTo: null, question: q("ask_budget", "budget_band"), readinessImpact: "blocked" }; // 有償行動はブロック
    case "participant_unavailable":
      return { action: "defer", switchTo: null, question: null, readinessImpact: "blocked" }; // 共有 commit 不能
    case "high_uncertainty":
      return { action: "ask_question", switchTo: null, question: q("ask_more_info"), readinessImpact: "needs_question" };
  }
}

function branchRationale(s: ContingencyScenario, core: BranchCore): ViewerScopedRationale {
  const text = `${TRIGGER_JA[s.trigger]}の場合は${ACTION_JA[core.action]}ます`;
  if (s.visibility === "shared") return { shared: text + "。", forParticipant: {} };
  // private: 理由を当人にのみ。shared 文は中立。
  const forParticipant: Record<string, string> = {};
  if (s.participantId) forParticipant[s.participantId] = text;
  return { shared: "状況に応じて調整できます。", forParticipant };
}

// ─────────────────────────────────────────────────────────────────────────────
// public: planContingencies
// ─────────────────────────────────────────────────────────────────────────────

export function planContingencies(input: ContingencyInput): ContingencyPlan {
  const { decision, readiness, comparison, scenarios } = input;
  const currentId = decision.recommendedProposalId;
  const currentEntry = currentId ? comparison.entries.find((e) => e.candidateId === currentId) : undefined;

  const forParticipant = { ...decision.rationale.forParticipant };

  if (!currentId || !currentEntry) {
    return { recommendedProposalId: currentId, branches: [], rationale: { shared: "代替案の前提となる確定案がありません。", forParticipant } };
  }

  const branches: ContingencyBranch[] = scenarios.map((s) => {
    const core = resolveBranch(s, currentEntry, comparison, readiness);
    return {
      trigger: s.trigger,
      fallbackAction: core.action,
      switchToProposalId: core.switchTo,
      question: core.question,
      readinessImpact: core.readinessImpact,
      triggerThreshold: TRIGGER_THRESHOLD[s.trigger],
      visibility: s.visibility,
      rationale: branchRationale(s, core),
    };
  });

  return {
    recommendedProposalId: currentId,
    branches,
    rationale: { shared: `${branches.length}件の状況に備えた分岐を用意しました。`, forParticipant },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// public: shared 射影（M5・private 分岐を漏らさない）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * shared ビュー: 相手にも見せてよい形。
 *   - **private 分岐（visibility==="private"）は分岐ごと除去**（private な事情の存在自体を隠す）。
 *     authoritative plan には残るため engine は private fallback を知っているが、shared には出さない。
 *   - 残る branch の rationale.forParticipant を削除・plan rationale も shared のみ。
 */
export function toSharedContingencyView(plan: ContingencyPlan): ContingencyPlan {
  return {
    recommendedProposalId: plan.recommendedProposalId,
    branches: plan.branches
      .filter((b) => b.visibility === "shared")
      .map((b) => ({ ...b, rationale: { shared: b.rationale.shared, forParticipant: {} } })),
    rationale: { shared: plan.rationale.shared, forParticipant: {} },
  };
}
