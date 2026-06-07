/**
 * lib/plan/dayRehearsal/personalPaceAdapter.ts — A1-5: personal pace を Day Rehearsal に反映する safe adapter（pure）
 *
 * ★目的: A1-4 の PersonalPaceRatio を rehearsal の travel 入力に **soft** に反映する。
 *   「この区間は estimate より長くかかる傾向」を friction/strain に穏やかに効かせる。
 *
 * ★安全境界（CEO 方針・最重要）:
 *   1. ★**travelMin だけ**を調整する。bufferStatus/slackMin/shortfallMin は feasibility 由来の **観測**
 *      （型定義が「推定でない」と明記）なので **絶対に触らない**。travelMin は friction(=estimate) のみに効く。
 *   2. ★**いきなり強く上書きしない**: soft multiplier（damping）+ clamp[0.85,1.25]。
 *   3. ★**confidence gate**: status==="ready"（≥3 観測）のときだけ適用。emerging は established より弱く。
 *   4. ★**fallback**: unknown / not_enough_signal / pace 不在 / travelMin 不明(null) → **そのまま**（既存 full-path 維持）。
 *      travelMin が null（unknown）なら捏造しない（null のまま）。
 *   5. ★**変更が無ければ同一参照を返す**（flag OFF / データ無で rehearsal が完全不変＝referential equality）。
 *   6. pure / Date 不使用 / DB・network 不使用 / 予定を動かさない。
 */
import type { RehearsalInput, RehearsalTransitionInput } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";
import type { PersonalPaceRatioResult } from "@/lib/plan/mobility/personalPaceRatio";

export interface PersonalPaceAdapterConfig {
  /** established(≥5 観測) の damping（deviation の何割を効かせるか）。 */
  readonly dampingEstablished: number;
  /** emerging(3-4 観測) の damping（established より弱く）。 */
  readonly dampingEmerging: number;
  /** multiplier 下限（過剰に短くしない）。 */
  readonly clampMin: number;
  /** multiplier 上限（過剰に長くしない）。 */
  readonly clampMax: number;
}

export const DEFAULT_PERSONAL_PACE_ADAPTER_CONFIG: PersonalPaceAdapterConfig = {
  dampingEstablished: 0.6,
  dampingEmerging: 0.35,
  clampMin: 0.85,
  clampMax: 1.25,
};

export type PaceAdjustmentReason =
  | "no_travel" // travelMin が null（unknown）→ 捏造しない
  | "no_ready_pace" // pace 不在 / unknown / not_enough_signal → fallback
  | "applied_established"
  | "applied_emerging";

export interface PaceAdjustment {
  /** travelMin が null なら null のまま（捏造しない）。 */
  readonly adjustedMin: number | null;
  readonly applied: boolean;
  readonly reason: PaceAdjustmentReason;
}

/**
 * 1 区間の travelMin に pace を soft 反映（pure）。
 * - travelMin null → そのまま null（no_travel）。
 * - pace が ready でない / medianRatio・strength 不在 → そのまま（no_ready_pace・fallback）。
 * - ready → dampedMult = 1 + (medianRatio − 1) × damping、clamp[min,max]、adjustedMin = round(travelMin × mult)。
 */
export function applyPersonalPaceToTravelMin(
  travelMin: number | null,
  pace: PersonalPaceRatioResult | null,
  config: PersonalPaceAdapterConfig = DEFAULT_PERSONAL_PACE_ADAPTER_CONFIG,
): PaceAdjustment {
  if (travelMin == null) return { adjustedMin: null, applied: false, reason: "no_travel" };
  if (!pace || pace.status !== "ready" || pace.medianRatio == null || pace.strength == null) {
    return { adjustedMin: travelMin, applied: false, reason: "no_ready_pace" };
  }
  const damping = pace.strength === "established" ? config.dampingEstablished : config.dampingEmerging;
  const damped = 1 + (pace.medianRatio - 1) * damping;
  const mult = Math.min(config.clampMax, Math.max(config.clampMin, damped));
  const adjustedMin = Math.round(travelMin * mult);
  return {
    adjustedMin,
    applied: true,
    reason: pace.strength === "established" ? "applied_established" : "applied_emerging",
  };
}

/** transition i（event i→i+1）に対応する pace を解決する callback。無ければ null。 */
export type PaceResolver = (
  stepIndex: number,
  transition: RehearsalTransitionInput,
) => PersonalPaceRatioResult | null;

/**
 * RehearsalInput の各 transition.travelMin に pace を soft 反映した **新** input を返す（pure）。
 * ★bufferStatus/slackMin/shortfallMin/gapMin/mode/travelKnown は一切変更しない（travelMin のみ）。
 * ★1 つも変更が無ければ **同一参照** を返す（flag OFF / データ無で完全不変）。
 */
export function applyPersonalPaceToRehearsalInput(
  input: RehearsalInput,
  resolvePace: PaceResolver,
  config: PersonalPaceAdapterConfig = DEFAULT_PERSONAL_PACE_ADAPTER_CONFIG,
): RehearsalInput {
  let changed = false;
  const steps = input.steps.map((step, i) => {
    const t = step.transitionAfter;
    if (!t || t.travelMin == null) return step;
    const adj = applyPersonalPaceToTravelMin(t.travelMin, resolvePace(i, t), config);
    if (!adj.applied || adj.adjustedMin === t.travelMin) return step;
    changed = true;
    return { ...step, transitionAfter: { ...t, travelMin: adj.adjustedMin } };
  });
  return changed ? { ...input, steps } : input;
}
