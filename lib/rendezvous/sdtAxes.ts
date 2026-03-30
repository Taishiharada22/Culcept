// ============================================================
// 自己決定理論（SDT）軸
// Ryan & Deciの基本的心理的欲求: 自律性・有能感・関係性
// 関係文脈における欲求充足度の評価
// ============================================================

/**
 * SDTプロファイル
 * 各次元 0..1
 */
export type SDTProfile = {
  /** 自律性: 自分の選択・意志による行動の自由度 */
  autonomySatisfaction: number;
  /** 有能感: 自分の能力を発揮できている実感 */
  competenceSatisfaction: number;
  /** 関係性: 他者との深い繋がりの実感 */
  relatednessSatisfaction: number;
};

/**
 * Stargazer 45軸からSDTプロファイルを導出
 *
 * 軸マッピング:
 * - 自律性 ← independence_vs_harmony（独立性）, boundary_awareness（境界認識）
 * - 有能感 ← perfectionist_vs_pragmatic（完璧主義）, social_initiative（社会的主導）
 * - 関係性 ← reassurance_need（再確認欲求）, emotional_openness（感情開放性）, intimacy_pace（親密ペース）
 */
export function deriveSDTProfile(opts: {
  stargazerScores?: Record<string, number>;
  matchingVector?: {
    initiative: number;
    emotional_openness: number;
    distance_need: number;
    depth_speed: number;
    social_energy: number;
    structure_preference: number;
  };
}): SDTProfile {
  const { stargazerScores, matchingVector } = opts;

  if (stargazerScores) {
    return deriveFromStargazer(stargazerScores);
  }

  if (matchingVector) {
    return deriveFromVector(matchingVector);
  }

  return { autonomySatisfaction: 0.5, competenceSatisfaction: 0.5, relatednessSatisfaction: 0.5 };
}

function deriveFromStargazer(scores: Record<string, number>): SDTProfile {
  const norm = (axis: string, fallback: number) => {
    const v = scores[axis];
    return v !== undefined ? (v + 1) / 2 : fallback;
  };

  // 自律性: 独立性↑ + 境界認識↑ + 自発性↑
  const autonomySatisfaction = clamp(
    norm("independence_vs_harmony", 0.5) * 0.40 +
    norm("boundary_awareness", 0.5) * 0.35 +
    norm("plan_vs_spontaneous", 0.5) * 0.25,
  );

  // 有能感: 完璧主義適度 + 社会的主導↑ + 大胆さ↑
  const perfectionism = norm("perfectionist_vs_pragmatic", 0.5);
  // 完璧主義は中程度が最適（極端な完璧主義は有能感を損なう）
  const optimalPerfectionism = 1 - Math.abs(perfectionism - 0.6) * 2;
  const competenceSatisfaction = clamp(
    optimalPerfectionism * 0.35 +
    norm("social_initiative", 0.5) * 0.35 +
    norm("cautious_vs_bold", 0.5) * 0.30,
  );

  // 関係性: 親密ペース↑ + 感情開放性↑ + 再確認欲求適度
  const reassurance = norm("reassurance_need", 0.5);
  const optimalReassurance = 1 - Math.abs(reassurance - 0.4) * 2; // やや低めが健全
  const relatednessSatisfaction = clamp(
    norm("intimacy_pace", 0.5) * 0.35 +
    norm("emotional_openness", 0.5) * 0.35 +
    optimalReassurance * 0.30,
  );

  return { autonomySatisfaction, competenceSatisfaction, relatednessSatisfaction };
}

function deriveFromVector(mv: {
  initiative: number;
  emotional_openness: number;
  distance_need: number;
  depth_speed: number;
  social_energy: number;
  structure_preference: number;
}): SDTProfile {
  // 自律性: 主導性↑ + 構造好み↑（自分で計画できる）+ 適度な距離欲求
  const autonomySatisfaction = clamp(
    mv.initiative * 0.40 +
    mv.structure_preference * 0.30 +
    mv.distance_need * 0.30,
  );

  // 有能感: 主導性↑ + 社交性↑
  const competenceSatisfaction = clamp(
    mv.initiative * 0.45 +
    mv.social_energy * 0.30 +
    mv.structure_preference * 0.25,
  );

  // 関係性: 感情開放↑ + 深度速度↑ + 社交性↑
  const relatednessSatisfaction = clamp(
    mv.emotional_openness * 0.40 +
    mv.depth_speed * 0.30 +
    mv.social_energy * 0.30,
  );

  return { autonomySatisfaction, competenceSatisfaction, relatednessSatisfaction };
}

/**
 * SDT互換性スコア (0..1)
 *
 * La Guardia et al. (2000) の研究に基づく:
 * - 基本的心理的欲求が充足される関係でアタッチメント安全性が向上
 * - 自律性を尊重し合える関係が最も持続する
 *
 * 互換性ルール:
 * - 自律性: 類似が良い（両者とも自律を尊重し合える）
 * - 有能感: 補完可（一方が引っ張り、他方が支える構造もOK）
 * - 関係性: 類似が重要（両者の関係欲求が近い方が満たされやすい）
 */
export function computeSDTCompatibility(
  a: SDTProfile,
  b: SDTProfile,
): number {
  // 自律性: 類似度重視。両者の自律性が近いほど尊重し合える
  const autonomyDiff = Math.abs(a.autonomySatisfaction - b.autonomySatisfaction);
  const autonomyFit = Math.exp(-(autonomyDiff * autonomyDiff) / 0.245); // σ=0.35

  // 有能感: 混合評価。類似でも補完でもOK
  const competenceSim = Math.exp(
    -Math.pow(a.competenceSatisfaction - b.competenceSatisfaction, 2) / 0.245,
  );
  // 補完: 一方が高く他方が中程度なら、メンター的関係が成立
  const competenceComp = Math.min(
    a.competenceSatisfaction + b.competenceSatisfaction,
    1.0,
  );
  const competenceFit = competenceSim * 0.6 + competenceComp * 0.4;

  // 関係性: 類似度が最重要（欲求レベルが合わないとすれ違う）
  const relatednessDiff = Math.abs(a.relatednessSatisfaction - b.relatednessSatisfaction);
  const relatednessFit = Math.exp(-(relatednessDiff * relatednessDiff) / 0.18); // σ=0.30（より厳しく）

  // 全体バランス: 3欲求の最低値が低すぎると関係が歪む
  const minSatisfaction = Math.min(
    (a.autonomySatisfaction + b.autonomySatisfaction) / 2,
    (a.competenceSatisfaction + b.competenceSatisfaction) / 2,
    (a.relatednessSatisfaction + b.relatednessSatisfaction) / 2,
  );
  const balanceBonus = minSatisfaction > 0.4 ? (minSatisfaction - 0.4) * 0.15 : 0;

  const score =
    autonomyFit * 0.35 +
    competenceFit * 0.25 +
    relatednessFit * 0.40 +
    balanceBonus;

  return clamp(score);
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}
