// lib/stargazer/matchingIntegration.ts
// Stargazer → マッチング接続シグナル
// Stage 2 軸スコア + CF軸からマッチング用の信号を生成

import type { TraitAxisKey } from "./traitAxes";

// ── マッチング統合型 ──

export interface MatchingIntegration {
  /** 友達モード適合度 (0-1, 高い方が安定) */
  friendModeFit: number;
  /** 安全スコア (0-1, 高い方が安全) */
  safetyScore: number;
  /** 信頼スコア (0-1, 高い方が信頼) */
  trustScore: number;
  /** 認知的成熟度 (0-1, CF軸ベース) */
  cognitiveMaturit: number;
  /** 互換性フラグ */
  compatibilityFlags: string[];
}

// ── 計算ロジック ──

/**
 * -1〜1 のスコアを 0〜1 に正規化
 */
function normalize01(v: number): number {
  return Math.max(0, Math.min(1, (v + 1) / 2));
}

/**
 * 安全スコアを算出
 * escalation_risk, pressure_risk, control_tendency が低い → 安全
 */
function computeSafetyScore(
  scores: Record<TraitAxisKey, number>
): number {
  const escalation = scores.escalation_risk ?? 0;
  const pressure = scores.pressure_risk ?? 0;
  const control = scores.control_tendency ?? 0;

  // これらは「高い = リスク高い」なので反転して平均
  const riskAvg = (escalation + pressure + control) / 3;
  return Math.max(0, Math.min(1, (1 - riskAvg) / 2 + 0.5));
}

/**
 * 認知的成熟度を算出 (CF軸ベース)
 *
 * 心理学的根拠:
 * - social_modeling（他者理解力）が高い人は対人関係で適切に振る舞える
 * - cognitive_updating（判断更新力）が高い人は関係内の変化に適応できる
 * - boundary_awareness × abstract_structuring → 複雑な関係性を理解できる
 *
 * 恋愛研究では「認知的複雑さ」がrelationship satisfactionの強い予測因子
 * (Burleson & Denton, 1997; Long & Andrews, 1990)
 */
function computeCognitiveMaturity(
  scores: Record<TraitAxisKey, number>
): number {
  const socialModeling = scores.social_modeling ?? 0;
  const cognitiveUpdating = scores.cognitive_updating ?? 0;
  const abstractStructuring = scores.abstract_structuring ?? 0;
  const explorationClosure = scores.exploration_closure ?? 0;

  // 他者理解力（最重要: 40%）
  const empathicUnderstanding = normalize01(socialModeling);

  // 適応力（30%）: 判断を柔軟に更新できる
  const adaptability = normalize01(cognitiveUpdating);

  // 複雑さの理解（20%）: 抽象構造化力
  const complexityGrasp = normalize01(abstractStructuring);

  // 探索-収束バランス（10%）: 中間が最も成熟
  // 極端な探索も極端な収束もrelationshipには不利
  const balanceScore = 1 - Math.abs(explorationClosure);

  return (
    empathicUnderstanding * 0.4 +
    adaptability * 0.3 +
    complexityGrasp * 0.2 +
    normalize01(balanceScore) * 0.1
  );
}

/**
 * 互換性フラグを生成
 */
function buildCompatibilityFlags(
  scores: Record<TraitAxisKey, number>
): string[] {
  const flags: string[] = [];

  // Safety flags
  if ((scores.control_tendency ?? 0) > 0.3) {
    flags.push("control_tendency_elevated");
  }
  if ((scores.exclusivity_pressure ?? 0) > 0.3) {
    flags.push("exclusivity_pressure_elevated");
  }
  if ((scores.long_term_shift_risk ?? 0) > 0.3) {
    flags.push("long_term_shift_risk_elevated");
  }
  if ((scores.public_private_gap ?? 0) > 0.3) {
    flags.push("public_private_gap_elevated");
  }
  if ((scores.friend_mode_fit ?? 0) > 0.3) {
    flags.push("friend_mode_stable");
  }
  if ((scores.consent_maturity ?? 0) > 0.3) {
    flags.push("consent_maturity_high");
  }
  if ((scores.boundary_respect ?? 0) > 0.3) {
    flags.push("boundary_respect_high");
  }

  // Cognitive flags (CF軸)
  if ((scores.social_modeling ?? 0) > 0.3) {
    flags.push("high_empathic_understanding");
  }
  if ((scores.cognitive_updating ?? 0) > 0.3) {
    flags.push("high_cognitive_flexibility");
  }
  if ((scores.abstract_structuring ?? 0) > 0.3 && (scores.social_modeling ?? 0) > 0.2) {
    flags.push("complex_relationship_thinker");
  }
  if (Math.abs(scores.decision_tempo ?? 0) > 0.5) {
    flags.push(
      (scores.decision_tempo ?? 0) > 0 ? "deliberate_decision_maker" : "rapid_decision_maker"
    );
  }

  return flags;
}

/**
 * Stargazerの軸スコアからマッチング統合シグナルを生成
 *
 * 使用例:
 * - friend_mode_fit 低 → 異性友達レーン弱化
 * - escalation_risk 高 → 1対1よりグループ起点を優先
 * - boundary_respect 低 → 昇格申請に制限
 * - intent_stability 低 → 友達モード表示順位を下げる
 * - cognitiveMaturit 高 → 深い関係性向きのマッチング優先
 */
export function computeMatchingSignals(
  scores: Record<TraitAxisKey, number>
): MatchingIntegration {
  return {
    friendModeFit: normalize01(scores.friend_mode_fit ?? 0),
    safetyScore: computeSafetyScore(scores),
    trustScore: normalize01(scores.consent_maturity ?? 0),
    cognitiveMaturit: computeCognitiveMaturity(scores),
    compatibilityFlags: buildCompatibilityFlags(scores),
  };
}

/**
 * 友達マッチでの推奨導線を判定
 */
export function getFriendMatchRecommendation(
  signals: MatchingIntegration
): {
  recommendGroupStart: boolean;
  restrictDirectContact: boolean;
  lowerPriority: boolean;
} {
  return {
    recommendGroupStart: signals.safetyScore < 0.5,
    restrictDirectContact: signals.safetyScore < 0.3,
    lowerPriority: signals.friendModeFit < 0.4,
  };
}

/**
 * 2ユーザー間の認知的相性を算出
 *
 * 研究ベース:
 * - 認知的複雑さが近いカップルほど満足度が高い（Burleson & Denton, 1997）
 * - ただし decision_tempo は相補性が生産的（Markey & Markey, 2007）
 */
export function computeCognitivePairFit(
  scoresA: Record<string, number>,
  scoresB: Record<string, number>,
): { fit: number; reason: string } {
  const CF_AXES = [
    "abstract_structuring", "decomposition", "cognitive_updating",
    "decision_tempo", "social_modeling", "exploration_closure",
  ];

  let totalFit = 0;
  let count = 0;

  for (const axis of CF_AXES) {
    const a = scoresA[axis];
    const b = scoresB[axis];
    if (a === undefined || b === undefined) continue;

    count++;
    if (axis === "decision_tempo" || axis === "exploration_closure") {
      // 相補性が機能する軸: 差があるほど良い（ただし極端すぎない）
      const diff = Math.abs(a - b);
      totalFit += diff > 0.2 && diff < 1.2 ? 0.7 + diff * 0.15 : 0.5;
    } else {
      // 類似性が機能する軸: ガウシアン類似度
      const diff = a - b;
      totalFit += Math.exp(-(diff * diff) / 0.5);
    }
  }

  if (count === 0) return { fit: 0.5, reason: "CF軸データ不足" };

  const fit = totalFit / count;
  let reason = "認知スタイル";
  if (fit > 0.7) reason = "考え方のリズムが合う";
  else if (fit > 0.5) reason = "異なる視点で補い合える";
  else reason = "認知スタイルに距離あり";

  return { fit, reason };
}
