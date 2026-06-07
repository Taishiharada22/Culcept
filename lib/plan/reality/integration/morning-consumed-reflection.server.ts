import "server-only";
/**
 * Reality Control OS — A1-6-7 Morning Consumed Reflection Route Support（**server-only・barrel 非 export**・route core）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.12
 *
 * 役割: morning route（alter route）が **serve-time に** consumed seed を `MorningPlan` に反映するための薄い wrapper。
 *   - flag（`realityConsumedReflection`）gate を **helper 側に閉じる**（route は PLAN_FLAGS を import せず 1 行で呼ぶ＝既存
 *     `resolveMorningProtocolCaptureFragment` と同じ pattern）。
 *   - flag off / plan null → **plan を変えない**（read 0・dormant・本番デフォルト）。
 *   - flag on → A1-6-5d real reader（status='consumed' のみ・seedRef-free）で read し A1-6-7 pure merge で additive 反映。
 *
 * 厳守:
 *   - **serve-time のみ**（route が response 用に算出・**stored session（morningResponse.plan）は変えない**＝呼び出し側が別変数で受ける）。
 *   - **fail-open**: flag off / read error / 例外では **既存 plan を返す**（response を壊さない・additive 不変）。
 *   - **read-only**（status-only accept の結果＝consumed seed を読むだけ・write しない・generateComplete/anchor 不使用・LLM await しない）。
 *   - **user-RLS client 注入**（auth user 以外の seed は読めない）・service_role なし・本 module は createClient しない。barrel 非 export。
 */

import type { MorningPlan } from "@/lib/alter-morning/types";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { loadConsumedReflectedMorningPlan } from "../consumed-seed-morning-reflection";
import { createConsumedSeedRepository, type ConsumedSeedReadClient } from "./consumed-seed-repository-supabase";

/**
 * A1-6-7: serve-time の consumed→MorningPlan reflection を解決（**flag-gated・fail-open**）。
 *   - `realityConsumedReflection` off / `plan===null` → **`plan` をそのまま返す**（read 0・既存と完全一致）。
 *   - on → real reader（user-RLS client 注入）で同日 consumed seed を read し additive merge。例外時は `plan`（fail-open）。
 *   返り値は **response 用**（呼び出し側は stored session と別変数で受け、session は変えない）。
 */
export async function resolveConsumedReflectedMorningPlan(
  plan: MorningPlan | null,
  client: ConsumedSeedReadClient,
  userId: string
): Promise<MorningPlan | null> {
  if (!PLAN_FLAGS.realityConsumedReflection || plan === null) return plan;
  try {
    return await loadConsumedReflectedMorningPlan(plan, createConsumedSeedRepository(client, userId));
  } catch {
    return plan; // fail-open: 既存 plan を serve（response を壊さない）
  }
}
