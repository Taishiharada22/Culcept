/**
 * lib/plan/mobility/paceActivationReadiness.ts — A1-7: personal pace を安全に有効化できるか判定（pure）
 *
 * ★目的: 「いま flag を ON にしてよいか」を **data 品質**で判定する。即 activation でなく readiness ゲート。
 *   A1-4 PersonalPaceRatio（既に outlier/low-confidence/sensitive を除外した valid 集計）の上に立てる。
 *
 * ★安全境界（CEO 方針）:
 *   - sparse は **絶対に activation しない**（minForActivation 未満は ready_for_activation にしない）。
 *   - 段階: not_enough（観測不足）→ ready_for_shadow（shadow 検証可）→ ready_for_activation（有効化可）。
 *   - outlier / low confidence / sensitive は A1-4 段階で既に除外（n は品質フィルタ後の valid 数）。
 *   - pure / Date 不使用 / DB・network 不使用 / 生数値を断定的 UI に出さない（status を使う）。
 */
import type { PersonalPaceRatioResult, PersonalPaceTendency, PersonalPaceStrength } from "@/lib/plan/mobility/personalPaceRatio";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

export type GroupReadiness = "not_enough" | "ready_for_shadow" | "ready_for_activation";
export type OverallReadiness = "not_enough" | "ready_for_shadow" | "ready_for_activation";

export interface PaceReadinessGroup {
  readonly groupKey: string;
  readonly odKey?: string;
  readonly legKey?: string;
  readonly mode: RouteTransportMode;
  readonly status: GroupReadiness;
  /** valid 観測数（A1-4 由来・品質フィルタ後）。 */
  readonly n: number;
  readonly tendency?: PersonalPaceTendency;
  readonly strength?: PersonalPaceStrength;
}

export interface PaceActivationReadiness {
  readonly groups: readonly PaceReadinessGroup[];
  readonly readyForShadowCount: number;
  readonly readyForActivationCount: number;
  readonly overall: OverallReadiness;
}

export interface PaceReadinessConfig {
  /** activation-level に必要な group 当たり valid 観測数（shadow は A1-4 ready=minObservations で足りる）。 */
  readonly minForActivation: number;
  /** overall を ready_for_activation にするのに必要な activation-level group 数。 */
  readonly minGroupsForActivation: number;
  /** overall を ready_for_shadow にするのに必要な shadow 可能 group 数。 */
  readonly minGroupsForShadow: number;
}

export const DEFAULT_PACE_READINESS_CONFIG: PaceReadinessConfig = {
  minForActivation: 8,
  minGroupsForActivation: 1,
  minGroupsForShadow: 1,
};

function groupReadiness(r: PersonalPaceRatioResult, config: PaceReadinessConfig): GroupReadiness {
  // A1-4 ready = valid ≥ minObservations(3)。shadow には十分。
  if (r.status === "ready") {
    return (r.n ?? 0) >= config.minForActivation ? "ready_for_activation" : "ready_for_shadow";
  }
  // not_enough_signal / unknown → 観測不足（activation も shadow もしない）。
  return "not_enough";
}

/**
 * A1-4 結果から activation readiness を構築（pure）。
 * 各 group を not_enough/ready_for_shadow/ready_for_activation に分類し、overall を集約。
 */
export function buildPaceActivationReadiness(
  ratios: readonly PersonalPaceRatioResult[],
  config: PaceReadinessConfig = DEFAULT_PACE_READINESS_CONFIG,
): PaceActivationReadiness {
  const groups: PaceReadinessGroup[] = ratios.map((r) => ({
    groupKey: r.groupKey,
    odKey: r.odKey,
    legKey: r.legKey,
    mode: r.mode,
    status: groupReadiness(r, config),
    n: r.n ?? 0,
    tendency: r.tendency,
    strength: r.strength,
  }));

  const readyForActivationCount = groups.filter((g) => g.status === "ready_for_activation").length;
  const readyForShadowCount = groups.filter((g) => g.status === "ready_for_shadow").length;

  let overall: OverallReadiness = "not_enough";
  if (readyForActivationCount >= config.minGroupsForActivation) {
    overall = "ready_for_activation";
  } else if (readyForActivationCount + readyForShadowCount >= config.minGroupsForShadow) {
    overall = "ready_for_shadow"; // ★sparse は activation でなく shadow 止まり
  }

  return { groups, readyForShadowCount, readyForActivationCount, overall };
}
