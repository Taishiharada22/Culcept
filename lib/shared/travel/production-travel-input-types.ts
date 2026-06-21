/**
 * B2-prod A — Production Travel Input 5-state 出力型（**pure types only**・未配線）
 *
 * 設計正本: docs/t11-production-travel-input-provider-preflight.md（§7）
 *
 * 役割: 既存 G1 `TravelInputResult`（ready | not_ready{missing,unconfirmed}）を **production-readiness 用に
 *   5 状態へ昇格**した出力契約。既存型は破壊しない（本型は別 union・additive）。
 *
 * 厳守:
 *   - scalar/rank/score を持たない・display packet/projection/cues 型を含まない・engine output 型を含まない。
 *   - client diagnostics 型を含まない（input までの provider）。
 *   - `manual_entity_evidence` 等 entity 側 evidence は hard 前提を満たさない（型は source 語彙のみ・surface でない）。
 */

import type { TravelPlanEngineInput } from "./engine-types";
import type { TravelInputPrerequisite, TravelInputProvenance } from "./travel-input-provider-types";

/** 構造的に不正な participant（「確認」でなく「不正」）。 */
export type ProductionInputInvalidReason =
  | "duplicate_participants"
  | "too_many_participants" // >2（MVP）
  | "viewer_not_in_participants";

/** provider が走れない/拒否（fixture fallback しない）。 */
export type ProductionInputUnavailableReason =
  | "no_session_intake" // session/intake source 自体が無い
  | "dev_fixture_rejected"; // production-like gate が dev_fixture を拒否

/**
 * Production input の 5 状態。
 *   - ready: 全 hard prerequisite confirmed-real（input + real-only provenance）。
 *   - not_ready_missing: 非 retracted slot が無い（「聞く」）。
 *   - not_ready_unconfirmed: slot は在るが confirmed-real でない（「確認させる」）。
 *   - unavailable: session/intake source 不在 or production gate が fixture を拒否（fail-closed・input なし）。
 *   - invalid: participant の構造違反（重複/>2/viewer 範囲外）。
 */
export type ProductionTravelInput =
  | { status: "ready"; input: TravelPlanEngineInput; provenance: TravelInputProvenance }
  | { status: "not_ready_missing"; provenance: TravelInputProvenance; missing: TravelInputPrerequisite[] }
  | { status: "not_ready_unconfirmed"; provenance: TravelInputProvenance; unconfirmed: TravelInputPrerequisite[] }
  | { status: "unavailable"; provenance: TravelInputProvenance; reason: ProductionInputUnavailableReason }
  | { status: "invalid"; provenance: TravelInputProvenance; reasons: ProductionInputInvalidReason[] };
