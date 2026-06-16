/**
 * B2-disp C — Travel live FormData → 構造化 events（**pure・permissioned 読み取りのみ**）
 *
 * 設計正本: docs/t11-production-plan-travel-live-gate-design.md（§5/§6）
 *
 * 役割: server action が受けた FormData から **許可された構造化 field のみ**を読み、
 *   `TravelSessionBindingInput`（events + participantIds）を組む。**status は読まない**（binding が surface から derive）。
 *
 * 厳守（static lock）:
 *   - 読むのは destination / date / participantId / budget / pace / mobility / red_line / soft_preference のみ。
 *   - ★ **読まない**: slot status / raw TravelPlanEngineInput / raw output / AuthoritativePacketForServer /
 *     user_id / diagnostics / booking/calendar/action field。
 *   - surface は **form_input 固定**（明示操作）・date は **session_context（選択日/window）**。
 *   - 不正/空 field は無視（捏造しない）。env/DB/fetch なし。
 */

import type { Pace } from "@/lib/shared/travel/core-types";
import type { SessionSurfaceEvent, TravelSessionBindingInput } from "@/lib/shared/travel/travel-session-binding-types";

const str = (v: FormDataEntryValue | null): string | undefined => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined);
const num = (v: FormDataEntryValue | null): number | undefined => {
  const s = str(v);
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

/** FormData → TravelSessionBindingInput（許可 field のみ・status は読まない）。 */
export function buildTravelSessionEventsFromFormData(formData: FormData): TravelSessionBindingInput {
  const events: SessionSurfaceEvent[] = [];

  // destination（明示 form input → confirmed）
  const destination = str(formData.get("destination"));
  if (destination !== undefined) {
    events.push({ kind: "destination_input", areaText: destination, surface: "form_input" });
  }

  // date（選択日 → session_context normalized）/ date-range（start+end+nights）
  const date = str(formData.get("date"));
  const dateEnd = str(formData.get("dateEnd"));
  const nightsRaw = num(formData.get("nights"));
  if (date !== undefined && dateEnd !== undefined && (nightsRaw === 1 || nightsRaw === 2)) {
    events.push({ kind: "selected_plan_window", window: { kind: "range", startDate: date, endDate: dateEnd, nights: nightsRaw } });
  } else if (date !== undefined) {
    events.push({ kind: "selected_plan_date", date });
  }

  // budget（lo/hi → quick_action soft）
  const budgetLo = num(formData.get("budgetLo"));
  const budgetHi = num(formData.get("budgetHi"));
  if (budgetLo !== undefined && budgetHi !== undefined) {
    events.push({ kind: "budget_input", value: { lo: budgetLo, hi: budgetHi, confidence: 0.8, currency: "JPY" }, surface: "quick_action" });
  }

  // pace（slow|normal|intense）
  const pace = str(formData.get("pace"));
  if (pace === "slow" || pace === "normal" || pace === "intense") {
    events.push({ kind: "pace_input", value: pace as Pace, surface: "form_input" });
  }

  // mobility（maxWalkKm）
  const maxWalkKm = num(formData.get("maxWalkKm"));
  if (maxWalkKm !== undefined) {
    events.push({ kind: "mobility_input", value: { maxWalkKm }, surface: "form_input" });
  }

  // red_line（avoid 述語）
  const redLine = str(formData.get("redLine"));
  if (redLine !== undefined) {
    events.push({ kind: "descriptor_input", slotKey: "red_line", value: { descriptorKey: "avoid", descriptorValue: redLine }, surface: "form_input" });
  }

  // soft_preference（prefer 述語）
  const softPreference = str(formData.get("softPreference"));
  if (softPreference !== undefined) {
    events.push({ kind: "descriptor_input", slotKey: "soft_preference", value: { descriptorKey: "prefer", descriptorValue: softPreference }, surface: "form_input" });
  }

  // participantIds（permissioned・slot でなく別供給・★ user_id は読まない）
  const participantIds = formData
    .getAll("participantId")
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);

  return { events, participantIds };
}
