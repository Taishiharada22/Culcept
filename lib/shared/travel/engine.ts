/**
 * T9B — Travel pure engine orchestrator / facade（**pure・未配線**）
 *
 * 設計: engine-types.ts + GPT note 2026-06-12
 *
 * 役割: T3 buildProposals → T4 compareProposals → T5 decide → T6 assessReadiness →
 *       T7 planContingencies → T8 buildPlanDecisionPacket を **安全に束ねる単一入口**。
 *       各層のロジックは複製せず compose のみ。
 *
 * 厳守（純・決定論・権限境界）:
 *   - 場所/経路/天候/予約 API・DB・runtime・LLM・UI なし。import は travel core/types のみ。
 *   - 各層の fail-closed 意味論を保持（inputError / blocked が end-to-end で伝播）。
 *   - ★ **authoritative path は authoritative 上流出力のみを使う**。shared/viewer 射影を
 *     authoritative downstream の入力に**決して使わない**。射影は **最終境界でのみ**構築する。
 */

import { buildProposals } from "./proposal-builder";
import { compareProposals } from "./proposal-comparator";
import { decide } from "./decision-core";
import { assessReadiness } from "./readiness-core";
import { planContingencies } from "./contingency-core";
import { buildPlanDecisionPacket, buildSharedPacketView, buildViewerPacketView, type BuildPacketInput } from "./packet-core";
import type { EngineDiagnostics, TravelPlanEngineInput, TravelPlanEngineOutput } from "./engine-types";

export function runTravelPlanEngine(input: TravelPlanEngineInput): TravelPlanEngineOutput {
  const { slots, participantIds } = input;

  // ── authoritative chain（authoritative 出力のみを下流へ・射影は使わない） ──
  const result = buildProposals({ participantIds, slots });
  const comparison = compareProposals({ result, slots });
  const decision = decide({ comparison, fairnessHistory: input.fairnessHistory });
  const selected = result.proposals.find((p) => p.candidateId === decision.recommendedProposalId) ?? null;
  const readiness = assessReadiness({ decision, selected, policy: input.policy });
  const contingency = planContingencies({ decision, readiness, comparison, scenarios: input.scenarios ?? [] });

  const packetInput: BuildPacketInput = { result, comparison, decision, readiness, contingency };

  // ── packet: authoritative + 射影（射影は最終境界でのみ・authoritative 入力から導出） ──
  const authoritative = buildPlanDecisionPacket(packetInput);
  const shared = buildSharedPacketView(packetInput);
  const viewer = input.viewerId !== undefined ? buildViewerPacketView(packetInput, input.viewerId) : null;

  const diagnostics: EngineDiagnostics = {
    proposalCount: result.proposals.length,
    rejectedAngleCount: result.rejected.length,
    paretoCount: comparison.paretoOptimalIds.length,
    contingencyBranchCount: contingency.branches.length,
    activeContingencyCount: contingency.branches.filter((b) => b.fallbackAction !== "keep_plan").length,
    decisionState: decision.state,
    readinessState: readiness.state,
    nextAction: authoritative.nextAction,
    executionAuthority: authoritative.executionAuthority,
  };

  return { authoritative, shared, viewer, diagnostics, inputError: authoritative.inputError };
}
