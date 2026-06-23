/**
 * canonicalTaskRow — canonical_tasks persistence projection + dry-run validator（P4・pure）
 *
 * CanonicalTaskV0(kernel 正本) → **DB に INSERT する行の形**（`CanonicalTaskRowV0`）への projection と、
 * その行が persistence 契約を満たすかの **dry-run 検証**（DB に触れず純関数で判定）。
 *
 * これは「保存準備（readiness）」であって **保存ではない**。実 INSERT / migration / Supabase / SQL 実行は
 *   一切しない。列契約は `docs/reality-os-canonical-task-db-open-decisions.md`（CEO 2026-06-21 裁定）に準拠：
 *   - table=`canonical_tasks` / soft archive(`archived_at`) / source_kind 3値 CHECK
 *   - due_time naive `time`（tz は projection 側で JST 合成・行には HH:mm を素で持つ）
 *   - recurrence 定義のみ(jsonb)・instance 非永続 / parentId two-pass(一時列 `_source_parent_id`)
 *   - RLS owner-only(`auth.uid()=user_id`)・service_role/SECURITY DEFINER 不使用
 *
 * 規律: pure・no DB・no SQL・no Supabase・no fetch・no API・no persistence write。
 *   DB 生成値（id/created_at/updated_at/解決後 parent_id）は **捏造しない**＝行に含めない（生成は DB 側）。
 *   honest-unknown: 不明は null。redaction は persistence 層の責務外（motivation 等は観測素材として保存・surface 露出は presenter で既に遮断）。
 */

import type { CanonicalTaskV0, CanonicalTaskRecurrenceV0, TaskMotivation, CompletionFeel } from "@/lib/plan/realityCore/canonicalTask";

/** 物理テーブル名（migration 昇格は別 GO・ここでは契約定数のみ）。 */
export const CANONICAL_TASKS_TABLE = "canonical_tasks" as const;

/** source_kind 3値 CHECK（open-decisions §3）。 */
export const CANONICAL_TASK_SOURCE_KINDS = ["daily_orbit", "manual", "import"] as const;
export type CanonicalTaskSourceKindV0 = (typeof CANONICAL_TASK_SOURCE_KINDS)[number];

/**
 * canonical_tasks に INSERT する 1st-pass 行の形（DB 生成値は持たない）。
 * - id / created_at / updated_at: DB default 生成 → 含めない（捏造しない）
 * - parent_id: 1st-pass は NULL。2nd-pass で `_source_parent_id`→新 id 解決（open-decisions §7）
 * - due_time: naive HH:mm（tz は projection で JST 合成・open-decisions §4）
 * - recurrence: 定義のみ jsonb（instance 非永続・open-decisions §5）
 */
export interface CanonicalTaskRowV0 {
  readonly user_id: string;
  readonly source_kind: CanonicalTaskSourceKindV0;
  readonly source_task_id: string;
  readonly text: string;
  readonly completed: boolean;
  readonly completed_at: string | null;
  readonly carried_from: string | null;
  readonly carry_count: number;
  readonly due_date: string | null;
  readonly due_time: string | null;
  readonly recurrence: CanonicalTaskRecurrenceV0 | null;
  readonly motivation: TaskMotivation | null;
  readonly completion_feel: CompletionFeel | null;
  readonly tags: ReadonlyArray<string>;
  /** parentId two-pass 用の一時列（migration 後 DROP・open-decisions §7）。root は null。 */
  readonly _source_parent_id: string | null;
  readonly added_at: string;
  /** soft archive（open-decisions §2）。v0 は手動 archive のみ（§9）→ 既定 null。 */
  readonly archived_at: string | null;
}

export interface ToCanonicalTaskRowOptionsV0 {
  readonly userId: string;
  readonly sourceKind: CanonicalTaskSourceKindV0;
  /** soft archive 時刻（手動 archive のみ・既定 null）。 */
  readonly archivedAt?: string | null;
}

/**
 * CanonicalTaskV0 → CanonicalTaskRowV0（pure projection）。
 * source_task_id = kernel の taskId（UNIQUE(user_id, source_kind, source_task_id) の dedup キー）。
 */
export function toCanonicalTaskRow(task: CanonicalTaskV0, opts: ToCanonicalTaskRowOptionsV0): CanonicalTaskRowV0 {
  return {
    user_id: opts.userId,
    source_kind: opts.sourceKind,
    source_task_id: task.taskId,
    text: task.text,
    completed: task.completed,
    completed_at: task.completedAt,
    carried_from: task.carriedFrom,
    carry_count: task.carryCount,
    due_date: task.dueDate,
    due_time: task.dueTime, // naive HH:mm（JST 合成は projection 側）
    recurrence: task.recurrence,
    motivation: task.motivation,
    completion_feel: task.completionFeel,
    tags: task.tags,
    _source_parent_id: task.parentId, // 1st-pass は parent_id=NULL・解決は 2nd-pass
    added_at: task.addedAt,
    archived_at: opts.archivedAt ?? null,
  };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * dry-run validator（DB に触れず行の persistence 契約適合を判定）。
 * 返り値は違反 reasonCode 配列（空 = 適合）。staging dry-run §10 の前段 self-check に相当。
 */
export function canonicalTaskRowDryRunViolations(row: CanonicalTaskRowV0): string[] {
  const v: string[] = [];
  // RLS owner key（auth.uid()=user_id）— 空は他者書込/孤児化リスク
  if (!row.user_id || row.user_id.trim() === "") v.push("user_id_missing");
  // CHECK 制約
  if (!CANONICAL_TASK_SOURCE_KINDS.includes(row.source_kind)) v.push("source_kind_invalid");
  // UNIQUE 構成要素
  if (!row.source_task_id || row.source_task_id.trim() === "") v.push("source_task_id_missing");
  if (!row.text || row.text.trim() === "") v.push("text_empty");
  // completed ⟺ completed_at の整合（completed なのに時刻欠落 / 未完了なのに時刻あり）
  if (row.completed && row.completed_at === null) v.push("completed_without_completed_at");
  if (!row.completed && row.completed_at !== null) v.push("completed_at_without_completed");
  if (row.carry_count < 0) v.push("carry_count_negative");
  // naive time / date 形式
  if (row.due_time !== null && !HHMM.test(row.due_time)) v.push("due_time_format");
  if (row.due_date !== null && !YMD.test(row.due_date)) v.push("due_date_format");
  if (row.carried_from !== null && !YMD.test(row.carried_from)) v.push("carried_from_format");
  // self-parent は 1 階層 subtask 契約違反
  if (row._source_parent_id !== null && row._source_parent_id === row.source_task_id) v.push("self_parent");
  return v;
}
