/**
 * lib/plan/mobility/paceShadowActivation.ts — A1-8: dogfood/dev 限定の shadow activation（pure orchestration）
 *
 * ★目的: 実 reflection（DAY_REHEARSAL_PERSONAL_PACE_ENABLED）は OFF のまま、pace 反映を **shadow** で走らせ
 *   OFF/ON 差分を structured に出す。readiness が足りるときだけ shadow し、害（過悲観/marker 爆発/診断悪化/
 *   過剰変化）を検出する。dogfood で「有効化して安全か」を実 UI に出さず観測するためのエンジン。
 *
 * ★安全境界（CEO 方針）:
 *   - readiness が ready_for_shadow / ready_for_activation のときだけ shadow（not_enough は走らせない）。
 *   - ★実 reflection はしない（本 module は rehearseDay を shadow で 2 回回すだけ・実 UI に出さない）。
 *   - flag DAY_REHEARSAL_PACE_SHADOW_ENABLED は default OFF・**production hard block**（isPaceShadowActivationEnabled）。
 *   - sparse を ready 扱いしない（buildPaceActivationReadiness が担保）。raw GPS を扱わない（derived のみ）。
 *   - pure / Date 不使用 / DB・network 不使用。
 */
import type { RehearsalInput } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";
import type { PaceResolver } from "@/lib/plan/dayRehearsal/personalPaceAdapter";
import type { PersonalPaceRatioConfig, PersonalPaceRatioResult } from "@/lib/plan/mobility/personalPaceRatio";
import {
  buildPaceActivationReadiness,
  type OverallReadiness,
  type PaceReadinessConfig,
} from "@/lib/plan/mobility/paceActivationReadiness";
import {
  validatePaceShadow,
  type PaceShadowConfig,
  type PaceShadowResult,
} from "@/lib/plan/mobility/paceShadowValidation";

/**
 * ★A1-8 dogfood shadow flag（**default OFF**・dogfood/dev のみ）。
 * これは shadow 比較を走らせるだけで実 reflection はしない（実 reflection は別 flag DAY_REHEARSAL_PERSONAL_PACE_ENABLED）。
 */
export const DAY_REHEARSAL_PACE_SHADOW_ENABLED = false;

/** shadow activation を走らせてよいか（flag ON ∧ 非 production・default OFF）。 */
export function isPaceShadowActivationEnabled(): boolean {
  return DAY_REHEARSAL_PACE_SHADOW_ENABLED && process.env.NODE_ENV !== "production"; // ★production hard block
}

export interface PaceShadowConcerns {
  readonly overPessimism: boolean; // viability 悪化
  readonly markerExplosion: boolean; // convergence marker 急増
  readonly diagnosticWorsening: boolean; // peakStrain level 悪化
  readonly overChange: boolean; // leg friction の過剰変化
}

export interface PaceShadowActivationReport {
  /** readiness を満たし shadow を走らせたか（not_enough なら false）。 */
  readonly ran: boolean;
  readonly readinessOverall: OverallReadiness;
  readonly shadow: PaceShadowResult | null;
  readonly concerns: PaceShadowConcerns;
  readonly anyConcern: boolean;
}

const NO_CONCERN: PaceShadowConcerns = {
  overPessimism: false,
  markerExplosion: false,
  diagnosticWorsening: false,
  overChange: false,
};

function levelRank(level: string): number {
  return level === "low" ? 0 : level === "moderate" ? 1 : level === "high" ? 2 : -1; // unknown=-1
}

/**
 * dogfood shadow activation を走らせる（pure）。
 * readiness が not_enough なら ran=false（走らせない）。ready なら shadow 比較 + 懸念検出。
 */
export function runPaceShadowActivation(input: {
  readonly rehearsalInput: RehearsalInput;
  readonly ratios: readonly PersonalPaceRatioResult[];
  readonly resolvePace: PaceResolver;
  readonly readinessConfig?: PaceReadinessConfig;
  readonly ratioConfig?: PersonalPaceRatioConfig;
  readonly shadowConfig?: PaceShadowConfig;
}): PaceShadowActivationReport {
  const readiness = buildPaceActivationReadiness(input.ratios, input.readinessConfig);

  // ★not_enough（sparse）は shadow も走らせない。
  if (readiness.overall === "not_enough") {
    return { ran: false, readinessOverall: readiness.overall, shadow: null, concerns: NO_CONCERN, anyConcern: false };
  }

  const shadow = validatePaceShadow(input.rehearsalInput, input.resolvePace, {
    shadowConfig: input.shadowConfig,
  });

  const concerns: PaceShadowConcerns = {
    overPessimism: shadow.viabilityRegressed,
    markerExplosion: shadow.markerExplosion,
    diagnosticWorsening: levelRank(shadow.peakStrainLevelAfter) > levelRank(shadow.peakStrainLevelBefore),
    overChange: shadow.overChangeLegCount > 0,
  };
  const anyConcern =
    concerns.overPessimism || concerns.markerExplosion || concerns.diagnosticWorsening || concerns.overChange;

  return { ran: true, readinessOverall: readiness.overall, shadow, concerns, anyConcern };
}
