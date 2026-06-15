/**
 * T11-A(R2F)-B — Retrieval-to-Fit 契約型（**pure types only**・未配線）
 *
 * 設計: docs/t11-a-retrieval-to-fit-integration-design.md（+ CEO/GPT 補正: missing fit subject は fail-closed・first slice は 1:1）
 *
 * 役割: caller が束ねた retrieved entity + 供給 FitUserState/FitSubject + proposal id から
 *   `ProposalFitInput[]` を作る adapter の契約。**ranking 変更なし・engine 呼出なし・display 生成なし・
 *   外部 retrieval/M2/本番/authority なし**。
 *
 * 純粋性: 型 + as-const のみ。**display packet / projection / raw PlanDecisionPacket / authority / ranking 型を含まない**。
 */

import type { FitContext, FitSubject } from "./fit-types";
import type { EntityRetrievalCandidate } from "./entity-retrieval-types";
import type { ProposalFitInput } from "./fit-decision-adapter-types";

/** caller 供給の binding（proposal/candidate id → retrieved entity id・**strict 一致のみ・1:1**） */
export interface ProposalEntityBinding {
  proposalId: string;
  /** retrieved entity の placeRefId（= EntityRetrievalCandidate.placeRefId） */
  retrievalCandidateId: string;
}
export type ProposalEntityBindingMap = ProposalEntityBinding[];

export const RETRIEVAL_TO_FIT_DIAGNOSTIC_REASONS = [
  "unknown_proposal_id",
  "unknown_entity_id",
  "duplicate_binding",
  "missing_fit_subject",
  "missing_entity",
  "invalid_binding",
] as const;
export type RetrievalToFitDiagnosticReason = (typeof RETRIEVAL_TO_FIT_DIAGNOSTIC_REASONS)[number];

/** ★ diagnostic は id/理由のみ・**private user state を含まない** */
export interface RetrievalToFitDiagnostic {
  reason: RetrievalToFitDiagnosticReason;
  proposalId?: string;
  retrievalCandidateId?: string;
}

export interface RetrievalToFitInput {
  /** 既存 proposal 層の id（順序なし参照） */
  proposalIds: string[];
  /** G2 retrieval 出力 */
  candidates: EntityRetrievalCandidate[];
  /** ★ 供給 fit subject(solo/group)。**欠如 → fail-closed(missing_fit_subject)**・default user を作らない */
  subject?: FitSubject;
  context?: FitContext;
  /** caller 責務の binding（entity 捏造なし・text 推論なし） */
  bindings: ProposalEntityBindingMap;
}

export interface RetrievalToFitResult {
  /** = `TravelPlanEngineInput.fit` の型。FitResult は `fit` 内に server-side で留まる */
  fitInputs: ProposalFitInput[];
  diagnostics: RetrievalToFitDiagnostic[];
}
