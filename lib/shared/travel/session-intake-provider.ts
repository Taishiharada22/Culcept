/**
 * T11-G1-C — Server Session/Intake Travel Input Provider（**pure・未配線**）
 *
 * 設計: docs/t11-g1-session-intake-provider-design.md v2（+ CEO/GPT 補正: isHardPrereqSatisfied は slot-key aware）
 *
 * 役割: server session/intake の **正規化済 slots** から real `TravelPlanEngineInput` を組む（real_only・fail-closed）。
 *   hard 必須（destination/date/participants）は **confirmed-real** 必須・soft は proposed/派生/private 可で input に流入。
 *   real input が confirmed-real で揃わなければ **not_ready**（input なし・missing/unconfirmed 分離）。
 *
 * 厳守（純・決定論・境界）:
 *   - **抽出 NLP しない**（slots は upstream で正規化済）・**M2/route/weather/place enrichment しない**・**engine を呼ばない**。
 *   - **display packet/projection/cues/diagnostics を返さない**・dev_fixture を混ぜない（real_only）。
 *   - env/process.env/Date.now/Math.random/fetch/DB/UI なし。import は travel slot/provider/engine 型 + provenance helper のみ。
 */

import type { ExtractedSlot, ExtractionSurface, TravelSlotKey } from "./slot-types";
import type { TravelPlanEngineInput } from "./engine-types";
import type {
  TravelInputPrerequisite,
  TravelInputProvenance,
  TravelInputResult,
  TravelInputSourceKind,
  TravelIntakeInput,
} from "./travel-input-provider-types";
import { deriveRealOnly } from "./travel-input-provider";

// ─────────────────────────────────────────────────────────────────────────────
// §1 slot-key aware 許可 surface（hard 充足の根拠）
// ─────────────────────────────────────────────────────────────────────────────

/** 明示操作 surface（confirmed 直行・SURFACE_IS_EXPLICIT=true 相当）。 */
const EXPLICIT_SURFACES: readonly ExtractionSurface[] = ["form_input", "quick_action", "adjustment_card"];

/**
 * ★ slot-key ごとの hard 充足を許す surface（CEO/GPT 補正）。
 *   - date_or_range: 明示 + **session_context**（/plan 選択日・window）。
 *   - destination_area: **明示のみ**。session_context は generic mode/window と区別できない（evidence に sub-kind 型なし）ため
 *     **fail-closed**＝確認させる（unconfirmed）。generic context が destination を満たす事故を構造的に排除。
 */
const HARD_CONFIRMING_SURFACES_BY_KEY: Record<"destination_area" | "date_or_range", readonly ExtractionSurface[]> = {
  date_or_range: [...EXPLICIT_SURFACES, "session_context"],
  destination_area: [...EXPLICIT_SURFACES],
};

// ─────────────────────────────────────────────────────────────────────────────
// §2 confirmed-real 述語（slot-key aware）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * hard 必須 slot が confirmed-real か。
 *   status !== retracted ∧ fillState === filled ∧ key 許可 surface の evidence を持つ。
 *   proposed(chat) / 派生のみ normalized(profile_prior/relation/after_action) / partial / retracted は不充足。
 */
export function isHardSlotSatisfied(slot: ExtractedSlot): boolean {
  if (slot.key !== "destination_area" && slot.key !== "date_or_range") return false; // hard は 2 slot key のみ
  if (slot.status === "retracted") return false;
  if (slot.fillState !== "filled") return false;
  const allowed = HARD_CONFIRMING_SURFACES_BY_KEY[slot.key];
  return slot.evidence.some((e) => allowed.includes(e.surface));
}

type PrereqState = "confirmed" | "unconfirmed" | "missing";

/** 指定 hard slot key の充足状態（非 retracted slot 無=missing / 在るが不充足=unconfirmed / 充足=confirmed）。 */
function classifyHardSlot(slots: readonly ExtractedSlot[], key: "destination_area" | "date_or_range"): PrereqState {
  const live = slots.filter((s) => s.key === key && s.status !== "retracted");
  if (live.length === 0) return "missing";
  return live.some((s) => isHardSlotSatisfied(s)) ? "confirmed" : "unconfirmed";
}

/** participants の充足状態（空=missing / 不正[>2・重複・viewer 範囲外]=unconfirmed / 妥当=confirmed）。 */
function classifyParticipants(participantIds: readonly string[], viewerId: string | undefined): PrereqState {
  if (participantIds.length === 0) return "missing";
  const unique = new Set(participantIds).size === participantIds.length;
  const countOk = participantIds.length >= 1 && participantIds.length <= 2;
  const viewerOk = viewerId === undefined || participantIds.includes(viewerId);
  return unique && countOk && viewerOk ? "confirmed" : "unconfirmed";
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 分類 + provider
// ─────────────────────────────────────────────────────────────────────────────

export interface TravelIntakePrerequisiteClassification {
  destination: PrereqState;
  date_or_range: PrereqState;
  participants: PrereqState;
}

/** hard prerequisite を 3 状態に分類（純）。 */
export function classifyTravelIntakePrerequisites(intake: TravelIntakeInput): TravelIntakePrerequisiteClassification {
  return {
    destination: classifyHardSlot(intake.slots, "destination_area"),
    date_or_range: classifyHardSlot(intake.slots, "date_or_range"),
    participants: classifyParticipants(intake.participantIds, intake.viewerId),
  };
}

/** confirmed-real な hard slot/明示 slot から provenance source を導出（dev_fixture を含めない）。 */
function deriveIntakeSources(slots: readonly ExtractedSlot[]): TravelInputSourceKind[] {
  const sources = new Set<TravelInputSourceKind>();
  for (const s of slots) {
    if (s.status === "retracted") continue;
    for (const e of s.evidence) {
      if (EXPLICIT_SURFACES.includes(e.surface)) sources.add("user_intake");
      if (e.surface === "session_context") sources.add("session_slots");
    }
  }
  if (sources.size === 0) sources.add("session_slots"); // ready 時は必ず confirming surface があるが default を持つ
  return [...sources].sort();
}

/**
 * session/intake → real `TravelPlanEngineInput`（ready）or not_ready（fail-closed）。
 *   - hard 3 prerequisite が全て confirmed → ready。1 つでも missing/unconfirmed → not_ready。
 *   - ready の input.slots は **retracted を除外**（soft/private は流入・server-only）。
 *   - provenance は session_slots/user_intake のみ（dev_fixture なし・realOnly 派生 true）。
 */
export function getSessionIntakeTravelInput(intake: TravelIntakeInput): TravelInputResult {
  const cls = classifyTravelIntakePrerequisites(intake);
  const PREREQ: { key: keyof TravelIntakePrerequisiteClassification; flag: TravelInputPrerequisite }[] = [
    { key: "destination", flag: "destination" },
    { key: "date_or_range", flag: "date_or_range" },
    { key: "participants", flag: "participants" },
  ];

  const sources = deriveIntakeSources(intake.slots);
  const provenance: TravelInputProvenance = { sources, realOnly: deriveRealOnly(sources) };

  const allConfirmed = PREREQ.every((p) => cls[p.key] === "confirmed");
  if (!allConfirmed) {
    const missing = PREREQ.filter((p) => cls[p.key] === "missing").map((p) => p.flag);
    const unconfirmed = PREREQ.filter((p) => cls[p.key] === "unconfirmed").map((p) => p.flag);
    return { status: "not_ready", provenance, missing, unconfirmed };
  }

  // ready: retracted を除いた slots（soft/private 含む）で input を組む（engine は呼ばない）。
  const liveSlots = intake.slots.filter((s) => s.status !== "retracted");
  const input: TravelPlanEngineInput = {
    slots: liveSlots,
    participantIds: intake.participantIds,
    ...(intake.viewerId !== undefined ? { viewerId: intake.viewerId } : {}),
    ...(intake.policy !== undefined ? { policy: intake.policy } : {}),
    ...(intake.fairnessHistory !== undefined ? { fairnessHistory: intake.fairnessHistory } : {}),
  };
  return { status: "ready", input, provenance };
}

/** key→key の薄い alias（slotKey 文字列でも参照できるよう・slot-key aware の明示）。 */
export function isHardPrereqSatisfied(slot: ExtractedSlot, slotKey: TravelSlotKey): boolean {
  if (slot.key !== slotKey) return false;
  return isHardSlotSatisfied(slot);
}
