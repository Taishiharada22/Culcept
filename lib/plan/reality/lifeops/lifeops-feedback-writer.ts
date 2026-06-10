import "server-only";
/**
 * 横 R2 — Life Ops Feedback Writer（**server-only・gate-first・insert のみ・fail-open**・barrel 非 export・**未配線**）
 *
 * 設計: docs/life-ops-feedback-write-contract-a4-c9-mini-design.md（§5）
 *
 * 役割: gate（master ∧ write flag ∧ staging ∧ !production）+ cooldown guard を通った時だけ、
 *   M1（prm_learning_events）へ **lifeops 行 1 件**を insert する薄い writer。
 *   既存 A1-7-16 repository と同 pattern（user_id 付与・fail-open・insert のみ）だが、
 *   `source_kind` 型 union を 'lifeops' で汚さないため**専用実装**（table 名は既存定数を参照）。
 *
 * 厳守:
 *   - **gate false → insert を呼ばない**（{written:false, reason:"gate_off"}・query 0）。
 *   - cooldown 重複 → {written:false, reason:"duplicate_cooldown"}（query 0）。
 *   - insert error/例外 → **throw しない**（{written:false, reason:"insert_failed"}・user action を壊さない）。
 *   - ★実 DB では **M1 CHECK 拡張 migration（source_kind+='lifeops'）が前提**＝それまで staging でも DB が拒否（設計どおり）。
 *   - createClient しない（注入）・service_role 禁止・UPDATE/DELETE/UPSERT/RPC なし・UI/通知なし・**本 slice では呼び出し元なし**。
 */

import { PRM_LEARNING_EVENTS_TABLE } from "../learning/supabase-prm-learning-event-repository";
import {
  buildLifeOpsFeedbackWriteRow,
  isLifeOpsFeedbackWriteAllowed,
  shouldWriteLifeOpsFeedback,
  type LifeOpsFeedbackWriteIntent,
  type RecentFeedbackWrite,
} from "./lifeops-feedback-write";

interface InsertResponse {
  readonly error: { readonly message: string } | null;
}
interface InsertFrom {
  insert(rows: readonly Record<string, unknown>[]): PromiseLike<InsertResponse>;
}
/** user-RLS write client（**service_role を渡さないこと**）。実 Supabase client が structural に満たす。 */
export interface LifeOpsFeedbackWriteClient {
  from(table: string): InsertFrom;
}

export interface LifeOpsFeedbackWriteEnv {
  /** PLAN_FLAGS.lifeopsRealdataReadonly（master・default OFF）。 */
  readonly master: boolean;
  /** PLAN_FLAGS.lifeopsFeedbackWrite（default OFF）。 */
  readonly write: boolean;
  readonly supabaseUrl: string | undefined;
}

export interface LifeOpsFeedbackWriteResult {
  readonly written: boolean;
  readonly reason: "ok" | "gate_off" | "duplicate_cooldown" | "insert_failed";
}

export interface LifeOpsFeedbackWriter {
  /** 1 user-gesture = 1 write（fire-once・no-retry）。gate/cooldown 不通過時は insert を呼ばない。 */
  writeFeedback(intent: LifeOpsFeedbackWriteIntent, opts?: { readonly recent?: readonly RecentFeedbackWrite[]; readonly nowMs?: number }): Promise<LifeOpsFeedbackWriteResult>;
}

/**
 * A-4-c9: injected user-RLS client + env → feedback writer（**default OFF・未配線**）。
 */
export function createLifeOpsFeedbackWriter(client: LifeOpsFeedbackWriteClient, userId: string, env: LifeOpsFeedbackWriteEnv): LifeOpsFeedbackWriter {
  return {
    async writeFeedback(intent, opts) {
      if (!isLifeOpsFeedbackWriteAllowed(env)) return { written: false, reason: "gate_off" }; // query 0
      const nowMs = opts?.nowMs ?? Date.parse(intent.actedAtISO);
      if (!shouldWriteLifeOpsFeedback(opts?.recent ?? [], intent, nowMs)) {
        return { written: false, reason: "duplicate_cooldown" }; // query 0
      }
      const row = buildLifeOpsFeedbackWriteRow(intent);
      // A-4-c12 実バグ修正: PostgREST は明示 null で DEFAULT を使わない → NOT NULL の captured_at は
      //   **payload から省略**して DB DEFAULT NOW() を効かせる（c12 smoke が NOT NULL 違反で発見）。
      const { captured_at: _omitForDbDefault, ...payload } = row;
      try {
        const res = await client.from(PRM_LEARNING_EVENTS_TABLE).insert([{ ...payload, user_id: userId }]);
        if (res.error) return { written: false, reason: "insert_failed" }; // fail-open（throw しない）
        return { written: true, reason: "ok" };
      } catch {
        return { written: false, reason: "insert_failed" };
      }
    },
  };
}
