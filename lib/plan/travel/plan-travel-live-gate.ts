/**
 * B2-disp A — Production /plan Travel Live Gate（**pure・default OFF・throw しない**）
 *
 * 設計正本: docs/t11-production-plan-travel-live-gate-design.md（§4）。LifeOps mainline gate の写し。
 *
 * 役割: travel display chain を production `/plan` surface に出してよいかの pure 判定。
 *   ★ env/IO を読まない（caller が PLAN_FLAGS + supabaseUrl を束ねて渡す）・**server-only flag が source of truth**。
 *
 * 二段階解禁:
 *   - 第 1 段（staging first）: travelLive ∧ planRouteLive ∧ staging allowlist ∧ production deny → staging でだけ true。
 *   - 第 2 段（production 解禁）: deny 解除は **別 CEO gate**（本 helper 改修 + 明示承認・事故で開かない）。
 *
 * 厳守: pure・default OFF・throw しない・client は判定しない（client は rendered result / 不在のみ受け取る）。
 */

import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "../shift/devFixtureHost";

export interface PlanTravelLiveEnv {
  /** PLAN_FLAGS.travelLive（server-only・default OFF）。 */
  readonly travelLive: boolean;
  /** PLAN_FLAGS.planRouteLive（/plan 自体が live な時のみ）。 */
  readonly planRouteLive: boolean;
  /** NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL（staging/production 判定）。 */
  readonly supabaseUrl: string | undefined;
}

/**
 * travelLive ∧ planRouteLive ∧ staging ∧ !production
 *   （第 1 段=staging first・**production は flag ON でも常に false**）。
 */
export function isPlanTravelLiveAllowed(env: PlanTravelLiveEnv): boolean {
  const url = env.supabaseUrl ?? "";
  return (
    env.travelLive === true &&
    env.planRouteLive === true &&
    url.includes(STAGING_PROJECT_REF) &&
    !url.includes(PRODUCTION_PROJECT_REF)
  );
}
