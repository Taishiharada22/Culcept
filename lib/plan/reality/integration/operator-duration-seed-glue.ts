import "server-only";
/**
 * operator-duration-seed-glue — RD3c-P3a-wire-C（2026-06-16）: operator seed write の **server-only glue**（barrel 非 export・未配線）
 *
 * 設計: docs/reality-operator-seed-wiring-rd3-c-p3a-wire-0.md §6
 *
 * 役割: gate（`evaluateOperatorDurationSeedGate`）→ injected user-RLS Supabase client → repository（Supabase 実装）→
 *   orchestration（`createOperatorDurationSeed`・pure・provenance/learningEligible を固定）を接続する。
 *   **server が user/environment/provenance を固定**し、client から isOperator/environment/provenance を **受け取らない**。
 *   route / server action / UI ではない（v0 = server-only function のみ・呼び出しは後続 gate）。
 *
 * 厳守:
 *   - operator-only・dogfood/staging のみ・production deny（gate + orchestration 二重）。
 *   - **createClient しない・service_role 禁止**（user-RLS client 注入）。**`.from` を持たない**（repository に委譲）。
 *   - **raw DB error / SQL / UUID を出さない**: 全 failure を safe code に正規化。write は fail-closed。
 *   - Date.now なし（nowIso は呼び元 server が注入）。barrel 非 export・未配線。
 */
import { evaluateOperatorDurationSeedGate, type OperatorDurationSeedGateInput } from "../operator-duration-seed-gate";
import {
  createSupabaseOperatorDurationSeedRepository,
  OperatorSeedRepositoryError,
  type DurationConfirmationWriteClient,
} from "./duration-confirmation-source";
import {
  createOperatorDurationSeed,
  type OperatorDurationSeedRequestV0,
} from "@/lib/plan/realityCore/operatorDurationSeedWrite";

export type OperatorDurationSeedServerResultV0 =
  | { readonly ok: true; readonly insertedId: string; readonly supersededIds: ReadonlyArray<string>; readonly environment: "dogfood" | "staging" }
  | { readonly ok: false; readonly code: string };

export interface OperatorDurationSeedServerDepsV0 {
  /** server-resolved gate inputs（flag/nodeEnv/supabaseUrl/operatorAllowlist/requestedUserId=auth.uid()）。client から受けない。 */
  readonly gateInput: OperatorDurationSeedGateInput;
  /** injected user-RLS Supabase client（**service_role を渡さない**）。 */
  readonly client: DurationConfirmationWriteClient;
  /** server clock（pure・Date.now 不使用）。 */
  readonly nowIso: string;
}

/**
 * createOperatorDurationSeedServer — operator seed write の server-only 入口。
 *   gate deny → repository を呼ばず safe code を返す。allow → server が user/environment/confirmedBy を固定して orchestration 実行。
 *   raw DB error は safe code に正規化（client に raw を出さない）。
 */
export async function createOperatorDurationSeedServer(
  request: OperatorDurationSeedRequestV0,
  deps: OperatorDurationSeedServerDepsV0,
): Promise<OperatorDurationSeedServerResultV0> {
  // ① gate（server-side・client から isOperator/environment を受けない）
  const gate = evaluateOperatorDurationSeedGate(deps.gateInput);
  if (!gate.allow) return { ok: false, code: `gate_${gate.reason.toLowerCase()}` };
  const ownerUserId = deps.gateInput.requestedUserId;
  if (ownerUserId === null) return { ok: false, code: "gate_no_user" }; // gate allow ⟹ 非 null（TS narrowing）

  // ② server が user/confirmedBy を固定（client 値を信用しない・provenance は orchestration が固定）
  const serverRequest: OperatorDurationSeedRequestV0 = {
    ...request,
    userId: ownerUserId, // server-resolved auth.uid()
    confirmedBy: ownerUserId, // operator id = auth.uid()
  };

  // ③ repository（注入 user-RLS client）+ orchestration（validation bypass なし・provenance/learningEligible 固定）
  const repository = createSupabaseOperatorDurationSeedRepository(deps.client, ownerUserId);
  try {
    const res = await createOperatorDurationSeed(serverRequest, {
      isOperator: true, // gate allow（client から受けない）
      resolvedEnvironment: gate.environment, // server-resolved（dogfood|staging・never production）
      nowIso: deps.nowIso,
      repository,
    });
    if (res.ok) {
      return { ok: true, insertedId: res.insertedId, supersededIds: res.supersededIds, environment: gate.environment };
    }
    return { ok: false, code: res.rejectedReason }; // validation_failed 等（safe code・raw でない）
  } catch (e) {
    // repository が throw する safe error（active_duplicate_conflict / db_insert_failed / supersede_failed）
    if (e instanceof OperatorSeedRepositoryError) return { ok: false, code: e.code };
    return { ok: false, code: "db_insert_failed" }; // 予期せぬ例外も safe code（raw を出さない）
  }
}
