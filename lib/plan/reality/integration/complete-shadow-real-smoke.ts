import "server-only";
/**
 * Reality Control OS — A1-5-1b Complete Shadow Real-Read Smoke Entry（server-only・**manual・no auto call-site**）
 *
 * 親設計: docs/aneurasync-reality-control-os-connection-design.md §8（A1-5-0/1a）
 *
 * 役割: CEO の **手動 dev smoke** 用 server-only entry。既存 `runRealReadSmoke` +
 *   `createDatedColumnRestrictedAnchorSource`（column-restricted external_anchors read）を合成し、
 *   **空 CompleteDispatchInput（candidates=[]）→ candidateCount=0** の redacted RealSmokeReport を返す。
 *
 * 【A1-5-1b の安全境界（厳守）】:
 *   - **route/UI/PlanClient/cron/automatic runtime call-site から呼ばない**（manual entry 専用）。
 *   - **createClient / createServerClient / service role を本 module に書かない**。user-RLS client は **注入**（CEO harness）。
 *   - 4 層 fail-closed gate（production / flag-off / no-capability / out-of-scope-user → no-op・load 0）。
 *   - external_anchors の **column-restricted read のみ**（seed read なし・DB write なし）。
 *   - seedPlacements/durationEvidences 空 → **candidateCount=0**。出力は assertRedacted-clean な RealSmokeReport。
 *   - **barrel（index.ts）非 export**。console / file / DB-write / push なし。
 *
 * 制約: 純合成 + 依存注入。server-only。**実 read は CEO 手動（user-RLS client 注入）時のみ**。
 */

import { runRealReadSmoke, type RealSmokeReport, type RealSmokeDeps } from "./dev-runtime-smoke";
import { createDatedColumnRestrictedAnchorSource, type UserContextClient } from "./dev-runtime-realsource";
import type { SmokeGate } from "./dev-runtime";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

/**
 * SmokeGate を `PLAN_FLAGS.realityCompleteShadow` + 注入値から組む（flag を committed code で消費）。
 * flag 既定 false（env 未設定）ゆえ、無指定では gate.flagEnabled=false → smoke は FLAG_OFF no-op。
 */
export function buildCompleteShadowGate(args: {
  readonly nodeEnv: string;
  readonly capability: "dev-only" | undefined;
  readonly requestedUserId: string;
  readonly allowedDevUserId: string | undefined;
}): SmokeGate {
  return {
    nodeEnv: args.nodeEnv,
    flagEnabled: PLAN_FLAGS.realityCompleteShadow,
    capability: args.capability,
    requestedUserId: args.requestedUserId,
    allowedDevUserId: args.allowedDevUserId,
  };
}

/** Complete shadow real-read smoke entry の依存（**client は注入**・本 module は createClient を書かない）。 */
export interface CompleteShadowRealSmokeDeps {
  readonly gate: SmokeGate;
  /** user-RLS client（service_role 不可・CEO harness が注入。本 module は createClient しない） */
  readonly client: UserContextClient;
  /** "user_rls" のみ許可（runRealReadSmoke が service_role を拒否） */
  readonly clientContext: RealSmokeDeps["clientContext"];
  readonly date: string;
  readonly limit: number;
}

/**
 * A1-5-1b: CEO 手動 dev smoke の **server-only entry**（no auto call-site）。
 * gate → column-restricted external_anchors read → seed-strip → runShadow(**candidates=[]**) →
 * redaction gate → RealSmokeReport。**実 read は user-RLS client 注入時のみ**・候補 0・DB write/push なし。
 */
export async function runCompleteShadowRealSmoke(deps: CompleteShadowRealSmokeDeps): Promise<RealSmokeReport> {
  const dataSource = createDatedColumnRestrictedAnchorSource(deps.client, { date: deps.date, limit: deps.limit });
  return runRealReadSmoke({
    gate: deps.gate,
    dataSource,
    clientContext: deps.clientContext,
    date: deps.date,
    limit: deps.limit,
    candidates: [], // A1-5-1b: 空 CompleteDispatchInput → candidateCount=0
  });
}
