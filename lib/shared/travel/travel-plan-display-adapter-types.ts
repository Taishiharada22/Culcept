/**
 * B2-disp A — Travel Plan Display Adapter 型（**pure types only**・未配線・no production side effect）
 *
 * 設計正本: docs/t11-production-plan-travel-input-wiring-preflight.md（§6/§9/§13 案 A）
 *
 * 役割: 「構造化 session events → bind → provider → engine → display」を束ねる **pure/server-only adapter** の
 *   入出力契約。★ **route wiring / server action / production side effect / DB / persistence を含まない**。
 *
 * 厳守（型で client-safe・authority 隔離）:
 *   - 出力は **display-safe のみ**（`DisplayPacketForClient` / `PlanIntelligenceProjection` / `CoAlterProjectionCue[]`）。
 *   - `AuthoritativePacketForServer` / raw `TravelPlanEngineInput` / raw `TravelPlanEngineOutput` /
 *     raw provider diagnostics / provenance を**持たない**。
 *   - executionAuthority / booking / calendar / action フィールドを持たない。
 *   - client diagnostics を既定で持たない（not-ready は中立 ask のみ）。
 */

import type { DisplayPacketForClient } from "./engine-consume-types";
import type { PlanIntelligenceProjection } from "./plan-intelligence-projection-types";
import type { CoAlterProjectionCue } from "./coalter-projection-consume-types";
import type { TravelInputPrerequisite } from "./travel-input-provider-types";
import type { TravelSessionBindingInput } from "./travel-session-binding-types";
import type { SafeTravelLinkHrefModel } from "./safe-link-href-types";
import type { SharedProposalDisplay } from "./shared-proposal-view";

/**
 * production-safe な構造化入力 payload。
 *   = 構造化 `SessionSurfaceEvent[]` + participantIds(別供給) + viewerId? + policy?/fairnessHistory?。
 *   ★ event は **status を持たない**（adapter が surface から derive）・raw chat / TravelPlanEngineInput を含まない。
 */
export type TravelPlanDisplayInput = TravelSessionBindingInput;

/** ready 時の **display-safe ペイロード**（全要素が brand 型で authority 無）。 */
export interface TravelPlanDisplayPayload {
  /** authoritative:false / executionAuthority:false 固定（brand 型） */
  packet: DisplayPacketForClient;
  projection: PlanIntelligenceProjection;
  cues: CoAlterProjectionCue[];
  /**
   * ★ D-A 外部 hand-off link transport（**optional・default 不在**）。
   *   - **display-safe な `SafeTravelLinkHrefModel[]` のみ**（raw `SafeTravelLinkIntent` / diagnostics /
   *     authoritative packet / engine output / private state / action authority を**持たない**）。
   *   - **server/display 層のみが用意**する（`prepareSafeTravelLinkHrefModels` の出力）。
   *     **UI はこの model を構築してはならない**・**UI は raw `SafeTravelLinkIntent` を受け取らない**・
   *     **UI は preparation/generation helper を呼ばない**（render only）。
   *   - **default 不在**＝producer が set するまで UI は何も描かない（本スライスでは producer/consumer 未配線）。
   *   - **not-ready / unavailable / invalid には存在し得ない**（それらは `display` payload を運ばない＝型で保証）。
   */
  externalLinks?: SafeTravelLinkHrefModel[];
  /**
   * ★ C6-A-1: display-safe 候補/却下ビュー（additive・optional）。
   *   候補カード（3案）表示用。engine output の proposalsDisplay をそのまま運ぶ（private 非搭載・brand 不要）。
   *   not-ready / unavailable / invalid には存在しない（display payload を運ぶ ready のみ）。
   */
  proposalsDisplay?: SharedProposalDisplay;
}

/** not-ready 時に「何を聞くか」だけを伝える中立 ask（provenance / 診断を含まない）。 */
export interface PrereqAsk {
  prerequisite: TravelInputPrerequisite;
}

/**
 * adapter の結果（display-safe ready / 中立 not-ready）。
 *   ★ authoritative / raw input / raw output / raw diagnostics を**構造的に持たない**。
 */
export type TravelPlanDisplayResult =
  | { status: "ready"; display: TravelPlanDisplayPayload }
  | { status: "not_ready_missing"; ask: PrereqAsk[] }
  | { status: "not_ready_unconfirmed"; ask: PrereqAsk[] }
  | { status: "unavailable" }
  | { status: "invalid" };
