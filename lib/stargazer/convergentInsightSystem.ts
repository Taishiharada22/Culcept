// lib/stargazer/convergentInsightSystem.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Convergent Insight System（収斂的洞察システム）
//
// 設計思想:
// Spotifyは100のシグナルを1つの「Discover Weekly」に収斂させる。
// Aneurasyncも、6つのエンジンが別々の洞察を出すのではなく、
// 複数エンジンが同じ軸を指すとき → 1つの統合洞察に収斂させる。
//
// 「矛盾を抱え、揺らいでおり、予測を裏切った」
// → これは3つの別々の情報ではなく、1つの深い発見。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "./traitAxes";
import { getAxisLabels } from "./traitAxes";
import type { ResonanceNetworkState } from "./resonanceNetwork";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** エンジンからのシグナル */
export interface EngineSignal {
  engine: "contradiction" | "fluctuation" | "prediction" | "aha" | "blindSpot" | "avoidance";
  axisId: TraitAxisKey;
  strength: number; // 0-1
  detail: string;
}

/** 収斂ポイント — 複数エンジンが同じ軸を指す場所 */
export interface ConvergencePoint {
  axisId: TraitAxisKey;
  axisLabel: string;
  /** 収斂に参加しているエンジン */
  engines: EngineSignal[];
  /** 収斂度（0-1、高いほど多くのエンジンが一致） */
  convergence: number;
  /** 統合洞察テキスト */
  unifiedInsight: string;
  /** 洞察の深度 */
  depth: "surface" | "intermediate" | "deep" | "core";
  /** 推奨アクション */
  recommendedAction: string;
}

/** 収斂分析の結果 */
export interface ConvergentInsightResult {
  /** 今日の最も重要な1つの洞察 */
  todayInsight: ConvergencePoint | null;
  /** 全収斂ポイント（収斂度順） */
  allPoints: ConvergencePoint[];
  /** 収斂が見つからなかった場合のフォールバック洞察 */
  fallbackInsight: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Signal Collection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ConvergentInputs {
  /** resonanceNetworkの出力 */
  resonance?: ResonanceNetworkState;
  /** 矛盾マップの軸リスト */
  contradictionAxes?: { axisId: TraitAxisKey; magnitude: number; meaning?: string }[];
  /** 揺らぎが大きい軸 */
  fluctuatingAxes?: { axisId: TraitAxisKey; stability: number }[];
  /** 予測が外れた軸 */
  predictionErrorAxes?: TraitAxisKey[];
  /** Ahaインサイトが生成された軸 */
  ahaAxes?: { axisId: TraitAxisKey; insightText: string }[];
  /** 盲点候補軸 */
  blindSpotAxes?: { axisId: TraitAxisKey; avoidanceRate: number }[];
}

/**
 * 全エンジンの出力からシグナルを収集
 */
function collectSignals(inputs: ConvergentInputs): EngineSignal[] {
  const signals: EngineSignal[] = [];

  // 矛盾マップから
  for (const c of inputs.contradictionAxes ?? []) {
    signals.push({
      engine: "contradiction",
      axisId: c.axisId,
      strength: Math.min(1, c.magnitude),
      detail: c.meaning
        ? `矛盾を抱えている（${c.meaning}）`
        : "矛盾が検出されている",
    });
  }

  // 揺らぎエンジンから
  for (const f of inputs.fluctuatingAxes ?? []) {
    if (f.stability < 0.4) {
      signals.push({
        engine: "fluctuation",
        axisId: f.axisId,
        strength: 1 - f.stability,
        detail: `揺らいでいる（安定度${Math.round(f.stability * 100)}%）`,
      });
    }
  }

  // 予測誤差から
  for (const axisId of inputs.predictionErrorAxes ?? []) {
    signals.push({
      engine: "prediction",
      axisId,
      strength: 0.7,
      detail: "予測が外れた",
    });
  }

  // Ahaインサイトから
  for (const a of inputs.ahaAxes ?? []) {
    signals.push({
      engine: "aha",
      axisId: a.axisId,
      strength: 0.8,
      detail: a.insightText,
    });
  }

  // 盲点から
  for (const b of inputs.blindSpotAxes ?? []) {
    if (b.avoidanceRate >= 0.3) {
      signals.push({
        engine: "blindSpot",
        axisId: b.axisId,
        strength: Math.min(1, b.avoidanceRate + 0.2),
        detail: `回避傾向（${Math.round(b.avoidanceRate * 100)}%スキップ）`,
      });
    }
  }

  // resonanceNetworkの共鳴情報から
  if (inputs.resonance && inputs.resonance.overallResonance >= 0.5) {
    // 矛盾→揺らぎパスで優先追跡されている軸を抽出
    const ctfAxes = inputs.resonance.contradictionToFluctuation.priorityAxes ?? [];
    for (const axisId of ctfAxes) {
      signals.push({
        engine: "avoidance",
        axisId,
        strength: inputs.resonance.overallResonance,
        detail: `共鳴ネットワークで活性化（${inputs.resonance.dominantResonancePath}）`,
      });
    }
  }

  return signals;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Convergence Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * シグナルから収斂ポイントを検出
 */
function detectConvergence(signals: EngineSignal[]): ConvergencePoint[] {
  // 軸ごとにシグナルをグループ化
  const axisGroups = new Map<TraitAxisKey, EngineSignal[]>();
  for (const signal of signals) {
    const existing = axisGroups.get(signal.axisId) ?? [];
    existing.push(signal);
    axisGroups.set(signal.axisId, existing);
  }

  const points: ConvergencePoint[] = [];

  for (const [axisId, axisSignals] of Array.from(axisGroups.entries())) {
    // 2つ以上のエンジンが同じ軸を指す場合のみ収斂
    const uniqueEngines = new Set(axisSignals.map((s) => s.engine));
    if (uniqueEngines.size < 2) continue;

    const labels = getAxisLabels(axisId);
    const axisLabel = labels ? `${labels.left} ⇔ ${labels.right}` : axisId;

    // 収斂度: 参加エンジン数 × 平均強度
    const avgStrength =
      axisSignals.reduce((s, sig) => s + sig.strength, 0) / axisSignals.length;
    const convergence = Math.min(
      1,
      (uniqueEngines.size / 4) * 0.6 + avgStrength * 0.4,
    );

    // 深度判定
    let depth: ConvergencePoint["depth"];
    if (uniqueEngines.size >= 4) depth = "core";
    else if (uniqueEngines.size >= 3) depth = "deep";
    else if (avgStrength >= 0.7) depth = "deep";
    else depth = "intermediate";

    // 統合洞察テキスト生成
    const unifiedInsight = generateUnifiedInsight(axisId, axisLabel, axisSignals);

    // 推奨アクション
    const recommendedAction = generateRecommendation(axisId, axisSignals);

    points.push({
      axisId,
      axisLabel,
      engines: axisSignals,
      convergence,
      unifiedInsight,
      depth,
      recommendedAction,
    });
  }

  return points.sort((a, b) => b.convergence - a.convergence);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Unified Insight Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateUnifiedInsight(
  axisId: TraitAxisKey,
  axisLabel: string,
  signals: EngineSignal[],
): string {
  const engines = new Set(signals.map((s) => s.engine));
  const parts: string[] = [];

  // 冒頭: 何が起きているか
  parts.push(`「${axisLabel}」が動いている。`);

  // エンジンごとの貢献を自然な文に
  if (engines.has("contradiction")) {
    parts.push("この領域に矛盾がある。");
  }
  if (engines.has("fluctuation")) {
    parts.push("安定していない。何かが変わろうとしている。");
  }
  if (engines.has("prediction")) {
    parts.push("予測を裏切った。自分でも意識していない変化が起きている。");
  }
  if (engines.has("blindSpot") || engines.has("avoidance")) {
    parts.push("しかも、普段は目を向けない場所。");
  }
  if (engines.has("aha")) {
    const ahaSignal = signals.find((s) => s.engine === "aha");
    if (ahaSignal) {
      parts.push(ahaSignal.detail);
    }
  }

  // 結論: なぜこれが重要か
  if (engines.size >= 3) {
    parts.push("複数の観測が同じ場所を指している。ここが今、最も変化している場所。");
  } else {
    parts.push("この交差点に、次の自己発見がある。");
  }

  return parts.join("");
}

function generateRecommendation(
  axisId: TraitAxisKey,
  signals: EngineSignal[],
): string {
  const engines = new Set(signals.map((s) => s.engine));

  if (engines.has("contradiction") && engines.has("blindSpot")) {
    return "この矛盾を直視する。Alterとの対話が効果的";
  }
  if (engines.has("prediction")) {
    return "予言を検証する。予測が外れた理由を探ると、新しい自分が見つかる";
  }
  if (engines.has("fluctuation")) {
    return "この軸を集中的に観測する。変化のパターンが見えてくる";
  }
  return "この領域をもう少し深く観測してみる";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Main Entry Point
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全エンジンの出力を統合し、最も重要な1つの洞察を導出
 *
 * 使い方:
 * ```
 * const result = generateConvergentInsight(inputs);
 * // result.todayInsight が今日の最も重要な1つの洞察
 * // AneurasyncHomeで1つだけ表示する
 * ```
 */
export function generateConvergentInsight(
  inputs: ConvergentInputs,
): ConvergentInsightResult {
  const signals = collectSignals(inputs);
  const points = detectConvergence(signals);

  const todayInsight = points.length > 0 ? points[0] : null;

  // フォールバック（収斂が見つからない場合）
  let fallbackInsight: string;
  if (signals.length === 0) {
    fallbackInsight = "今日の観測が、明日の洞察の種になる";
  } else if (signals.length === 1) {
    fallbackInsight = signals[0].detail;
  } else {
    fallbackInsight = "複数のシグナルが検出されている。もう少し観測が進むと収斂し始める";
  }

  return {
    todayInsight,
    allPoints: points,
    fallbackInsight,
  };
}
