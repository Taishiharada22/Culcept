/**
 * B2-bind A — Real Session/Intake Source Binding 型（**pure types only**・未配線）
 *
 * 設計正本: docs/t11-real-session-intake-source-binding-design.md（§6 + CEO 補正: session_context date は explicit 選択日/window のみ）
 *
 * 役割: 構造化された**明示 surface event**（form/quick-action/選択日/window）から `ExtractedSlot` を作る
 *   決定論 binding の入力契約。**raw chat / raw LLM / NLP を含まない**。
 *
 * 厳守:
 *   - event は **status を持たない**（status は surface から binding が DERIVE＝偽造不能）。
 *   - **chat_message / raw LLM / manual_entity_evidence の event 種別を持たない**（hard 不可・future）。
 *   - display packet/projection/cues 型・engine output 型を含まない。
 */

import type { TravelPlanWindow, BudgetBand, Pace, Visibility } from "./core-types";
import type { MobilityToleranceValue, TimeWindowValue, DescriptorSlotValue } from "./slot-types";
import type { ReadinessPolicy } from "./readiness-types";
import type { FairnessHistoryInput } from "./decision-types";
import type { TravelIntakeInput } from "./travel-input-provider-types";

/** 明示操作 surface（SURFACE_IS_EXPLICIT=true・confirmed 直行可能）。 */
export type ExplicitInputSurface = "form_input" | "quick_action" | "adjustment_card";

/**
 * 構造化された session/form surface event（**明示・決定論のみ**）。
 *   ★ いずれも `status` フィールドを持たない（binding が surface から導出）。
 *   ★ chat/raw LLM/manual_entity_evidence の event は**意図的に存在しない**（hard 不可・future）。
 */
export type SessionSurfaceEvent =
  // 選択 /plan window/date → session_context normalized date_or_range（explicit 選択のみ）
  | { kind: "selected_plan_window"; window: TravelPlanWindow }
  | { kind: "selected_plan_date"; date: string }
  // 明示入力 → confirmed
  | { kind: "destination_input"; areaText: string; surface: ExplicitInputSurface }
  | { kind: "date_input"; window: TravelPlanWindow; surface: ExplicitInputSurface }
  // soft enrichment
  | { kind: "budget_input"; value: BudgetBand; surface: ExplicitInputSurface }
  | { kind: "pace_input"; value: Pace; surface: ExplicitInputSurface }
  | { kind: "mobility_input"; value: MobilityToleranceValue; surface: ExplicitInputSurface }
  | { kind: "descriptor_input"; slotKey: "red_line" | "soft_preference"; value: DescriptorSlotValue; surface: ExplicitInputSurface; visibility?: Visibility; participantId?: string }
  | { kind: "time_window_input"; value: TimeWindowValue; surface: ExplicitInputSurface };

/** binding の入力。participantIds は **slot でなく別供給**（participant selector 由来）。 */
export interface TravelSessionBindingInput {
  events: SessionSurfaceEvent[];
  participantIds: string[];
  viewerId?: string;
  policy?: ReadinessPolicy;
  fairnessHistory?: FairnessHistoryInput;
}

/** drop された event の中立診断（**server-only・client-facing でない**）。 */
export type BindingDropReason = "invalid_event" | "unknown_kind" | "normalize_rejected";
export interface BindingDiagnostic {
  kind: string;
  reason: BindingDropReason;
}

/** binding の結果（intake + server-only diagnostics）。主 helper は intake のみ返す。 */
export interface TravelSessionBindingResult {
  intake: TravelIntakeInput;
  /** server-only（drop された event のみ・client へ出さない） */
  diagnostics: BindingDiagnostic[];
}
