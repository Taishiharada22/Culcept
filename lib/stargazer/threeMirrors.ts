// lib/stargazer/threeMirrors.ts
// 三面鏡アーキテクチャ — 3つの独立した観測源で主観の壁を突破する
//
// 🪞 Mirror 1: 自画像 (Self-Portrait) — 自己申告による質問回答
// 🪞 Mirror 2: 足跡 (Footprint) — アプリ内行動の無意識的痕跡
// 🪞 Mirror 3: 影絵 (Shadow Play) — 他者・シナリオへの投影反応
//
// 核心思想:
// 3つの鏡が一致すれば高確信。
// ズレがあれば、そこに最も深い自己理解の手がかりがある。

/**
 * Academic References & Theoretical Foundation:
 *
 * The Three Mirrors architecture draws on converging evidence that self-knowledge
 * requires multiple independent observation channels, because each channel has
 * systematic blind spots that the others can compensate for.
 *
 * Mirror 1 — Self-Portrait (自画像): Explicit self-report
 *   - Nisbett, R. E., & Wilson, T. D. (1977). "Telling more than we can know:
 *     Verbal reports on mental processes." Journal of Personality and Social
 *     Psychology, 35(4), 231-259.
 *     Demonstrated that people have limited introspective access to their own
 *     cognitive processes and often confabulate plausible but inaccurate
 *     explanations for their behavior.
 *   - Paulhus, D. L. (1984). "Two-component models of socially desirable
 *     responding." Journal of Personality and Social Psychology, 46(3), 598-609.
 *     Showed that self-report is systematically distorted by self-deception
 *     (unconscious) and impression management (conscious).
 *
 * Mirror 2 — Footprint (足跡): Behavioral traces
 *   - Baumeister, R. F., Vohs, K. D., & Funder, D. C. (2007). "Psychology as
 *     the science of self-reports and finger movements: Whatever happened to
 *     actual behavior?" Perspectives on Psychological Science, 2(4), 396-403.
 *     Argued that behavioral observation provides validity that self-report
 *     alone cannot achieve, as behavior reflects actual decision processes
 *     rather than post-hoc rationalizations.
 *   - Back, M. D., et al. (2010). "Facebook profiles reflect actual
 *     personality, not self-idealization." Psychological Science, 21(3),
 *     372-374.
 *     Demonstrated that digital behavioral traces can be more accurate
 *     reflections of personality than deliberate self-presentation.
 *
 * Mirror 3 — Shadow Play (影絵): Projective / implicit responses
 *   - Greenwald, A. G., & Banaji, M. R. (1995). "Implicit social cognition:
 *     Attitudes, self-esteem, and stereotypes." Psychological Review, 102(1),
 *     4-27.
 *     Established that implicit attitudes — revealed through indirect measures
 *     rather than direct self-report — often diverge from explicit attitudes and
 *     can predict behavior that explicit measures miss.
 *   - McClelland, D. C., Koestner, R., & Weinberger, J. (1989). "How do
 *     self-attributed and implicit motives differ?" Psychological Review, 96(4),
 *     690-702.
 *     Showed that implicit motives (measured via projective techniques) and
 *     self-attributed motives are distinct systems that predict different types
 *     of behavior.
 *
 * Weighting Rationale (30:35:35):
 *   Self-report is weighted lowest (0.30) because of the well-documented
 *   introspective illusion: people are systematically poor at reporting their
 *   own mental processes (Nisbett & Wilson, 1977), and self-reports are further
 *   distorted by social desirability bias (Paulhus, 1984). Behavioral traces
 *   (0.35) and projective/shadow data (0.35) are weighted equally and higher
 *   because they bypass conscious self-presentation bias and tap into actual
 *   decision processes (Baumeister et al., 2007) and implicit attitudes
 *   (Greenwald & Banaji, 1995) respectively.
 *
 * Divergence Detection:
 *   - Higgins, E. T. (1987). "Self-discrepancy: A theory relating self and
 *     affect." Psychological Review, 94(3), 319-340.
 *     When mirrors disagree, the pattern of divergence itself is informative:
 *     self-vs-footprint gaps reveal ideal/actual self-discrepancies, while
 *     self-vs-shadow gaps reveal explicit/implicit attitude dissociations.
 */

import type { TraitAxisKey } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mirror Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 3つの観測源 */
export type MirrorSource = "self_portrait" | "footprint" | "shadow_play";

/** 全ミラーソース */
export const ALL_MIRROR_SOURCES: MirrorSource[] = [
  "self_portrait",
  "footprint",
  "shadow_play",
];

export const MIRROR_LABELS: Record<MirrorSource, { ja: string; en: string; emoji: string; description: string }> = {
  self_portrait: {
    ja: "自画像",
    en: "Self-Portrait",
    emoji: "🪞",
    description: "あなた自身が語る自分",
  },
  footprint: {
    ja: "足跡",
    en: "Footprint",
    emoji: "👣",
    description: "行動が映し出す無意識の自分",
  },
  shadow_play: {
    ja: "影絵",
    en: "Shadow Play",
    emoji: "🎭",
    description: "他者への反応に映る本当の自分",
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mirror Axis Score
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 1つの軸に対する、各ミラーからのスコアと信頼度 */
export interface MirrorAxisScore {
  axisId: TraitAxisKey;
  /** 自画像（自己申告）からのスコア。未観測なら undefined */
  selfPortrait?: number;
  /** 足跡（行動データ）からのスコア。未観測なら undefined */
  footprint?: number;
  /** 影絵（投影質問）からのスコア。未観測なら undefined */
  shadowPlay?: number;
  /** 各ミラーの観測回数 */
  counts: {
    selfPortrait: number;
    footprint: number;
    shadowPlay: number;
  };
}

/** 全軸の三面鏡スコア */
export type ThreeMirrorProfile = Record<TraitAxisKey, MirrorAxisScore>;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Divergence (ズレ)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ミラー間のズレの種類 */
export type DivergenceType =
  | "self_vs_footprint"   // 言ってることとやってることが違う
  | "self_vs_shadow"      // 自覚と投影が違う
  | "footprint_vs_shadow" // 行動と投影が違う
  | "all_aligned"         // 3つが一致 → 高確信
  | "all_diverged";       // 3つがバラバラ → 複雑な構造

export interface AxisDivergence {
  axisId: TraitAxisKey;
  divergenceType: DivergenceType;
  /** ズレの大きさ (0-1, 大きいほど乖離が激しい) */
  magnitude: number;
  /** 人間が読めるインサイト */
  insight: string;
  /** ズレから推測される心理構造 */
  hypothesis: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Integrated Score
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ミラー統合の重み設定 */
export interface MirrorWeights {
  selfPortrait: number;
  footprint: number;
  shadowPlay: number;
}

/**
 * デフォルト: 行動と投影を自己申告より重視
 *
 * Weight rationale:
 * - selfPortrait (0.30): Lowest weight due to introspective illusion
 *   (Nisbett & Wilson, 1977) and social desirability bias (Paulhus, 1984).
 *   People systematically misreport their own mental processes.
 * - footprint (0.35): Higher weight because behavioral traces reflect actual
 *   decision processes rather than post-hoc rationalization
 *   (Baumeister et al., 2007).
 * - shadowPlay (0.35): Higher weight because projective/indirect measures
 *   access implicit attitudes that bypass conscious self-presentation
 *   (Greenwald & Banaji, 1995; McClelland et al., 1989).
 */
export const DEFAULT_MIRROR_WEIGHTS: MirrorWeights = {
  selfPortrait: 0.30,  // Discounted for introspective illusion
  footprint: 0.35,     // Elevated for behavioral validity
  shadowPlay: 0.35,    // Elevated for implicit attitude access
};

/** 自己申告のみ（従来互換） */
export const SELF_ONLY_WEIGHTS: MirrorWeights = {
  selfPortrait: 1.0,
  footprint: 0.0,
  shadowPlay: 0.0,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Computation Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 三面鏡スコアを重み付き統合して1つの軸スコアを算出
 * 観測がないミラーは自動的に除外して残りで正規化
 */
export function integrateAxisScore(
  mirror: MirrorAxisScore,
  weights: MirrorWeights = DEFAULT_MIRROR_WEIGHTS
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  if (mirror.selfPortrait !== undefined && mirror.counts.selfPortrait > 0) {
    weightedSum += mirror.selfPortrait * weights.selfPortrait;
    totalWeight += weights.selfPortrait;
  }
  if (mirror.footprint !== undefined && mirror.counts.footprint > 0) {
    weightedSum += mirror.footprint * weights.footprint;
    totalWeight += weights.footprint;
  }
  if (mirror.shadowPlay !== undefined && mirror.counts.shadowPlay > 0) {
    weightedSum += mirror.shadowPlay * weights.shadowPlay;
    totalWeight += weights.shadowPlay;
  }

  if (totalWeight === 0) return 0;
  return weightedSum / totalWeight;
}

/**
 * 全軸の三面鏡スコアを統合して、従来互換の軸スコアマップを生成
 * ① subjective: 自画像のみ（従来の自己申告ベース）
 * ② objective: 三面鏡統合（行動+投影で補正）
 */
export function buildDualAxisScores(
  profile: Partial<ThreeMirrorProfile>
): {
  subjective: Partial<Record<TraitAxisKey, number>>;
  objective: Partial<Record<TraitAxisKey, number>>;
} {
  const subjective: Partial<Record<TraitAxisKey, number>> = {};
  const objective: Partial<Record<TraitAxisKey, number>> = {};

  for (const [axisId, mirror] of Object.entries(profile) as [TraitAxisKey, MirrorAxisScore][]) {
    // Subjective = self-portrait only
    if (mirror.selfPortrait !== undefined) {
      subjective[axisId] = mirror.selfPortrait;
    }
    // Objective = weighted integration of all available mirrors
    objective[axisId] = integrateAxisScore(mirror);
  }

  return { subjective, objective };
}

/**
 * 2つのスコア間のズレを検出
 */
function computeDivergence(a: number | undefined, b: number | undefined): number {
  if (a === undefined || b === undefined) return 0;
  return Math.abs(a - b);
}

/**
 * 1つの軸に対するズレのタイプを判定
 */
export function classifyDivergence(mirror: MirrorAxisScore): DivergenceType {
  const THRESHOLD = 0.35; // このズレ以上で「異なる」と判定

  const spVsFp = computeDivergence(mirror.selfPortrait, mirror.footprint);
  const spVsSh = computeDivergence(mirror.selfPortrait, mirror.shadowPlay);
  const fpVsSh = computeDivergence(mirror.footprint, mirror.shadowPlay);

  const spFpDiverged = spVsFp >= THRESHOLD;
  const spShDiverged = spVsSh >= THRESHOLD;
  const fpShDiverged = fpVsSh >= THRESHOLD;

  const divergedCount = [spFpDiverged, spShDiverged, fpShDiverged].filter(Boolean).length;

  if (divergedCount === 0) return "all_aligned";
  if (divergedCount === 3) return "all_diverged";
  if (spFpDiverged && !fpShDiverged) return "self_vs_footprint";
  if (spShDiverged && !fpShDiverged) return "self_vs_shadow";
  if (fpShDiverged && !spFpDiverged) return "footprint_vs_shadow";

  // default to self_vs_footprint if multiple but not all
  return spFpDiverged ? "self_vs_footprint" : "self_vs_shadow";
}

/**
 * 全軸のズレを検出し、大きいものから並べる
 */
export function detectDivergences(
  profile: Partial<ThreeMirrorProfile>
): AxisDivergence[] {
  const results: AxisDivergence[] = [];

  for (const [axisId, mirror] of Object.entries(profile) as [TraitAxisKey, MirrorAxisScore][]) {
    // 2つ以上のミラーがないとズレは検出できない
    const available = [
      mirror.selfPortrait !== undefined,
      mirror.footprint !== undefined,
      mirror.shadowPlay !== undefined,
    ].filter(Boolean).length;
    if (available < 2) continue;

    const divergenceType = classifyDivergence(mirror);
    if (divergenceType === "all_aligned") continue;

    // ズレの大きさ = 最大のペア間差分
    const pairs = [
      computeDivergence(mirror.selfPortrait, mirror.footprint),
      computeDivergence(mirror.selfPortrait, mirror.shadowPlay),
      computeDivergence(mirror.footprint, mirror.shadowPlay),
    ];
    const magnitude = Math.max(...pairs);

    results.push({
      axisId: axisId as TraitAxisKey,
      divergenceType,
      magnitude,
      insight: generateDivergenceInsight(axisId as TraitAxisKey, divergenceType, mirror),
      hypothesis: generateDivergenceHypothesis(axisId as TraitAxisKey, divergenceType, mirror),
    });
  }

  // 大きいズレから並べる
  return results.sort((a, b) => b.magnitude - a.magnitude);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Insight Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DIVERGENCE_TEMPLATES: Record<DivergenceType, { insight: string; hypothesis: string }> = {
  self_vs_footprint: {
    insight: "自分が語る自分と、行動が示す自分にズレがある",
    hypothesis: "理想の自分と実際の自分の間に距離がある。これは弱さではなく、成長の方向を示している",
  },
  self_vs_shadow: {
    insight: "自覚している自分と、他者への反応が映す自分が異なる",
    hypothesis: "無意識の価値基準が、自覚とは別の場所にある可能性がある",
  },
  footprint_vs_shadow: {
    insight: "日常の行動パターンと、深層の価値観にギャップがある",
    hypothesis: "環境に適応した行動と、本来の志向が異なる。状況依存的な側面が見える",
  },
  all_aligned: {
    insight: "3つの観測源が一致している",
    hypothesis: "この領域の自己認識は正確。高い自己理解度",
  },
  all_diverged: {
    insight: "自己申告・行動・投影の3つがすべて異なる方向を指している",
    hypothesis: "この領域は複雑な内的構造を持っている。矛盾ではなく、多面性の現れ",
  },
};

function generateDivergenceInsight(
  _axisId: TraitAxisKey,
  divergenceType: DivergenceType,
  _mirror: MirrorAxisScore
): string {
  return DIVERGENCE_TEMPLATES[divergenceType].insight;
}

function generateDivergenceHypothesis(
  _axisId: TraitAxisKey,
  divergenceType: DivergenceType,
  _mirror: MirrorAxisScore
): string {
  return DIVERGENCE_TEMPLATES[divergenceType].hypothesis;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mirror Confidence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MirrorConfidence {
  /** 全体的な確信度 (0-1) — 3つの鏡の一致度 × 観測量 */
  overall: number;
  /** 各ミラーの観測充足度 (0-1) */
  perMirror: Record<MirrorSource, number>;
  /** ズレがある軸の数 */
  divergentAxesCount: number;
  /** 一致している軸の数 */
  alignedAxesCount: number;
}

/**
 * 三面鏡プロファイル全体の確信度を算出
 */
export function computeMirrorConfidence(
  profile: Partial<ThreeMirrorProfile>
): MirrorConfidence {
  let selfCount = 0;
  let footCount = 0;
  let shadowCount = 0;
  let alignedCount = 0;
  let divergedCount = 0;
  const totalAxes = Object.keys(profile).length;

  for (const mirror of Object.values(profile) as MirrorAxisScore[]) {
    if (mirror.counts.selfPortrait > 0) selfCount++;
    if (mirror.counts.footprint > 0) footCount++;
    if (mirror.counts.shadowPlay > 0) shadowCount++;

    const available = [
      mirror.selfPortrait !== undefined,
      mirror.footprint !== undefined,
      mirror.shadowPlay !== undefined,
    ].filter(Boolean).length;

    if (available >= 2) {
      const type = classifyDivergence(mirror);
      if (type === "all_aligned") alignedCount++;
      else divergedCount++;
    }
  }

  const maxAxes = Math.max(totalAxes, 1);
  const selfCoverage = selfCount / maxAxes;
  const footCoverage = footCount / maxAxes;
  const shadowCoverage = shadowCount / maxAxes;

  // 確信度 = ミラーカバレッジ × 一致率
  const coverageScore = (selfCoverage + footCoverage + shadowCoverage) / 3;
  const comparableAxes = alignedCount + divergedCount;
  const alignmentRate = comparableAxes > 0 ? alignedCount / comparableAxes : 0;
  const overall = coverageScore * 0.4 + alignmentRate * 0.6;

  return {
    overall: Math.min(Math.max(overall, 0), 1),
    perMirror: {
      self_portrait: selfCoverage,
      footprint: footCoverage,
      shadow_play: shadowCoverage,
    },
    divergentAxesCount: divergedCount,
    alignedAxesCount: alignedCount,
  };
}
