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
