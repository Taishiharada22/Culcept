// lib/stargazer/generativeCore.ts
// Layer 4: 生成核 (Generative Core) — 自己理解の創発的インサイト生成
//
// 原理: 既知の観測データから「まだ言語化されていない自己像」を生成する
// 三面鏡の矛盾パターン + 時系列変化 + 行動シグナルから、
// ユーザー自身が気づいていない内面構造を言語化する
//
// 出力:
// 1. 内面核 (Inner Core): 判断の最深部にある原理
// 2. 保護構造 (Protective Structure): 無意識に守っているもの
// 3. 成長方向 (Growth Vector): 自然に向かっている方向
// 4. 盲点仮説 (Blind Spot Hypothesis): ミラー矛盾から推測される無自覚領域

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import type { ThreeMirrorProfile, MirrorAxisScore, DivergenceType } from "./threeMirrors";
import { classifyDivergence, integrateAxisScore } from "./threeMirrors";
import type { ArchetypeResult } from "./archetypeResolver";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 内面核 — 判断原理の最深部 */
export interface InnerCore {
  /** 核心的な価値軸 (最も安定している軸) */
  coreAxes: {
    axisId: TraitAxisKey;
    score: number;
    stability: number; // 0-1, ミラー間の一致度
    interpretation: string;
  }[];
  /** 核心的な判断原理の言語化 */
  principle: string;
  /** 安心の源 */
  safetySource: string;
  /** 確信度 */
  confidence: number;
}

/** 保護構造 — 無意識に守っているもの */
export interface ProtectiveStructure {
  /** 保護パターンの種類 */
  patternType: "avoidance" | "overcompensation" | "mask" | "control" | "withdrawal";
  /** 保護している核心的な欲求 */
  protectedNeed: string;
  /** 保護行動の表れ方 */
  manifestation: string;
  /** 関連する軸のズレ */
  relatedDivergences: { axisId: TraitAxisKey; divergenceType: DivergenceType }[];
  /** 気づきの問い */
  reflectionPrompt: string;
}

/** 成長方向 — 自然に向かっている方向 */
export interface GrowthVector {
  /** 現在の位置 */
  currentPosition: string;
  /** 向かっている方向 */
  direction: string;
  /** 成長のサイン（行動の変化） */
  signs: string[];
  /** 成長を阻む可能性のある構造 */
  resistance: string;
  /** 関連する軸 */
  axes: TraitAxisKey[];
}

/** 盲点仮説 — ミラー矛盾から推測される無自覚領域 */
export interface BlindSpotHypothesis {
  /** 仮説のタイトル */
  title: string;
  /** 詳細な説明 */
  description: string;
  /** 根拠となるミラーデータ */
  evidence: {
    axisId: TraitAxisKey;
    selfSays: number;
    behaviorShows: number;
    projectionReveals: number;
  }[];
  /** 探索のための問い */
  explorationQuestions: string[];
  /** 確信度 */
  confidence: number;
}

/** 生成核の全出力 */
export interface GenerativeCoreResult {
  innerCore: InnerCore;
  protectiveStructures: ProtectiveStructure[];
  growthVector: GrowthVector;
  blindSpots: BlindSpotHypothesis[];
  /** 生成日時 */
  generatedAt: string;
  /** データ充足度 */
  dataCompleteness: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core Computation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 三面鏡プロファイルから生成核インサイトを構築
 */
export function buildGenerativeCore(
  profile: Partial<ThreeMirrorProfile>,
  archetype?: ArchetypeResult | null,
): GenerativeCoreResult {
  const entries = Object.entries(profile) as [TraitAxisKey, MirrorAxisScore][];
  if (entries.length < 3) {
    return emptyGenerativeCoreResult();
  }

  const innerCore = computeInnerCore(entries);
  const protectiveStructures = detectProtectiveStructures(entries);
  const growthVector = computeGrowthVector(entries, archetype);
  const blindSpots = generateBlindSpotHypotheses(entries);

  // データ充足度: 2つ以上のミラーがある軸の割合
  const multiMirrorCount = entries.filter(([, m]) => {
    const count = [m.selfPortrait !== undefined, m.footprint !== undefined, m.shadowPlay !== undefined].filter(Boolean).length;
    return count >= 2;
  }).length;
  const dataCompleteness = entries.length > 0 ? multiMirrorCount / entries.length : 0;

  return {
    innerCore,
    protectiveStructures,
    growthVector,
    blindSpots,
    generatedAt: new Date().toISOString(),
    dataCompleteness,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Inner Core: 判断原理の最深部
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function computeInnerCore(entries: [TraitAxisKey, MirrorAxisScore][]): InnerCore {
  // 安定度 = ミラー間の一致度 (標準偏差の逆数)
  const axisStability: { axisId: TraitAxisKey; score: number; stability: number }[] = [];

  for (const [axisId, mirror] of entries) {
    const scores = [mirror.selfPortrait, mirror.footprint, mirror.shadowPlay]
      .filter((s): s is number => s !== undefined);
    if (scores.length < 2) continue;

    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const variance = scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length;
    const stability = 1 - Math.min(Math.sqrt(variance), 1);

    axisStability.push({
      axisId,
      score: integrateAxisScore(mirror),
      stability,
    });
  }

  // 最も安定している上位3軸 = 核心的な価値軸
  axisStability.sort((a, b) => b.stability - a.stability);
  const coreAxes = axisStability.slice(0, 3).map((a) => ({
    ...a,
    interpretation: generateCoreInterpretation(a.axisId, a.score, a.stability),
  }));

  const principle = generatePrinciple(coreAxes);
  const safetySource = generateSafetySource(coreAxes);
  const confidence = coreAxes.length > 0
    ? coreAxes.reduce((s, a) => s + a.stability, 0) / coreAxes.length
    : 0;

  return { coreAxes, principle, safetySource, confidence };
}

function generateCoreInterpretation(axisId: TraitAxisKey, score: number, stability: number): string {
  const axis = TRAIT_AXES.find((a) => a.id === axisId);
  if (!axis) return "";

  const direction = score > 0.2 ? axis.labelRight : score < -0.2 ? axis.labelLeft : "バランス型";
  const stabilityLabel = stability > 0.8 ? "非常に安定" : stability > 0.5 ? "やや安定" : "揺れがある";

  return `${direction}傾向（${stabilityLabel}）— 3つの鏡が一致して示す、あなたの確かな特性`;
}

function generatePrinciple(coreAxes: { axisId: TraitAxisKey; score: number }[]): string {
  if (coreAxes.length === 0) return "データを蓄積中です";

  const patterns: string[] = [];
  for (const axis of coreAxes) {
    const def = TRAIT_AXES.find((a) => a.id === axis.axisId);
    if (!def) continue;
    if (axis.score > 0.2) patterns.push(def.labelRight);
    else if (axis.score < -0.2) patterns.push(def.labelLeft);
  }

  if (patterns.length >= 2) {
    return `あなたの判断の核には「${patterns[0]}」と「${patterns[1]}」がある。これは状況が変わっても揺るがない部分。`;
  }
  if (patterns.length === 1) {
    return `あなたの判断の根底には「${patterns[0]}」への確かな志向がある。`;
  }
  return "多くの軸でバランスを保っている。状況に応じた柔軟さが核心にある。";
}

function generateSafetySource(coreAxes: { axisId: TraitAxisKey; score: number }[]): string {
  const safetyMap: Partial<Record<TraitAxisKey, { positive: string; negative: string }>> = {
    introvert_vs_extrovert: { negative: "一人の静かな時間", positive: "人とのつながり" },
    analytical_vs_intuitive: { negative: "論理的な納得", positive: "直感への信頼" },
    cautious_vs_bold: { negative: "十分な準備と確認", positive: "即座に行動できる環境" },
    independence_vs_harmony: { negative: "自分のペースで進むこと", positive: "周囲との調和" },
    perfectionist_vs_pragmatic: { negative: "細部まで整った状態", positive: "まず動ける環境" },
  };

  for (const axis of coreAxes) {
    const mapping = safetyMap[axis.axisId];
    if (mapping) {
      return axis.score < 0 ? mapping.negative : mapping.positive;
    }
  }
  return "自分のリズムが守られていること";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Protective Structure: 保護パターン検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectProtectiveStructures(entries: [TraitAxisKey, MirrorAxisScore][]): ProtectiveStructure[] {
  const structures: ProtectiveStructure[] = [];

  for (const [axisId, mirror] of entries) {
    const divergence = classifyDivergence(mirror);
    if (divergence === "all_aligned") continue;

    const sp = mirror.selfPortrait ?? 0;
    const fp = mirror.footprint ?? 0;
    const sh = mirror.shadowPlay ?? 0;

    // パターン1: 自画像 vs 行動のズレ → 理想と現実のギャップ
    if (divergence === "self_vs_footprint" && Math.abs(sp - fp) > 0.4) {
      if (sp > fp) {
        // 自己像が行動より「強い」→ 過補償
        structures.push({
          patternType: "overcompensation",
          protectedNeed: "弱さを見せたくないという欲求",
          manifestation: `この領域では、自分を実際より強く見せようとする傾向がある`,
          relatedDivergences: [{ axisId, divergenceType: divergence }],
          reflectionPrompt: "本当は少し不安を感じている部分はないだろうか？",
        });
      } else {
        // 自己像が行動より「弱い」→ マスク
        structures.push({
          patternType: "mask",
          protectedNeed: "期待に応えたくないという無意識の抵抗",
          manifestation: `自覚している以上に、実は行動ではこの傾向が出ている`,
          relatedDivergences: [{ axisId, divergenceType: divergence }],
          reflectionPrompt: "自分で思っているよりも、実はそちら側の人間かもしれない？",
        });
      }
    }

    // パターン2: 影絵で強く出る → 無意識の価値基準
    if (divergence === "self_vs_shadow" && Math.abs(sp - sh) > 0.4) {
      structures.push({
        patternType: "avoidance",
        protectedNeed: "認めたくない自分の一部",
        manifestation: `他者を評価する時、自覚とは違う基準で判断している`,
        relatedDivergences: [{ axisId, divergenceType: divergence }],
        reflectionPrompt: "他人のこの行動に反応するのは、自分の中のどんな部分に触れるからだろう？",
      });
    }
  }

  // 最大3つまで
  return structures.slice(0, 3);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Growth Vector: 成長方向
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function computeGrowthVector(
  entries: [TraitAxisKey, MirrorAxisScore][],
  archetype?: ArchetypeResult | null,
): GrowthVector {
  // 行動(Footprint)が自画像より先に進んでいる軸 = 成長方向
  const growthAxes: { axisId: TraitAxisKey; gap: number; direction: string }[] = [];

  for (const [axisId, mirror] of entries) {
    if (mirror.selfPortrait === undefined || mirror.footprint === undefined) continue;
    const gap = mirror.footprint - mirror.selfPortrait;
    if (Math.abs(gap) > 0.2) {
      const axis = TRAIT_AXES.find((a) => a.id === axisId);
      if (!axis) continue;
      growthAxes.push({
        axisId,
        gap,
        direction: gap > 0 ? axis.labelRight : axis.labelLeft,
      });
    }
  }

  growthAxes.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  const primary = growthAxes[0];

  if (!primary) {
    return {
      currentPosition: "安定期",
      direction: "現在の自己認識と行動が一致している状態",
      signs: ["行動と自覚にズレが少ない", "一貫したパターンが確立されている"],
      resistance: "変化への小さな不安",
      axes: [],
    };
  }

  const axis = TRAIT_AXES.find((a) => a.id === primary.axisId);
  return {
    currentPosition: `自覚では${primary.gap > 0 ? axis?.labelLeft : axis?.labelRight}寄りだが...`,
    direction: `実際の行動は「${primary.direction}」の方向へ自然に向かっている`,
    signs: [
      "日常の小さな選択に変化の兆しが見える",
      "以前より自然にその方向の行動が取れるようになっている",
    ],
    resistance: "「自分はそういう人間ではない」という自己像の固さ",
    axes: growthAxes.slice(0, 3).map((g) => g.axisId),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Blind Spot Hypothesis: 盲点仮説
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateBlindSpotHypotheses(
  entries: [TraitAxisKey, MirrorAxisScore][],
): BlindSpotHypothesis[] {
  const hypotheses: BlindSpotHypothesis[] = [];

  // 3つのミラーが全て異なる軸を探す
  const allDiverged = entries.filter(([, m]) => classifyDivergence(m) === "all_diverged");
  for (const [axisId, mirror] of allDiverged) {
    const axis = TRAIT_AXES.find((a) => a.id === axisId);
    if (!axis) continue;

    hypotheses.push({
      title: `${axis.labelLeft}—${axis.labelRight}の三重構造`,
      description: `この領域では、自分が語る自分・行動が示す自分・深層の価値観の3つが、それぞれ異なる方向を指しています。これは矛盾ではなく、この領域があなたの中で最も複雑で多層的な構造を持っていることを示しています。`,
      evidence: [{
        axisId,
        selfSays: mirror.selfPortrait ?? 0,
        behaviorShows: mirror.footprint ?? 0,
        projectionReveals: mirror.shadowPlay ?? 0,
      }],
      explorationQuestions: [
        "この領域で、自分の「本当の姿」はどれだと感じる？",
        "状況によって使い分けているとしたら、それはどんな時？",
        "この3つの自分のうち、最も心地よいのはどれ？",
      ],
      confidence: 0.6,
    });
  }

  // 自画像と影絵が大きくズレている軸 = 無意識の価値基準
  const selfShadowDiverged = entries.filter(([, m]) =>
    classifyDivergence(m) === "self_vs_shadow" &&
    m.selfPortrait !== undefined && m.shadowPlay !== undefined &&
    Math.abs(m.selfPortrait - m.shadowPlay) > 0.5,
  );

  for (const [axisId, mirror] of selfShadowDiverged.slice(0, 2)) {
    const axis = TRAIT_AXES.find((a) => a.id === axisId);
    if (!axis) continue;

    const spDir = (mirror.selfPortrait ?? 0) > 0 ? axis.labelRight : axis.labelLeft;
    const shDir = (mirror.shadowPlay ?? 0) > 0 ? axis.labelRight : axis.labelLeft;

    hypotheses.push({
      title: `無自覚の${shDir}志向`,
      description: `自覚では「${spDir}」と感じているが、他者への反応パターンを見ると「${shDir}」の価値基準が強く働いている。この隠れた価値基準が、対人関係での微妙な違和感の源かもしれません。`,
      evidence: [{
        axisId,
        selfSays: mirror.selfPortrait ?? 0,
        behaviorShows: mirror.footprint ?? 0,
        projectionReveals: mirror.shadowPlay ?? 0,
      }],
      explorationQuestions: [
        `「${shDir}」に対して、本当はどう感じている？`,
        "この傾向に気づいた時、驚くそれとも納得する？",
      ],
      confidence: 0.7,
    });
  }

  return hypotheses.slice(0, 3);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Empty result
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function emptyGenerativeCoreResult(): GenerativeCoreResult {
  return {
    innerCore: {
      coreAxes: [],
      principle: "三面鏡のデータを蓄積中です。観測を続けると、判断原理が見えてきます。",
      safetySource: "",
      confidence: 0,
    },
    protectiveStructures: [],
    growthVector: {
      currentPosition: "",
      direction: "",
      signs: [],
      resistance: "",
      axes: [],
    },
    blindSpots: [],
    generatedAt: new Date().toISOString(),
    dataCompleteness: 0,
  };
}
