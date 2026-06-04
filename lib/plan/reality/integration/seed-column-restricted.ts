/**
 * Reality Control OS — A1-5-2-1 Column-Restricted Seed Projection（**pure・DB source factory なし**）
 *
 * 親設計: docs/aneurasync-reality-control-os-connection-design.md §8（A1-5-2-0 audit）
 *
 * 役割: 将来 `plan_seeds` table（**現状未存在・migration なし**）から **許可列だけ**読んだ row を、
 *   raw を一切持ち込まずに `SeedPlacement[]` へ projection する **pure 関数 + 列契約**。
 *
 * 【A1-5-2-1 の境界（厳守）】:
 *   - **DB source factory / Supabase client / `.from("plan_seeds")` を作らない**（table 不在ゆえ実 read 不能）。
 *     本 module は **row[] を受け取る pure projection のみ**（row は呼び出し側／test が注入）。
 *   - **raw（`signal` / `desired_action`）を型に持たない・読まない・SELECT しない**（structured-only）。
 *   - **`buildSeedPlacements` と同等 semantics**（active のみ / structured fields のみ / durationMin=null）。
 *   - durationMin は常に null・durationSource は unknown（PlanSeed に duration 欄が無いため）。
 *
 * 制約: 純関数のみ。DB / Supabase / runtime / route / UI / migration / barrel export なし。
 */

import { buildSeedPlacements, type SeedPlacement } from "../seed-placement";
import type { PlanSeed, PlanSeedTimeHint, PlanSeedStatus } from "../../plan-seed";
import type { ActionShape } from "../../../stargazer/alterHomeAdapter";

/**
 * 許可列（**structured-only**・raw 自由文を含まない）。将来 `plan_seeds` table の column-restricted SELECT 用。
 * buildSeedPlacements が必要とする structured fields に対応（id/desiredDate/desiredTimeHint/actionShape/confidence/status）。
 */
export const ALLOWED_SEED_COLUMNS = [
  "id",
  "user_id",
  "desired_date",
  "desired_time_hint",
  "action_shape",
  "confidence",
  "status",
] as const;
export type AllowedSeedColumn = (typeof ALLOWED_SEED_COLUMNS)[number];

/** 禁止列（**raw 自由文**）。SELECT も型保持もしない。 */
export const FORBIDDEN_SEED_COLUMNS = ["signal", "desired_action"] as const;
export type ForbiddenSeedColumn = (typeof FORBIDDEN_SEED_COLUMNS)[number];

/** column-restricted SELECT 句（`"*"` 禁止・raw 列なし）。 */
export const SEED_COLUMNS_SQL = ALLOWED_SEED_COLUMNS.join(", ");

/** 将来 `plan_seeds` table のテーブル名（**本 module では使わない**・実 read は A1-5-2-2 以降 + migration）。 */
export const SEED_TABLE = "plan_seeds";

/**
 * 許可列だけを持つ row 型（**`signal` / `desired_action` を型に持たない**）。
 * DB 側は TEXT enum ゆえ desired_time_hint/action_shape/status は string で受け、projection 側で安全に解釈する。
 */
export interface ColumnRestrictedSeedRow {
  readonly id: string;
  readonly user_id: string;
  readonly desired_date: string | null;
  readonly desired_time_hint: string | null;
  readonly action_shape: string | null;
  readonly confidence: number;
  readonly status: string;
}

/**
 * column-restricted row → 構造化 PlanSeed（**raw を持ち込まない**）。
 * signal/source/capturedAt は buildSeedPlacements が**読まない**ゆえ placeholder（空/manual）で型を満たすだけ。
 * desiredAction は **意図的に省略**（raw・型にも値にも持ち込まない）。
 * desired_time_hint/action_shape は不正値でも projection helper が default 処理（unknown→安全側）するため安全。
 */
function rowToStructuredSeed(row: ColumnRestrictedSeedRow): PlanSeed {
  return {
    id: row.id,
    userId: row.user_id,
    signal: "", // placeholder（未読・raw でない空文字）
    desiredDate: row.desired_date ?? undefined,
    desiredTimeHint: (row.desired_time_hint ?? undefined) as PlanSeedTimeHint | undefined,
    actionShape: (row.action_shape ?? undefined) as ActionShape | undefined,
    confidence: row.confidence,
    status: row.status as PlanSeedStatus,
    source: "manual", // placeholder（未読）
    capturedAt: "", // placeholder（未読）
  };
}

/**
 * A1-5-2-1: column-restricted seed row[] → `SeedPlacement[]`（**pure projection**）。
 * 既存 `buildSeedPlacements` を再利用 → **同等 semantics**（active のみ / structured-only / durationMin=null）。
 * 実 read はしない（row は注入）。raw（signal/desired_action）は型に無く読まれない。
 */
export function projectSeedRowsToPlacements(rows: readonly ColumnRestrictedSeedRow[]): readonly SeedPlacement[] {
  return buildSeedPlacements(rows.map(rowToStructuredSeed));
}
