/**
 * lib/plan/mobility/personalPaceCalibrationReadiness.ts — A1-12: 較正(calibration)を検討してよいかの判定（pure）
 *
 * ★目的: 固定値（A1-4 1.15/0.70/minEst5/minObs3/est5・A1-5 damping/clamp・A1-7 minForActivation8）は
 *   「実データが閾値分布を語るまで凍結」。本 helper は **いつ語れるようになるか** を機械的に判定する。
 *   ★値は一切出さない・変えない・apply しない（凍結維持）。「準備できたか」の status だけ返す。
 *
 * ★安全境界（CEO 方針）:
 *   - calibration 値を変更しない（A1-12 は readiness 判定のみ・dry-run proposal は A1-13・apply は stop gate）。
 *   - 較正は activation(n≥8) より **多くの観測**を要する（閾値分布の推定のため）→ minForCalibration は厳しめ。
 *   - sparse を ready 扱いしない。raw ratio を出さない（件数・status のみ）。
 *   - pure / Date 不使用 / DB・network 不使用。
 */
import type { PersonalPaceRatioResult } from "@/lib/plan/mobility/personalPaceRatio";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

export interface CalibrationReadinessGroup {
  readonly groupKey: string;
  readonly odKey?: string;
  readonly legKey?: string;
  readonly mode: RouteTransportMode;
  /** valid 観測数（A1-4 由来・品質後）。 */
  readonly n: number;
  readonly calibrationReady: boolean;
}

export type CalibrationOverall = "not_enough" | "ready_to_assess";

export interface PersonalPaceCalibrationReadiness {
  readonly groups: readonly CalibrationReadinessGroup[];
  readonly calibrationReadyCount: number;
  readonly overall: CalibrationOverall;
  /** ★値は凍結のまま（apply しない）ことの明示。 */
  readonly note: string;
}

export interface CalibrationReadinessConfig {
  /** 較正検討に必要な group 当たり valid 観測数（activation の 8 より厳しい）。 */
  readonly minForCalibration: number;
  /** 較正検討に必要な calibration-ready group 数。 */
  readonly minGroupsForCalibration: number;
}

export const DEFAULT_PACE_CALIBRATION_CONFIG: CalibrationReadinessConfig = {
  minForCalibration: 20,
  minGroupsForCalibration: 3,
};

const FROZEN_NOTE = "calibration 値は凍結のまま（本判定は準備確認のみ・apply しない・dry-run は A1-13）";

/**
 * 較正検討の readiness を判定（pure・★値は出さない/変えない）。
 * A1-4 ready かつ n≥minForCalibration の group を calibration-ready とし、その数が minGroupsForCalibration 以上なら ready_to_assess。
 */
export function buildCalibrationReadiness(
  ratios: readonly PersonalPaceRatioResult[],
  config: CalibrationReadinessConfig = DEFAULT_PACE_CALIBRATION_CONFIG,
): PersonalPaceCalibrationReadiness {
  const groups: CalibrationReadinessGroup[] = ratios.map((r) => ({
    groupKey: r.groupKey,
    odKey: r.odKey,
    legKey: r.legKey,
    mode: r.mode,
    n: r.n ?? 0,
    calibrationReady: r.status === "ready" && (r.n ?? 0) >= config.minForCalibration,
  }));

  const calibrationReadyCount = groups.filter((g) => g.calibrationReady).length;
  const overall: CalibrationOverall =
    calibrationReadyCount >= config.minGroupsForCalibration ? "ready_to_assess" : "not_enough"; // ★sparse は not_enough

  return { groups, calibrationReadyCount, overall, note: FROZEN_NOTE };
}
