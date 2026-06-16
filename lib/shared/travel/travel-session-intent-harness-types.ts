/**
 * D(C-option) A — In-Memory Travel Session Intent Harness 型（**pure types only・contract harness**）
 *
 * 設計正本: docs/t11-d-durable-travel-state-persistence-preflight.md（§6/§11 + CEO 命名補正）
 *
 * ★ これは **real persistence ではない**（process-memory のみ・restart で消える・DB/Supabase 非接触）。
 *   「durable モデルの contract harness」＝「input intent のみ保持 → display を recompute・authoritative/raw/
 *   diagnostics/private-client を保持しない」を検証するための型。
 *
 * 厳守:
 *   - 保持してよいのは input intent（events）+ owner marker + inert SafeTravelLinkIntent + visibility。
 *   - **保持しない**: AuthoritativePacketForServer / raw TravelPlanEngineOutput / raw diagnostics /
 *     PlanIntelligenceProjection / CoAlterProjectionCue[] / DisplayPacketForClient / executionAuthority /
 *     booking/calendar/action / href / generatedUrl / live availability・price。
 */

import type { SessionSurfaceEvent } from "./travel-session-binding-types";
import type { SafeTravelLinkIntent } from "./safe-link-types";

export type TravelSessionIntentVisibility = "shared" | "private";
export type TravelSessionIntentId = string;

/** harness への保存入力（許可された intent のみ）。 */
export interface TravelSessionIntentRecordInput {
  /** ★ test harness marker only（real auth identity でない・data として扱う） */
  ownerUserId: string;
  /** 構造化 input intent（destination/date/budget/pace/mobility/descriptor）。 */
  events: SessionSurfaceEvent[];
  /** inert safe-link metadata のみ（href/action でない）。 */
  safeLinks?: SafeTravelLinkIntent[];
}

/** 保持される record（id 付・events + inert safeLinks のみ）。 */
export interface TravelSessionIntentRecord {
  id: TravelSessionIntentId;
  ownerUserId: string;
  events: SessionSurfaceEvent[];
  safeLinks: SafeTravelLinkIntent[];
}

/** 保存拒否理由（中立）。 */
export type TravelSessionIntentHarnessError =
  | "forbidden_field" // authoritative / raw output / diagnostics / projection / booking / href / generatedUrl 等
  | "non_inert_safe_link" // safeLink が inert:true でない
  | "invalid_input";

/** 保存結果。 */
export type TravelSessionIntentHarnessResult =
  | { ok: true; record: TravelSessionIntentRecord }
  | { ok: false; error: TravelSessionIntentHarnessError };
