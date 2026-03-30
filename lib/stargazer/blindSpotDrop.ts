// lib/stargazer/blindSpotDrop.ts
// Blind Spot Drop Engine v2 — 毎日1つ、自分では気づけない自分を届ける
//
// 自分が思ってる自分と、行動が示す自分のズレを見つけて、
// 「え、自分ってそうだったの？」という気づきを毎日1つ届ける。
//
// 核心思想:
// 人は自分の大事なところほど、自分では見えなくなる。
// このエンジンはそれを毎日1つだけ、言葉にして届ける。
// ありきたりな気づきじゃなく、その人にしか刺さらない一撃を。

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES, type TraitAxisDef } from "./traitAxes";
import { ARCHETYPE_DEFS, type ArchetypeDef } from "./archetypeTypes";
import type { DivergenceType } from "./threeMirrors";
import type { ContradictionMeaning } from "./contradictionMap";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Drop のトーン — 変動報酬としてスケジュール選択される */
export type DropTone = "warm" | "harsh" | "neutral" | "poetic" | "clinical";

/** Drop のカテゴリ — 盲点の種類 */
export type DropCategory =
  | "mirror_gap"        // 自画像と足跡/影絵の *具体的な* ズレ
  | "contradiction"     // 矛盾地図から検出された心理的矛盾
  | "pattern_blind"     // 揺らぎデータから検出された無自覚パターン
  | "shadow_leak"       // もうひとりのアーキタイプの特徴が行動に漏出
  | "defense_exposure"  // 防衛機制の検出（安定度＋回避パターン）
  | "stability_illusion" // 自分は安定だと思っている不安定な軸（veteran only）
  | "condition_blind";   // 状況依存の自己変化に無自覚（veteran only）

/** 三面鏡のズレデータ（具体的なズレ種類を含む） */
export interface MirrorDivergenceData {
  selfPortrait: number;
  footprint: number;
  shadowPlay: number;
  /** 3つのスコアの最大乖離 (0-1) */
  divergenceScore: number;
  /** ズレの種類 */
  divergenceType: DivergenceType;
}

/** Blind Spot Drop 本体 */
export interface BlindSpotDrop {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** 短く鋭いタイトル */
  title: string;
  /** インサイト本文 (2-3文) */
  body: string;
  /** トーン — 変動報酬 */
  tone: DropTone;
  /** 盲点のカテゴリ */
  category: DropCategory;
  /** 強度 (0-1) — 観測深度が深いほど強い Drop を許可 */
  intensity: number;
  /** このインサイトに寄与した軸 */
  sourceAxes: string[];
  /** 三面鏡のズレデータ (mirror_gap カテゴリ時) */
  mirrorDivergence?: MirrorDivergenceData;
  /** 深掘りへのティーザー */
  unlockHint: string;
  /** 配信時刻 (0-23) — 行動パターン+日付で決定 */
  deliveryHour: number;
  /** ユーザーの観測フェーズ */
  depthPhase: DepthPhase;
}

/** 観測フェーズ — 日数ではなくセッション数と深度で決定 */
export type DepthPhase =
  | "seedling"   // 観測 0-3回: 種まき期。やさしく、好奇心を育てる
  | "sprout"     // 観測 4-14回: 発芽期。最初の盲点を提示
  | "growth"     // 観測 15-49回: 成長期。カテゴリを広げる
  | "deep"       // 観測 50-89回: 深層期。鋭い指摘を許可
  | "veteran";   // 観測 90回+: 熟練期。全カテゴリ解放、メタ観測

/** 揺らぎデータ（fluctuationEngine から受け取る） */
export interface FluctuationInput {
  axisId: string;
  /** 安定度 0-1 (0=流動的, 1=岩盤) */
  stability: number;
  /** 中心値 */
  center: number;
  /** 観測レンジ [min, max] */
  range: [number, number];
  /** 条件シフト */
  conditions: Array<{
    condition: string;
    conditionLabel: string;
    shift: number;
  }>;
  /** 月あたりの変化トレンド */
  trend: number;
  trendLabel: string | null;
}

/** 矛盾地図エントリ（contradictionMap から受け取る） */
export interface ContradictionInput {
  axisId: string;
  divergenceType: DivergenceType;
  magnitude: number;
  meaning: ContradictionMeaning;
  scores: {
    selfPortrait?: number;
    footprint?: number;
    shadowPlay?: number;
  };
  insight: string;
}

/** Drop 生成への入力 */
export interface BlindSpotDropInput {
  userId: string;
  /** 現在の軸スコア (統合済み) */
  axisScores: Record<string, number>;
  /** 三面鏡スコア (各軸: self, footprint, shadow) */
  mirrorScores?: Record<
    string,
    { self: number; footprint: number; shadow: number }
  >;
  /** 矛盾地図エントリ（心理的意味を含む） */
  contradictions?: ContradictionInput[];
  /** 揺らぎ分布データ */
  fluctuations?: FluctuationInput[];
  /** 直近7日の Drop カテゴリ (繰り返し防止) */
  recentDropCategories?: DropCategory[];
  /** 直近7日の Drop トーン (変動報酬制御) */
  recentDropTones?: DropTone[];
  /** 観測深度 (0-1) — ユーザーをどれだけ理解しているか */
  observationDepth: number;
  /** 総観測セッション数 */
  totalSessions: number;
  /** 3文字アーキタイプコード e.g. "PEA" */
  archetypeCode: string;
  /** ユーザーの主な活動時間帯 (0-23の配列、最頻3つ) */
  activeHours?: number[];
  /** 指定日付 (テスト用。省略で today) */
  dateOverride?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface MirrorGap {
  axisId: string;
  selfScore: number;
  footprintScore: number;
  shadowScore: number;
  /** 最大乖離 */
  divergence: number;
  /** 具体的なズレの種類 */
  divergenceType: DivergenceType;
  axisLabel: string;
  selfLabel: string;
  /** ズレの「相手」側のラベル (footprint or shadow) */
  counterLabel: string;
  /** ズレの心理的意味の要約 */
  psychMeaning: string;
}

interface DropContent {
  title: string;
  body: string;
  unlockHint: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hash Utility
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 文字列を非負整数にハッシュする (日付シード等に使用) */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** 軸IDから定義を引く */
function findAxis(axisId: string): TraitAxisDef | undefined {
  return TRAIT_AXES.find((a: TraitAxisDef) => a.id === axisId);
}

/** スコアから方向ラベルを得る */
function directionLabel(axisDef: TraitAxisDef, score: number): string {
  return score < 0 ? axisDef.labelLeft : axisDef.labelRight;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 0. Depth Phase Resolution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function resolveDepthPhase(totalSessions: number, observationDepth: number): DepthPhase {
  // セッション数を主軸に、observationDepth で補正
  const effective = totalSessions + observationDepth * 10;
  if (effective < 4) return "seedling";
  if (effective < 15) return "sprout";
  if (effective < 50) return "growth";
  if (effective < 90) return "deep";
  return "veteran";
}

/** フェーズに応じた許可カテゴリ */
function allowedCategories(phase: DepthPhase): Set<DropCategory> {
  const s = (cats: DropCategory[]) => new Set<DropCategory>(cats);
  switch (phase) {
    case "seedling":
      // 種まき期は mirror_gap のみ（データが少なくても1つのズレは見せられる）
      return s(["mirror_gap"]);
    case "sprout":
      return s(["mirror_gap", "contradiction", "pattern_blind"]);
    case "growth":
      return s(["mirror_gap", "contradiction", "pattern_blind", "shadow_leak", "defense_exposure"]);
    case "deep":
      return s(["mirror_gap", "contradiction", "pattern_blind", "shadow_leak", "defense_exposure", "stability_illusion"]);
    case "veteran":
      return s(["mirror_gap", "contradiction", "pattern_blind", "shadow_leak", "defense_exposure", "stability_illusion", "condition_blind"]);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Mirror Gap Detection (v2 — preserves divergence type)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 三面鏡の *具体的なズレ種類* を保持したまま盲点を検出する。
 * self vs footprint, self vs shadow, footprint vs shadow を個別に評価し、
 * 最大のズレを持つペアとその心理的意味を返す。
 */
export function detectMirrorGaps(
  mirrorScores: Record<
    string,
    { self: number; footprint: number; shadow: number }
  >,
  threshold = 0.25,
): MirrorGap[] {
  const gaps: MirrorGap[] = [];

  for (const [axisId, scores] of Object.entries(mirrorScores)) {
    const axisDef = findAxis(axisId);
    if (!axisDef) continue;

    // 3つの独立したズレを個別に計算
    const selfVsFootprint = Math.abs(scores.self - scores.footprint);
    const selfVsShadow = Math.abs(scores.self - scores.shadow);
    const footprintVsShadow = Math.abs(scores.footprint - scores.shadow);

    // 最大ズレのペアを特定
    const maxDiv = Math.max(selfVsFootprint, selfVsShadow, footprintVsShadow);
    if (maxDiv < threshold) continue;

    let divergenceType: DivergenceType;
    let counterScore: number;
    let psychMeaning: string;

    if (selfVsFootprint >= selfVsShadow && selfVsFootprint >= footprintVsShadow) {
      divergenceType = "self_vs_footprint";
      counterScore = scores.footprint;
      psychMeaning = "言ってることと、やってることが合ってない";
    } else if (selfVsShadow >= footprintVsShadow) {
      divergenceType = "self_vs_shadow";
      counterScore = scores.shadow;
      psychMeaning = "自分で思ってる自分と、本当の気持ちが違う";
    } else {
      divergenceType = "footprint_vs_shadow";
      counterScore = scores.shadow;
      psychMeaning = "普段の行動と、心の奥で望んでることが違う";
    }

    // 3つ全てバラバラの場合
    const allDiverged = selfVsFootprint > threshold && selfVsShadow > threshold && footprintVsShadow > threshold;
    if (allDiverged) {
      divergenceType = "all_diverged";
      psychMeaning = "3つの視点がバラバラ。この部分は自分の中でも複雑に絡み合ってる";
    }

    const counterAxisDef = findAxis(axisId)!;

    gaps.push({
      axisId,
      selfScore: scores.self,
      footprintScore: scores.footprint,
      shadowScore: scores.shadow,
      divergence: maxDiv,
      divergenceType,
      axisLabel: `${axisDef.labelLeft} / ${axisDef.labelRight}`,
      selfLabel: directionLabel(axisDef, scores.self),
      counterLabel: divergenceType === "footprint_vs_shadow"
        ? `${directionLabel(counterAxisDef, scores.footprint)} (行動) vs ${directionLabel(counterAxisDef, scores.shadow)} (深層)`
        : directionLabel(counterAxisDef, counterScore),
      psychMeaning,
    });
  }

  return gaps.sort((a, b) => b.divergence - a.divergence);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Category Selection (v2 — data-driven priority with phase gating)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function selectDropCategory(
  gaps: MirrorGap[],
  contradictions: ContradictionInput[],
  fluctuations: FluctuationInput[],
  archetypeDef: ArchetypeDef | null,
  recentCategories: DropCategory[],
  phase: DepthPhase,
  seed: number,
): DropCategory {
  const allowed = allowedCategories(phase);
  const candidates: { category: DropCategory; priority: number }[] = [];

  // mirror_gap: 優先度はズレの大きさに比例
  if (gaps.length > 0 && allowed.has("mirror_gap")) {
    candidates.push({ category: "mirror_gap", priority: 3 + gaps[0].divergence * 2 });
  }

  // contradiction: 心理的意味が深いほど高優先
  if (contradictions.length > 0 && allowed.has("contradiction")) {
    const deepMeanings: ContradictionMeaning[] = ["unconscious_value", "protective_pattern", "adaptation_mask"];
    const hasDeep = contradictions.some(c => deepMeanings.includes(c.meaning));
    candidates.push({ category: "contradiction", priority: hasDeep ? 3.5 : 2 });
  }

  // pattern_blind: 揺らぎデータがある場合のみ（fabrication を防ぐ）
  if (fluctuations && fluctuations.length > 0 && allowed.has("pattern_blind")) {
    const hasExtreme = fluctuations.some(f => Math.abs(f.center) > 0.5 && f.stability > 0.6);
    if (hasExtreme) {
      candidates.push({ category: "pattern_blind", priority: 2 });
    }
  }

  // shadow_leak: アーキタイプ定義がある場合
  if (archetypeDef && allowed.has("shadow_leak")) {
    candidates.push({ category: "shadow_leak", priority: 2.5 });
  }

  // defense_exposure: 曖昧な軸 + 安定度が高い（意図的回避の証拠）
  if (allowed.has("defense_exposure")) {
    const ambiguousStable = fluctuations
      ? fluctuations.filter(f => Math.abs(f.center) < 0.15 && f.stability > 0.5)
      : Object.entries(gaps.length > 0 ? {} : {}).length > 0
        ? [] // fallback: axis scores based
        : [];
    const hasAmbiguousFromScores = Object.values(
      gaps.reduce<Record<string, number>>((acc, g) => { acc[g.axisId] = g.selfScore; return acc; }, {})
    ).some(v => Math.abs(v) < 0.15);

    if (ambiguousStable.length > 0 || hasAmbiguousFromScores) {
      candidates.push({ category: "defense_exposure", priority: 1.5 });
    }
  }

  // stability_illusion: 自分では安定だと思っているが揺らぎが大きい軸
  if (fluctuations && fluctuations.length > 0 && allowed.has("stability_illusion")) {
    const illusions = fluctuations.filter(f => {
      const range = f.range[1] - f.range[0];
      return f.stability < 0.3 && range > 0.6; // 実は不安定
    });
    if (illusions.length > 0) {
      candidates.push({ category: "stability_illusion", priority: 3 });
    }
  }

  // condition_blind: 状況によって大きく変わるが無自覚
  if (fluctuations && fluctuations.length > 0 && allowed.has("condition_blind")) {
    const conditioned = fluctuations.filter(f =>
      f.conditions.some(c => Math.abs(c.shift) > 0.3)
    );
    if (conditioned.length > 0) {
      candidates.push({ category: "condition_blind", priority: 2.5 });
    }
  }

  // フォールバック: seedling で mirror data もない場合
  if (candidates.length === 0) {
    return "mirror_gap"; // fallback content が処理する
  }

  // 直近で使用されたカテゴリの優先度を大幅に下げる（繰り返し防止）
  const recentSet = new Set(recentCategories);
  const adjusted = candidates.map((c) => ({
    ...c,
    priority: recentSet.has(c.category)
      ? Math.max(c.priority - 3, 0.1)
      : c.priority,
  }));

  // 優先度でソートし、上位グループからシードで選択
  adjusted.sort((a, b) => b.priority - a.priority);
  const maxPriority = adjusted[0].priority;
  // 上位20%以内を候補にする（厳密な同点だけだと選択肢が狭すぎる）
  const topTier = adjusted.filter((c) => c.priority >= maxPriority * 0.8);

  return topTier[seed % topTier.length].category;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Tone Selection (v2 — non-linear variable reward)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Drop のトーンを選択する。
 *
 * 真の変動報酬: 直近のトーン履歴を見て *反転確率* を上げる。
 * 3日連続 warm なら harsh の確率が急上昇する。
 * さらに稀少トーン (poetic/clinical) をランダムに差し込む。
 *
 * warm    — 受容的、寄り添い
 * harsh   — 容赦ない指摘
 * neutral — データ的、感情を排した観測報告
 * poetic  — 詩的、比喩的、余韻を残す（レア）
 * clinical — 診断書のような冷徹な分析（レア）
 */
export function selectDropTone(
  seed: number,
  phase: DepthPhase,
  recentTones: DropTone[] = [],
): DropTone {
  // seedling は必ず warm（初期体験を壊さない）
  if (phase === "seedling") return "warm";

  // 直近トーンの連続を検出
  const lastThree = recentTones.slice(-3);
  const warmStreak = lastThree.filter(t => t === "warm").length;
  const harshStreak = lastThree.filter(t => t === "harsh").length;

  // 基本重み (100分率)
  let warmW = 35;
  let harshW = 20;
  let neutralW = 25;
  let poeticW = 12;
  let clinicalW = 8;

  // フェーズ補正
  if (phase === "sprout") {
    warmW += 15; harshW -= 10; poeticW -= 5;
  } else if (phase === "deep" || phase === "veteran") {
    harshW += 10; clinicalW += 5; warmW -= 15;
  }

  // 反転圧力: 同じトーンが続くほど他のトーンの確率が上がる
  if (warmStreak >= 2) { warmW -= 20; harshW += 10; poeticW += 10; }
  if (warmStreak >= 3) { warmW = 5; harshW += 15; }
  if (harshStreak >= 2) { harshW -= 15; warmW += 10; poeticW += 5; }

  // 正規化
  const total = Math.max(warmW + harshW + neutralW + poeticW + clinicalW, 1);
  const roll = seed % total;

  let acc = 0;
  acc += Math.max(warmW, 0); if (roll < acc) return "warm";
  acc += Math.max(harshW, 0); if (roll < acc) return "harsh";
  acc += Math.max(neutralW, 0); if (roll < acc) return "neutral";
  acc += Math.max(poeticW, 0); if (roll < acc) return "poetic";
  return "clinical";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Content Generation (v2 — deep templates with divergence-type awareness)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ContentGenerationData {
  gaps: MirrorGap[];
  contradictions: ContradictionInput[];
  fluctuations: FluctuationInput[];
  axisScores: Record<string, number>;
  archetypeDef: ArchetypeDef | null;
  observationDepth: number;
  phase: DepthPhase;
  seed: number;
}

export function generateDropContent(
  category: DropCategory,
  tone: DropTone,
  data: ContentGenerationData,
): DropContent {
  switch (category) {
    case "mirror_gap":
      return genMirrorGap(tone, data);
    case "contradiction":
      return genContradiction(tone, data);
    case "pattern_blind":
      return genPatternBlind(tone, data);
    case "shadow_leak":
      return genShadowLeak(tone, data);
    case "defense_exposure":
      return genDefenseExposure(tone, data);
    case "stability_illusion":
      return genStabilityIllusion(tone, data);
    case "condition_blind":
      return genConditionBlind(tone, data);
  }
}

// ── Mirror Gap Content (v2) ──

function genMirrorGap(tone: DropTone, data: ContentGenerationData): DropContent {
  const gap = data.gaps[data.seed % Math.max(data.gaps.length, 1)];
  if (!gap) return fallbackContent(tone, data.phase);

  // ズレの種類に応じた精密なテンプレート
  const byType: Record<DivergenceType, Record<DropTone, (g: MirrorGap) => DropContent>> = {
    self_vs_footprint: {
      warm: (g) => ({
        title: "言葉と足跡のあいだ",
        body: `あなたは自分を「${g.selfLabel}」と語る。けれど、あなたの足跡は「${g.counterLabel}」の方角を指している。この食い違いは嘘ではない。あなたがまだ認めていない自分の一面が、行動だけに正直に現れているのだ。`,
        unlockHint: `「${g.selfLabel}」でありたい理由——そこに、手放せない物語がある`,
      }),
      harsh: (g) => ({
        title: "口が語る自分、手が語る自分",
        body: `「${g.selfLabel}」——あなたが繰り返し主張するその像と、実際の行動記録が示す「${g.counterLabel}」の間には${(g.divergence * 100).toFixed(0)}%の断裂がある。どちらが本当のあなたかは明白だ。行動は嘘をつけない。`,
        unlockHint: `この自己像を維持するために、あなたが無意識に払っているコスト`,
      }),
      neutral: (g) => ({
        title: "自己申告/行動乖離",
        body: `${g.axisLabel}軸において、自己申告値と行動データの間に有意な乖離（${(g.divergence * 100).toFixed(0)}%）を検出。自己申告は「${g.selfLabel}」方向、行動パターンは「${g.counterLabel}」方向。認知的不協和の典型的パターンと一致。`,
        unlockHint: `この乖離が最大化する具体的状況と、その心理的トリガー`,
      }),
      poetic: (g) => ({
        title: "鏡の裏側",
        body: `あなたが鏡に映したい顔は「${g.selfLabel}」。でも鏡の裏側に回り込むと、そこには「${g.counterLabel}」のもうひとりの自分が静かに座っている。もうひとりの自分は恥ずかしいものではない。光が強い場所にだけ、深いもうひとりが生まれる。`,
        unlockHint: `そのもうひとりが初めて生まれた日——記憶の深層に鍵がある`,
      }),
      clinical: (g) => ({
        title: "認知的不協和レポート",
        body: `被験者は${g.axisLabel}領域において自己申告「${g.selfLabel}」(${g.selfScore.toFixed(2)})に対し、行動指標「${g.counterLabel}」(${g.footprintScore.toFixed(2)})を示す。乖離率${(g.divergence * 100).toFixed(0)}%。この水準の不一致は、自己概念の防衛的維持を示唆する。`,
        unlockHint: `この防衛が形成された時期と、維持メカニズムの構造分析`,
      }),
    },
    self_vs_shadow: {
      warm: (g) => ({
        title: "あなたが他者に見ているもの",
        body: `自分では「${g.selfLabel}」だと信じている。だが、他者の行動に対するあなたの反応は、「${g.counterLabel}」への深い共鳴を示している。他人の中に強く反応するものは、自分の中の認めていない断片だ。`,
        unlockHint: `最近、誰かの行動に異常に強く反応した瞬間を思い出してほしい`,
      }),
      harsh: (g) => ({
        title: "知らないうちに相手に押しつけてるもの",
        body: `あなたが他人を見て感じる「引っかかり」の正体を教えよう。自分は「${g.selfLabel}」だと思い込んでるけど、データは「${g.counterLabel}」を求めてることを示してる。誰かにイラッとする時、それは自分自身に対してイラッとしてるんだ。`,
        unlockHint: `あなたが一番批判しがちな人の特徴、それは自分の中にあるもの`,
      }),
      neutral: (g) => ({
        title: "他人への反応パターン分析",
        body: `${g.axisLabel}軸：自分では「${g.selfLabel}」と思ってるけど、他人への反応は「${g.counterLabel}」を示してる。ズレは${(g.divergence * 100).toFixed(0)}%。他人にどう反応するかって、自分の本音が一番出やすいところ。`,
        unlockHint: `あなたの反応パターンからわかる「自分でも気づいてない理想の姿」`,
      }),
      poetic: (g) => ({
        title: "他人の中に映る、もう一人の自分",
        body: `他人を見るとき、あなたはいつも「${g.selfLabel}」の自分を探してる。でも実際に映ってるのは「${g.counterLabel}」の方。他人は正直な鏡なんだ。自分の見え方を変えてるのは、自分自身の方。`,
        unlockHint: `この「見え方の書き換え」が始まったきっかけの記憶`,
      }),
      clinical: (g) => ({
        title: "自己イメージの補正レポート",
        body: `自分では「${g.selfLabel}」(${g.selfScore.toFixed(2)})と思ってるけど、他人への反応は逆方向の「${g.counterLabel}」(${g.shadowScore.toFixed(2)})を示してる。ズレ${(g.divergence * 100).toFixed(0)}%。自分のイメージを無意識に守り続けてる状態。`,
        unlockHint: `この「イメージを守る仕組み」がどう変化してきたか`,
      }),
    },
    footprint_vs_shadow: {
      warm: (g) => ({
        title: "適応と本心のあいだ",
        body: `あなたの日常の行動は${g.counterLabel.split("(")[0]?.trim() ?? g.counterLabel}を選んでいる。でも、無意識の反応はまったく別の方向を指している。今の環境に合わせて、本当の自分を少しだけ隠しているのかもしれない。`,
        unlockHint: `環境が変わった時、どちらの自分が出てくるか`,
      }),
      harsh: (g) => ({
        title: "仮面と素顔の距離",
        body: `行動が示す「適応した自分」と、投影が暴く「素の自分」が全く違う方向を向いている。あなたは毎日、自分ではない誰かを演じている。その演技の疲れに、あなたはまだ気づいていない。`,
        unlockHint: `この演技を続けることで、あなたが失い続けているもの`,
      }),
      neutral: (g) => ({
        title: "行動/投影乖離",
        body: `${g.axisLabel}軸において、行動パターン(${g.footprintScore.toFixed(2)})と投影反応(${g.shadowScore.toFixed(2)})の間に乖離を検出。これは環境適応行動と深層志向の不一致を示し、適応コストが発生している可能性がある。`,
        unlockHint: `適応コストの定量評価と、解消シナリオ`,
      }),
      poetic: (g) => ({
        title: "昼の顔、夜の顔",
        body: `昼間のあなたは世界に合わせて形を変える水のよう。でも夜、一人になった時に浮かぶ顔は全く別人だ。どちらも本物のあなた。ただ、夜の顔にはまだ名前がない。`,
        unlockHint: `夜の顔に名前をつけるとしたら——その名が鍵になる`,
      }),
      clinical: (g) => ({
        title: "適応/深層不一致レポート",
        body: `行動データ(${g.footprintScore.toFixed(2)})と投影データ(${g.shadowScore.toFixed(2)})の方向が不一致。環境適応のための行動修正が無意識下で行われており、本来の志向性が抑制されている。抑制コスト：推定${(g.divergence * 100).toFixed(0)}%。`,
        unlockHint: `抑制が限界に達する条件と、その際の行動予測`,
      }),
    },
    all_diverged: {
      warm: (g) => ({
        title: "三つの鏡が映す、三人のあなた",
        body: `自分が語る自分、行動が示す自分、他者の中に映る自分。この三人が${g.axisLabel}の領域でバラバラの方向を向いている。矛盾ではない。あなたはそれだけ複雑で、一つの言葉では捕まえきれない存在だということ。`,
        unlockHint: `三人の自分が合流する瞬間——それがあなたの「真ん中」だ`,
      }),
      harsh: (g) => ({
        title: "分裂した自画像",
        body: `${g.axisLabel}——この領域で、あなたの3つの観測源が完全に異なる方向を示している。あなたは自分が何者か、この領域ではまだ決められていない。あるいは、決めることを恐れている。`,
        unlockHint: `この分裂を維持し続ける心理的な利得——「決めない」ことの報酬`,
      }),
      neutral: (g) => ({
        title: "三面完全乖離",
        body: `${g.axisLabel}軸：自画像(${g.selfScore.toFixed(2)})、足跡(${g.footprintScore.toFixed(2)})、影絵(${g.shadowScore.toFixed(2)})の三値が有意に乖離。この軸はユーザーの内的構造が最も複雑な領域であり、単一スコアでの表現が不適切な可能性がある。`,
        unlockHint: `三面分裂を持つ他のユーザーとの比較パターン分析`,
      }),
      poetic: (g) => ({
        title: "プリズム",
        body: `あなたを一つの光だとしたら、${g.axisLabel}の領域でプリズムに当たり、三色に分かれている。どの色が「本当の」光かと問うのは愚問だ。三色すべてが、分かれる前のあなただ。`,
        unlockHint: `三色が再び一つに重なるとしたら、その条件は何か`,
      }),
      clinical: (g) => ({
        title: "三面鏡完全乖離診断",
        body: `${g.axisLabel}軸で三面鏡の完全乖離を検出。自画像:${g.selfScore.toFixed(2)} / 足跡:${g.footprintScore.toFixed(2)} / 影絵:${g.shadowScore.toFixed(2)}。各ミラー間の相互矛盾は、この領域におけるアイデンティティの未統合状態を示す。`,
        unlockHint: `未統合状態の構造図と、統合に向けた仮説`,
      }),
    },
    all_aligned: {
      warm: (g) => ({
        title: "稀有な一致",
        body: `${g.axisLabel}の領域で、三つの鏡が同じ方向を指している。これは珍しい。あなたはこの領域では、自分自身と深く和解している。`,
        unlockHint: `この一致がいつから始まったのか——その起源に意味がある`,
      }),
      harsh: (g) => ({
        title: "一致という盲点",
        body: `三つの鏡が一致している。それは美しいが、一致しているがゆえに見えなくなるものもある。この領域の「当たり前」が、他者にとっては「当たり前」ではないことに、あなたは気づいているか。`,
        unlockHint: `この一致が他者との衝突を生む場面`,
      }),
      neutral: (g) => ({
        title: "三面一致確認",
        body: `${g.axisLabel}軸で三面鏡が高い一致を示す（乖離${(g.divergence * 100).toFixed(0)}%）。この領域の自己認識は正確。ただし、一致＝盲点がないとは限らない。`,
        unlockHint: `この一致が持つ「見えない代償」の分析`,
      }),
      poetic: (g) => ({
        title: "重なる三枚の影",
        body: `三枚の鏡に映るもうひとりが、ぴたりと重なっている。それは稀有な調和。けれど、完璧に重なったもうひとりは、最も深い盲点を作ることも忘れてはいけない。`,
        unlockHint: `この調和の裏側にある、あなたが手放したもの`,
      }),
      clinical: (g) => ({
        title: "三面一致レポート",
        body: `${g.axisLabel}軸：三面鏡スコアの一致度が高い（乖離${(g.divergence * 100).toFixed(0)}%）。自己概念の正確性は高いが、この一致自体が防衛的固着の可能性も排除できない。`,
        unlockHint: `一致の安定性推移と、固着リスクの評価`,
      }),
    },
  };

  const typeTemplates = byType[gap.divergenceType] ?? byType.self_vs_footprint;
  const template = typeTemplates[tone] ?? typeTemplates.warm;
  return template(gap);
}

// ── Contradiction Content (v2 — uses psychological meaning) ──

function genContradiction(tone: DropTone, data: ContentGenerationData): DropContent {
  const c = data.contradictions[data.seed % Math.max(data.contradictions.length, 1)];
  if (!c) return fallbackContent(tone, data.phase);

  const axisDef = findAxis(c.axisId);
  if (!axisDef) return fallbackContent(tone, data.phase);

  // 心理的意味に応じたテンプレート
  const byMeaning: Record<ContradictionMeaning, Record<DropTone, () => DropContent>> = {
    ideal_gap: {
      warm: () => ({
        title: "理想という鎧",
        body: `「${axisDef.labelRight}」でありたいという強い願いが、あなたの自画像を歪めている。行動データが示す今のあなたは「${axisDef.labelLeft}」寄りだ。理想と現実のあいだにいるあなたは、どちらも本物。ただ、理想だけが自分だと思い込むと、現実の自分が窒息する。`,
        unlockHint: `この理想像が生まれた原体験——誰の期待を生きているのか`,
      }),
      harsh: () => ({
        title: "自分に嘘をついている領域",
        body: `「${axisDef.labelRight}」だと自分に言い聞かせているが、あなたの行動は「${axisDef.labelLeft}」だ。これは成長の途上ではない。自己欺瞞だ。理想の自分を演じるエネルギーを、本当の自分を受け入れる勇気に回せ。`,
        unlockHint: `この嘘がばれた時——あなたが最も恐れているシナリオ`,
      }),
      neutral: () => ({
        title: "理想/現実ギャップ検出",
        body: `${axisDef.labelLeft}/${axisDef.labelRight}軸において、自己申告と行動データの方向が不一致。自己申告は理想方向へのバイアスを含む可能性が高い。乖離度${(c.magnitude * 100).toFixed(0)}%。`,
        unlockHint: `理想バイアスの強度推移と、現実側スコアの安定性`,
      }),
      poetic: () => ({
        title: "描き直せない肖像画",
        body: `あなたは毎朝、鏡の前で肖像画を描き直す。「${axisDef.labelRight}」の方向へ、少しだけ。でも夕方には絵の具が剥がれて、「${axisDef.labelLeft}」の素顔が覗く。その素顔は、案外悪くない顔をしている。`,
        unlockHint: `素顔のまま過ごせた最後の記憶`,
      }),
      clinical: () => ({
        title: "理想自己バイアス報告",
        body: `自己概念の理想方向バイアスを検出。${axisDef.labelLeft}/${axisDef.labelRight}軸：自己申告は理想方向へ${(c.magnitude * 100).toFixed(0)}%偏位。行動指標との不一致は、自己概念の防衛的修正を示唆。`,
        unlockHint: `バイアスの形成過程と、維持コストの定量評価`,
      }),
    },
    adaptation_mask: {
      warm: () => ({
        title: "もう一つの顔",
        body: `${axisDef.labelLeft}/${axisDef.labelRight}の領域で、日常の行動と深層の価値観が異なる方向を向いている。今の環境に馴染むために、あなたは無意識にもう一つの顔を使い分けている。それは賢さだ。でも、仮面をつけたまま眠ると、朝には素顔を忘れる。`,
        unlockHint: `仮面を外せる場所は、今の生活に存在するか`,
      }),
      harsh: () => ({
        title: "適応のコスト",
        body: `あなたは${axisDef.labelLeft}/${axisDef.labelRight}の領域で、環境に合わせた仮面を被っている。それは生存戦略として有効だが、代償を払い続けている。仮面と素顔のズレが${(c.magnitude * 100).toFixed(0)}%。この乖離は持続可能か。`,
        unlockHint: `この適応が破綻するシナリオ——そしてその時あなたが見せる素顔`,
      }),
      neutral: () => ({
        title: "環境適応マスク検出",
        body: `${axisDef.labelLeft}/${axisDef.labelRight}軸で行動パターンと投影反応に乖離を検出。環境適応のための行動修正が無意識に行われている。適応コスト推定：中〜高。`,
        unlockHint: `適応マスクの厚さと、マスク下の本来志向の安定性`,
      }),
      poetic: () => ({
        title: "借り物の笑顔",
        body: `毎朝、クローゼットから「今日の自分」を選ぶように、あなたは${axisDef.labelLeft}/${axisDef.labelRight}の仮面を付け替える。でも、夜中にふと目が覚めた時、仮面は枕元に落ちていて——そこにいるのは、誰だ。`,
        unlockHint: `仮面なしの自分に、あなた自身が耐えられるかどうか`,
      }),
      clinical: () => ({
        title: "適応的自己修正レポート",
        body: `行動データと投影データの不一致パターンから、環境適応のための自己修正行動を検出。${axisDef.labelLeft}/${axisDef.labelRight}軸。修正度${(c.magnitude * 100).toFixed(0)}%。長期的な自己概念への影響リスクあり。`,
        unlockHint: `適応行動の固着化リスクと、可逆性の評価`,
      }),
    },
    unconscious_value: {
      warm: () => ({
        title: "知らない自分の価値観",
        body: `${axisDef.labelLeft}/${axisDef.labelRight}の領域で、自分では気づいていない価値基準が動いている。他者の行動に対するあなたの反応パターンが、それを映し出している。無自覚の価値観は弱さではない。まだ言語化されていない知恵だ。`,
        unlockHint: `この無自覚な価値観が、あなたの人間関係を静かに支配している`,
      }),
      harsh: () => ({
        title: "認めていない欲求",
        body: `あなたが${axisDef.labelLeft}/${axisDef.labelRight}について意識的に信じていることと、無意識が求めていることが食い違っている。他者を見て感じる苛立ちや羨望の正体は、抑圧された自分自身の欲求だ。`,
        unlockHint: `この欲求を認めた時に崩れるもの——それが恐怖の正体`,
      }),
      neutral: () => ({
        title: "無自覚的価値基準検出",
        body: `自己申告と投影反応の不一致から、${axisDef.labelLeft}/${axisDef.labelRight}領域に無自覚な価値基準の存在を推定。投影データはより深層の志向を反映するため、自己申告よりも高い信頼度で深層構造を示す。`,
        unlockHint: `無自覚な価値基準の行動への影響経路の詳細分析`,
      }),
      poetic: () => ({
        title: "海底の潮流",
        body: `波の上からは見えないが、海底には強い潮流が流れている。${axisDef.labelLeft}と${axisDef.labelRight}のあいだで、あなたの表層と深層は別の方向に流れている。波の形を決めているのは、見えない潮流の方だ。`,
        unlockHint: `潮流の向きが変わった瞬間——人生の転機と重なるはず`,
      }),
      clinical: () => ({
        title: "深層価値構造レポート",
        body: `投影データから推定された深層価値基準が、自己申告の表層価値と不一致。${axisDef.labelLeft}/${axisDef.labelRight}軸。不一致度${(c.magnitude * 100).toFixed(0)}%。深層価値は行動決定に対してより強い影響力を持つと推定。`,
        unlockHint: `深層/表層の影響力比率と、統合への仮説`,
      }),
    },
    contextual_self: {
      warm: () => ({
        title: "場所で変わるあなた",
        body: `${axisDef.labelLeft}/${axisDef.labelRight}の領域で、3つの観測が異なる方向を向いている。あなたは場面によって異なる自分を生きている。それは不安定ではなく、豊かさだ。ただし、「どれが本当の自分か」という問いにはいつか向き合う必要がある。`,
        unlockHint: `3つの自分のうち、最もエネルギーが軽い自分はどれか`,
      }),
      harsh: () => ({
        title: "カメレオンの代償",
        body: `状況に応じて自在に変化する。便利だ。だが${axisDef.labelLeft}/${axisDef.labelRight}の領域で、あなたの3つの鏡は完全にバラバラだ。適応力が高すぎて、「何にでもなれる」は「何者でもない」と紙一重になっている。`,
        unlockHint: `一人きりの部屋で、カメレオンは何色になるか`,
      }),
      neutral: () => ({
        title: "状況依存型自己構造",
        body: `${axisDef.labelLeft}/${axisDef.labelRight}軸で3つの観測源が異なる方向を示す。状況依存型の自己構造と判定。各観測源のスコア差から、最低3つの自己モードが推定される。`,
        unlockHint: `自己モード間の切り替えトリガーと、各モードの安定性`,
      }),
      poetic: () => ({
        title: "三つの部屋",
        body: `あなたの中に、三つの部屋がある。一つは来客用に綺麗に整えた部屋。一つは誰にも見せない散らかった部屋。もう一つは、あなた自身がまだ扉を開けたことのない部屋。${axisDef.labelLeft}/${axisDef.labelRight}の鍵が、その扉を開ける。`,
        unlockHint: `三つ目の部屋に入る準備はできているか`,
      }),
      clinical: () => ({
        title: "多面的自己構造診断",
        body: `${axisDef.labelLeft}/${axisDef.labelRight}軸で三面鏡の完全乖離を検出。状況依存的な自己呈示パターンと判定。乖離度${(c.magnitude * 100).toFixed(0)}%。自己統合度の低さは心理的コストを伴う可能性がある。`,
        unlockHint: `統合度スコアの推移と、統合に向けた介入仮説`,
      }),
    },
    growth_edge: {
      warm: () => ({
        title: "変わりかけている場所",
        body: `${axisDef.labelLeft}/${axisDef.labelRight}の領域で、あなたは今まさに変化の途上にいる。古い自分と新しい自分が混在するこの不安定さは、成長の証拠だ。居心地が悪いのは、正しい方向に進んでいるから。`,
        unlockHint: `この変化の先に待っている自分の姿`,
      }),
      harsh: () => ({
        title: "中途半端な脱皮",
        body: `古い皮を脱ぎかけて止まっている。${axisDef.labelLeft}/${axisDef.labelRight}の領域で、あなたは変化を始めたが完遂していない。中途半端が一番痛い。脱ぐか、戻るか、決めろ。`,
        unlockHint: `この脱皮を完遂するために、手放す必要があるもの`,
      }),
      neutral: () => ({
        title: "変化過渡期検出",
        body: `${axisDef.labelLeft}/${axisDef.labelRight}軸でスコアの方向転換を検出。現在は過渡期であり、スコアの安定化には追加の観測が必要。変化の方向性は確認済み。`,
        unlockHint: `変化速度の予測と、安定化までの推定期間`,
      }),
      poetic: () => ({
        title: "蛹の時間",
        body: `蛹の中はどろどろだ。芋虫の形も蝶の形もない。${axisDef.labelLeft}と${axisDef.labelRight}のあいだで、あなたは今、蛹の中にいる。形がないことを恐れなくていい。形がない時間こそが、次の形を決める。`,
        unlockHint: `この変容を加速させるもの、減速させるもの`,
      }),
      clinical: () => ({
        title: "軸方向転換レポート",
        body: `${axisDef.labelLeft}/${axisDef.labelRight}軸で値の方向転換を検出。過渡期の不安定状態。転換前スコアと現行スコアの中間値にあり、両方向の特性が混在。`,
        unlockHint: `転換完了後の予測プロファイルと、その信頼区間`,
      }),
    },
    protective_pattern: {
      warm: () => ({
        title: "守り続けてきたもの",
        body: `${axisDef.labelLeft}/${axisDef.labelRight}の領域で、あなたは何かを必死に守っている。その防衛は過去のあなたを救った。でも今の環境にはもう、その鎧は必要ないかもしれない。鎧を脱いでも大丈夫か、確かめる時が来ている。`,
        unlockHint: `この防衛が最初に必要になった出来事`,
      }),
      harsh: () => ({
        title: "過剰防衛",
        body: `${axisDef.labelLeft}/${axisDef.labelRight}の領域で、防衛パターンが検出された。あなたは傷つくことを恐れるあまり、成長のチャンスも一緒にブロックしている。その壁は外敵だけでなく、味方も通さない。`,
        unlockHint: `防衛を解除した場合の、最悪のシナリオと最良のシナリオ`,
      }),
      neutral: () => ({
        title: "防衛パターン検出",
        body: `${axisDef.labelLeft}/${axisDef.labelRight}軸で防衛的反応パターンを検出。スコアの特定範囲への回避行動が確認され、この領域での深い探索に対する心理的抵抗が推定される。`,
        unlockHint: `防衛パターンの発動条件と、強度の推移`,
      }),
      poetic: () => ({
        title: "古い城壁",
        body: `昔、誰かに傷つけられた場所に、あなたは城壁を築いた。${axisDef.labelLeft}/${axisDef.labelRight}の領域に。もう攻めてくる者はいないのに、城壁だけが残っている。城壁の向こうの風景を、あなたはもう忘れてしまった。`,
        unlockHint: `城壁に最初の石を置いた日——その記憶を探して`,
      }),
      clinical: () => ({
        title: "防衛機制構造レポート",
        body: `${axisDef.labelLeft}/${axisDef.labelRight}軸で防衛機制の活性化を検出。回避的応答パターンと特定スコアレンジの忌避が確認された。防衛の起源は過去の心理的脅威体験と推定。`,
        unlockHint: `防衛機制の類型判定と、段階的解除のプロトコル`,
      }),
    },
  };

  const meaningTemplates = byMeaning[c.meaning] ?? byMeaning.growth_edge;
  const template = meaningTemplates[tone] ?? meaningTemplates.warm;
  return template();
}

// ── Pattern Blind Content (v2 — uses fluctuation data) ──

function genPatternBlind(tone: DropTone, data: ContentGenerationData): DropContent {
  // 揺らぎデータから、安定して極端な値を取る軸を見つける（真の無自覚パターン）
  const stableExtremes = (data.fluctuations ?? [])
    .filter(f => Math.abs(f.center) > 0.5 && f.stability > 0.6)
    .sort((a, b) => Math.abs(b.center) * b.stability - Math.abs(a.center) * a.stability);

  const target = stableExtremes[data.seed % Math.max(stableExtremes.length, 1)];
  if (!target) {
    // フォールバック: axisScores から極端な値を使う（ただしfabrication注記なし）
    return genPatternBlindFallback(tone, data);
  }

  const axisDef = findAxis(target.axisId);
  if (!axisDef) return fallbackContent(tone, data.phase);

  const label = directionLabel(axisDef, target.center);
  const stabilityPct = (target.stability * 100).toFixed(0);

  const templates: Record<DropTone, () => DropContent> = {
    warm: () => ({
      title: "水のように当たり前のこと",
      body: `「${label}」——あなたにとってこれは空気のように当たり前のことで、わざわざ言葉にする価値すらないと思っている。安定度${stabilityPct}%。でも、あなたにとっての「当たり前」は他者にとっては珍しい選択であり、それがあなたの強さの源泉になっている。`,
      unlockHint: `この「当たり前」が通じなかった瞬間の記憶`,
    }),
    harsh: () => ({
      title: "自覚なき支配者",
      body: `${stabilityPct}%の安定度で「${label}」を繰り返し選んでいるのに、あなたはそれを「自分の特徴」として一度も語っていない。見えていないのではない。あまりに自分の一部になりすぎて、輪郭が消えたのだ。輪郭のないものは制御できない。`,
      unlockHint: `このパターンがあなたの人間関係に与えている無自覚な影響`,
    }),
    neutral: () => ({
      title: "無自覚安定パターン検出",
      body: `${axisDef.labelLeft}/${axisDef.labelRight}軸において、安定度${stabilityPct}%で「${label}」方向への一貫したパターンを検出。自己申告にはこのパターンへの言及がなく、無自覚な行動傾向として分類される。`,
      unlockHint: `このパターンの発達的起源と、意識化による変化予測`,
    }),
    poetic: () => ({
      title: "指紋",
      body: `指紋は自分では見えない。でもあなたが触れたものすべてに残る。「${label}」という指紋が、あなたの選択のすべてに刻まれている。安定度${stabilityPct}%。世界はあなたの指紋を知っている。あなただけが知らない。`,
      unlockHint: `この指紋が最も色濃く残る、あなたの人生の場面`,
    }),
    clinical: () => ({
      title: "無自覚行動パターン報告",
      body: `${axisDef.labelLeft}/${axisDef.labelRight}軸：中心値${target.center.toFixed(2)}、安定度${stabilityPct}%、観測レンジ[${target.range[0].toFixed(2)}, ${target.range[1].toFixed(2)}]。高安定・高偏向のパターンが自己報告に未反映。自動化された行動スキーマと判定。`,
      unlockHint: `行動スキーマの発達段階と、意識的修正の可能性評価`,
    }),
  };

  return (templates[tone] ?? templates.warm)();
}

function genPatternBlindFallback(tone: DropTone, data: ContentGenerationData): DropContent {
  const extreme = Object.entries(data.axisScores)
    .filter(([, v]) => Math.abs(v) > 0.5)
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));

  const target = extreme[data.seed % Math.max(extreme.length, 1)];
  if (!target) return fallbackContent(tone, data.phase);

  const [axisId, score] = target;
  const axisDef = findAxis(axisId);
  if (!axisDef) return fallbackContent(tone, data.phase);

  const label = directionLabel(axisDef, score);

  return {
    title: "言葉にならない習慣",
    body: `あなたの観測データは「${label}」方向への一貫した傾向を示している。しかし、あなた自身はこれを自分の特徴として語ったことがない。名前のないパターンは、最も深くあなたを支配する。`,
    unlockHint: `このパターンの起源と、あなたの人生における影響`,
  };
}

// ── Shadow Leak Content (v2) ──

function genShadowLeak(tone: DropTone, data: ContentGenerationData): DropContent {
  if (!data.archetypeDef) return fallbackContent(tone, data.phase);

  const shadowDef = ARCHETYPE_DEFS.find(
    (d) => d.code === data.archetypeDef!.shadowCode,
  );
  if (!shadowDef) return fallbackContent(tone, data.phase);

  const shadowName = shadowDef.name;
  const mainName = data.archetypeDef.name;
  const shadowBlindSpot =
    shadowDef.blindSpots?.[data.seed % (shadowDef.blindSpots?.length ?? 1)] ??
    "未知の傾向";
  const shadowTension = data.archetypeDef.shadowTension;

  const templates: Record<DropTone, () => DropContent> = {
    warm: () => ({
      title: `${shadowName}からの手紙`,
      body: `あなたは${mainName}として生きている。でも、${shadowName}の特徴——「${shadowBlindSpot}」——が最近の行動に滲み出ている。もうひとりの自分は否定すべき敵ではない。まだ光の当たっていない、あなた自身の別の才能だ。統合した時、あなたはもっと自由になる。`,
      unlockHint: `${shadowName}の特徴を「長所」として使えるシナリオ`,
    }),
    harsh: () => ({
      title: `${shadowName}の侵食`,
      body: `${mainName}であるはずのあなたに、${shadowName}の匂いが混じっている。「${shadowBlindSpot}」——否定すればするほど、影は力を増す。${shadowTension}`,
      unlockHint: `影を否定し続けた場合の、3ヶ月後のあなたの予測像`,
    }),
    neutral: () => ({
      title: "シャドウコード活性化",
      body: `プライマリ: ${data.archetypeDef!.code}（${mainName}）/ シャドウ: ${data.archetypeDef!.shadowCode}（${shadowName}）。シャドウの行動特性「${shadowBlindSpot}」が行動データに出現。シャドウ活性度: 推定${(data.observationDepth * 40 + 20).toFixed(0)}%。`,
      unlockHint: `シャドウ統合度スコアと、統合のための具体的ステップ`,
    }),
    poetic: () => ({
      title: `もうひとりの劇場`,
      body: `舞台の上であなたは${mainName}を演じている。見事に。だが舞台袖で、${shadowName}が同じ台本を持って待っている。「${shadowBlindSpot}」——その台詞を読み上げた時、客席が最も静まる。その沈黙が、真実の音だ。`,
      unlockHint: `${shadowName}に舞台を譲った時、何が起こるか`,
    }),
    clinical: () => ({
      title: "シャドウ活性化レポート",
      body: `被験者のプライマリアーキタイプ${data.archetypeDef!.code}に対し、シャドウ${data.archetypeDef!.shadowCode}（${shadowName}）の行動マーカーが検出された。該当特性: 「${shadowBlindSpot}」。シャドウ活性化は人格の未統合領域を示す。`,
      unlockHint: `シャドウ統合の進行度メトリクスと、リスク/ベネフィット評価`,
    }),
  };

  return (templates[tone] ?? templates.warm)();
}

// ── Defense Exposure Content (v2 — uses stability data) ──

function genDefenseExposure(tone: DropTone, data: ContentGenerationData): DropContent {
  // 揺らぎデータがあれば: 安定して曖昧な値 = 意図的回避の証拠
  const stableAmbiguous = (data.fluctuations ?? [])
    .filter(f => Math.abs(f.center) < 0.15 && f.stability > 0.5)
    .sort((a, b) => b.stability - a.stability);

  if (stableAmbiguous.length > 0) {
    const target = stableAmbiguous[data.seed % stableAmbiguous.length];
    const axisDef = findAxis(target.axisId);
    if (axisDef) {
      return genDefenseWithEvidence(tone, axisDef, target);
    }
  }

  // フォールバック: 極端に強い確信（揺らぎがゼロ）= 防衛的固着
  const rigidAxes = (data.fluctuations ?? [])
    .filter(f => Math.abs(f.center) > 0.7 && f.stability > 0.85 && (f.range[1] - f.range[0]) < 0.2)
    .sort((a, b) => b.stability - a.stability);

  if (rigidAxes.length > 0) {
    const target = rigidAxes[data.seed % rigidAxes.length];
    const axisDef = findAxis(target.axisId);
    if (axisDef) {
      return genRigidDefense(tone, axisDef, target);
    }
  }

  // 最終フォールバック: axisScores から
  return genDefenseFromScores(tone, data);
}

function genDefenseWithEvidence(tone: DropTone, axisDef: TraitAxisDef, f: FluctuationInput): DropContent {
  const stabilityPct = (f.stability * 100).toFixed(0);

  const templates: Record<DropTone, () => DropContent> = {
    warm: () => ({
      title: "答えを保留した場所",
      body: `「${axisDef.labelLeft}」と「${axisDef.labelRight}」の間で、あなたはずっと中間に留まっている。安定度${stabilityPct}%。これは迷いではなく、無意識の選択だ。どちらかに振れることで失うものが、あなたにとって耐えがたいほど大きいのかもしれない。`,
      unlockHint: `「決める」ことであなたが失うと感じているものの正体`,
    }),
    harsh: () => ({
      title: "決断の拒否",
      body: `${axisDef.labelLeft}か${axisDef.labelRight}か。安定度${stabilityPct}%でこの問いを回避し続けている。曖昧さは安全だが、それは自己理解の放棄だ。決めないことは「どちらでもない」ではない。「どちらも怖い」だ。`,
      unlockHint: `この回避が維持し続けている、あなたの最も深い恐怖`,
    }),
    neutral: () => ({
      title: "安定的回避パターン検出",
      body: `${axisDef.labelLeft}/${axisDef.labelRight}軸でスコアが中間域に安定（安定度${stabilityPct}%）。自然な中間値ではなく、方向選択の回避と判定。回避の心理的コスト推定: 中程度。`,
      unlockHint: `回避パターンの発達的起源と、回避解除のプロトコル`,
    }),
    poetic: () => ({
      title: "踏切の前で",
      body: `踏切の前で、あなたはずっと立っている。${axisDef.labelLeft}と${axisDef.labelRight}、どちらの道にも一歩を踏み出さない。遮断機は上がっているのに。電車はもう来ないのに。それでも立ち続ける。その足を止めているのは、何。`,
      unlockHint: `一歩を踏み出した先の風景を、想像できるかどうか`,
    }),
    clinical: () => ({
      title: "方向選択回避レポート",
      body: `${axisDef.labelLeft}/${axisDef.labelRight}軸：中心値${f.center.toFixed(2)}、安定度${stabilityPct}%。高安定性の中間値は自然分布では稀であり、決定回避メカニズムの活性化を示唆。観測レンジの狭さ[${f.range[0].toFixed(2)}, ${f.range[1].toFixed(2)}]が意図的回避を裏付ける。`,
      unlockHint: `回避メカニズムの強度と、段階的曝露のプロトコル`,
    }),
  };

  return (templates[tone] ?? templates.warm)();
}

function genRigidDefense(tone: DropTone, axisDef: TraitAxisDef, f: FluctuationInput): DropContent {
  const label = directionLabel(axisDef, f.center);
  const rangePct = ((f.range[1] - f.range[0]) * 100).toFixed(0);

  const templates: Record<DropTone, () => DropContent> = {
    warm: () => ({
      title: "確信の鎧",
      body: `「${label}」に対するあなたの確信は揺るぎない。変動幅わずか${rangePct}%。迷いがないことは美しいが、一切揺らがないことは強さではなく、揺れることへの恐怖の表れかもしれない。本当に確信しているのなら、疑いも許せるはずだ。`,
      unlockHint: `この確信が最後に揺らいだ瞬間——その記憶に鍵がある`,
    }),
    harsh: () => ({
      title: "固着した信念",
      body: `「${label}」に変動幅${rangePct}%で固着している。これは信念ではなく、恐怖だ。本物の確信は揺らぎを恐れない。あなたの「確信」は、疑いが入り込む隙間を恐れて、必死に壁を高くしているだけだ。`,
      unlockHint: `この固着の裏にある、あなたが絶対に認めたくない可能性`,
    }),
    neutral: () => ({
      title: "異常安定性検出",
      body: `${axisDef.labelLeft}/${axisDef.labelRight}軸で異常な安定性を検出。変動幅${rangePct}%は統計的に極端であり、防衛的固着の可能性が高い。真の確信と防衛的固着は外見上区別が困難だが、揺らぎの不在自体が診断的指標となる。`,
      unlockHint: `固着の解除テストと、解除後の予測変動パターン`,
    }),
    poetic: () => ({
      title: "凍った湖",
      body: `「${label}」という氷の上で、あなたは安全に立っている。変動幅${rangePct}%。氷の下には何があるか知っている。だから溶かさない。でも氷の下でも生命は動いている。いつか春が来た時、あなたはその水に触れる準備ができているか。`,
      unlockHint: `氷の下に封じ込めたもの——それに名前をつけてみて`,
    }),
    clinical: () => ({
      title: "防衛的固着レポート",
      body: `${axisDef.labelLeft}/${axisDef.labelRight}軸：中心値${f.center.toFixed(2)}、変動幅${rangePct}%。極端な安定性は防衛的固着と一致。固着解除には段階的な認知的柔軟性訓練が推奨される。`,
      unlockHint: `固着の発達的起源と、維持メカニズムの構造分析`,
    }),
  };

  return (templates[tone] ?? templates.warm)();
}

function genDefenseFromScores(tone: DropTone, data: ContentGenerationData): DropContent {
  // 曖昧な軸
  const ambiguous = Object.entries(data.axisScores)
    .filter(([, v]) => Math.abs(v) < 0.15 && v !== 0)
    .sort(([, a], [, b]) => Math.abs(a) - Math.abs(b));

  if (ambiguous.length > 0) {
    const [axisId] = ambiguous[data.seed % ambiguous.length];
    const axisDef = findAxis(axisId);
    if (axisDef) {
      return {
        title: "判断を保留した領域",
        body: `「${axisDef.labelLeft}」と「${axisDef.labelRight}」の間で、あなたのスコアはほぼゼロ。これは中立ではなく、まだ向き合っていない場所。このスコアの「空白」の中に、あなたが避けている問いが眠っている。`,
        unlockHint: `この領域の判断を迫られた時のあなたの身体反応`,
      };
    }
  }

  return fallbackContent(tone, data.phase);
}

// ── Stability Illusion Content (veteran only) ──

function genStabilityIllusion(tone: DropTone, data: ContentGenerationData): DropContent {
  const illusions = (data.fluctuations ?? [])
    .filter(f => {
      const range = f.range[1] - f.range[0];
      return f.stability < 0.3 && range > 0.6;
    })
    .sort((a, b) => (b.range[1] - b.range[0]) - (a.range[1] - a.range[0]));

  const target = illusions[data.seed % Math.max(illusions.length, 1)];
  if (!target) return fallbackContent(tone, data.phase);

  const axisDef = findAxis(target.axisId);
  if (!axisDef) return fallbackContent(tone, data.phase);

  const rangePct = ((target.range[1] - target.range[0]) * 100).toFixed(0);
  const trendNote = target.trendLabel ? `さらに、${target.trendLabel}。` : "";

  const templates: Record<DropTone, () => DropContent> = {
    warm: () => ({
      title: "揺れている場所",
      body: `${axisDef.labelLeft}/${axisDef.labelRight}の領域で、あなたは自分を安定していると思っているかもしれない。でも観測データは${rangePct}%もの変動幅を示している。${trendNote}この揺れは弱さではなく、この領域があなたにとって「生きている」証拠。まだ定まっていないからこそ、可能性がある。`,
      unlockHint: `この揺れが最大になる条件——そこに成長のヒントがある`,
    }),
    harsh: () => ({
      title: "安定の幻想",
      body: `自分は${axisDef.labelLeft}/${axisDef.labelRight}について「もう分かっている」と思っているだろう。残念ながら、変動幅${rangePct}%。あなたはこの領域で全く安定していない。${trendNote}自覚のない不安定さは、最も危険な不安定さだ。`,
      unlockHint: `この不安定さが次に表面化するタイミングの予測`,
    }),
    neutral: () => ({
      title: "安定度過信検出",
      body: `${axisDef.labelLeft}/${axisDef.labelRight}軸：安定度${(target.stability * 100).toFixed(0)}%（低安定）、変動幅${rangePct}%。自己認識上は安定領域として扱われているが、実測値は高い不安定性を示す。認知と実態の乖離。${trendNote}`,
      unlockHint: `不安定性の周期パターンと、安定化への介入ポイント`,
    }),
    poetic: () => ({
      title: "砂の上の家",
      body: `${axisDef.labelLeft}/${axisDef.labelRight}の領域に、あなたは確かな家を建てたと思っている。でも基礎の砂は${rangePct}%も動いている。${trendNote}家が傾いていることに気づかないのは、家と一緒に傾いているからだ。`,
      unlockHint: `砂が動くたびに、あなたの何が一緒に揺れているか`,
    }),
    clinical: () => ({
      title: "安定性過信レポート",
      body: `${axisDef.labelLeft}/${axisDef.labelRight}軸で安定性の過大評価を検出。実測安定度${(target.stability * 100).toFixed(0)}%に対し、変動幅${rangePct}%。主観的安定感と客観的安定度の乖離は、この領域での自己モニタリング精度の低さを示す。`,
      unlockHint: `安定性過信のメカニズムと、自己モニタリング精度の改善方法`,
    }),
  };

  return (templates[tone] ?? templates.warm)();
}

// ── Condition Blind Content (veteran only) ──

function genConditionBlind(tone: DropTone, data: ContentGenerationData): DropContent {
  const conditioned = (data.fluctuations ?? [])
    .filter(f => f.conditions.some(c => Math.abs(c.shift) > 0.3))
    .sort((a, b) => {
      const maxA = Math.max(...a.conditions.map(c => Math.abs(c.shift)));
      const maxB = Math.max(...b.conditions.map(c => Math.abs(c.shift)));
      return maxB - maxA;
    });

  const target = conditioned[data.seed % Math.max(conditioned.length, 1)];
  if (!target) return fallbackContent(tone, data.phase);

  const axisDef = findAxis(target.axisId);
  if (!axisDef) return fallbackContent(tone, data.phase);

  // 最大シフトの条件を取得
  const biggestShift = target.conditions
    .sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift))[0];
  if (!biggestShift) return fallbackContent(tone, data.phase);

  const shiftDir = biggestShift.shift > 0 ? axisDef.labelRight : axisDef.labelLeft;
  const shiftPct = (Math.abs(biggestShift.shift) * 100).toFixed(0);

  const templates: Record<DropTone, () => DropContent> = {
    warm: () => ({
      title: "条件で変わる自分",
      body: `「${biggestShift.conditionLabel}」の時、あなたは${axisDef.labelLeft}/${axisDef.labelRight}の軸で「${shiftDir}」方向に${shiftPct}%もシフトする。あなたは一つの自分ではなく、条件によって異なる自分を持っている。それは多面性であり、豊かさだ。ただし、無自覚なシフトは予期せぬ行動につながる。`,
      unlockHint: `このシフトがあなたの対人関係に与えている影響`,
    }),
    harsh: () => ({
      title: "知らない間に変わっている",
      body: `「${biggestShift.conditionLabel}」——その条件が整った瞬間、あなたは別人になる。${shiftPct}%のシフト。自分では同じ人間のつもりでいるが、周囲はその変化に気づいている。あなただけが知らない。`,
      unlockHint: `この「変身」に周囲がどう反応しているか——本当に知りたいか`,
    }),
    neutral: () => ({
      title: "条件依存シフト検出",
      body: `${axisDef.labelLeft}/${axisDef.labelRight}軸で条件依存シフトを検出。条件「${biggestShift.conditionLabel}」発動時に${shiftDir}方向へ${shiftPct}%シフト。被験者はこのシフトを自覚していない可能性が高い。`,
      unlockHint: `全条件シフトの一覧と、シフトパターンの類型分析`,
    }),
    poetic: () => ({
      title: "天気で変わる色",
      body: `あなたは自分を一色だと思っている。でも「${biggestShift.conditionLabel}」という天気の下で、あなたの色は${shiftPct}%変わる。「${shiftDir}」の色に。虹がいつも見えないのと同じで、あなたの別の色も、特定の条件でだけ現れる。`,
      unlockHint: `あなたの「虹」が出る条件の完全リスト`,
    }),
    clinical: () => ({
      title: "状態依存型行動変容レポート",
      body: `${axisDef.labelLeft}/${axisDef.labelRight}軸で状態依存型変容を検出。トリガー条件: 「${biggestShift.conditionLabel}」。変容量: ${shiftPct}%（${shiftDir}方向）。自己認識にはこの状態依存性が反映されておらず、行動予測精度の低下が推定される。`,
      unlockHint: `状態依存型変容の全パターンと、自己モニタリングの改善手法`,
    }),
  };

  return (templates[tone] ?? templates.warm)();
}

// ── Fallback ──

function fallbackContent(tone: DropTone, phase: DepthPhase): DropContent {
  if (phase === "seedling") {
    return {
      title: "観測がはじまった",
      body: "あなたを知るための旅が始まった。まだデータは少ないが、すでにあなたの最初の輪郭が見え始めている。もう少しだけ、自分を見せてほしい。",
      unlockHint: "次の観測セッションが、最初の発見への入口になる",
    };
  }

  const bodies: Record<DropTone, string> = {
    warm: "あなたの中には、まだ名前のついていない光がある。今日はその光の方角だけを示す。もう少し深く観測すれば、それが何かわかるはずだ。",
    harsh: "データが足りない。あなたはまだ、自分を見せることを恐れている。深い自己理解は、自分を差し出す勇気の先にしかない。",
    neutral: "現時点の観測データでは、有意な盲点パターンは検出されなかった。追加の観測セッションにより検出精度が向上する。",
    poetic: "まだ、霧の中。輪郭だけが揺れている。でも霧が晴れるたびに、あなたは自分の思っていた形と少し違うことに気づくだろう。",
    clinical: "有意な盲点パターンの検出に必要な最低観測回数に未到達。追加データの蓄積を推奨。現在の観測精度では偽陽性リスクが高い。",
  };

  return {
    title: "観測継続中",
    body: bodies[tone],
    unlockHint: "より多くの観測データが蓄積されると、精度が飛躍的に向上する",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Delivery Hour (v2 — behavior-aware)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 配信時刻を算出する。
 *
 * ユーザーの活動時間帯を考慮し、活動の「隙間」を狙う。
 * 活発に活動している真っ只中ではなく、少し手が空いた時（活動ピークの1-2時間後）。
 * さらに日ごとに +-1時間のジッターを加えて予測不能性を維持する。
 *
 * 活動データがない場合は、ゴールデンタイムからランダム選択:
 * - 朝 (7-9): 通勤・起床後の内省時間
 * - 昼後 (13-14): 午後の気だるさ、防衛が下がる時間
 * - 夜 (21-23): 一日の終わり、内省しやすい時間
 */
export function calculateDeliveryHour(
  userId: string,
  date: string,
  activeHours?: number[],
): number {
  const seed = hashStr(`${userId}:${date}:delivery`);

  if (activeHours && activeHours.length > 0) {
    // 活動ピークの1-2時間後を狙う
    const peakHour = activeHours[0]; // 最頻活動時間
    const offset = 1 + (seed % 2); // 1 or 2 hours after
    const baseHour = peakHour + offset;

    // +-1時間のジッター
    const jitter = (seed % 3) - 1; // -1, 0, or +1
    const hour = baseHour + jitter;

    // 7:00-23:00 の範囲にクランプ
    return Math.max(7, Math.min(23, hour));
  }

  // ゴールデンタイムからランダム選択
  const goldenHours = [7, 8, 9, 13, 14, 21, 22, 23];
  return goldenHours[seed % goldenHours.length];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. Intensity Calculation (v2 — phase-gated)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Drop の強度を算出する。
 *
 * フェーズに応じた上限を設定し、
 * ズレの大きさ・観測深度・カテゴリの侵襲性を掛け合わせる。
 */
export function calculateIntensity(
  divergenceScore: number,
  observationDepth: number,
  phase: DepthPhase,
  category: DropCategory,
): number {
  // フェーズ別の強度上限
  const phaseCap: Record<DepthPhase, number> = {
    seedling: 0.2,
    sprout: 0.4,
    growth: 0.7,
    deep: 0.9,
    veteran: 1.0,
  };

  // カテゴリ別の侵襲性ボーナス
  const categoryBonus: Record<DropCategory, number> = {
    mirror_gap: 0.1,
    contradiction: 0.05,
    pattern_blind: 0.0,
    shadow_leak: 0.15,
    defense_exposure: 0.2,
    stability_illusion: 0.1,
    condition_blind: 0.05,
  };

  const raw = divergenceScore * 0.5 + observationDepth * 0.3 + (categoryBonus[category] ?? 0) + 0.1;
  const capped = Math.min(raw, phaseCap[phase]);
  return Math.max(0, Math.min(1, capped));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main: generateBlindSpotDrop
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Blind Spot Drop を1つ生成する。
 *
 * 毎日1回呼び出し、その日のインサイトを生成する。
 * ユーザーID + 日付で決定論的に動作するため、同じ日に何度呼んでも同一結果を返す。
 */
export function generateBlindSpotDrop(
  input: BlindSpotDropInput,
): BlindSpotDrop {
  const today = new Date();
  const date = input.dateOverride ??
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // 日付ベースのシード (同じ日・同じユーザーなら同じ結果)
  const baseSeed = hashStr(`${input.userId}:${date}`);

  // ── Step 0: Depth Phase ──
  const phase = resolveDepthPhase(input.totalSessions, input.observationDepth);

  // ── Step 1: Mirror Gap Detection ──
  const gaps = input.mirrorScores
    ? detectMirrorGaps(input.mirrorScores)
    : [];

  // ── Step 2: Resolve archetype definition ──
  const archetypeDef =
    ARCHETYPE_DEFS.find((d) => d.code === input.archetypeCode) ?? null;

  // ── Step 3: Category Selection ──
  const category = selectDropCategory(
    gaps,
    input.contradictions ?? [],
    input.fluctuations ?? [],
    archetypeDef,
    input.recentDropCategories ?? [],
    phase,
    hashStr(`${baseSeed}:category`),
  );

  // ── Step 4: Tone Selection (variable reward with history) ──
  const tone = selectDropTone(
    hashStr(`${baseSeed}:tone`),
    phase,
    input.recentDropTones,
  );

  // ── Step 5: Content Generation ──
  const contentSeed = hashStr(`${baseSeed}:content`);
  const content = generateDropContent(category, tone, {
    gaps,
    contradictions: input.contradictions ?? [],
    fluctuations: input.fluctuations ?? [],
    axisScores: input.axisScores,
    archetypeDef,
    observationDepth: input.observationDepth,
    phase,
    seed: contentSeed,
  });

  // ── Step 6: Divergence Score (category-aware) ──
  let divergenceScore = 0;
  if (category === "mirror_gap" && gaps.length > 0) {
    divergenceScore = gaps[0].divergence;
  } else if (category === "contradiction" && input.contradictions && input.contradictions.length > 0) {
    divergenceScore = Math.max(...input.contradictions.map((c) => c.magnitude));
  } else if (category === "stability_illusion" && input.fluctuations) {
    const illusions = input.fluctuations.filter(f => f.stability < 0.3 && (f.range[1] - f.range[0]) > 0.6);
    if (illusions.length > 0) {
      divergenceScore = illusions[0].range[1] - illusions[0].range[0];
    }
  } else if (category === "condition_blind" && input.fluctuations) {
    const maxShift = Math.max(
      ...input.fluctuations.flatMap(f => f.conditions.map(c => Math.abs(c.shift))),
      0,
    );
    divergenceScore = maxShift;
  } else {
    // pattern_blind / shadow_leak / defense_exposure
    divergenceScore = input.observationDepth * 0.5;
  }

  const intensity = calculateIntensity(divergenceScore, input.observationDepth, phase, category);

  // ── Step 7: Mirror Divergence Data ──
  let mirrorDivergence: MirrorDivergenceData | undefined;
  if (category === "mirror_gap" && gaps.length > 0 && input.mirrorScores) {
    const topGap = gaps[contentSeed % gaps.length];
    const mirrorData = input.mirrorScores[topGap.axisId];
    if (mirrorData) {
      mirrorDivergence = {
        selfPortrait: mirrorData.self,
        footprint: mirrorData.footprint,
        shadowPlay: mirrorData.shadow,
        divergenceScore: topGap.divergence,
        divergenceType: topGap.divergenceType,
      };
    }
  }

  // ── Step 8: Source Axes ──
  const sourceAxes: string[] = [];
  if (category === "mirror_gap" && gaps.length > 0) {
    sourceAxes.push(...gaps.slice(0, 3).map((g) => g.axisId));
  } else if (category === "contradiction" && input.contradictions && input.contradictions.length > 0) {
    const c = input.contradictions[contentSeed % input.contradictions.length];
    sourceAxes.push(c.axisId);
  } else if ((category === "stability_illusion" || category === "condition_blind") && input.fluctuations) {
    const relevant = input.fluctuations.slice(0, 2);
    sourceAxes.push(...relevant.map(f => f.axisId));
  } else {
    const extreme = Object.entries(input.axisScores)
      .filter(([, v]) => v !== 0)
      .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
      .slice(0, 2);
    sourceAxes.push(...extreme.map(([id]) => id));
  }

  // ── Step 9: Delivery Hour ──
  const deliveryHour = calculateDeliveryHour(input.userId, date, input.activeHours);

  // ── Assemble ──
  return {
    id: `bsd_${input.userId.slice(0, 8)}_${date}`,
    date,
    title: content.title,
    body: content.body,
    tone,
    category,
    intensity,
    sourceAxes,
    mirrorDivergence,
    unlockHint: content.unlockHint,
    deliveryHour,
    depthPhase: phase,
  };
}
