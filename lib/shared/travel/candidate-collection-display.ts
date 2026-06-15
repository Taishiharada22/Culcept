/**
 * D2 — Candidate Collection Display Projection helper（pure・client-safe）
 *
 * 設計正本: docs/t11-candidate-collection-display-preview-preflight.md（§4/§5）
 *
 * 役割: server-only `CandidateCollectionDraft` → client 表示用 `DisplayCandidateCollection`。
 *   read-only copy のみ（shared 情報のみ・private/serverOnly/内部 flag を除去）。
 *
 * 厳守:
 *   - rationale は **shared のみ**（`forParticipant` は写さない）。
 *   - serverOnly / authoritative / ranked / dominance / pareto / rank / FitResult / 内部 placeRefId を出さない。
 *   - **ranking を生成しない・score でソートしない**（入力 candidates の順を保つ＝表示順）。
 *   - engine / evaluateFit / converter / insertion helper / DB/API/fetch を呼ばない。
 */

import type { CandidateCollectionDraft } from "./candidate-collection-draft-types";
import type { TravelCandidate } from "./core-types";
import type { DisplayCandidateCard, DisplayCandidateCollection } from "./candidate-collection-display-types";
import { projectDisplayDays } from "./scheduled-draft-display";

/** 不確実性の shared-safe 表示語（factual・実行を含意しない）。 */
function uncertaintyLabel(u: TravelCandidate["uncertainty"]): string {
  const word = u === "high" ? "高" : u === "low" ? "低" : "中";
  return `不確実性: ${word}`;
}

/** 変更可否の shared-safe ノート（cancellable + 任意 deadline/fee）。 */
function reversalNote(r: NonNullable<TravelCandidate["reversal"]>): string {
  const base = r.cancellable ? "変更・キャンセル可" : "変更・キャンセル不可";
  const parts: string[] = [base];
  if (r.deadline !== undefined) parts.push(`期限 ${r.deadline}`);
  if (r.fee !== undefined) parts.push(`手数料 ¥${r.fee.lo}–¥${r.fee.hi}`);
  return parts.join(" ・ ");
}

function projectCard(c: TravelCandidate): DisplayCandidateCard {
  return {
    candidateId: c.candidateId,
    title: c.title,
    tags: [...c.tags],
    // ★ shared のみ・forParticipant（private）は写さない
    rationaleShared: c.rationale.shared,
    uncertaintyLabel: uncertaintyLabel(c.uncertainty),
    tradeoffSummary: {
      cost: c.tradeoff.cost,
      distance: c.tradeoff.distance,
      fatigue: c.tradeoff.fatigue,
      experienceVariety: c.tradeoff.experienceVariety,
    },
    ...(c.reversal !== undefined ? { reversalNote: reversalNote(c.reversal) } : {}),
    days: projectDisplayDays(c.itinerary),
  };
}

/**
 * CandidateCollectionDraft → DisplayCandidateCollection。
 *   ★ 入力順を保持（ソート/ranking しない）。serverOnly/ranked/private を出さない。
 */
export function projectDisplayCandidateCollection(draft: CandidateCollectionDraft): DisplayCandidateCollection {
  const candidates = Array.isArray(draft.candidates) ? draft.candidates : [];
  return { status: "candidate_draft_collection", cards: candidates.map(projectCard) };
}
