/**
 * T8B — 決定論 Plan Decision Packet builder（**pure・未配線**）
 *
 * 設計: packet-types.ts + GPT note 2026-06-12
 *
 * 入力: T3 `ProposalSetOutput` + T4 `ProposalComparison` + T5 `DecisionResult` +
 *       T6 `ReadinessResult` + T7 `ContingencyPlan`
 * 出力: authoritative packet ＋ 安全な shared / viewer 射影。
 *
 * 厳守（純・決定論）:
 *   - opaque scoring・外部データ・runtime 呼び出し・UI レンダリングなし。import は travel core/types のみ。
 *   - upstream 不整合は **fail-closed**（nextAction=blocked・executionAuthority=false）。
 *   - ★ 権限境界: authoritative packet のみ実行権限。**shared/viewer 射影は authoritative=false で
 *     executionAuthority も必ず false**（display 専用・private を隠した見た目が実行権限に化けない）。
 *     shared 射影は「各層の shared 射影から組み立て直す」ことで、private confirmation/contingency が
 *     authoritative では効いたまま、shared では存在ごと消える。
 */

import type { ViewerScopedRationale } from "./core-types";
import type { ProposalSetOutput } from "./proposal-types";
import type { ProposalComparison } from "./proposal-comparison-types";
import { toSharedDecisionView } from "./decision-core";
import type { DecisionQuestion, DecisionResult } from "./decision-types";
import { hasActionAuthority, toSharedReadinessView } from "./readiness-core";
import type { ReadinessResult } from "./readiness-types";
import { hasContingencyActionAuthority, toSharedContingencyView } from "./contingency-core";
import type { ContingencyPlan } from "./contingency-types";
import type { FallbackSummaryEntry, NextAction, PlanDecisionPacket } from "./packet-types";

export interface BuildPacketInput {
  result: ProposalSetOutput;
  comparison: ProposalComparison;
  decision: DecisionResult;
  readiness: ReadinessResult;
  contingency: ContingencyPlan;
}

const NEXT_JA: Record<NextAction, string> = {
  propose_plan: "この案を提案できます",
  confirm: "進める前に確認が必要です",
  handle_contingency: "状況の変化に対応が必要です",
  ask_question: "決めるために確認したいことがあります",
  await_preference: "どちらが良いか教えてください",
  blocked: "今は進められません",
};

function mergeForParticipant(...rs: ViewerScopedRationale[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rs) {
    for (const [pid, text] of Object.entries(r.forParticipant)) {
      out[pid] = out[pid] ? `${out[pid]}・${text}` : text;
    }
  }
  return out;
}

function dedupeQuestions(qs: (DecisionQuestion | null)[]): DecisionQuestion[] {
  const seen = new Set<string>();
  const out: DecisionQuestion[] = [];
  for (const q of qs) {
    if (!q) continue;
    const key = `${q.about}|${q.intent}|${q.slotKey ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

/** 各層（authoritative or shared 射影）から packet を組み立てる。決定論。 */
function assemble(d: DecisionResult, rd: ReadinessResult, ct: ContingencyPlan, authoritative: boolean): PlanDecisionPacket {
  const contingencyActive = ct.branches.some((b) => b.fallbackAction !== "keep_plan");
  const inputError = d.inputError ?? rd.inputError ?? null;
  const inconsistent = d.state === "recommend" && d.recommendedProposalId !== ct.recommendedProposalId;

  let nextAction: NextAction;
  let blockedReason: string | null = null;

  if (inputError !== null) {
    nextAction = "blocked";
    blockedReason = inputError;
  } else if (inconsistent) {
    nextAction = "blocked";
    blockedReason = "upstream_inconsistent";
  } else if (d.state === "blocked") {
    nextAction = "blocked";
    blockedReason = "decision_blocked";
  } else if (d.state === "needs_question") {
    nextAction = "ask_question";
  } else if (d.state === "tie") {
    nextAction = "await_preference";
  } else {
    // recommend
    if (rd.state === "blocked") {
      nextAction = "blocked";
      blockedReason = "readiness_blocked";
    } else if (rd.state === "not_ready") {
      nextAction = "blocked";
      blockedReason = "readiness_not_ready";
    } else if (rd.state === "needs_question") {
      nextAction = "ask_question";
    } else if (contingencyActive) {
      nextAction = "handle_contingency";
    } else if (rd.state === "needs_confirmation") {
      nextAction = "confirm";
    } else {
      nextAction = "propose_plan";
    }
  }

  // 実行権限: authoritative かつ完全クリア（propose_plan + readiness 権限 + contingency 権限）のときのみ。
  const executionAuthority =
    authoritative && nextAction === "propose_plan" && hasActionAuthority(rd) && hasContingencyActionAuthority(ct);

  const fallbackSummary: FallbackSummaryEntry[] = ct.branches.map((b) => ({
    trigger: b.trigger,
    fallbackAction: b.fallbackAction,
    switchToProposalId: b.switchToProposalId,
    visibility: b.visibility,
  }));

  const rationale: ViewerScopedRationale = {
    shared: NEXT_JA[nextAction] + "。",
    forParticipant: mergeForParticipant(d.rationale, rd.rationale, ct.rationale),
  };

  return {
    authoritative,
    executionAuthority,
    recommendedProposalId: d.recommendedProposalId,
    decisionState: d.state,
    readinessState: rd.state,
    contingencyActive,
    nextAction,
    questionQueue: dedupeQuestions([d.followUpQuestion, rd.pendingQuestion]),
    confirmationQueue: rd.requiredConfirmations,
    fallbackSummary,
    blockedReason,
    rationale,
    inputError,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// public
// ─────────────────────────────────────────────────────────────────────────────

/** authoritative packet（実行権限の正本）。 */
export function buildPlanDecisionPacket(input: BuildPacketInput): PlanDecisionPacket {
  return assemble(input.decision, input.readiness, input.contingency, true);
}

/**
 * shared 射影（display 専用・両者に見せてよい）。
 *   - **各層の shared 射影から組み立て直す**ため、private confirmation/contingency は存在ごと消える。
 *   - authoritative=false・executionAuthority は構造的に false（実行権限に化けない）。
 */
export function buildSharedPacketView(input: BuildPacketInput): PlanDecisionPacket {
  return assemble(
    toSharedDecisionView(input.decision),
    toSharedReadinessView(input.readiness),
    toSharedContingencyView(input.contingency),
    false,
  );
}

/**
 * viewer 射影（特定 participant 向け・display 専用）。
 *   shared 射影 + その viewer 自身の private rationale 注記のみ復元。実行権限は付与しない（authoritative=false）。
 */
export function buildViewerPacketView(input: BuildPacketInput, viewerParticipantId: string): PlanDecisionPacket {
  const shared = buildSharedPacketView(input);
  const auth = buildPlanDecisionPacket(input);
  const own = auth.rationale.forParticipant[viewerParticipantId];
  return {
    ...shared,
    rationale: { shared: shared.rationale.shared, forParticipant: own !== undefined ? { [viewerParticipantId]: own } : {} },
  };
}
