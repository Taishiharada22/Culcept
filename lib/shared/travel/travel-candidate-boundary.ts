/**
 * B — TravelCandidate Construction Boundary helper（pure・insertion なし）
 *
 * 設計正本: docs/t11-travelcandidate-construction-boundary-design.md（§12 案 B）
 *
 * 役割: server-only `AssemblyBridgeResult`（scheduled_draft）を
 *   `ScheduledDraftCandidateEnvelope`（= TravelCandidate **でない**）に**包むだけ**。
 *
 * 厳守（fail-closed）:
 *   - candidates[] insertion なし・TravelCorePlan mutation なし。
 *   - ranking/dominance 計算なし・acceptance state なし。
 *   - booking/calendar/action 権限なし。
 *   - runTravelPlanEngine / evaluateFit / assembleScheduledDraft / display projection を**呼ばない**。
 *   - raw private diagnostics を出さない（中立 reason のみ）。
 *   - 不正入力（no_draft / 非整合 draft / null）は **no_candidate** で fail-closed。
 *   - fetch/API/DB/Supabase/外部/M2/app/UI を import しない（pure）。
 */

import type {
  ScheduledDraftCandidateConstructionInput,
  ScheduledDraftCandidateConstructionResult,
  ScheduledDraftCandidateEnvelope,
} from "./travel-candidate-boundary-types";

/**
 * scheduled draft bridge envelope → draft-candidate envelope（候補化の手前で包むだけ）。
 *   成功: ScheduledDraftCandidateEnvelope（serverOnly/authoritative:false/draft:true/insertable:false）。
 *   失敗: no_candidate（中立 reason）。
 */
export function buildScheduledDraftCandidateEnvelope(
  input: ScheduledDraftCandidateConstructionInput,
): ScheduledDraftCandidateConstructionResult {
  // 入力自体の健全性（fail-closed）
  if (!input || typeof input !== "object" || !input.bridge) {
    return { outcome: "no_candidate", serverOnly: true, diagnostic: { reason: "invalid_input" } };
  }
  const { bridge } = input;

  // ★ 唯一の正本入力は scheduled_draft 側のみ。no_draft 等はここで弾く。
  if (bridge.outcome !== "scheduled_draft") {
    return {
      outcome: "no_candidate",
      serverOnly: true,
      diagnostic: { reason: "non_scheduled_draft_bridge", rejectedBridgeOutcome: bridge.outcome },
    };
  }

  const draft = bridge.draft;
  // draft envelope の不変条件を再確認（server-only/非権威/draft・candidateId 必須）。fail-closed。
  if (
    !draft ||
    draft.outcome !== "scheduled_draft" ||
    draft.authoritative !== false ||
    draft.draft !== true ||
    typeof draft.candidateId !== "string" ||
    draft.candidateId.length === 0
  ) {
    return {
      outcome: "no_candidate",
      serverOnly: true,
      diagnostic: { reason: "missing_scheduled_draft", rejectedBridgeOutcome: bridge.outcome },
    };
  }

  // 包むだけ（copy-only・rank/insert/accept いずれもしない）。
  const envelope: ScheduledDraftCandidateEnvelope = {
    outcome: "scheduled_draft_candidate_envelope",
    serverOnly: true,
    authoritative: false,
    draft: true,
    insertable: false,
    candidateId: input.candidateIdOverride ?? draft.candidateId,
    scheduledDraft: draft,
  };
  // 任意フィールドは供給時のみ付与（bounded advisory のみ・raw 不可は型が保証）。
  if (input.proposalId !== undefined) envelope.proposalId = input.proposalId;
  if (input.fitSummary !== undefined) envelope.fitSummary = input.fitSummary;
  if (input.readinessSummary !== undefined) envelope.readinessSummary = input.readinessSummary;

  return envelope;
}
