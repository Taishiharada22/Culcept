/**
 * T11-B(CoAlter) — CoAlter Projection consume 契約型（**pure types only**・未配線）
 *
 * 設計: docs/t11-ui-coalter-consume-wiring-preflight.md §4/§8（CoAlter は client display path のみ先行）
 *
 * 役割: 将来 CoAlter が `PlanIntelligenceProjection` を **display/proposal 素材**として consume する
 *   ための型。**useCoAlter / /talk / server-authoritative packet / send / realtime / read receipt /
 *   M2-B-2 には一切繋がない**（型のみ）。
 *
 * ★ 型ロック: 入力 `projection` は `PlanIntelligenceProjection` のみ。
 *   `AuthoritativePacketForServer` / 生 `PlanDecisionPacket` / raw `FitResult` は **型レベルで受理不可**
 *   （H 系の display tier 壁を CoAlter consume 入口まで延伸）。
 *
 * ★ display-only: action は **ask/explain/show/note のみ**。execute/book/schedule/send を **持たない**。
 *
 * 純粋性: 型 + as-const のみ。
 */

import type { PlanIntelligenceProjection } from "./plan-intelligence-projection-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 入力（projection のみ・display tier 型ロック）
// ─────────────────────────────────────────────────────────────────────────────

export interface CoAlterProjectionPromptInput {
  /** CoAlter が読む display/explanation 素材（**projection のみ**・packet/raw を受けない） */
  projection: PlanIntelligenceProjection;
  /** display-safe な viewer context（任意・viewerNote をその viewer に絞るため） */
  viewerId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 display-only intent（execute/book/schedule/send を持たない）
// ─────────────────────────────────────────────────────────────────────────────

export const COALTER_PROJECTION_DISPLAY_ACTIONS = [
  "ask_question", //     questionsToAsk → 聞く候補（実行しない）
  "ask_confirmation", // needsConfirmation → 確認候補（実行しない）
  "explain_plan", //     answer/why/fitAdvisory → 説明
  "note_risk", //        readinessWarning/fitAdvisory risk → 注意喚起
  "show_fallback", //    fallbackNote → 代替提示
] as const;
export type CoAlterProjectionDisplayAction = (typeof COALTER_PROJECTION_DISPLAY_ACTIONS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// §3 cue（display/proposal のみ・authority なし）
// ─────────────────────────────────────────────────────────────────────────────

export const COALTER_PROJECTION_CUE_SOURCES = [
  "questionsToAsk",
  "needsConfirmation",
  "readinessWarning",
  "fallbackNote",
  "fitAdvisory",
] as const;
export type CoAlterProjectionCueSource = (typeof COALTER_PROJECTION_CUE_SOURCES)[number];

/**
 * CoAlter に渡す **display/proposal cue**。
 *   - `action` は display-only intent（execute/book/schedule/send を含まない）。
 *   - `ref` は **display-safe な安定ラベル/ID**（intent / reason / state / trigger / candidateId）。生 private を持たない。
 *   - **executionAuthority / authoritative / diagnostics を持たない**。
 */
export interface CoAlterProjectionCue {
  action: CoAlterProjectionDisplayAction;
  /** 由来 section（観測用） */
  source: CoAlterProjectionCueSource;
  /** display-safe 参照（enum/label/id のみ・raw 値や private なし） */
  ref: string;
}
