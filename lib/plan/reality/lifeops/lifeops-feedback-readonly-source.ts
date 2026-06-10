import "server-only";
/**
 * 横 R2 — Life Ops Feedback Read-only Source（**server-only wiring・write 0・default OFF**・barrel 非 export）
 *
 * 設計: docs/life-ops-feedback-readonly-source-a4-c8-mini-design.md（§4-§5）
 *
 * 役割: gate（master ∧ feedback flag ∧ staging ∧ !production）を通った時だけ、既存 M1 reader
 *   （column-restricted・owner-RLS・LIMIT・fail-open）で row を読み、**辞書 firewall adapter** 経由の
 *   `LifeOpsFeedbackObservation[]` を返す。**gate false → query せず []**（fail-closed-to-empty）。
 *
 * 厳守: createClient しない（注入）・service_role 禁止・write/INSERT/UPDATE/DELETE/RPC 0・UI/通知 0・
 *   env/flag は **caller が束ねて渡す**（PLAN_FLAGS.lifeopsRealdataReadonly ∧ lifeopsFeedbackReadonly・default OFF）・
 *   raw row を外に出さない（adapter 出力のみ）。接続位置は cap pipeline の最上流（merge 配線は別 slice）。
 */

import {
  createSupabasePrmLearningEventReader,
  type PrmLearningEventReadClient,
} from "../learning/supabase-prm-learning-event-reader";
import {
  isLifeOpsFeedbackReadAllowed,
  m1RowsToLifeOpsFeedback,
  type LifeOpsFeedbackObservation,
} from "./lifeops-feedback-source";

export interface LifeOpsFeedbackReadEnv {
  /** PLAN_FLAGS.lifeopsRealdataReadonly（default OFF）。 */
  readonly master: boolean;
  /** PLAN_FLAGS.lifeopsFeedbackReadonly（default OFF）。 */
  readonly feedback: boolean;
  /** NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL（staging allowlist ∧ production deny の照合元）。 */
  readonly supabaseUrl: string | undefined;
}

export interface LifeOpsFeedbackReadonlySource {
  /** gate 通過時のみ read（firewall 済み観測のみ・raw 非搬出）。gate false → query せず []。 */
  readObservations(): Promise<readonly LifeOpsFeedbackObservation[]>;
}

/**
 * A-4-c8: injected user-RLS client + env → feedback read-only source（**読むのは gate 通過時だけ**）。
 */
export function createLifeOpsFeedbackReadonlySource(
  client: PrmLearningEventReadClient,
  userId: string,
  env: LifeOpsFeedbackReadEnv,
): LifeOpsFeedbackReadonlySource {
  return {
    async readObservations() {
      if (!isLifeOpsFeedbackReadAllowed(env)) return []; // fail-closed-to-empty（query しない）
      const rows = await createSupabasePrmLearningEventReader(client, userId).readEventRows();
      return m1RowsToLifeOpsFeedback(rows);
    },
  };
}
