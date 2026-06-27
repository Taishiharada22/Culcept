/**
 * 横 R2 — A-4-c19 Life Ops Mainline Gate（**pure・dormant・consumer なし**＝設計の具体化のみ・barrel 非 export）
 *
 * 設計: docs/life-ops-mainline-readiness-a4-c19-design.md（§6）
 *
 * 役割: Life Ops を /plan 本線 surface に出してよいかの pure 判定。**本 slice では呼び出し元を作らない**
 *   （UI/PlanClient/R4/notification 不接触）。将来の本線 slice が page/server action の両方で使う。
 *
 * 二段階解禁設計:
 *   - 第 1 段（staging first）: flag ∧ staging allowlist ∧ production deny → staging でだけ true。
 *   - 第 2 段（production 解禁）: deny 解除は**別 CEO gate**（本 helper の改修 + 明示承認が必要＝事故で開かない）。
 *
 * 厳守: pure（IO/env 読み取りなし・caller が PLAN_FLAGS を束ねて渡す）・default OFF・throw しない。
 */

import {
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  CLEAN_PRODUCTION_PROJECT_REF,
} from "../../shift/devFixtureHost";

export interface LifeOpsMainlineEnv {
  /** PLAN_FLAGS.lifeopsMainline（default OFF）。 */
  readonly mainline: boolean;
  /** PLAN_FLAGS.planRouteLive（/plan 自体の flag・本線は plan が生きている時のみ）。 */
  readonly planRouteLive: boolean;
  /** NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL。 */
  readonly supabaseUrl: string | undefined;
}

/**
 * mainline ∧ planRouteLive ∧ staging ∧ !production（**第 1 段=staging first・production は flag ON でも常に false**）。
 */
export function isLifeOpsMainlineAllowed(env: LifeOpsMainlineEnv): boolean {
  const url = env.supabaseUrl ?? "";
  return env.mainline === true && env.planRouteLive === true && url.includes(STAGING_PROJECT_REF) && !url.includes(PRODUCTION_PROJECT_REF) && !url.includes(CLEAN_PRODUCTION_PROJECT_REF);
}
