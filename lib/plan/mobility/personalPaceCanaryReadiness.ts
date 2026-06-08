/**
 * lib/plan/mobility/personalPaceCanaryReadiness.ts — A1-15: canary entry readiness 判定（pure）
 *
 * ★目的: dogfood（本人・dev）で複数日 stable_safe を維持し、十分な区間が成熟したとき
 *   「canary（少数公開）への entry を **検討** してよいか」を structured に判定する。
 *   ★canary を **実行しない**・production の hard block を **解除しない**。assessment readiness のみ。
 *
 * ★安全境界（CEO 方針）:
 *   - canary 実行 / production block 解除 / flag activation は本 helper の外（CEO 判断の stop gate）。
 *   - sparse / 単発 stable では ready にしない（複数日 + 複数区間を要求）。
 *   - raw 数値（pace ratio / friction / GPS 座標）を出さない（status / 件数のみ）。
 *   - pure / Date 不使用 / DB・network 不使用 / calibration 値に触れない（凍結維持）。
 */
import type { DogfoodStabilityAssessment } from "@/lib/plan/mobility/dogfoodSafetyJournal";
import type { PersonalPaceDogfoodReadiness } from "@/lib/plan/mobility/personalPaceDogfoodReadiness";

export type CanaryCheckKey = "dogfood_stable_safe" | "enough_observed_days" | "dogfood_ready" | "multiple_activation_groups";

export interface CanaryReadinessCheck {
  readonly key: CanaryCheckKey;
  readonly label: string;
  readonly passed: boolean;
  readonly detail: string;
}

export type CanaryOverall = "not_ready_for_canary" | "ready_for_canary_assessment";

export interface PersonalPaceCanaryReadiness {
  readonly checks: readonly CanaryReadinessCheck[];
  readonly overall: CanaryOverall;
  readonly blockers: readonly string[];
  /** ★canary 実行 / production block 解除は CEO 判断であることの明示。 */
  readonly note: string;
}

export interface CanaryReadinessConfig {
  /** canary 検討に必要な観測日数（dogfood の複数日確認）。 */
  readonly minObservedDays: number;
  /** canary 検討に必要な ready_for_activation 区間数（複数 od×mode の成熟）。 */
  readonly minActivationGroups: number;
}

export const DEFAULT_CANARY_READINESS_CONFIG: CanaryReadinessConfig = {
  minObservedDays: 7,
  minActivationGroups: 2,
};

const CANARY_NOTE = "canary 実行 / production block 解除 / flag activation は CEO 判断（本判定は entry assessment のみ・実行しない）";

/**
 * canary entry readiness を判定（pure）。4 check 全 pass で ready_for_canary_assessment。
 * ★assessment のみ・canary を実行しない・production block を解除しない・calibration に触れない。
 */
export function buildCanaryReadiness(input: {
  readonly stability: DogfoodStabilityAssessment;
  readonly dogfoodReadiness: PersonalPaceDogfoodReadiness;
  /** ready_for_activation 区間数（A1-7 readiness.readyForActivationCount）。 */
  readonly activationReadyCount: number;
  readonly config?: CanaryReadinessConfig;
}): PersonalPaceCanaryReadiness {
  const config = input.config ?? DEFAULT_CANARY_READINESS_CONFIG;
  const { stability, dogfoodReadiness, activationReadyCount } = input;

  const checks: CanaryReadinessCheck[] = [
    {
      key: "dogfood_stable_safe",
      label: "複数日 stable_safe",
      passed: stability.stability === "stable_safe",
      detail: `stability: ${stability.stability}（懸念${stability.daysWithConcern}日）`,
    },
    {
      key: "enough_observed_days",
      label: "十分な観測日数",
      passed: stability.daysObserved >= config.minObservedDays,
      detail: `${stability.daysObserved} / ${config.minObservedDays} 日`,
    },
    {
      key: "dogfood_ready",
      label: "dogfood 前提充足",
      passed: dogfoodReadiness.overall === "ready_for_dogfood",
      detail: dogfoodReadiness.overall,
    },
    {
      key: "multiple_activation_groups",
      label: "複数区間の成熟",
      passed: activationReadyCount >= config.minActivationGroups,
      detail: `ready_for_activation: ${activationReadyCount} / ${config.minActivationGroups} 区間`,
    },
  ];

  const overall: CanaryOverall = checks.every((c) => c.passed) ? "ready_for_canary_assessment" : "not_ready_for_canary";
  const blockers = checks.filter((c) => !c.passed).map((c) => c.label);

  return { checks, overall, blockers, note: CANARY_NOTE };
}
