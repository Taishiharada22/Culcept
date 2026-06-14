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
import { deriveProposalFitSummaries } from "./fit-decision-adapter";
import type { EngineDiagnostics, TravelPlanEngineInput, TravelPlanEngineOutput } from "./engine-types";
import type { PlanDecisionPacket } from "./packet-types";

/**
 * fit summary を packet に **advisory として additive 付与**。
 *   - fit input 不在 → packet をそのまま返す（**fitSummary key を足さない＝byte 同一**）。
 *   - **executionAuthority / dominance / ranking には一切触れない**（advisory のみ）。
 *   - authoritative packet = full grade 反映 / shared・viewer packet = toSharedFitView 由来。
 */
function withFitSummary(
  packet: PlanDecisionPacket,
  proposalIds: readonly string[],
  fit: TravelPlanEngineInput["fit"],
  mode: "authoritative" | "shared",
): PlanDecisionPacket {
  if (!fit || fit.length === 0) return packet; // no-op: 従来 packet と byte 同一
  return { ...packet, fitSummary: deriveProposalFitSummaries(proposalIds, fit, mode).summaries };
}

export function runTravelPlanEngine(input: TravelPlanEngineInput): TravelPlanEngineOutput {
  const { slots, participantIds } = input;

  // ── authoritative chain（authoritative 出力のみを下流へ・射影は使わない） ──
  const result = buildProposals({ participantIds, slots });
  const comparison = compareProposals({ result, slots });
  const decision = decide({ comparison, fairnessHistory: input.fairnessHistory });
  const selected = result.proposals.find((p) => p.candidateId === decision.recommendedProposalId) ?? null;
  // ★ T11-C7/F: cancelWeather は engine input 経由で readiness に thread（fit-core 非経由）。不在時不変。
  const readiness = assessReadiness({ decision, selected, policy: input.policy, cancelWeather: input.cancelWeather });
  const contingency = planContingencies({ decision, readiness, comparison, scenarios: input.scenarios ?? [] });

  const packetInput: BuildPacketInput = { result, comparison, decision, readiness, contingency };

  // ── packet: authoritative + 射影（射影は最終境界でのみ・authoritative 入力から導出） ──
  const authoritative = withFitSummary(buildPlanDecisionPacket(packetInput), result.proposals.map((p) => p.candidateId), input.fit, "authoritative");
  const shared = withFitSummary(buildSharedPacketView(packetInput), result.proposals.map((p) => p.candidateId), input.fit, "shared");
  const viewer = input.viewerId !== undefined
    ? withFitSummary(buildViewerPacketView(packetInput, input.viewerId), result.proposals.map((p) => p.candidateId), input.fit, "shared")
    : null;

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
