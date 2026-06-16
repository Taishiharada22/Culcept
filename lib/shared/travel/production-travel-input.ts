/**
 * B2-prod B — Production Travel Input helper（**pure・未配線**）
 *
 * 設計正本: docs/t11-production-travel-input-provider-preflight.md（§7/§13 案 B + CEO 補正: manual_entity_evidence は hard 不可）
 *
 * 役割: 既存 G1 `getSessionIntakeTravelInput`（confirmed-real ロジック）を **production-like gate** で wrap し、
 *   出力を **5 状態 `ProductionTravelInput`** に写す。confirmed-real ロジックは**複製しない**（G1 を呼ぶ）。
 *
 * 厳守（fail-closed・境界）:
 *   - explicit slot/intake 入力のみ消費（raw chat / raw LLM / UI コピー推論なし）。
 *   - production-like gate（fixtureAllowed:false）のみで動く・**dev_fixture を拒否**・**fixture fallback なし**・fake user なし・捏造なし。
 *   - hard 前提は session/intake 側（destination/date/participants）。entity 側 evidence は hard を満たさない（型が surface でない）。
 *   - engine を呼ばない・display packet/projection/cues を返さない。
 *   - env/Date.now/Math.random/fetch/DB/M2/route・weather・place なし。
 */

import type { TravelInputProvenance, TravelInputProviderGate, TravelIntakeInput } from "./travel-input-provider-types";
import type { ProductionInputInvalidReason, ProductionTravelInput } from "./production-travel-input-types";
import { getSessionIntakeTravelInput } from "./session-intake-provider";

const EMPTY_PROVENANCE: TravelInputProvenance = { sources: [], realOnly: true };

/** 非空 participant の構造違反のみ（空は missing 扱いで downstream）。 */
function structuralParticipantInvalidReasons(
  participantIds: readonly string[],
  viewerId: string | undefined,
): ProductionInputInvalidReason[] {
  const reasons: ProductionInputInvalidReason[] = [];
  if (participantIds.length === 0) return reasons; // 空 = missing（不正でない）
  if (participantIds.length > 2) reasons.push("too_many_participants");
  if (new Set(participantIds).size !== participantIds.length) reasons.push("duplicate_participants");
  if (viewerId !== undefined && !participantIds.includes(viewerId)) reasons.push("viewer_not_in_participants");
  return reasons;
}

/**
 * production-like context での real input 取得（5 状態・fail-closed）。
 *   gate.fixtureAllowed は **false 必須**（production-like）。true（fixture 許可）は real path から拒否。
 */
export function getProductionTravelInput(
  intake: TravelIntakeInput,
  gate: TravelInputProviderGate,
): ProductionTravelInput {
  // ① session/intake source 不在 → unavailable（fixture 代入しない）
  if (!intake || typeof intake !== "object" || !Array.isArray(intake.slots) || !Array.isArray(intake.participantIds)) {
    return { status: "unavailable", provenance: EMPTY_PROVENANCE, reason: "no_session_intake" };
  }
  // ② production-like gate のみ許可。fixture 許可 gate（dev）は real path から拒否（fixture fallback しない）
  if (!gate || gate.fixtureAllowed !== false) {
    return { status: "unavailable", provenance: EMPTY_PROVENANCE, reason: "dev_fixture_rejected" };
  }
  // ③ participant 構造違反 → invalid（「確認」でなく「不正」）
  const invalidReasons = structuralParticipantInvalidReasons(intake.participantIds, intake.viewerId);
  if (invalidReasons.length > 0) {
    return { status: "invalid", provenance: EMPTY_PROVENANCE, reasons: invalidReasons };
  }

  // ④ 既存 G1 provider に委譲（confirmed-real ロジックを複製しない）
  const r = getSessionIntakeTravelInput(intake);

  // ⑤ 防御: production は dev_fixture provenance を絶対に受けない（G1 は real-only だが構造保証）
  if (r.provenance.sources.includes("dev_fixture") || r.provenance.realOnly !== true) {
    return { status: "unavailable", provenance: r.provenance, reason: "dev_fixture_rejected" };
  }

  if (r.status === "ready") {
    return { status: "ready", input: r.input, provenance: r.provenance };
  }
  // ⑥ not_ready を missing / unconfirmed に分離（missing 優先＝不在は確認より根源的）
  if (r.missing.length > 0) {
    return { status: "not_ready_missing", provenance: r.provenance, missing: r.missing };
  }
  return { status: "not_ready_unconfirmed", provenance: r.provenance, unconfirmed: r.unconfirmed ?? [] };
}
