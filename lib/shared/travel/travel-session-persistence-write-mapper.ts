/**
 * C — Events → `TravelSessionPersistenceWriteInput` pure mapper（**pure・no DB/repository/engine/display/action**）
 *
 * 設計正本: docs/t11-server-action-persistence-wiring-preflight.md（§7 B+D / §C）
 *
 * 役割: 構造化 `SessionSurfaceEvent[]` + server auth owner を、**既存 binding/provider path で再 bind**して
 *   **provider-ready の時だけ** `TravelSessionPersistenceWriteInput`（confirmed structured intent のみ）に map。
 *   adapter/action を改変しない（再 bind 方式・§12 (ii)）。
 *
 * 厳守:
 *   - **ownerUserId は input のみ**（event/FormData から読まない）・participantIds=[ownerUserId]（auth 注入と同型）。
 *   - **provider-ready のみ writeInput**（not-ready/unavailable/invalid は writeInput なし）。
 *   - **display/projection/cues/engine output/authoritative/href/generatedUrl/generated_maps_search を持たない**。
 *   - 永続 input = **allowed key（red_line 除外）∧ shared ∧ confirmed/normalized ∧ filled** の ready slot のみ。
 *     private(M2 profile_prior / relation_context / after_action 既定 private)・proposed・red_line を除外。
 *   - engine/display adapter/repository/DB/Supabase/app・UI/M2 runtime/CoAlter/`/talk` を呼ばない・import しない。
 */

import type { SessionSurfaceEvent } from "./travel-session-binding-types";
import type { ExtractedSlot, TravelSlotKey } from "./slot-types";
import type { TravelInputPrerequisite } from "./travel-input-provider-types";
import type { PersistedTravelSessionInput, TravelSessionPersistenceWriteInput } from "./travel-session-persistence-types";
import { bindTravelSessionIntake } from "./travel-session-binding";
import { getProductionTravelInput } from "./production-travel-input";

/** 永続可能 slot key（**red_line 除外＝private は別 owner-only table・HOLD**）。SQL allowlist に一致。 */
const PERSISTABLE_SLOT_KEYS: ReadonlySet<TravelSlotKey> = new Set([
  "destination_area",
  "date_or_range",
  "budget_band",
  "pace",
  "mobility_tolerance",
  "soft_preference",
  "time_window",
]);

export interface TravelSessionPersistenceWriteMapperInput {
  events: SessionSurfaceEvent[];
  /** ★ server auth owner のみ（event/FormData から取らない）。 */
  ownerUserId: string;
  /** 任意・既定は ownerUserId（単独 owner MVP）。 */
  viewerId?: string;
}

export type TravelSessionPersistenceWriteMapperResult =
  | { status: "ready"; writeInput: TravelSessionPersistenceWriteInput }
  | { status: "not_ready_missing"; missing: TravelInputPrerequisite[] }
  | { status: "not_ready_unconfirmed"; unconfirmed: TravelInputPrerequisite[] }
  | { status: "unavailable" }
  | { status: "invalid" };

/** ready slot のうち永続対象か（allowed key ∧ shared ∧ confirmed/normalized ∧ filled）。 */
function isPersistableSlot(s: ExtractedSlot): boolean {
  return (
    PERSISTABLE_SLOT_KEYS.has(s.key) && // red_line 除外
    s.visibility === "shared" && // private(M2/relation/after_action 既定)を除外
    (s.status === "confirmed" || s.status === "normalized") && // proposed/retracted を除外（SQL CHECK 一致）
    s.fillState === "filled"
  );
}

/** ExtractedSlot → persisted input（参照 id のみ・display/raw を作らない）。 */
function slotToWriteInput(s: ExtractedSlot): Omit<PersistedTravelSessionInput, "sessionId"> {
  return {
    slotKey: s.key,
    value: s.value,
    slotStatus: s.status,
    fillState: s.fillState,
    owner: s.owner,
    visibility: s.visibility,
    provenance: { refIds: s.evidence.map((e) => e.refId) }, // 本文非保持・参照 id のみ
  };
}

/**
 * events + owner → write input（**provider-ready のみ**・confirmed structured intent のみ）。
 */
export function mapTravelSessionEventsToPersistenceWriteInput(
  input: TravelSessionPersistenceWriteMapperInput,
): TravelSessionPersistenceWriteMapperResult {
  if (!input || typeof input !== "object" || typeof input.ownerUserId !== "string" || !Array.isArray(input.events)) {
    return { status: "invalid" };
  }

  // ★ 既存 binding/provider を再利用（adapter/action 非改変）。participantIds は owner から注入。
  const intake = bindTravelSessionIntake({
    events: input.events,
    participantIds: [input.ownerUserId],
    viewerId: input.viewerId ?? input.ownerUserId,
  });
  const provided = getProductionTravelInput(intake, { fixtureAllowed: false });

  if (provided.status === "not_ready_missing") return { status: "not_ready_missing", missing: provided.missing };
  if (provided.status === "not_ready_unconfirmed") return { status: "not_ready_unconfirmed", unconfirmed: provided.unconfirmed };
  if (provided.status === "unavailable") return { status: "unavailable" };
  if (provided.status === "invalid") return { status: "invalid" };

  // ready: confirmed structured input のみ（links は events から供給されない＝空）。
  const inputs = provided.input.slots.filter(isPersistableSlot).map(slotToWriteInput);
  const writeInput: TravelSessionPersistenceWriteInput = {
    ownerUserId: input.ownerUserId,
    status: "ready_snapshot",
    visibility: "shared",
    inputs,
    links: [],
  };
  return { status: "ready", writeInput };
}
