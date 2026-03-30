// ============================================================
// アタッチメントスタイルプロファイル
// Bowlby/Ainsworth理論に基づく4次元アタッチメント評価
// ============================================================

/**
 * アタッチメントプロファイル
 * 各次元 0..1
 */
export type AttachmentProfile = {
  /** 不安レベル: 見捨てられ不安、過度な承認欲求 */
  anxietyLevel: number;
  /** 回避レベル: 親密さへの抵抗、感情的距離 */
  avoidanceLevel: number;
  /** 安全基地スコア: 安定した接続を築く能力 */
  secureBase: number;
  /** 抗議行動傾向: 不安時に関係を試す行動 */
  protestBehavior: number;
};

export type AttachmentStyle =
  | "secure"        // 安全型: 低不安・低回避
  | "anxious"       // 不安型: 高不安・低回避
  | "avoidant"      // 回避型: 低不安・高回避
  | "disorganized"; // 混乱型: 高不安・高回避

/**
 * アタッチメントスタイルを分類
 */
export function classifyAttachment(profile: AttachmentProfile): AttachmentStyle {
  const { anxietyLevel, avoidanceLevel } = profile;
  if (anxietyLevel < 0.45 && avoidanceLevel < 0.45) return "secure";
  if (anxietyLevel >= 0.45 && avoidanceLevel < 0.45) return "anxious";
  if (anxietyLevel < 0.45 && avoidanceLevel >= 0.45) return "avoidant";
  return "disorganized";
}

/**
 * MatchingVector + 既存の質問回答からアタッチメントプロファイルを導出
 *
 * Stargazer 45軸がある場合はそちらから高精度導出、
 * なければMatchingVectorの関連次元から推定
 */
export function deriveAttachmentProfile(opts: {
  /** ユーザーのMatchingVector */
  matchingVector: {
    distance_need: number;
    emotional_openness: number;
    conflict_directness: number;
    stability_need: number;
    depth_speed: number;
  };
  /** Stargazer 45軸（任意） */
  stargazerScores?: Record<string, number>;
}): AttachmentProfile {
  const { matchingVector, stargazerScores } = opts;

  if (stargazerScores) {
    return deriveFromStargazer(stargazerScores, matchingVector);
  }

  return deriveFromVector(matchingVector);
}

/**
 * Stargazer 45軸から高精度導出
 */
function deriveFromStargazer(
  scores: Record<string, number>,
  mv: { distance_need: number; emotional_openness: number; stability_need: number },
): AttachmentProfile {
  // Stargazer軸: -1..+1 → 0..1 に正規化
  const norm = (axis: string, fallback: number) => {
    const v = scores[axis];
    return v !== undefined ? (v + 1) / 2 : fallback;
  };

  // 不安レベル: 再確認欲求↑ + 感情調節↓ + 安定性欲求↑
  const reassurance = norm("reassurance_need", 0.5);
  const emotionalReg = norm("emotional_regulation", 0.5);
  const anxietyLevel = clamp(
    reassurance * 0.45 + (1 - emotionalReg) * 0.30 + mv.stability_need * 0.25,
  );

  // 回避レベル: 独立性↑ + 感情開放性↓ + 親密ペース↓(遅い)
  const independence = norm("independence_vs_harmony", 0.5);
  const intimacyPace = norm("intimacy_pace", 0.5);
  const avoidanceLevel = clamp(
    independence * 0.35 + (1 - mv.emotional_openness) * 0.35 + (1 - intimacyPace) * 0.30,
  );

  // 安全基地: 境界認識↑ + 感情調節↑ + 感情開放性適度(中央値に近い)
  const boundaryAwareness = norm("boundary_awareness", 0.5);
  const opennessCentered = 1 - Math.abs(mv.emotional_openness - 0.5) * 2;
  const secureBase = clamp(
    boundaryAwareness * 0.35 + emotionalReg * 0.35 + opennessCentered * 0.30,
  );

  // 抗議行動: 不安↑かつ回避↓、直接的葛藤対処↑
  const directness = norm("direct_vs_diplomatic", 0.5);
  const protestBehavior = clamp(
    anxietyLevel * 0.40 + directness * 0.30 + (1 - mv.distance_need) * 0.30,
  );

  return { anxietyLevel, avoidanceLevel, secureBase, protestBehavior };
}

/**
 * MatchingVectorのみから推定（精度はやや低い）
 */
function deriveFromVector(mv: {
  distance_need: number;
  emotional_openness: number;
  conflict_directness: number;
  stability_need: number;
  depth_speed: number;
}): AttachmentProfile {
  // 距離欲求↓ + 感情閉鎖↓ → 不安型の傾向
  const anxietyLevel = clamp(
    (1 - mv.distance_need) * 0.35 +
    mv.stability_need * 0.30 +
    (1 - mv.conflict_directness) * 0.20 +
    mv.depth_speed * 0.15,
  );

  // 距離欲求↑ + 感情閉鎖↑ → 回避型の傾向
  const avoidanceLevel = clamp(
    mv.distance_need * 0.35 +
    (1 - mv.emotional_openness) * 0.35 +
    (1 - mv.depth_speed) * 0.30,
  );

  // 安全基地: 両方低ければ高い
  const secureBase = clamp(
    (1 - anxietyLevel) * 0.45 +
    (1 - avoidanceLevel) * 0.45 +
    mv.emotional_openness * 0.10,
  );

  const protestBehavior = clamp(
    anxietyLevel * 0.50 +
    mv.conflict_directness * 0.30 +
    (1 - mv.distance_need) * 0.20,
  );

  return { anxietyLevel, avoidanceLevel, secureBase, protestBehavior };
}

/**
 * アタッチメント互換性スコア (0..1)
 *
 * 心理学研究に基づくマッチングルール:
 * - 安全型 × 安全型 = 最高（安定した関係）
 * - 安全型 × 不安型 = 良好（安全型が安定を提供）
 * - 安全型 × 回避型 = 良好（安全型が受容を提供）
 * - 不安型 × 回避型 = 危険パターン（追跡-回避の悪循環）
 * - 不安型 × 不安型 = 不安定（相互不安の増幅）
 * - 回避型 × 回避型 = 疎遠（感情的距離の拡大）
 * - 混乱型が絡む場合 = 予測困難
 */
export function computeAttachmentCompatibility(
  a: AttachmentProfile,
  b: AttachmentProfile,
): number {
  const styleA = classifyAttachment(a);
  const styleB = classifyAttachment(b);

  // 基本スコア: スタイル組合せによる
  let baseScore = getStylePairBaseScore(styleA, styleB);

  // 微調整: 安全基地スコアの平均で補正（両者の安全基地が高いほど良い）
  const secureBoost = (a.secureBase + b.secureBase) / 2;
  baseScore = baseScore * 0.7 + secureBoost * 0.3;

  // 不安×回避の追跡-回避パターンペナルティ
  const pursuerDistancerPenalty = computePursuerDistancerPenalty(a, b);
  baseScore -= pursuerDistancerPenalty;

  // 抗議行動の非対称性ペナルティ
  const protestGap = Math.abs(a.protestBehavior - b.protestBehavior);
  if (protestGap > 0.4) {
    baseScore -= (protestGap - 0.4) * 0.15;
  }

  return clamp(baseScore);
}

function getStylePairBaseScore(a: AttachmentStyle, b: AttachmentStyle): number {
  // 順序を正規化
  const pair = [a, b].sort().join("_");
  const PAIR_SCORES: Record<string, number> = {
    "secure_secure": 0.92,
    "anxious_secure": 0.78,
    "avoidant_secure": 0.75,
    "anxious_avoidant": 0.38,  // 追跡-回避の危険パターン
    "anxious_anxious": 0.45,
    "avoidant_avoidant": 0.50,
    "disorganized_secure": 0.60,
    "anxious_disorganized": 0.32,
    "avoidant_disorganized": 0.35,
    "disorganized_disorganized": 0.25,
  };
  return PAIR_SCORES[pair] ?? 0.50;
}

/**
 * 追跡者-回避者パターンのペナルティ計算
 * 不安レベルが高い側 × 回避レベルが高い側 → 悪循環リスク
 */
function computePursuerDistancerPenalty(
  a: AttachmentProfile,
  b: AttachmentProfile,
): number {
  // AがPursuer(不安高)、BがDistancer(回避高)のパターン
  const patternAB = a.anxietyLevel * b.avoidanceLevel;
  const patternBA = b.anxietyLevel * a.avoidanceLevel;
  const maxPattern = Math.max(patternAB, patternBA);

  // パターン強度が0.3以上で顕著
  if (maxPattern < 0.3) return 0;
  return (maxPattern - 0.3) * 0.25;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}
