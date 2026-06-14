/**
 * T11-C-B — Travel engine **決定論 fixture 入力**（dev preview 用・runtime/外部データ非依存）。
 *
 * 役割: `runTravelPlanEngine` を server で実行するための **static `TravelPlanEngineInput`**。
 *   実 user data / M2 personalization / DB / route・weather・place live / fetch を一切使わない純データ。
 *
 * 厳守: Date.now / Math.random / process.env / fetch / DB を含まない。
 *   fit は **fixture `ProposalFitInput`**（evaluateFit を fixture entity に適用＝M2 由来でない）。
 *   recommend を安定して出すため slots（dest/date/budget/softPref）を与える。
 */

import type { TravelPlanEngineInput } from "@/lib/shared/travel/engine-types";
import type { ExtractedSlot } from "@/lib/shared/travel/slot-types";
import type { ProposalFitInput } from "@/lib/shared/travel/fit-decision-adapter-types";
import type { FitSubject, FitUserState, TravelObjectState } from "@/lib/shared/travel/fit-types";
import { evaluateFit } from "@/lib/shared/travel/fit-core";
import { PROPOSAL_ANGLES } from "@/lib/shared/travel/proposal-types";

/** viewer display path を通すための fixture viewer（viewerNote は private stretch 無→null になり得る・honest）。 */
export const FIXTURE_ENGINE_VIEWER_ID = "P1";

/** recommend を安定して出す決定論 slots（全 shared・private なし）。 */
const SLOTS: ExtractedSlot[] = [
  { key: "destination_area", value: { areaText: "京都" }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [{ surface: "form_input", refId: "f:d" }] },
  { key: "date_or_range", value: { kind: "single_day", date: "2026-07-01" }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [{ surface: "session_context", refId: "s:w" }] },
  { key: "budget_band", value: { lo: 0, hi: 30000, confidence: 0.9, currency: "JPY" }, status: "confirmed", fillState: "filled", confidence: 0.9, owner: { kind: "shared" }, visibility: "shared", evidence: [{ surface: "quick_action", refId: "a:b" }] },
  { key: "soft_preference", value: { descriptorKey: "prefer", descriptorValue: "nature" }, status: "confirmed", fillState: "filled", confidence: 0.7, owner: { kind: "participant", participantId: "P1" }, visibility: "shared", evidence: [{ surface: "chat_message", refId: "m:s" }] },
];

// fit evidence（fixture・決定論）。どの proposal angle が立っても fitAdvisory が出るよう全 angle に付与。
const FIT_SUBJECT: FitSubject = { kind: "solo", user: { tolerances: {} } as FitUserState };
const FIT_ENTITY: TravelObjectState = { placeRefId: "P", category: "place", roleAffinity: { relaxation: { value: 0.85, confidence: 0.8, provenance: "editorial" } } };
const FIT_RESULT = evaluateFit({ entity: FIT_ENTITY, subject: FIT_SUBJECT });
const FIT: ProposalFitInput[] = PROPOSAL_ANGLES.map((angle) => ({ candidateId: `proposal:${angle}`, fit: FIT_RESULT }));

/**
 * static engine 入力。reserve + paid + irreversible + cancelWeather → needs_confirmation
 *   （weather_reversal_uncertainty / paid_booking / irreversible）+ fit → fitAdvisory。
 */
export const FIXTURE_ENGINE_INPUT: TravelPlanEngineInput = {
  slots: SLOTS,
  participantIds: ["P1"],
  policy: { intendedAction: "reserve_or_book_later", involvesPaidBooking: true, irreversible: true },
  cancelWeather: { weatherVulnerability: 0.85, cancellationFlexibility: 0.1 },
  fit: FIT,
  viewerId: FIXTURE_ENGINE_VIEWER_ID,
};
