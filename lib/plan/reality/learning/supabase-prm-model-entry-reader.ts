import "server-only";
/**
 * Reality Control OS — A1-7-34 Supabase PRM Model Entry Reader（read-only・**server-only・user-RLS・barrel 非 export**）
 *
 * 設計: docs/prm-second-self-surfacing-design.md（A1-7-34）/ prm-model-entry-read.ts
 *
 * 役割: injected user-RLS client で owner の M3 `prm_model_entries`（**user_visible ∧ 非 retracted**）を column-restricted に read し、
 *   `SecondSelfTendency[]` に変換する。dev-second-self preview が presenter で非断定表示。**read-only・service_role 禁止**。
 *
 * 厳守: read-only（select/eq/is/order/limit のみ）・createClient しない・raw/seedRef/personality を select も返却もしない・fail-open []。
 */

import {
  PRM_MODEL_ENTRY_READ_COLUMNS,
  PRM_MODEL_ENTRY_FEEDBACK_COLUMNS,
  prmModelEntryRowsToTendencies,
  prmModelEntryRowsToFeedbackEntries,
  type PrmModelEntryReadRow,
  type PrmModelEntryFeedbackRow,
  type PrmModelEntryFeedbackEntry,
  type SecondSelfTendency,
} from "./prm-model-entry-read";

const READ_LIMIT = 200;

interface ReadResponse {
  readonly data: readonly Record<string, unknown>[] | null;
  readonly error: { readonly message: string } | null;
}
interface ReadChain {
  eq(column: string, value: string | boolean): ReadChain;
  is(column: string, value: null): ReadChain;
  order(column: string, opts?: { readonly ascending?: boolean }): ReadChain;
  limit(n: number): PromiseLike<ReadResponse>;
}
interface ReadFrom {
  select(columns: string): ReadChain;
}
/** user-RLS read client（**service_role を渡さないこと**）。 */
export interface PrmModelEntryReadClient {
  from(table: string): ReadFrom;
}

export interface PrmModelEntryReader {
  /** owner の review 済 tendency（user_visible ∧ 非 retracted）を SecondSelfTendency[] として読む（fail-open []）。 */
  readSecondSelfTendencies(): Promise<readonly SecondSelfTendency[]>;
  /**
   * A1-7-35: feedback 解決用に owner の M3（非 retracted）を **id 付き** で読む（confirm/correct/reject の対象特定）。
   * client snapshot を信頼しないための **server 再読込パス**。fail-open []。
   */
  readModelEntriesForFeedback(): Promise<readonly PrmModelEntryFeedbackEntry[]>;
}

/**
 * A1-7-34: injected user-RLS client で M3（owner・user_visible ∧ retracted_at IS NULL）を read し SecondSelfTendency[] を返す reader。
 */
export function createSupabasePrmModelEntryReader(client: PrmModelEntryReadClient, userId: string): PrmModelEntryReader {
  return {
    async readSecondSelfTendencies() {
      const res = await client
        .from("prm_model_entries")
        .select(PRM_MODEL_ENTRY_READ_COLUMNS) // 許可列のみ（raw/user_id/id/decay なし）
        .eq("user_id", userId) // RLS + 明示
        .eq("user_visible", true) // ユーザーに見える tendency のみ
        .is("retracted_at", null) // 非 retracted（論理削除でない）
        .order("created_at", { ascending: false })
        .limit(READ_LIMIT);
      if (res.error || !res.data) return []; // fail-open
      return prmModelEntryRowsToTendencies(res.data as unknown as readonly PrmModelEntryReadRow[]);
    },
    async readModelEntriesForFeedback() {
      const res = await client
        .from("prm_model_entries")
        .select(PRM_MODEL_ENTRY_FEEDBACK_COLUMNS) // id + context 列のみ（raw/user_id/decay なし）
        .eq("user_id", userId) // RLS + 明示
        .eq("user_visible", true)
        .is("retracted_at", null) // 既に retract 済は feedback 対象外
        .order("created_at", { ascending: false })
        .limit(READ_LIMIT);
      if (res.error || !res.data) return []; // fail-open
      return prmModelEntryRowsToFeedbackEntries(res.data as unknown as readonly PrmModelEntryFeedbackRow[]);
    },
  };
}
