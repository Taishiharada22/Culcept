// ============================================================
// Partner Scoring Orchestrator — 3層統合スコアリング
//
// Layer 1:  MatchingVector (10次元) — 性格・行動互換性
//           既存の evaluateDirection() がそのまま担当
//
// Layer 1.5: Relationship Process Vector (6次元)
//           relationshipProcess.ts: Four Horsemen, Conflict Style,
//           Bid Responsiveness, Growth/Destiny + 既存 Attachment, Repair
//
// Layer 2:  Life Plan Vector (8次元)
//           lifePlanVector.ts: 金銭感覚, キャリア家庭, 家族計画,
//           親族距離, 生活水準, 親密さ, 健康習慣, 文化価値観
//
// 統合比率:
//   Layer 1: 0.40 — 行動互換性は日常の基盤
//   Layer 1.5: 0.30 — 関係プロセスは長期の安定性を左右
//   Layer 2: 0.30 — 人生設計の一致は結婚の持続性を左右
//
// Guard 統合:
//   既存 partnerGuard (Layer 1) + processGuard (Layer 1.5) + lifePlanGuard (Layer 2)
//   いずれかが fail → マッチ不可
// ============================================================

import type { EvaluationResult } from "./types";
import type { RelationshipProcessVector } from "./relationshipProcess";
import {
  computeRelationshipProcessVector,
  computeProcessFitScore,
  processGuard,
  type StargazerAxesPartial,
} from "./relationshipProcess";
import type { LifePlanProfile, LifePlanFitResult } from "./lifePlanVector";
import { computeLifePlanFit, lifePlanGuard } from "./lifePlanVector";
import type { LifePlanAxisKey } from "./lifePlanQuestions";

// ── 型定義 ──

/**
 * Partner 評価に必要な追加入力
 */
export type PartnerEvaluationInput = {
  /** A の Stargazer 45軸スコア (関係プロセス評価用) */
  aStargazerScores?: StargazerAxesPartial;
  /** B の Stargazer 45軸スコア */
  bStargazerScores?: StargazerAxesPartial;
  /** 既存モジュールで計算済みの愛着互換性 (0..1) */
  attachmentFit?: number;
  /** 既存モジュールで計算済みの修復互換性 (0..1) */
  repairCapacity?: number;
  /** A の Life Plan Profile */
  aLifePlanProfile?: LifePlanProfile;
  /** B の Life Plan Profile */
  bLifePlanProfile?: LifePlanProfile;
};

/**
 * Partner 3層統合スコアの結果
 */
export type PartnerScoringResult = {
  /** 3層統合後の総合スコア (0..1) */
  total: number;
  /** Layer 1 スコア (既存 evaluateDirection の total) */
  layer1Score: number;
  /** Layer 1.5 スコア (Relationship Process Fit) */
  layer15Score: number;
  /** Layer 2 スコア (Life Plan Fit) */
  layer2Score: number;
  /** Layer 1.5 の詳細 */
  processVector?: RelationshipProcessVector;
  /** Layer 2 の詳細 */
  lifePlanFit?: LifePlanFitResult;
  /** Guard チェック結果 */
  guardResult: PartnerGuardResult;
  /** Partner 固有の reason コード */
  partnerReasonCodes: PartnerReasonCode[];
  /** Partner 固有の caution コード */
  partnerCautionCodes: PartnerCautionCode[];
};

export type PartnerGuardResult = {
  pass: boolean;
  failedGuards: Array<{
    layer: "process" | "lifePlan";
    dimension: string;
    detail?: string;
  }>;
};

// Partner 固有の理由・注意コード
export type PartnerReasonCode =
  | "relationship_process_healthy"
  | "growth_mindset_aligned"
  | "bid_responsiveness_high"
  | "conflict_style_matched"
  | "financial_values_aligned"
  | "career_family_aligned"
  | "family_planning_aligned"
  | "life_design_compatible";

export type PartnerCautionCode =
  | "four_horsemen_risk_elevated"
  | "attachment_anxiety_avoidance_pattern"
  | "repair_capacity_low"
  | "growth_destiny_gap"
  | "financial_values_gap"
  | "career_family_gap"
  | "family_planning_gap"
  | "kinship_boundary_gap"
  | "intimacy_expectation_gap"
  | "life_plan_data_incomplete";

// ── Partner 固有テキストマップ ──

export const partnerReasonTextMap: Record<PartnerReasonCode, string> = {
  relationship_process_healthy: "関係の築き方が健全に噛み合う",
  growth_mindset_aligned: "ふたりとも関係を育てる姿勢がある",
  bid_responsiveness_high: "日常の小さなサインに気づき合える",
  conflict_style_matched: "意見が衝突したときの対処法が近い",
  financial_values_aligned: "お金に対する感覚が自然に近い",
  career_family_aligned: "仕事と家庭のバランス観が合う",
  family_planning_aligned: "家族のかたちについての考えが近い",
  life_design_compatible: "人生設計の方向性が重なっている",
};

export const partnerCautionTextMap: Record<PartnerCautionCode, string> = {
  four_horsemen_risk_elevated: "対話パターンに注意が必要な傾向がある",
  attachment_anxiety_avoidance_pattern: "安心の求め方にすれ違いが生じやすい",
  repair_capacity_low: "すれ違い後の修復に時間がかかりやすい",
  growth_destiny_gap: "関係の捉え方（育てる vs 運命）に差がある",
  financial_values_gap: "お金の使い方・考え方に温度差がある",
  career_family_gap: "仕事と家庭の優先順位に差がある",
  family_planning_gap: "家族計画の姿勢に差がある",
  kinship_boundary_gap: "親族との距離感に差がある",
  intimacy_expectation_gap: "親密さの表現方法に差がある",
  life_plan_data_incomplete: "人生設計の情報が不足している",
};

// ── 3層統合比率 ──

const LAYER_WEIGHTS = {
  layer1: 0.40,   // MatchingVector
  layer15: 0.30,  // Relationship Process
  layer2: 0.30,   // Life Plan
} as const;

// ── メイン関数 ──

/**
 * Partner 3層統合スコアリング
 *
 * Layer 1 (evaluateDirection の total) は外部から渡される。
 * Layer 1.5 と Layer 2 をここで計算し、3層を統合する。
 *
 * データ可用性に応じて重み再配分:
 * - 全層データあり: 0.40 / 0.30 / 0.30
 * - Layer 1.5 のみ欠損: 0.60 / 0.00 / 0.40
 * - Layer 2 のみ欠損: 0.55 / 0.45 / 0.00
 * - Layer 1.5 + Layer 2 欠損: 1.00 / 0.00 / 0.00（既存と同等）
 */
export function computePartnerScore(
  layer1Score: number,
  partnerInput: PartnerEvaluationInput,
): PartnerScoringResult {
  // ── Layer 1.5: Relationship Process ──
  const hasProcessData = !!(
    partnerInput.aStargazerScores &&
    partnerInput.bStargazerScores
  );
  let layer15Score = 0.5; // fallback
  let processVector: RelationshipProcessVector | undefined;

  if (hasProcessData) {
    processVector = computeRelationshipProcessVector({
      aStargazerScores: partnerInput.aStargazerScores!,
      bStargazerScores: partnerInput.bStargazerScores!,
      attachmentFit: partnerInput.attachmentFit ?? 0.5,
      repairCapacity: partnerInput.repairCapacity ?? 0.5,
    });
    layer15Score = computeProcessFitScore(processVector);
  }

  // ── Layer 2: Life Plan ──
  const hasLifePlanData = !!(
    partnerInput.aLifePlanProfile &&
    partnerInput.bLifePlanProfile
  );
  let layer2Score = 0.5; // fallback
  let lifePlanFit: LifePlanFitResult | undefined;

  if (hasLifePlanData) {
    lifePlanFit = computeLifePlanFit(
      partnerInput.aLifePlanProfile!,
      partnerInput.bLifePlanProfile!,
    );
    layer2Score = lifePlanFit.total;
  }

  // ── Guard チェック ──
  const guardResult = computePartnerGuards(
    processVector,
    partnerInput.aLifePlanProfile,
    partnerInput.bLifePlanProfile,
    hasProcessData,
    hasLifePlanData,
  );

  // ── 重み再配分 ──
  let w1: number, w15: number, w2: number;
  if (hasProcessData && hasLifePlanData) {
    w1 = LAYER_WEIGHTS.layer1;
    w15 = LAYER_WEIGHTS.layer15;
    w2 = LAYER_WEIGHTS.layer2;
  } else if (hasProcessData && !hasLifePlanData) {
    w1 = 0.55;
    w15 = 0.45;
    w2 = 0;
  } else if (!hasProcessData && hasLifePlanData) {
    w1 = 0.60;
    w15 = 0;
    w2 = 0.40;
  } else {
    w1 = 1.0;
    w15 = 0;
    w2 = 0;
  }

  const total = clamp(
    layer1Score * w1 +
    layer15Score * w15 +
    layer2Score * w2,
  );

  // ── Reason / Caution コード収集 ──
  const partnerReasonCodes = collectPartnerReasons(
    processVector,
    lifePlanFit,
    hasProcessData,
    hasLifePlanData,
  );
  const partnerCautionCodes = collectPartnerCautions(
    processVector,
    lifePlanFit,
    hasProcessData,
    hasLifePlanData,
  );

  return {
    total,
    layer1Score,
    layer15Score,
    layer2Score,
    processVector,
    lifePlanFit,
    guardResult,
    partnerReasonCodes,
    partnerCautionCodes,
  };
}

// ── Guard 統合 ──

function computePartnerGuards(
  processVector: RelationshipProcessVector | undefined,
  aLifePlan: LifePlanProfile | undefined,
  bLifePlan: LifePlanProfile | undefined,
  hasProcessData: boolean,
  hasLifePlanData: boolean,
): PartnerGuardResult {
  const failedGuards: PartnerGuardResult["failedGuards"] = [];

  // Process Guard
  if (hasProcessData && processVector) {
    const pgResult = processGuard(processVector);
    if (!pgResult.pass) {
      failedGuards.push({
        layer: "process",
        dimension: pgResult.failedDimension ?? "unknown",
      });
    }
  }

  // Life Plan Guard
  if (hasLifePlanData && aLifePlan && bLifePlan) {
    const lpResult = lifePlanGuard(aLifePlan, bLifePlan);
    if (!lpResult.pass) {
      failedGuards.push({
        layer: "lifePlan",
        dimension: lpResult.failedDimension ?? "unknown",
        detail: lpResult.detail,
      });
    }
  }

  return {
    pass: failedGuards.length === 0,
    failedGuards,
  };
}

// ── Reason 収集 ──

function collectPartnerReasons(
  processVector: RelationshipProcessVector | undefined,
  lifePlanFit: LifePlanFitResult | undefined,
  hasProcess: boolean,
  hasLifePlan: boolean,
): PartnerReasonCode[] {
  const reasons: Array<{ code: PartnerReasonCode; score: number }> = [];

  if (hasProcess && processVector) {
    const processFit = computeProcessFitScore(processVector);
    if (processFit > 0.70) {
      reasons.push({ code: "relationship_process_healthy", score: processFit });
    }
    if (processVector.growthVsDestiny > 0.70) {
      reasons.push({ code: "growth_mindset_aligned", score: processVector.growthVsDestiny });
    }
    if (processVector.bidResponsiveness > 0.70) {
      reasons.push({ code: "bid_responsiveness_high", score: processVector.bidResponsiveness });
    }
    if (processVector.conflictStyleMatch > 0.70) {
      reasons.push({ code: "conflict_style_matched", score: processVector.conflictStyleMatch });
    }
  }

  if (hasLifePlan && lifePlanFit) {
    if (lifePlanFit.total > 0.70) {
      reasons.push({ code: "life_design_compatible", score: lifePlanFit.total });
    }
    for (const axis of lifePlanFit.alignedDimensions) {
      const code = AXIS_TO_REASON[axis];
      if (code) {
        reasons.push({ code, score: lifePlanFit.dimensions[axis] });
      }
    }
  }

  return reasons
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => r.code);
}

// ── Caution 収集 ──

function collectPartnerCautions(
  processVector: RelationshipProcessVector | undefined,
  lifePlanFit: LifePlanFitResult | undefined,
  hasProcess: boolean,
  hasLifePlan: boolean,
): PartnerCautionCode[] {
  const cautions: Array<{ code: PartnerCautionCode; severity: number }> = [];

  if (hasProcess && processVector) {
    if (processVector.fourHorsemenRisk > 0.50) {
      cautions.push({
        code: "four_horsemen_risk_elevated",
        severity: processVector.fourHorsemenRisk,
      });
    }
    if (processVector.attachmentFit < 0.45) {
      cautions.push({
        code: "attachment_anxiety_avoidance_pattern",
        severity: 1 - processVector.attachmentFit,
      });
    }
    if (processVector.repairCapacity < 0.40) {
      cautions.push({
        code: "repair_capacity_low",
        severity: 1 - processVector.repairCapacity,
      });
    }
    if (processVector.growthVsDestiny < 0.40) {
      cautions.push({
        code: "growth_destiny_gap",
        severity: 1 - processVector.growthVsDestiny,
      });
    }
  }

  if (hasLifePlan && lifePlanFit) {
    for (const axis of lifePlanFit.riskDimensions) {
      const code = AXIS_TO_CAUTION[axis];
      if (code) {
        cautions.push({
          code,
          severity: 1 - lifePlanFit.dimensions[axis],
        });
      }
    }
  }

  // データ不足 caution
  if (!hasLifePlan) {
    cautions.push({
      code: "life_plan_data_incomplete",
      severity: 0.3,
    });
  }

  return cautions
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 3)
    .map((c) => c.code);
}

// ── マッピングテーブル ──

const AXIS_TO_REASON: Partial<Record<LifePlanAxisKey, PartnerReasonCode>> = {
  financial_values: "financial_values_aligned",
  career_family_balance: "career_family_aligned",
  family_planning_depth: "family_planning_aligned",
};

const AXIS_TO_CAUTION: Partial<Record<LifePlanAxisKey, PartnerCautionCode>> = {
  financial_values: "financial_values_gap",
  career_family_balance: "career_family_gap",
  family_planning_depth: "family_planning_gap",
  kinship_boundary: "kinship_boundary_gap",
  intimacy_expectation: "intimacy_expectation_gap",
};

// ── ユーティリティ ──

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}
