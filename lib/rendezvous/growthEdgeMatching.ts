// lib/rendezvous/growthEdgeMatching.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Growth-Edge Matching（成長境界マッチング）
//
// 脳科学的根拠:
// Vygotskyの「最近接発達領域（ZPD）」:
// 人は「少しだけ届かない」課題に最も強く動機づけられる。
// マッチングを「成長の最近接領域」として設計する。
//
// 設計思想:
// 「この人の強みは、あなたの盲点」
// → 「この人に会いたい」の動機が
//    「快適だから」→「自分が変わるから」に進化
//
// 統合:
// - Stargazer contradictionMap の blind spot 検出
// - Stargazer predictiveClone の unpredictableAreas
// - MatchingVector の軸スコア
// → 相手の強み軸 × 自分の盲点軸 の交差を検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { MatchingVector } from "./types";
import type { RendezvousCategory } from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ユーザーの成長プロファイル */
export interface GrowthProfile {
  /** 強み軸（自信を持っている/安定している軸） */
  strengths: GrowthAxis[];
  /** 盲点軸（回避している/不安定な軸） */
  blindSpots: GrowthAxis[];
  /** 成長エッジ（もう少しで届きそうな軸） */
  growthEdges: GrowthAxis[];
  /** 全体の成長開放度（他者からの影響を受け入れる度合い） */
  growthOpenness: number;
}

export interface GrowthAxis {
  /** 軸名（MatchingVectorのキー） */
  axis: keyof MatchingVector;
  /** スコア */
  score: number;
  /** 安定度（高い＝強み、低い＝揺らぎ中） */
  stability: number;
  /** 回避率（高い＝盲点候補） */
  avoidanceRate: number;
  /** 矛盾が検出されているか */
  hasContradiction: boolean;
}

/** 成長エッジマッチの結果 */
export interface GrowthEdgeMatch {
  /** 自分の盲点軸 */
  myBlindSpot: keyof MatchingVector;
  myBlindSpotLabel: string;
  /** 相手の強み軸 */
  theirStrength: keyof MatchingVector;
  theirStrengthLabel: string;
  /** 成長インパクト推定（0-1） */
  growthImpact: number;
  /** 成長の説明 */
  growthNarrative: string;
  /** 具体的な変化の予測 */
  predictedChange: string;
  /** このマッチが心地よいか挑戦的か */
  comfort: "comfortable" | "stretching" | "challenging";
}

/** 成長エッジマッチングの全体結果 */
export interface GrowthEdgeResult {
  /** A→Bの成長エッジ（AがBから学べること） */
  growthForA: GrowthEdgeMatch[];
  /** B→Aの成長エッジ（BがAから学べること） */
  growthForB: GrowthEdgeMatch[];
  /** 相互成長ポテンシャル（0-1） */
  mutualGrowthPotential: number;
  /** 成長の方向性の対称性（0-1、高い＝互いに学び合える） */
  growthSymmetry: number;
  /** 成長スコアの追加ボースト（evaluatePairに加算） */
  scoreBoost: number;
  /** 成長物語（この二人が出会うと何が起きるか） */
  growthStory: string;
  /** Anima向けの成長テーマ */
  animaGrowthTheme: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Growth Profile Construction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Stargazerからの入力データ（盲点と揺らぎ情報） */
export interface StargazerGrowthInput {
  /** 軸ごとの安定度（fluctuationEngineから） */
  axisStability: Partial<Record<keyof MatchingVector, number>>;
  /** 軸ごとの回避率（multiModalSignalFusionから） */
  axisAvoidanceRate: Partial<Record<keyof MatchingVector, number>>;
  /** 矛盾が検出された軸（contradictionMapから） */
  contradictionAxes: (keyof MatchingVector)[];
  /** 予測が外れた軸（predictiveCloneから） */
  unpredictableAxes: (keyof MatchingVector)[];
}

/**
 * MatchingVector + Stargazerデータから成長プロファイルを構築
 */
export function buildGrowthProfile(
  vector: MatchingVector,
  stargazerInput?: StargazerGrowthInput,
): GrowthProfile {
  const axes = Object.keys(vector) as (keyof MatchingVector)[];
  const growthAxes: GrowthAxis[] = axes.map((axis) => ({
    axis,
    score: vector[axis],
    stability: stargazerInput?.axisStability[axis] ?? 0.5,
    avoidanceRate: stargazerInput?.axisAvoidanceRate[axis] ?? 0,
    hasContradiction: stargazerInput?.contradictionAxes?.includes(axis) ?? false,
  }));

  // 強み: 安定度が高く（≥0.7）、回避率が低い（<0.2）
  const strengths = growthAxes.filter(
    (a) => a.stability >= 0.7 && a.avoidanceRate < 0.2,
  );

  // 盲点: 回避率が高い（≥0.3）OR 矛盾が検出された OR 非常に不安定（<0.3）
  const blindSpots = growthAxes.filter(
    (a) =>
      a.avoidanceRate >= 0.3 ||
      a.hasContradiction ||
      (a.stability < 0.3 && a.avoidanceRate >= 0.15),
  );

  // 成長エッジ: 中間的な安定度（0.3-0.6）で矛盾なし
  const growthEdges = growthAxes.filter(
    (a) =>
      a.stability >= 0.3 &&
      a.stability < 0.6 &&
      !a.hasContradiction &&
      a.avoidanceRate < 0.3,
  );

  // 全体の成長開放度
  const avgStability =
    growthAxes.reduce((s, a) => s + a.stability, 0) / growthAxes.length;
  const avgAvoidance =
    growthAxes.reduce((s, a) => s + a.avoidanceRate, 0) / growthAxes.length;
  const growthOpenness = Math.max(
    0,
    Math.min(1, 1 - avgStability * 0.3 - avgAvoidance * 0.7),
  );

  return { strengths, blindSpots, growthEdges, growthOpenness };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Growth Edge Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 軸のラベルマップ */
const AXIS_LABELS: Record<keyof MatchingVector, { name: string; low: string; high: string }> = {
  conversation_temperature: { name: "会話温度", low: "静かな対話", high: "熱い議論" },
  distance_need: { name: "距離感", low: "密着型", high: "独立型" },
  depth_speed: { name: "関係の深まり方", low: "ゆっくり慎重", high: "すぐに深く" },
  stability_need: { name: "安定性", low: "変化を好む", high: "安定を好む" },
  stimulation_need: { name: "刺激欲求", low: "穏やか", high: "冒険的" },
  initiative: { name: "主導性", low: "フォロワー型", high: "リーダー型" },
  emotional_openness: { name: "感情的開放度", low: "慎重に表現", high: "率直に表現" },
  conflict_directness: { name: "衝突への向き合い方", low: "間接的", high: "直接的" },
  social_energy: { name: "社交エネルギー", low: "内向的", high: "外向的" },
  structure_preference: { name: "計画性", low: "即興型", high: "計画型" },
};

/**
 * A の盲点 × B の強みを検出
 */
function detectGrowthEdges(
  profileA: GrowthProfile,
  profileB: GrowthProfile,
  vectorA: MatchingVector,
  vectorB: MatchingVector,
): GrowthEdgeMatch[] {
  const matches: GrowthEdgeMatch[] = [];

  for (const blindSpot of profileA.blindSpots) {
    // Bの強みに同じ軸があるか
    const theirStrength = profileB.strengths.find(
      (s) => s.axis === blindSpot.axis,
    );
    if (!theirStrength) continue;

    const label = AXIS_LABELS[blindSpot.axis];
    const gap = Math.abs(vectorA[blindSpot.axis] - vectorB[blindSpot.axis]);

    // 成長インパクト: 盲点の深さ × 相手の安定度 × ギャップの大きさ
    const growthImpact = Math.min(
      1,
      (blindSpot.avoidanceRate + (blindSpot.hasContradiction ? 0.3 : 0)) *
        theirStrength.stability *
        (0.5 + gap * 0.5),
    );

    // 心地よさレベル
    let comfort: GrowthEdgeMatch["comfort"];
    if (gap < 0.3) comfort = "comfortable";
    else if (gap < 0.5) comfort = "stretching";
    else comfort = "challenging";

    // 成長物語の生成
    const myDirection = vectorA[blindSpot.axis] < 0.5 ? label.low : label.high;
    const theirDirection = vectorB[blindSpot.axis] < 0.5 ? label.low : label.high;

    const growthNarrative = blindSpot.hasContradiction
      ? `あなたは「${label.name}」に矛盾を抱えている。この人は同じ領域で安定している。その安定性に触れることで、矛盾が解消に向かう可能性がある`
      : `あなたが無意識に避けている「${label.name}」の領域。この人はそこに自然に存在している`;

    const predictedChange = `${myDirection}傾向のあなたが、${theirDirection}の人と接することで、「${label.name}」の新しい側面に気づく可能性`;

    matches.push({
      myBlindSpot: blindSpot.axis,
      myBlindSpotLabel: label.name,
      theirStrength: theirStrength.axis,
      theirStrengthLabel: label.name,
      growthImpact,
      growthNarrative,
      predictedChange,
      comfort,
    });
  }

  return matches.sort((a, b) => b.growthImpact - a.growthImpact).slice(0, 3);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Main Entry Point
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface GrowthEdgeInput {
  vectorA: MatchingVector;
  vectorB: MatchingVector;
  stargazerA?: StargazerGrowthInput;
  stargazerB?: StargazerGrowthInput;
  category: RendezvousCategory;
}

/**
 * 二人のユーザー間の成長エッジマッチングを実行
 */
export function evaluateGrowthEdge(input: GrowthEdgeInput): GrowthEdgeResult {
  const profileA = buildGrowthProfile(input.vectorA, input.stargazerA);
  const profileB = buildGrowthProfile(input.vectorB, input.stargazerB);

  const growthForA = detectGrowthEdges(
    profileA,
    profileB,
    input.vectorA,
    input.vectorB,
  );
  const growthForB = detectGrowthEdges(
    profileB,
    profileA,
    input.vectorB,
    input.vectorA,
  );

  // 相互成長ポテンシャル
  const avgImpactA =
    growthForA.length > 0
      ? growthForA.reduce((s, g) => s + g.growthImpact, 0) / growthForA.length
      : 0;
  const avgImpactB =
    growthForB.length > 0
      ? growthForB.reduce((s, g) => s + g.growthImpact, 0) / growthForB.length
      : 0;
  const mutualGrowthPotential = (avgImpactA + avgImpactB) / 2;

  // 対称性（両方が同程度に学び合えるか）
  const growthSymmetry =
    avgImpactA > 0 && avgImpactB > 0
      ? 1 - Math.abs(avgImpactA - avgImpactB) / Math.max(avgImpactA, avgImpactB)
      : 0;

  // スコアブースト（evaluatePairに加算する追加スコア）
  // 成長ポテンシャルが高い = 通常のスコアに追加価値
  const scoreBoost = mutualGrowthPotential * growthSymmetry * 0.05;

  // 成長物語
  const growthStory = generateGrowthStory(
    growthForA,
    growthForB,
    mutualGrowthPotential,
    growthSymmetry,
  );

  // Anima向け成長テーマ
  const animaGrowthTheme = generateAnimaTheme(growthForA, growthForB);

  return {
    growthForA,
    growthForB,
    mutualGrowthPotential,
    growthSymmetry,
    scoreBoost,
    growthStory,
    animaGrowthTheme,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Story Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateGrowthStory(
  growthForA: GrowthEdgeMatch[],
  growthForB: GrowthEdgeMatch[],
  mutualPotential: number,
  symmetry: number,
): string {
  if (growthForA.length === 0 && growthForB.length === 0) {
    return "互いに安定した領域が多い。快適な関係が築ける一方、成長の刺激は少ないかもしれない";
  }

  if (symmetry >= 0.7 && mutualPotential >= 0.4) {
    const topA = growthForA[0];
    const topB = growthForB[0];
    if (topA && topB) {
      return `互いの盲点を照らし合える関係。${topA.myBlindSpotLabel}と${topB.myBlindSpotLabel}の領域で、両者が成長する可能性がある`;
    }
  }

  if (growthForA.length > growthForB.length) {
    const top = growthForA[0];
    return top
      ? `あなたの「${top.myBlindSpotLabel}」の盲点に、この人の安定性が光を当てる。成長の方向が見えてくるかもしれない`
      : "成長のきっかけが潜んでいる関係";
  }

  const top = growthForB[0];
  return top
    ? `相手の「${top.myBlindSpotLabel}」の領域で、あなたの経験が役に立つ。教えることで自分も深まる`
    : "互いにとって新しい視点を提供し合える関係";
}

function generateAnimaTheme(
  growthForA: GrowthEdgeMatch[],
  growthForB: GrowthEdgeMatch[],
): string {
  const allEdges = [...growthForA, ...growthForB];
  if (allEdges.length === 0) {
    return "安定の中に、小さな発見を探す";
  }

  const topEdge = allEdges.sort((a, b) => b.growthImpact - a.growthImpact)[0];
  return `${topEdge.myBlindSpotLabel}の境界線。${topEdge.comfort === "comfortable" ? "自然に" : topEdge.comfort === "stretching" ? "少しずつ" : "勇気を持って"}踏み出す`;
}
