/**
 * B2-disp A(2) — Travel Live ActionState 型（**pure・display-safe by construction**）
 *
 * 設計正本: docs/t11-rich-display-transport-boundary-design.md（§5 H + CEO 補正: 返り値型を構造で拘束）
 *
 * 役割: `useActionState` 用の **返却状態**。ready は `TravelPlanDisplayPayload`（packet/projection/cues）**のみ**。
 *   ★ AuthoritativePacketForServer / raw TravelPlanEngineInput / raw output / diagnostics / provenance /
 *     executionAuthority / booking/calendar/action / 任意 JSON を **型として持てない**（構造で拘束）。
 */

import type {
  PrereqAsk,
  TravelPlanDisplayPayload,
  TravelPlanDisplayResult,
} from "@/lib/shared/travel/travel-plan-display-adapter-types";

/** 初期（未送信）。 */
export interface TravelLiveIdleState {
  status: "idle";
}
/** ready = display-safe payload のみ（packet:DisplayPacketForClient + projection + cues）。 */
export interface TravelLiveReadyState {
  status: "ready";
  display: TravelPlanDisplayPayload;
}
/** not-ready = 中立 ask のみ（prerequisite 種別・provenance/診断なし）。 */
export interface TravelLiveNotReadyState {
  status: "not_ready_missing" | "not_ready_unconfirmed";
  ask: PrereqAsk[];
}
/** source 不在 / gate 不許可（中立）。 */
export interface TravelLiveUnavailableState {
  status: "unavailable";
}
/** participant 構造違反等（中立・理由非開示）。 */
export interface TravelLiveInvalidState {
  status: "invalid";
}
/** 予期せぬ error（中立・診断非搭載）。 */
export interface TravelLiveActionErrorState {
  status: "error";
}

/** useActionState の返却状態（client-renderable・非権威）。 */
export type TravelLiveActionState =
  | TravelLiveIdleState
  | TravelLiveReadyState
  | TravelLiveNotReadyState
  | TravelLiveUnavailableState
  | TravelLiveInvalidState
  | TravelLiveActionErrorState;

export const TRAVEL_LIVE_INITIAL_STATE: TravelLiveActionState = { status: "idle" };

/** adapter の display-safe result → action state（display-safe を**型で**保持・追加 leak しない）。 */
export function toTravelLiveActionState(result: TravelPlanDisplayResult): TravelLiveActionState {
  switch (result.status) {
    case "ready":
      return { status: "ready", display: result.display };
    case "not_ready_missing":
      return { status: "not_ready_missing", ask: result.ask };
    case "not_ready_unconfirmed":
      return { status: "not_ready_unconfirmed", ask: result.ask };
    case "unavailable":
      return { status: "unavailable" };
    case "invalid":
      return { status: "invalid" };
    default:
      return { status: "error" };
  }
}
