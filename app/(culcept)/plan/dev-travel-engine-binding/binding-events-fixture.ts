/**
 * B2-bind C — Session binding **決定論 event fixture**（dev preview 用・runtime/外部データ非依存）。
 *
 * 役割: form/session の構造化 event（SessionSurfaceEvent[]）の fixture。
 *   page が bindTravelSessionIntake → getProductionTravelInput → runTravelPlanEngine を通す。
 *
 * 厳守: Date.now / Math.random / process.env / fetch / DB なし・raw chat / LLM なし。
 *   destination=explicit form_input(confirmed) / date=selected_plan_window(session_context normalized)。
 */

import type { TravelSessionBindingInput } from "@/lib/shared/travel/travel-session-binding-types";

export const FIXTURE_BINDING_VIEWER_ID = "P1";

/** 明示 surface event のみ（confirmed destination + selected date/window + soft）。 */
export const FIXTURE_BINDING_EVENTS: TravelSessionBindingInput = {
  events: [
    { kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } }, // → date_or_range(session_context/normalized)
    { kind: "destination_input", areaText: "京都", surface: "form_input" }, //               → destination_area(confirmed)
    { kind: "budget_input", value: { lo: 0, hi: 30000, confidence: 0.9, currency: "JPY" }, surface: "quick_action" }, // soft
    { kind: "descriptor_input", slotKey: "soft_preference", value: { descriptorKey: "prefer", descriptorValue: "nature" }, surface: "form_input" }, // soft
  ],
  participantIds: ["P1"],
  viewerId: FIXTURE_BINDING_VIEWER_ID,
  policy: { intendedAction: "reserve_or_book_later", involvesPaidBooking: true, irreversible: true },
};
