/**
 * E1 hero canary resolver — 実 anchor read の triple-gated エントリ（server・実 read 実装）
 *
 * 設計: docs/reality-os-e1-hero-canary-preflight.md。readiness(15b742506) の guard/composer/flag を
 *   **実 Supabase client に配線**する最小箇所。`buildPlanClientFeatureProps` から呼ばれる。
 *
 * triple gate（全て満たした時のみ実 read）:
 *   1. flag `REALITY_OS_HERO_CANARY`（env・default OFF）
 *   2. canary user allowlist（`realityCanaryUserIds`・env REALITY_CAPTURE_CANARY_USER_IDS）に userId 含有
 *   3. read 接続先 guard（`isRealityReadConnectionAllowed`・staging のみ・plod/aljav deny）
 *   いずれか欠ければ undefined（実 read せず・従来挙動不変）。
 *
 * 規律: column-restricted（許可列のみ・reader が SELECT 制限）。DB write / migration / 外部API / LLM なし。
 *   gate を緩めない（Math 的 AND）。flag OFF rollback は本 resolver が undefined を返すことで即時成立。
 */

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { isRealityReadConnectionAllowed } from "@/lib/plan/reality/realityReadConnectionGuard";
import {
  createSupabaseHeroAnchorReader,
  composeHeroCanaryForViewer,
  type HeroCanarySurfaceV0,
} from "@/lib/plan/realityPipeline/heroAnchorFeasibility";
import type { SupabaseLikeClient } from "@/lib/plan/reality/integration/dev-runtime-adapter";

export interface HeroCanaryGateInput {
  readonly flagOn: boolean;
  readonly canaryUserIds: readonly string[];
  readonly userId: string;
  readonly supabaseUrl: string | undefined;
}

/**
 * triple gate の pure 判定（flag ∧ canary 該当 ∧ read 接続先許可）。test 容易・env 非依存。
 */
export function shouldResolveHeroCanary(input: HeroCanaryGateInput): boolean {
  return (
    input.flagOn &&
    input.userId.length > 0 &&
    input.canaryUserIds.includes(input.userId) &&
    isRealityReadConnectionAllowed(input.supabaseUrl)
  );
}

/**
 * gate 通過時のみ実 anchor を column-restricted read して hero surface を返す（else undefined）。
 * supabase は server client（SupabaseLikeClient 互換・既存 cast 先例に倣う）。
 */
export async function resolveHeroCanarySurface(
  supabase: unknown,
  userId: string,
  supabaseUrl: string | undefined,
): Promise<HeroCanarySurfaceV0 | undefined> {
  if (
    !shouldResolveHeroCanary({
      flagOn: PLAN_FLAGS.realityOsHeroCanary,
      canaryUserIds: PLAN_FLAGS.realityCanaryUserIds,
      userId,
      supabaseUrl,
    })
  ) {
    return undefined; // flag OFF / 非 canary / 非 staging → 実 read せず（rollback も同経路）
  }
  const reader = createSupabaseHeroAnchorReader(supabase as SupabaseLikeClient);
  return (await composeHeroCanaryForViewer(reader, userId)) ?? undefined;
}
