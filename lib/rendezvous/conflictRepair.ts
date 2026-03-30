// ============================================================
// Gottman式 葛藤修復パターン検出
// 関係性における修復能力の評価
// ============================================================

import type { TensionResponse } from "./tensionArchitecture";

/**
 * 葛藤修復プロファイル
 * 各次元 0..1
 */
export type ConflictRepairProfile = {
  /** 修復主導力: 自ら修復を試みる傾向 */
  repairInitiative: number;
  /** 応答性: 相手の修復試みへの反応の良さ */
  responsiveness: number;
  /** エスカレーション傾向: 葛藤を悪化させる傾向（低い方が良い） */
  escalationTendency: number;
  /** 回復速度: 葛藤後の関係回復の速さ */
  recoverySpeed: number;
};

/**
 * Gottmanの四騎士パターン（検出対象）
 * - criticism: 相手の性格への攻撃（行動批判ではなく人格攻撃）
 * - contempt: 見下し・軽蔑
 * - defensiveness: 防衛的反応・責任回避
 * - stonewalling: 会話遮断・石壁化
 */
export type FourHorsemanPattern =
  | "criticism"
  | "contempt"
  | "defensiveness"
  | "stonewalling";

/**
 * TensionArchitectureの応答データから葛藤修復プロファイルを算出
 *
 * tensionArchitecture.tsの24種のプロンプトへの応答パターンから:
 * - "faced" = 正面から向き合った → 修復能力の証拠
 * - "deferred" = 先送りにした → 回避傾向の証拠
 * - "reflected" = 内省した → 修復の素地あり
 */
export function computeConflictRepairProfile(opts: {
  tensionResponses: TensionResponse[];
  /** チャット統計（任意: メッセージ頻度変化など） */
  messageStats?: {
    /** 葛藤的プロンプト後のメッセージ頻度変化率 (-1..1) */
    postTensionFrequencyDelta?: number;
    /** 平均返信ラタンシー秒数 */
    avgReplyLatency?: number;
    /** 葛藤後の返信ラタンシー変化率 (-1..1) */
    postTensionLatencyDelta?: number;
  };
}): ConflictRepairProfile {
  const { tensionResponses, messageStats } = opts;

  if (tensionResponses.length === 0) {
    return defaultProfile();
  }

  const total = tensionResponses.length;
  const faced = tensionResponses.filter((r) => r.response === "faced").length;
  const deferred = tensionResponses.filter((r) => r.response === "deferred").length;
  const reflected = tensionResponses.filter((r) => r.response === "reflected").length;

  const facedRatio = faced / total;
  const deferredRatio = deferred / total;
  const reflectedRatio = reflected / total;

  // 修復主導力: faced比率が高い → 自ら向き合う力
  let repairInitiative = facedRatio * 0.7 + reflectedRatio * 0.3;

  // 応答性: faced + reflected（どちらも関与している証拠）
  let responsiveness = (facedRatio + reflectedRatio) * 0.8;

  // エスカレーション傾向: deferred比率が高い → 回避が蓄積 → エスカレーションリスク
  let escalationTendency = deferredRatio * 0.6;

  // 回復速度: faced応答の比率 + 内省の深さ
  let recoverySpeed = facedRatio * 0.5 + reflectedRatio * 0.4;

  // レベル別の重み付け
  const levelWeights = computeLevelWeights(tensionResponses);
  repairInitiative = repairInitiative * 0.7 + levelWeights.deepFacedRatio * 0.3;
  responsiveness = responsiveness * 0.8 + levelWeights.gentleResponseRate * 0.2;

  // メッセージ統計による補正
  if (messageStats) {
    // 葛藤後にメッセージ頻度が下がる → stonewalling傾向
    if (messageStats.postTensionFrequencyDelta !== undefined) {
      const delta = messageStats.postTensionFrequencyDelta;
      if (delta < -0.3) {
        escalationTendency += (-delta - 0.3) * 0.3;
        recoverySpeed -= (-delta - 0.3) * 0.2;
      }
    }

    // 葛藤後に返信が遅くなる → 回復の遅さ
    if (messageStats.postTensionLatencyDelta !== undefined) {
      const delta = messageStats.postTensionLatencyDelta;
      if (delta > 0.3) {
        recoverySpeed -= (delta - 0.3) * 0.2;
      }
    }
  }

  return {
    repairInitiative: clamp(repairInitiative),
    responsiveness: clamp(responsiveness),
    escalationTendency: clamp(escalationTendency),
    recoverySpeed: clamp(recoverySpeed),
  };
}

/**
 * TensionLevel別の応答パターンを分析
 */
function computeLevelWeights(responses: TensionResponse[]): {
  deepFacedRatio: number;
  gentleResponseRate: number;
} {
  // promptIdのプレフィックスからレベルを推定
  const deep = responses.filter((r) => r.promptId.startsWith("d-"));
  const gentle = responses.filter((r) => r.promptId.startsWith("g-"));

  const deepFaced = deep.filter((r) => r.response === "faced").length;
  const gentleResponded = gentle.filter(
    (r) => r.response === "faced" || r.response === "reflected",
  ).length;

  return {
    deepFacedRatio: deep.length > 0 ? deepFaced / deep.length : 0.5,
    gentleResponseRate: gentle.length > 0 ? gentleResponded / gentle.length : 0.5,
  };
}

/**
 * 葛藤修復互換性スコア (0..1)
 *
 * 良い組み合わせ:
 * - 両者とも修復主導力が高い → 問題をすぐ解決できる
 * - 一方が主導、他方が応答的 → 自然な修復フロー
 * - 両者ともエスカレーション傾向が低い → 安定
 *
 * 危険な組み合わせ:
 * - 両者ともエスカレーション傾向が高い → 激化の悪循環
 * - 一方が石壁化、他方が追跡 → 修復不能
 */
export function computeConflictRepairCompatibility(
  a: ConflictRepairProfile,
  b: ConflictRepairProfile,
): number {
  // 修復能力の合算（少なくとも一方が修復できれば関係は維持される）
  const repairCapacity = Math.max(a.repairInitiative, b.repairInitiative) * 0.6 +
    Math.min(a.repairInitiative, b.repairInitiative) * 0.4;

  // 応答性の調和（両者が応答的であることが重要）
  const responseHarmony = (a.responsiveness + b.responsiveness) / 2;

  // エスカレーションリスク（両者の合算、高いほど危険）
  const escalationRisk = (a.escalationTendency + b.escalationTendency) / 2;

  // 回復速度の調和
  const recoveryHarmony = (a.recoverySpeed + b.recoverySpeed) / 2;

  // 非対称性ペナルティ: 一方だけが修復を頑張る構造は持続しない
  const repairAsymmetry = Math.abs(a.repairInitiative - b.repairInitiative);
  const asymmetryPenalty = repairAsymmetry > 0.3 ? (repairAsymmetry - 0.3) * 0.2 : 0;

  const score =
    repairCapacity * 0.30 +
    responseHarmony * 0.25 +
    (1 - escalationRisk) * 0.25 +
    recoveryHarmony * 0.20 -
    asymmetryPenalty;

  return clamp(score);
}

function defaultProfile(): ConflictRepairProfile {
  return {
    repairInitiative: 0.5,
    responsiveness: 0.5,
    escalationTendency: 0.3,
    recoverySpeed: 0.5,
  };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}
