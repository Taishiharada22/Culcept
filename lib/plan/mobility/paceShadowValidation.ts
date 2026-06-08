/**
 * lib/plan/mobility/paceShadowValidation.ts — A1-7: pace 反映を有効化する前に shadow 比較（pure）
 *
 * ★目的: flag ON 相当（applyPersonalPaceToRehearsalInput）を **実 UI に出さず** shadow で実行し、
 *   rehearsal が before→after でどう変わるかを structured 差分にする。activation 前の安全確認に使う。
 *
 * ★検出したい害（CEO 方針）:
 *   - over-pessimism: viability が holds→tight/breaks 等に悪化（過悲観）。
 *   - marker explosion: convergence marker が急増（警告だらけ化）。
 *   - over change: 個別 leg の friction が過剰変化。
 *
 * ★安全境界: pure（rehearseDay は pure・READ のみ）/ 予定変更なし / 実 UI 非表示前提 /
 *   生数値は dev-report 内部用（UI には status/flag を出す）/ Date 不使用 / DB・network 不使用。
 */
import { rehearseDay } from "@/lib/plan/dayRehearsal/dayRehearsal";
import type {
  DayRehearsalConfig,
  EstimateLevel,
  RehearsalInput,
  ViabilityOutlook,
} from "@/lib/plan/dayRehearsal/dayRehearsalTypes";
import {
  applyPersonalPaceToRehearsalInput,
  type PaceResolver,
  type PersonalPaceAdapterConfig,
} from "@/lib/plan/dayRehearsal/personalPaceAdapter";

export interface PaceShadowConfig {
  /** convergence marker 数の増加がこれを超えたら marker explosion。 */
  readonly markerExplosionDelta: number;
  /** leg friction の相対変化がこれを超えたら over change。 */
  readonly overChangeRatio: number;
}

export const DEFAULT_PACE_SHADOW_CONFIG: PaceShadowConfig = {
  markerExplosionDelta: 2,
  overChangeRatio: 0.5,
};

export interface PaceShadowLegDiff {
  readonly stepIndex: number;
  readonly frictionBefore: number | null;
  readonly frictionAfter: number | null;
  readonly overChange: boolean;
}

export interface PaceShadowResult {
  /** pace 反映で input が実際に変わったか（同一参照なら false＝差分なし）。 */
  readonly changed: boolean;
  readonly viabilityBefore: ViabilityOutlook;
  readonly viabilityAfter: ViabilityOutlook;
  /** ★over-pessimism: viability が悪化したか。 */
  readonly viabilityRegressed: boolean;
  readonly peakStrainLevelBefore: EstimateLevel;
  readonly peakStrainLevelAfter: EstimateLevel;
  readonly convergenceCountBefore: number;
  readonly convergenceCountAfter: number;
  /** ★marker explosion。 */
  readonly markerExplosion: boolean;
  readonly legDiffs: readonly PaceShadowLegDiff[];
  readonly overChangeLegCount: number;
  /** いずれかの懸念があるか（activation 前の赤信号）。 */
  readonly anyConcern: boolean;
}

function outlookRank(o: ViabilityOutlook): number {
  return o === "holds" ? 0 : o === "tight" ? 1 : o === "breaks" ? 2 : -1; // unknown=-1（比較対象外）
}

/**
 * pace 反映の shadow 比較（pure）。before=反映なし / after=applyPersonalPaceToRehearsalInput → rehearseDay。
 * @param resolvePace transition→pace（CalendarTab と同じ解決）。常に null を渡せば「反映なし」の自己一致確認。
 */
export function validatePaceShadow(
  input: RehearsalInput,
  resolvePace: PaceResolver,
  opts?: {
    readonly rehearsalConfig?: DayRehearsalConfig;
    readonly adapterConfig?: PersonalPaceAdapterConfig;
    readonly shadowConfig?: PaceShadowConfig;
  },
): PaceShadowResult {
  const config = opts?.shadowConfig ?? DEFAULT_PACE_SHADOW_CONFIG;
  const before = rehearseDay(input, opts?.rehearsalConfig);
  const afterInput = applyPersonalPaceToRehearsalInput(input, resolvePace, opts?.adapterConfig);
  const after = rehearseDay(afterInput, opts?.rehearsalConfig);

  const rankBefore = outlookRank(before.viability.outlook);
  const rankAfter = outlookRank(after.viability.outlook);
  const viabilityRegressed = rankBefore >= 0 && rankAfter >= 0 && rankAfter > rankBefore;

  const convergenceCountBefore = before.convergencePoints.length;
  const convergenceCountAfter = after.convergencePoints.length;
  const markerExplosion = convergenceCountAfter - convergenceCountBefore > config.markerExplosionDelta;

  const legCount = Math.min(before.steps.length, after.steps.length);
  const legDiffs: PaceShadowLegDiff[] = [];
  for (let i = 0; i < legCount; i += 1) {
    const fb = before.steps[i].friction?.score ?? null;
    const fa = after.steps[i].friction?.score ?? null;
    const overChange =
      fb != null && fa != null && fb > 0 && Math.abs(fa - fb) / fb > config.overChangeRatio;
    legDiffs.push({ stepIndex: i, frictionBefore: fb, frictionAfter: fa, overChange });
  }
  const overChangeLegCount = legDiffs.filter((d) => d.overChange).length;

  return {
    changed: afterInput !== input,
    viabilityBefore: before.viability.outlook,
    viabilityAfter: after.viability.outlook,
    viabilityRegressed,
    peakStrainLevelBefore: before.peakStrain.level,
    peakStrainLevelAfter: after.peakStrain.level,
    convergenceCountBefore,
    convergenceCountAfter,
    markerExplosion,
    legDiffs,
    overChangeLegCount,
    anyConcern: viabilityRegressed || markerExplosion || overChangeLegCount > 0,
  };
}
