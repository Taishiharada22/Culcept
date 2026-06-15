/**
 * C3 — TravelCandidate Conversion helper（pure・**insertion なし**）
 *
 * 設計正本: docs/t11-candidate-insertion-preflight.md（§6 案 B・§11 C3）
 *
 * 役割: 完全明示の `TravelCandidateConversionInput` を **core-types `TravelCandidate`** に変換する。
 *   ★ target は core-types `TravelCandidate` **のみ**（CoAlter 側 TravelCandidate は import/構築しない）。
 *
 * 厳守（fail-closed）:
 *   - source は `ScheduledDraftCandidateEnvelope`（runtime でも discriminant 確認）。
 *   - rich field は **explicitInterpretation から**（title/tags/rationale/uncertainty/tradeoff/reversal）。
 *     draft text から **生成しない**。空/whitespace は reject。
 *   - factual itinerary は **scheduled draft 由来のみ**（derivedAllowed の consent 必須）。価格/空き/理由を作らない。
 *   - DisplayScheduledItinerary を source にしない・raw FitResult を使わない（型で排除・runtime でも触れない）。
 *   - engine/evaluateFit/assembler/projection を呼ばない・candidates[] に insert しない・ranking/dominance しない。
 *   - acceptance/final state なし・executionAuthority/booking/calendar/action なし。
 */

import type { TravelCandidate } from "./core-types";
import type {
  TravelCandidateConversionInput,
  TravelCandidateConversionOutcome,
  TravelCandidateConversionRejectionReason,
} from "./travel-candidate-conversion-types";

/** 非空文字列（whitespace のみは不可）。 */
function nonEmptyStr(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function reject(
  reason: TravelCandidateConversionRejectionReason,
  missingFields?: string[],
): TravelCandidateConversionOutcome {
  return {
    outcome: "conversion_rejected",
    serverOnly: true,
    diagnostic: missingFields && missingFields.length > 0 ? { reason, missingFields } : { reason },
  };
}

/**
 * 完全明示の変換入力 → core-types TravelCandidate（構築のみ・insert しない）。
 *   成功: { outcome:"converted", candidate }（未挿入）。失敗: conversion_rejected（中立 reason）。
 */
export function convertScheduledDraftEnvelopeToTravelCandidate(
  input: TravelCandidateConversionInput,
): TravelCandidateConversionOutcome {
  if (!input || typeof input !== "object") return reject("invalid_input");
  const { source, explicitInterpretation: interp, explicitCandidateMetadata: meta, derivedAllowed: derived } = input;

  // ① source: ScheduledDraftCandidateEnvelope の不変条件（runtime fail-closed）
  if (
    !source ||
    source.outcome !== "scheduled_draft_candidate_envelope" ||
    source.serverOnly !== true ||
    source.insertable !== false ||
    !source.scheduledDraft ||
    source.scheduledDraft.outcome !== "scheduled_draft" ||
    !source.scheduledDraft.itinerary
  ) {
    return reject("source_not_convertible_envelope");
  }

  // ② derivedAllowed: factual itinerary は scheduled_draft 由来のみ（consent 必須・捏造禁止）
  if (!derived || derived.itinerarySource !== "scheduled_draft" || !Array.isArray(derived.constraints)) {
    return reject("fabrication_not_allowed", ["derivedAllowed"]);
  }

  // ③ explicitCandidateMetadata: candidateId 必須
  if (!meta || !nonEmptyStr(meta.candidateId)) {
    return reject("missing_explicit_metadata", ["candidateId"]);
  }

  // ④ explicitInterpretation: 必須 rich field の存在 + 非空（placeholder 不可）
  if (!interp || typeof interp !== "object") {
    return reject("missing_explicit_interpretation", ["explicitInterpretation"]);
  }
  const missing: string[] = [];
  if (!nonEmptyStr(interp.title)) missing.push("title");
  if (!Array.isArray(interp.tags) || interp.tags.length === 0 || !interp.tags.every(nonEmptyStr)) missing.push("tags");
  if (!interp.rationale || !nonEmptyStr(interp.rationale.shared) || typeof interp.rationale.forParticipant !== "object" || interp.rationale.forParticipant === null) missing.push("rationale");
  if (interp.uncertainty !== "high" && interp.uncertainty !== "medium" && interp.uncertainty !== "low") missing.push("uncertainty");
  if (
    !interp.tradeoff ||
    !Number.isFinite(interp.tradeoff.cost) ||
    !Number.isFinite(interp.tradeoff.distance) ||
    !Number.isFinite(interp.tradeoff.fatigue) ||
    !Number.isFinite(interp.tradeoff.experienceVariety)
  ) {
    missing.push("tradeoff");
  }
  if (missing.length > 0) return reject("missing_explicit_interpretation", missing);

  // ⑤ 構築（fabrication なし・全 field は明示 or factual source 由来）
  const candidate: TravelCandidate = {
    candidateId: meta.candidateId,
    title: interp.title,
    tags: interp.tags,
    itinerary: source.scheduledDraft.itinerary, // factual 構造（derivedAllowed consent 済）
    tradeoff: interp.tradeoff,
    constraints: derived.constraints, // explicit factual のみ
    rationale: interp.rationale,
    uncertainty: interp.uncertainty,
    ...(interp.reversal !== undefined ? { reversal: interp.reversal } : {}),
  };

  return { outcome: "converted", serverOnly: true, insertable: false, targetType: "core_types_travel_candidate", candidate };
}
