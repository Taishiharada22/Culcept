/**
 * C4-B — Candidate Collection Draft helper（pure・immutable・**TravelCorePlan 非変更**）
 *
 * 設計正本: docs/t11-candidate-insertion-adapter-design.md（§6 案 C・§11 C4-B）
 *
 * 役割: 完成 core-types `TravelCandidate` を `CandidateCollectionDraft` に **immutable に追加**する。
 *   ★ TravelCorePlan を mutate / copy-append / candidates[] insert いずれもしない。
 *
 * 厳守（fail-closed）:
 *   - 入力は完成 core-types `TravelCandidate` のみ（型で限定 + runtime guard）。
 *   - 禁止種別（envelope / conversion 中間 / display / CoAlter / FitResult）は runtime guard で拒否。
 *   - 重複 candidateId / 空 candidateId は fail-closed。
 *   - ranking/dominance/pareto を計算しない・accepted/final state を作らない・権限を付与しない。
 *   - converter / engine / evaluateFit / display projection / DB/API/fetch を呼ばない。
 */

import type { TravelCandidate } from "./core-types";
import type {
  CandidateCollectionDraft,
  CandidateInsertionResult,
  InsertionRejectionReason,
} from "./candidate-collection-draft-types";

/** core-types TravelCandidate でない既知種別（envelope/conversion/display/collection 等）の outcome。 */
const FOREIGN_OUTCOMES = new Set<string>([
  "scheduled_draft_candidate_envelope",
  "converted",
  "conversion_ready",
  "conversion_rejected",
  "candidate_collection_draft",
  "added_to_collection_draft",
  "insertion_rejected",
  "scheduled_draft",
  "no_candidate",
  "no_draft",
]);

function rejectIns(reason: InsertionRejectionReason, candidateId?: string): CandidateInsertionResult {
  return {
    outcome: "insertion_rejected",
    serverOnly: true,
    diagnostic: candidateId !== undefined ? { reason, candidateId } : { reason },
  };
}

/** 禁止種別（foreign discriminant / server-only marker / display status）を検出。 */
function isForeignKind(c: Record<string, unknown>): boolean {
  if (typeof c.outcome === "string" && FOREIGN_OUTCOMES.has(c.outcome)) return true;
  if (c.status === "draft_proposal") return true; // DisplayScheduledItinerary
  if (c.serverOnly === true) return true; // envelope / conversion result / collection
  return false;
}

/** core-types TravelCandidate の必須形（CoAlter 形・FitResult を弾く）。 */
function looksLikeCoreCandidate(c: Record<string, unknown>): boolean {
  const rationale = c.rationale as Record<string, unknown> | null | undefined;
  return (
    typeof c.title === "string" &&
    Array.isArray(c.tags) &&
    typeof c.tradeoff === "object" &&
    c.tradeoff !== null &&
    typeof c.itinerary === "object" &&
    c.itinerary !== null &&
    !!rationale &&
    typeof rationale === "object" &&
    typeof rationale.shared === "string" && // CoAlter は perUserA/synthesis・shared を持たない
    (c.uncertainty === "high" || c.uncertainty === "medium" || c.uncertainty === "low")
  );
}

/**
 * 完成 core-types TravelCandidate を CandidateCollectionDraft に immutable 追加。
 *   prev=null は空から開始。prev は非変更（新しい collection を返す）。
 *   成功: added_to_collection_draft。失敗: insertion_rejected（中立 reason）。
 */
export function addTravelCandidateToCollectionDraft(
  prev: CandidateCollectionDraft | null,
  candidate: TravelCandidate,
): CandidateInsertionResult {
  // ① candidate 健全性 + 種別 guard（runtime・cast 越しの誤入力も弾く）
  if (!candidate || typeof candidate !== "object") return rejectIns("invalid_input");
  const c = candidate as unknown as Record<string, unknown>;
  if (isForeignKind(c)) return rejectIns("forbidden_input_kind");
  if (!looksLikeCoreCandidate(c)) return rejectIns("not_core_types_candidate");

  // ② candidateId（非空）
  const id = c.candidateId;
  if (typeof id !== "string" || id.trim().length === 0) return rejectIns("empty_candidate_id");

  // ③ prev 健全性（非変更で読むだけ）
  if (prev !== null && (typeof prev !== "object" || !Array.isArray(prev.candidates))) {
    return rejectIns("invalid_input");
  }
  const existing = prev ? prev.candidates : [];

  // ④ 重複 candidateId は fail-closed
  if (existing.some((e) => e.candidateId === id)) return rejectIns("duplicate_candidate_id", id);

  // ⑤ immutable append（prev / TravelCorePlan を mutate しない・ranking しない）
  const collection: CandidateCollectionDraft = {
    outcome: "candidate_collection_draft",
    serverOnly: true,
    authoritative: false,
    ranked: false,
    candidates: [...existing, candidate], // storage/display order のみ
  };
  return { outcome: "added_to_collection_draft", serverOnly: true, collection };
}
