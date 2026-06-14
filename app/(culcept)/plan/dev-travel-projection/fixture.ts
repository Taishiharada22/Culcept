/**
 * T11-A — Travel projection dev preview **fixture**（live engine 非配線・runtime 非実行）。
 *
 * 役割: 代表的な **display-tier** `DisplayPacketForClient` を手で組み、**実 mapper**
 *   `buildPlanIntelligenceProjection` を通して `PlanIntelligenceProjection` を得る。
 *   → preview は「実 projection logic が display packet から何を作るか」を観測する（engine は実行しない）。
 *
 * 厳守: authoritative packet / raw FitResult / diagnostics を含まない。authoritative=false・
 *   executionAuthority=false 固定。fitSummary は bounded（ProposalFitSummary）。
 *   ★ brand 付与は fixture 内の cast に限定（display tier であることは値で担保＝authoritative:false 等）。
 */

import type { PlanDecisionPacket } from "@/lib/shared/travel/packet-types";
import type { DisplayPacketForClient } from "@/lib/shared/travel/engine-consume-types";
import { buildPlanIntelligenceProjection } from "@/lib/shared/travel/plan-intelligence-projection";
import type { PlanIntelligenceProjection } from "@/lib/shared/travel/plan-intelligence-projection-types";

/** preview viewer（自分視点の viewerNote を見せるため）。 */
export const FIXTURE_VIEWER_ID = "you";

/** 代表的な display packet（shared/viewer 射影相当・private は構造的に含まない）。 */
const FIXTURE_DISPLAY_PACKET = {
  authoritative: false,
  executionAuthority: false,
  recommendedProposalId: "proposal:relaxed",
  decisionState: "recommend",
  readinessState: "needs_confirmation",
  contingencyActive: true,
  nextAction: "confirm",
  questionQueue: [{ about: "missing_slot", intent: "ask_budget_band", priority: "recommended", slotKey: "budget_band" }],
  confirmationQueue: [
    { reason: "weather_reversal_uncertainty", visibility: "shared" },
    { reason: "paid_booking", visibility: "shared" },
  ],
  fallbackSummary: [
    { trigger: "rain_or_weather", fallbackAction: "switch_proposal", switchToProposalId: "proposal:culture", visibility: "shared" },
  ],
  blockedReason: null,
  rationale: {
    shared: "雨予報が不確実なため、屋内案への切り替えを確認できる状態です。",
    forParticipant: { [FIXTURE_VIEWER_ID]: "あなたが大事にしている「静かさ」を優先して組んでいます。" },
  },
  inputError: null,
  fitSummary: [
    {
      candidateId: "proposal:relaxed",
      grade: "good",
      labelCap: null,
      labelStability: "stable",
      confidenceBand: "high",
      mismatchCount: 1,
      riskCodes: ["outdoor_weather_exposure"],
      missingFields: ["cancellationFlexibility"],
    },
  ],
} satisfies PlanDecisionPacket as unknown as DisplayPacketForClient;

/** 実 mapper を通した fixture projection（preview が表示する read-only object）。 */
export const FIXTURE_TRAVEL_PROJECTION: PlanIntelligenceProjection = buildPlanIntelligenceProjection({
  packet: FIXTURE_DISPLAY_PACKET,
  viewerId: FIXTURE_VIEWER_ID,
});
