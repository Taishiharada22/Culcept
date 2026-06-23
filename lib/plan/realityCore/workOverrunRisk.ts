/**
 * OverrunRisk — task / scheduled work block が「確保した時間枠を超過する」リスク（P2-3・pure heuristic）
 *
 * collapseRisk との別軸（重複禁止）:
 *  - collapseRisk = 「日のどこが崩れるか / どんな failure mode か」の factor map（RC2b-1）
 *  - **overrunRisk = この単一 block/task が予定時間を超過するか**（時間超過の1軸）
 *  本 module は collapseRisk / feasibility を読まず・コピーしない。独立に超過リスクを集約する。
 *
 * 不変条件:
 *  - 数字コスプレ禁止: riskLevel は low/medium/high/unknown（連続スコアを確定的に出さない）
 *  - estimatedMinutes / plannedMinutes が無い → honest-unknown（無理に low/medium/high を出さない）
 *  - high を出すには evidence 必須（evidence 空なら high にしない）
 *  - 裸スコア禁止: 結果は confidence を持ち RealityAttribute に包む
 *  - source 境界: fixture/heuristic → heuristic(conf≤0.35)・user_confirmed → inferred
 *  - 提案/通知を直接実行しない（recommendedActionHint は記述的データのみ）
 *  - Future Simulator / PredictionLedger 非接続・DB 保存しない
 *
 * 規律: pure・no Date・no IO・no fetch・no env・no LLM・no UI。additive（既存型不変更）。
 */

import {
  heuristicAttribute,
  inferredAttribute,
  unknownAttribute,
  HEURISTIC_CONFIDENCE_MAX,
  type RealityAttribute,
} from "./realityAttribute";

export type OverrunRiskLevel = "low" | "medium" | "high" | "unknown";

export type OverrunReasonCode =
  | "ample_margin"
  | "estimate_near_window"
  | "estimate_exceeds_window"
  | "high_cognitive_load_tight_window"
  | "prior_overrun_pattern"
  | "low_energy_fit"
  | "fixed_no_slack"
  | "insufficient_input";

export type OverrunFlexibility = "flexible" | "fixed" | "unknown";
export type OverrunFitLevel = "low" | "medium" | "high" | "unknown";
export type OverrunSourceKind = "fixture" | "heuristic" | "user_confirmed";

export interface WorkOverrunRiskInputV0 {
  /** task.estimatedDuration（分）。null = 未取得 */
  readonly estimatedMinutes: number | null;
  /** block.durationMin / 確保した window 長（分）。null = 未取得 */
  readonly plannedMinutes: number | null;
  readonly flexibility: OverrunFlexibility;
  /** task.cognitiveLoad（0-1）。null = 未取得 */
  readonly cognitiveLoad: number | null;
  /** TaskPlacementFeasibility.energyFit の value（注入・本 module は依存 import しない） */
  readonly energyFit: OverrunFitLevel;
  /** 採用済 minimalProgress があるか（分割の逃げ道） */
  readonly hasMinimalProgress: boolean;
  /** 過去の同種作業の超過回数（fixture）。null = 未取得 */
  readonly priorOverruns: number | null;
  readonly sourceKind: OverrunSourceKind;
  readonly evidenceRefs: ReadonlyArray<string>;
}

export interface WorkOverrunRiskV0 {
  readonly riskLevel: OverrunRiskLevel;
  readonly confidence: number;
  readonly reasonCodes: ReadonlyArray<OverrunReasonCode>;
  readonly evidence: ReadonlyArray<string>;
  /** 記述的ヒント（提案・通知ではない）。不要なら null */
  readonly recommendedActionHint: string | null;
  readonly attribute: RealityAttribute<OverrunRiskLevel>;
}

const ORDER: Record<Exclude<OverrunRiskLevel, "unknown">, number> = { low: 0, medium: 1, high: 2 };
const BY_RANK: ReadonlyArray<Exclude<OverrunRiskLevel, "unknown">> = ["low", "medium", "high"];
function bumpUp(level: Exclude<OverrunRiskLevel, "unknown">): Exclude<OverrunRiskLevel, "unknown"> {
  return BY_RANK[Math.min(ORDER[level] + 1, 2)];
}

/**
 * 超過リスクを pure heuristic で集約。estimate/planned 欠如は honest-unknown。
 */
export function evaluateWorkOverrunRisk(input: WorkOverrunRiskInputV0): WorkOverrunRiskV0 {
  const reasonCodes: OverrunReasonCode[] = [];

  // honest-unknown: 見積 or 確保枠が無い / 枠が非正なら判定しない
  if (
    input.estimatedMinutes === null ||
    input.plannedMinutes === null ||
    input.plannedMinutes <= 0 ||
    input.estimatedMinutes < 0
  ) {
    return {
      riskLevel: "unknown",
      confidence: 0,
      reasonCodes: ["insufficient_input"],
      evidence: [],
      recommendedActionHint: null,
      attribute: unknownAttribute<OverrunRiskLevel>({ evidenceRefs: input.evidenceRefs, displayPolicy: "debugOnly" }),
    };
  }

  const ratio = input.estimatedMinutes / input.plannedMinutes;

  // base: 確保枠に対する見積の比
  let level: Exclude<OverrunRiskLevel, "unknown">;
  if (ratio <= 0.85) {
    level = "low";
    reasonCodes.push("ample_margin");
  } else if (ratio <= 1.05) {
    level = "medium";
    reasonCodes.push("estimate_near_window");
  } else {
    level = "high";
    reasonCodes.push("estimate_exceeds_window");
  }

  // modifiers（証拠が揃った時のみ1段引き上げ）
  if (input.cognitiveLoad !== null && input.cognitiveLoad >= 0.7 && ratio > 0.9) {
    reasonCodes.push("high_cognitive_load_tight_window");
    level = bumpUp(level);
  }
  if (input.priorOverruns !== null && input.priorOverruns >= 2) {
    reasonCodes.push("prior_overrun_pattern");
    level = bumpUp(level);
  }
  if (input.energyFit === "low" && ratio > 0.9) {
    reasonCodes.push("low_energy_fit");
    level = bumpUp(level);
  }
  if (input.flexibility === "fixed" && ratio > 1.0) {
    reasonCodes.push("fixed_no_slack");
    level = bumpUp(level);
  }

  // evidence = 外部 refs + 導出 reasonCodes（reasonCode は監査可能な根拠）
  const evidence: string[] = [...input.evidenceRefs, ...reasonCodes.map((r) => `overrun:${r}`)];

  // 不変条件: high は evidence 必須（evidence 空なら high を出さない → medium へ降格）
  if (level === "high" && evidence.length === 0) {
    level = "medium";
  }

  // confidence: heuristic 上限内。入力 completeness で微増。user_confirmed のみ inferred 上限。
  const signalCount =
    (input.cognitiveLoad !== null ? 1 : 0) +
    (input.energyFit !== "unknown" ? 1 : 0) +
    (input.priorOverruns !== null ? 1 : 0) +
    (input.flexibility !== "unknown" ? 1 : 0);
  const confidence =
    input.sourceKind === "user_confirmed"
      ? Math.min(0.7, 0.4 + 0.05 * signalCount)
      : Math.min(HEURISTIC_CONFIDENCE_MAX, 0.15 + 0.05 * signalCount);

  const attribute: RealityAttribute<OverrunRiskLevel> =
    input.sourceKind === "user_confirmed"
      ? inferredAttribute<OverrunRiskLevel>(level, confidence, evidence, {
          status: "inferred",
          displayPolicy: "notActionable",
        })
      : heuristicAttribute<OverrunRiskLevel>(level, confidence, evidence, { displayPolicy: "notActionable" });

  // 記述的ヒント（提案/通知でない・high のみ・最小前進 seam を参照）
  let recommendedActionHint: string | null = null;
  if (level === "high") {
    recommendedActionHint = input.hasMinimalProgress
      ? "最小前進だけ確保すれば超過の影響を抑えられる余地"
      : "見積が確保枠を超過（枠拡張か分割の検討余地）";
  }

  return { riskLevel: level, confidence, reasonCodes, evidence, recommendedActionHint, attribute };
}
