/**
 * B2-prod C — Session/Intake **決定論 fixture**（dev preview 用・runtime/外部データ非依存）。
 *
 * 役割: production provider path を実証するための **TravelIntakeInput**（生 `TravelPlanEngineInput` でない）。
 *   getProductionTravelInput(これ, {fixtureAllowed:false}) → ready → runTravelPlanEngine を通す。
 *
 * 厳守: Date.now / Math.random / process.env / fetch / DB なし。dev_fixture source を持たない（real-only intake）。
 *   hard 必須 = confirmed-real（destination=form_input / date=session_context / participants 妥当）。
 */

import type { TravelIntakeInput } from "@/lib/shared/travel/travel-input-provider-types";
import type { ExtractedSlot } from "@/lib/shared/travel/slot-types";

export const FIXTURE_INTAKE_VIEWER_ID = "P1";

/** confirmed-real な hard slot + soft 補完（全 shared・retracted/proposed なし）。 */
const CONFIRMED_SLOTS: ExtractedSlot[] = [
  { key: "destination_area", value: { areaText: "京都" }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [{ surface: "form_input", refId: "f:d" }] },
  { key: "date_or_range", value: { kind: "single_day", date: "2026-07-01" }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [{ surface: "session_context", refId: "s:w" }] },
  { key: "budget_band", value: { lo: 0, hi: 30000, confidence: 0.9, currency: "JPY" }, status: "confirmed", fillState: "filled", confidence: 0.9, owner: { kind: "shared" }, visibility: "shared", evidence: [{ surface: "quick_action", refId: "a:b" }] },
  { key: "soft_preference", value: { descriptorKey: "prefer", descriptorValue: "nature" }, status: "proposed", fillState: "filled", confidence: 0.7, owner: { kind: "participant", participantId: "P1" }, visibility: "shared", evidence: [{ surface: "chat_message", refId: "m:s" }] },
];

/** ★ real-only な TravelIntakeInput（page が getProductionTravelInput 経由で ready→engine に通す）。 */
export const FIXTURE_SESSION_INTAKE: TravelIntakeInput = {
  slots: CONFIRMED_SLOTS,
  participantIds: ["P1"],
  viewerId: FIXTURE_INTAKE_VIEWER_ID,
  policy: { intendedAction: "reserve_or_book_later", involvesPaidBooking: true, irreversible: true },
};
