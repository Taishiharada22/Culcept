/**
 * B2-bind B — Real Session/Intake Source Binding helper（**pure・決定論・未配線**）
 *
 * 設計正本: docs/t11-real-session-intake-source-binding-design.md（§4/§6/§13 + CEO 補正）
 *
 * 役割: 構造化 `SessionSurfaceEvent[]` → `ExtractedSlot[]` → `TravelIntakeInput`。
 *   ★ status は **`SURFACE_INITIAL_STATUS[surface]` から DERIVE**（caller override 不能＝honesty firewall）。
 *   ★ 各 slot は既存 `normalizeSlot` gate を通す（excess/invalid を fail-closed で drop）。
 *
 * 厳守:
 *   - **NLP なし・raw chat / raw LLM なし**（event は構造化値のみ）。
 *   - destination は **explicit surface のみ**（generic session_context から作らない）。
 *   - session_context date は **explicit 選択日/window event のみ**（generic context から作らない）。
 *   - **manual_entity_evidence は destination/date/participants を作らない**（event 種別に存在しない）。
 *   - retracted/invalid event は drop（捏造しない）・participantIds は pass-through。
 *   - engine を呼ばない・production provider を呼ばない・display/projection/cues を返さない。
 *   - fetch/DB/M2/route・weather・place なし。
 */

import { SURFACE_INITIAL_STATUS } from "./slot-types";
import { normalizeSlot } from "./slot-normalizer";
import type { ExtractedSlot, ExtractionSurface, TravelSlotKey } from "./slot-types";
import type { TravelIntakeInput } from "./travel-input-provider-types";
import type {
  BindingDiagnostic,
  SessionSurfaceEvent,
  TravelSessionBindingInput,
  TravelSessionBindingResult,
} from "./travel-session-binding-types";

/** ★ status は surface 由来（event は status を持たない）。raw slot を組む（fillState は具体値ゆえ filled）。 */
function buildRawSlot(
  key: TravelSlotKey,
  value: unknown,
  surface: ExtractionSurface,
  index: number,
  over?: { visibility?: "shared" | "private"; participantId?: string },
): unknown {
  return {
    key,
    value,
    status: SURFACE_INITIAL_STATUS[surface], // ★ DERIVE（confirmed/normalized は normalizeSlot がそのまま保持）
    fillState: "filled",
    confidence: 1,
    owner: over?.participantId ? { kind: "participant", participantId: over.participantId } : { kind: "shared" },
    visibility: over?.visibility ?? "shared",
    evidence: [{ surface, refId: `${surface}:${key}:${index}` }],
  };
}

/** event → raw slot（未知種別は null）。 */
function eventToRawSlot(ev: SessionSurfaceEvent, index: number): unknown | null {
  switch (ev.kind) {
    case "selected_plan_window":
      return buildRawSlot("date_or_range", ev.window, "session_context", index);
    case "selected_plan_date":
      return buildRawSlot("date_or_range", { kind: "single_day", date: ev.date }, "session_context", index);
    case "destination_input":
      return buildRawSlot("destination_area", { areaText: ev.areaText }, ev.surface, index);
    case "date_input":
      return buildRawSlot("date_or_range", ev.window, ev.surface, index);
    case "budget_input":
      return buildRawSlot("budget_band", ev.value, ev.surface, index);
    case "pace_input":
      return buildRawSlot("pace", ev.value, ev.surface, index);
    case "mobility_input":
      return buildRawSlot("mobility_tolerance", ev.value, ev.surface, index);
    case "descriptor_input":
      return buildRawSlot(ev.slotKey, ev.value, ev.surface, index, { visibility: ev.visibility, participantId: ev.participantId });
    case "time_window_input":
      return buildRawSlot("time_window", ev.value, ev.surface, index);
    default:
      return null;
  }
}

/** binding（intake + server-only diagnostics）。各 event は最大 1 slot・normalizeSlot で gate。 */
export function bindTravelSessionIntakeWithDiagnostics(input: TravelSessionBindingInput): TravelSessionBindingResult {
  const slots: ExtractedSlot[] = [];
  const diagnostics: BindingDiagnostic[] = [];
  const participantIds = input && Array.isArray(input.participantIds) ? input.participantIds : [];

  const events = input && Array.isArray(input.events) ? input.events : [];
  events.forEach((ev, i) => {
    if (!ev || typeof ev !== "object" || typeof (ev as { kind?: unknown }).kind !== "string") {
      diagnostics.push({ kind: "unknown", reason: "invalid_event" });
      return;
    }
    const raw = eventToRawSlot(ev, i);
    if (raw === null) {
      diagnostics.push({ kind: ev.kind, reason: "unknown_kind" });
      return;
    }
    const res = normalizeSlot(raw); // ★ 既存 gate（excess/invalid を fail-closed）
    if (res.ok) slots.push(res.slot);
    else diagnostics.push({ kind: ev.kind, reason: "normalize_rejected" });
  });

  const intake: TravelIntakeInput = {
    slots,
    participantIds,
    ...(input?.viewerId !== undefined ? { viewerId: input.viewerId } : {}),
    ...(input?.policy !== undefined ? { policy: input.policy } : {}),
    ...(input?.fairnessHistory !== undefined ? { fairnessHistory: input.fairnessHistory } : {}),
  };
  return { intake, diagnostics };
}

/** binding（`TravelIntakeInput` のみ・provider が消費）。 */
export function bindTravelSessionIntake(input: TravelSessionBindingInput): TravelIntakeInput {
  return bindTravelSessionIntakeWithDiagnostics(input).intake;
}
