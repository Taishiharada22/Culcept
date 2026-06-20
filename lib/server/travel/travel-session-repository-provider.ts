import "server-only";
/**
 * B — Travel Session Repository **Provider Seam**（**server-side・stateless・fail-closed・no DB/Supabase**）
 *
 * 設計正本: docs/t11-server-action-persistence-wiring-preflight.md（§8）
 *
 * 役割: 将来の server action persistence 配線が依存する **repository 解決の seam**。
 *   - test は in-memory harness を **context に注入**して available にできる。
 *   - **real Supabase repository は承認まで unavailable**（本 seam は構築しない）。
 *   - **global singleton / process-wide 共有 mutable repository を持たない**（cross-user leakage 防止）。
 *
 * 厳守:
 *   - **stateless**（module-level mutable state なし）・注入が無ければ **unavailable（fail-closed）**。
 *   - `supabaseServer` / `createClient` / `createSupabaseTravelSessionDbPort` を import/構築しない・service_role なし。
 *   - generated types を import しない・DB call をしない・repository method を resolution 中に呼ばない。
 *   - engine/display/provider mapper/M2/CoAlter/`/talk`/app・UI を呼ばない・import しない。
 *   - **raw diagnostics を client に出さない**（中立 reason のみ）。
 */

import type { TravelSessionRepositoryContract } from "@/lib/shared/travel/travel-session-persistence-types";

/** 解決 mode（既定 disabled）。 */
export type TravelSessionRepositoryProviderMode = "in_memory_harness" | "supabase_unavailable" | "disabled";

/** 解決 context（owner + 任意の注入 repository / mode）。 */
export interface TravelSessionRepositoryProviderContext {
  /** server auth owner（context のみ・FormData から取らない）。 */
  readonly ownerUserId: string;
  /** ★ test 用に注入された repository（production では渡さない）。 */
  readonly injectedRepository?: TravelSessionRepositoryContract;
  /** 任意・既定 disabled。注入が無い限り available にしない。 */
  readonly mode?: TravelSessionRepositoryProviderMode;
}

/** 解決結果（available は repository + owner / unavailable は中立 reason のみ）。 */
export type TravelSessionRepositoryProviderResult =
  | { readonly status: "available"; readonly repository: TravelSessionRepositoryContract; readonly ownerUserId: string }
  | { readonly status: "unavailable"; readonly reason: "no_repository" | "disabled" | "supabase_unavailable" };

export interface TravelSessionRepositoryProvider {
  resolve(context: TravelSessionRepositoryProviderContext): TravelSessionRepositoryProviderResult;
}

/**
 * context から repository を解決（**pure・stateless・注入があれば available・無ければ fail-closed**）。
 *   ★ real Supabase を構築しない・repository method を呼ばない・owner を pass-through するだけ。
 */
export function resolveTravelSessionRepository(
  context: TravelSessionRepositoryProviderContext,
): TravelSessionRepositoryProviderResult {
  if (!context || typeof context.ownerUserId !== "string" || context.ownerUserId.length === 0) {
    return { status: "unavailable", reason: "disabled" }; // 無効 context → fail-closed
  }
  // ★ 注入された repository のみ available（test / 将来の承認済 caller）。owner を pass-through。
  if (context.injectedRepository) {
    return { status: "available", repository: context.injectedRepository, ownerUserId: context.ownerUserId };
  }
  // 注入なし → fail-closed。**real Supabase は HOLD（構築しない）**・global harness も作らない。
  const mode = context.mode ?? "disabled";
  if (mode === "supabase_unavailable") return { status: "unavailable", reason: "supabase_unavailable" };
  if (mode === "in_memory_harness") return { status: "unavailable", reason: "no_repository" }; // harness を global 構築しない
  return { status: "unavailable", reason: "disabled" };
}

/**
 * provider seam（**stateless wrapper・global singleton を持たない**）。
 *   各呼び出しは新しい stateless object を返し、repository は context 注入のみから来る。
 */
export function createTravelSessionRepositoryProvider(): TravelSessionRepositoryProvider {
  return { resolve: resolveTravelSessionRepository };
}
