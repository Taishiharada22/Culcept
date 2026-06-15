/**
 * T11-A(R2F)-C — Retrieval-to-Fit adapter（**pure・未配線**）
 *
 * 設計: retrieval-to-fit-types.ts + docs/t11-a-retrieval-to-fit-integration-design.md（+ 補正: missing subject fail-closed・1:1）
 *
 * 役割: caller binding(strict) で retrieved entity を proposal に紐づけ、供給 FitSubject で `evaluateFit` し
 *   `ProposalFitInput[]` を産む。**ranking 変更なし・display 生成なし・authority なし・外部/M2/本番なし**。
 *
 * 厳守（純・決定論・境界）:
 *   - **`runTravelPlanEngine`(engine) を呼ばない**。`evaluateFit`(fit model の pure 評価) は呼ぶ。
 *   - **missing fit subject → fail-closed**（no fit inputs・default user を作らない・entity-only scoring しない）。
 *   - strict id 一致のみ・未知/重複は diagnostic（捏造しない・proposal copy/areaPlaceholder から推論しない）。
 *   - **FitResult は ProposalFitInput.fit 内に server-side で留め**、raw FitResult を別に出さない。display packet/projection/cues を返さない。
 *   - import は fit-core(evaluateFit) + 型のみ。fetch/API/DB/Supabase/M2/UI なし。
 */

import { evaluateFit } from "./fit-core";
import type { ProposalFitInput } from "./fit-decision-adapter-types";
import type {
  RetrievalToFitDiagnostic,
  RetrievalToFitInput,
  RetrievalToFitResult,
} from "./retrieval-to-fit-types";

/**
 * retrieved entity + 供給 FitSubject + proposal ids + caller binding → ProposalFitInput[]。
 *   - subject 欠如 → fail-closed（missing_fit_subject・fitInputs 空）。
 *   - 重複 binding（同 proposalId 複数）→ fail-closed（多 entity per proposal は HOLD）。
 *   - 未知 proposal/entity id → diagnostic（捏造しない）。
 *   - valid binding のみ `evaluateFit`（pure・engine でない）→ ProposalFitInput。
 */
export function deriveProposalFitInputsFromRetrievedEntities(input: RetrievalToFitInput): RetrievalToFitResult {
  const diagnostics: RetrievalToFitDiagnostic[] = [];

  // ★ missing fit subject → fail-closed（default user を作らない・entity-only scoring しない）
  if (!input.subject) {
    diagnostics.push({ reason: "missing_fit_subject" });
    return { fitInputs: [], diagnostics };
  }
  const subject = input.subject;

  const proposalSet = new Set(input.proposalIds);
  const entityById = new Map(input.candidates.map((c) => [c.placeRefId, c]));

  // 重複 binding（同 proposalId が複数）→ fail-closed（first slice は 1:1）
  const counts = new Map<string, number>();
  for (const b of input.bindings) counts.set(b.proposalId, (counts.get(b.proposalId) ?? 0) + 1);
  const dup = new Set([...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id));
  for (const p of dup) diagnostics.push({ reason: "duplicate_binding", proposalId: p });

  const fitInputs: ProposalFitInput[] = [];
  const bound = new Set<string>();
  for (const b of input.bindings) {
    if (dup.has(b.proposalId)) continue; // 重複 proposal は採用しない
    if (!b.proposalId) {
      diagnostics.push({ reason: "invalid_binding", ...(b.retrievalCandidateId ? { retrievalCandidateId: b.retrievalCandidateId } : {}) });
      continue;
    }
    if (!b.retrievalCandidateId) {
      diagnostics.push({ reason: "missing_entity", proposalId: b.proposalId });
      continue;
    }
    if (!proposalSet.has(b.proposalId)) {
      diagnostics.push({ reason: "unknown_proposal_id", proposalId: b.proposalId });
      continue;
    }
    const cand = entityById.get(b.retrievalCandidateId);
    if (!cand) {
      diagnostics.push({ reason: "unknown_entity_id", proposalId: b.proposalId, retrievalCandidateId: b.retrievalCandidateId });
      continue;
    }
    if (bound.has(b.proposalId)) continue; // 1:1（既に bound）
    bound.add(b.proposalId);
    // ★ valid binding → evaluateFit（fit model の pure 評価・runTravelPlanEngine ではない）。FitResult は fit 内に server-side。
    const fit = evaluateFit({ entity: cand.entity, subject, ...(input.context ? { context: input.context } : {}) });
    fitInputs.push({ candidateId: b.proposalId, fit });
  }

  return { fitInputs, diagnostics };
}
