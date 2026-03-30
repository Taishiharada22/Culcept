// lib/stargazer/resonanceNetwork.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cross-Engine Resonance Network（共鳴ネットワーク）
//
// 脳科学的根拠:
// mPFC（自己参照）、ACC（矛盾検出）、ドーパミン系（予測誤差）は
// 独立ではなく常に相互接続している。エンジンもそうあるべき。
//
// 設計原則:
// - 各エンジンの内部ロジックは一切変更しない
// - エンジン間の「入力と出力の接続」のみを追加する
// - 各共鳴信号には神経科学的な対応物がある
//
// 共鳴パス:
// contradictionMap → fluctuationEngine  (矛盾軸の揺らぎ優先追跡)
// fluctuationEngine → predictiveClone   (文脈条件の注入)
// predictiveClone → ahaEngine           (予測誤差をAha素材に)
// ahaEngine → contradictionMap          (矛盾の解消/深化マーク)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "./traitAxes";
import type { ContradictionMap, ContradictionEntry } from "./contradictionMap";
import type {
  AxisDistribution,
  FluctuationPattern,
  ObservationState,
} from "./fluctuationEngine";
import type {
  PredictiveCloneResult,
  ClonePrediction,
  SituationContext,
} from "./predictiveClone";
import type { DetectedPattern } from "./patternDetectionEngine";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Resonance Signal Types — 共鳴信号の型定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 矛盾→揺らぎ共鳴: 矛盾が検出された軸を揺らぎエンジンで優先追跡
 *
 * 神経科学的対応: ACC（前帯状皮質）の矛盾検出信号が
 * ドーパミン系の注意配分を変更する経路
 */
export interface ContradictionToFluctuationSignal {
  /** 矛盾が検出された軸（優先追跡対象） */
  priorityAxes: TraitAxisKey[];
  /** 各軸の矛盾の大きさ（注目度のweight） */
  contradictionWeights: Partial<Record<TraitAxisKey, number>>;
  /** 矛盾の種類 → 追跡すべき揺らぎの種類を示唆 */
  trackingHints: {
    axisId: TraitAxisKey;
    hint: "monitor_stability" | "monitor_conditions" | "monitor_trend";
    reason: string;
  }[];
}

/**
 * 揺らぎ→予測共鳴: 揺らぎの条件マップを予測分身に注入
 *
 * 神経科学的対応: ドーパミン系の文脈依存予測。
 * 同じ刺激でも文脈が違えば異なるドーパミン応答が生じる（Schultz, 2016）
 */
export interface FluctuationToPredictiveSignal {
  /** 現在の状態に最も影響を受ける軸 */
  contextSensitiveAxes: {
    axisId: TraitAxisKey;
    /** 現在の条件での予測スコア偏差 */
    contextualBias: number;
    /** この偏差の信頼度 */
    biasConfidence: number;
    /** 偏差の原因となる条件 */
    activeCondition: string;
  }[];
  /** 現在検出されている揺らぎパターン（予測の修正に使用） */
  activePatterns: {
    patternName: string;
    affectedAxes: TraitAxisKey[];
    expectedShiftDirection: "increase" | "decrease";
    confidence: number;
  }[];
}

/**
 * 予測→Aha共鳴: 予測誤差を「気づき」の素材に変換
 *
 * 神経科学的対応: 予測誤差信号（ドーパミン）が
 * mPFC（自己参照処理）を活性化し「Aha!」体験を生む経路。
 * 予測が外れた瞬間が最も強い自己発見に繋がる
 */
export interface PredictiveToAhaSignal {
  /** 予測が外れた領域（＝成長/変化のシグナル） */
  predictionErrors: {
    scenarioId: string;
    scenario: string;
    predictedLabel: string;
    predictedProbability: number;
    /** 低い予測確率 ＝ 大きなサプライズ ＝ 強いAha候補 */
    surpriseScore: number;
    relatedAxes: TraitAxisKey[];
    /** 成長仮説：「なぜ予測が外れたか」のAI推論 */
    growthHypothesis: string;
  }[];
  /** 予測不能な領域（＝内的葛藤の指標） */
  unpredictableZones: {
    area: string;
    reason: string;
    /** 盲点候補として渡す */
    isBlindSpotCandidate: boolean;
  }[];
}

/**
 * Aha→矛盾フィードバック: 洞察による矛盾の状態更新
 *
 * 神経科学的対応: mPFCの統合処理がACCの矛盾信号を更新する経路。
 * 「分かった！」体験の後、矛盾は解消するか、さらに深化する
 */
export interface AhaToContradictionFeedback {
  /** 矛盾の状態更新 */
  contradictionUpdates: {
    axisId: TraitAxisKey;
    /** 解消: insight が矛盾を説明した / 深化: 新たな矛盾層が見えた */
    status: "resolved" | "deepened" | "reframed" | "unchanged";
    /** 更新の根拠となったinsight */
    insightSource: string;
    /** 次の探索の方向性 */
    nextExplorationDirection: string | null;
  }[];
}

/**
 * 全共鳴信号を統合したネットワーク状態
 */
export interface ResonanceNetworkState {
  /** 矛盾→揺らぎ */
  contradictionToFluctuation: ContradictionToFluctuationSignal;
  /** 揺らぎ→予測 */
  fluctuationToPredictive: FluctuationToPredictiveSignal;
  /** 予測→Aha */
  predictiveToAha: PredictiveToAhaSignal;
  /** Aha→矛盾 */
  ahaToContradiction: AhaToContradictionFeedback;
  /** 共鳴の全体スコア（全パスの活性度の平均） */
  overallResonance: number;
  /** 最も活性化している共鳴パス */
  dominantResonancePath: string;
  /** ネットワーク状態のサマリ（日本語） */
  networkNarrative: string;
  /** 生成日時 */
  generatedAt: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Resonance Path Builders — 各共鳴パスの構築
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * パス1: 矛盾マップ → 揺らぎエンジンへの共鳴信号
 *
 * 矛盾が大きい軸ほど揺らぎが大きいはず。
 * 逆に、矛盾が大きいのに安定している軸は「抑圧」の可能性がある。
 */
export function buildContradictionToFluctuationSignal(
  contradictionMap: ContradictionMap
): ContradictionToFluctuationSignal {
  const entries = contradictionMap.entries;

  // 矛盾の大きい順に優先軸を選定
  const priorityAxes = entries
    .filter((e) => e.magnitude >= 0.3)
    .map((e) => e.axisId);

  // 各軸の矛盾ウェイト（0-1）
  const contradictionWeights: Partial<Record<TraitAxisKey, number>> = {};
  for (const entry of entries) {
    contradictionWeights[entry.axisId] = entry.magnitude;
  }

  // 矛盾の種類に基づく追跡ヒント
  const trackingHints = entries
    .filter((e) => e.magnitude >= 0.25)
    .map((entry) => {
      let hint: "monitor_stability" | "monitor_conditions" | "monitor_trend";
      let reason: string;

      switch (entry.meaning) {
        case "ideal_gap":
          // 理想と現実のギャップ → 状況による揺らぎを追跡
          hint = "monitor_conditions";
          reason = `${entry.axisLabel}で理想と現実のギャップが検出。どの状況で現実の自分が出るか追跡`;
          break;
        case "adaptation_mask":
          // 環境適応マスク → 安定度を追跡（マスクが崩れる瞬間を捉える）
          hint = "monitor_stability";
          reason = `${entry.axisLabel}で適応マスクを検出。マスクが外れる条件を特定中`;
          break;
        case "contextual_self":
          // 状況依存的自己 → 条件マップの精密化
          hint = "monitor_conditions";
          reason = `${entry.axisLabel}は状況依存的。条件→スコア変動のマッピングを精密化`;
          break;
        case "growth_edge":
          // 成長の最前線 → トレンドを追跡（変化の方向を見る）
          hint = "monitor_trend";
          reason = `${entry.axisLabel}が成長の最前線。変化の方向と速度を追跡`;
          break;
        case "unconscious_value":
        case "protective_pattern":
        default:
          // 無自覚/自己防衛 → 安定度を追跡（表面化する条件を探す）
          hint = "monitor_stability";
          reason = `${entry.axisLabel}に無自覚なパターンを検出。表面化する条件を探索中`;
          break;
      }

      return { axisId: entry.axisId, hint, reason };
    });

  return { priorityAxes, contradictionWeights, trackingHints };
}

/**
 * パス2: 揺らぎエンジン → 予測分身への共鳴信号
 *
 * 揺らぎの条件マップ（ConditionShift）を予測の文脈修正に使う。
 * 「月曜朝のあなた」と「金曜夜のあなた」は別の予測を返すべき。
 */
export function buildFluctuationToPredictiveSignal(
  distributions: AxisDistribution[],
  patterns: FluctuationPattern[],
  currentState?: ObservationState | null
): FluctuationToPredictiveSignal {
  const contextSensitiveAxes: FluctuationToPredictiveSignal["contextSensitiveAxes"] = [];

  for (const dist of distributions) {
    if (!currentState || dist.conditions.length === 0) continue;

    // 現在の状態に一致する条件シフトを見つける
    const activeShift = findActiveConditionShift(dist, currentState);
    if (activeShift && Math.abs(activeShift.shift) >= 0.1) {
      contextSensitiveAxes.push({
        axisId: dist.axis,
        contextualBias: activeShift.shift,
        biasConfidence: Math.min(activeShift.confidence, dist.confidence),
        activeCondition: activeShift.conditionLabel,
      });
    }
  }

  // 現在アクティブな揺らぎパターンを抽出
  const activePatterns = patterns
    .filter((p) => p.confidence >= 0.5)
    .map((p) => ({
      patternName: p.name,
      affectedAxes: p.axisMovements.map((m) => m.axis),
      expectedShiftDirection: p.axisMovements[0]?.direction ?? ("increase" as const),
      confidence: p.confidence,
    }));

  return { contextSensitiveAxes, activePatterns };
}

/**
 * パス3: 予測分身 → Ahaエンジンへの共鳴信号
 *
 * 「予測が外れた」= 最も強い自己発見の瞬間。
 * ドーパミンの予測誤差信号をAha体験に変換する。
 */
export function buildPredictiveToAhaSignal(
  cloneResult: PredictiveCloneResult
): PredictiveToAhaSignal {
  const predictionErrors: PredictiveToAhaSignal["predictionErrors"] = [];

  for (const pred of cloneResult.predictions) {
    // 予測確率が50%以下の場合、サプライズスコアが高い
    const topProb = pred.predictedChoice.probability;
    const surpriseScore = 1 - topProb; // 0-1, 高いほどサプライズ

    // サプライズスコアが0.3以上（予測が70%未満）の場合のみ
    if (surpriseScore >= 0.3) {
      predictionErrors.push({
        scenarioId: pred.scenarioId,
        scenario: pred.scenario,
        predictedLabel: pred.predictedChoice.label,
        predictedProbability: topProb,
        surpriseScore,
        relatedAxes: extractRelatedAxes(pred),
        growthHypothesis: generateGrowthHypothesis(pred),
      });
    }
  }

  const unpredictableZones = cloneResult.unpredictableAreas.map((area) => ({
    area: area.area,
    reason: area.reason,
    // 内的葛藤が理由なら盲点候補
    isBlindSpotCandidate: area.reason.includes("矛盾") || area.reason.includes("葛藤"),
  }));

  return { predictionErrors, unpredictableZones };
}

/**
 * パス4: Aha洞察 → 矛盾マップへのフィードバック
 *
 * 矛盾マップを「生きた文書」にする。
 * 洞察が得られるたびに、矛盾の状態が更新される。
 */
export function buildAhaToContradictionFeedback(
  contradictionMap: ContradictionMap,
  recentInsights: { text: string; relatedAxes: TraitAxisKey[]; confidence: number }[],
  verifiedPredictions?: { axisId: TraitAxisKey; wasAccurate: boolean }[]
): AhaToContradictionFeedback {
  const contradictionUpdates: AhaToContradictionFeedback["contradictionUpdates"] = [];

  for (const entry of contradictionMap.entries) {
    // この矛盾に関連するinsightを検索
    const relatedInsight = recentInsights.find(
      (i) => i.relatedAxes.includes(entry.axisId) && i.confidence >= 0.5
    );

    // この矛盾に関連する予測検証結果を検索
    const verification = verifiedPredictions?.find(
      (v) => v.axisId === entry.axisId
    );

    if (!relatedInsight && !verification) {
      contradictionUpdates.push({
        axisId: entry.axisId,
        status: "unchanged",
        insightSource: "",
        nextExplorationDirection: entry.explorationPrompt,
      });
      continue;
    }

    // insightの内容と予測検証から矛盾の状態を判定
    let status: "resolved" | "deepened" | "reframed" | "unchanged" = "unchanged";
    let nextDirection: string | null = null;

    if (relatedInsight) {
      const text = relatedInsight.text;
      // insightが矛盾の原因を説明している → reframed
      if (text.includes("理由") || text.includes("なぜなら") || text.includes("背景")) {
        status = "reframed";
        nextDirection = `${entry.axisLabel}の矛盾が再解釈された。新しい角度から深掘りする`;
      }
      // insightが矛盾を直接指摘 → deepened
      else if (text.includes("矛盾") || text.includes("ギャップ") || text.includes("ズレ")) {
        status = "deepened";
        nextDirection = `${entry.axisLabel}の矛盾がさらに深い層を示唆。別の条件での観測が必要`;
      }
    }

    // 予測が外れた → 矛盾が深化している可能性
    if (verification && !verification.wasAccurate && status === "unchanged") {
      status = "deepened";
      nextDirection = `予測が外れた。${entry.axisLabel}に未知の変化が起きている可能性`;
    }

    contradictionUpdates.push({
      axisId: entry.axisId,
      status,
      insightSource: relatedInsight?.text ?? "予測検証結果",
      nextExplorationDirection: nextDirection ?? entry.explorationPrompt,
    });
  }

  return { contradictionUpdates };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Full Network Computation — 全共鳴パスの統合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ResonanceNetworkInput {
  contradictionMap: ContradictionMap;
  distributions: AxisDistribution[];
  fluctuationPatterns: FluctuationPattern[];
  cloneResult: PredictiveCloneResult;
  recentInsights: { text: string; relatedAxes: TraitAxisKey[]; confidence: number }[];
  currentState?: ObservationState | null;
  verifiedPredictions?: { axisId: TraitAxisKey; wasAccurate: boolean }[];
}

/**
 * 全共鳴パスを一度に計算し、ネットワーク状態を返す
 */
export function computeResonanceNetwork(
  input: ResonanceNetworkInput
): ResonanceNetworkState {
  // パス1: 矛盾 → 揺らぎ
  const c2f = buildContradictionToFluctuationSignal(input.contradictionMap);

  // パス2: 揺らぎ → 予測
  const f2p = buildFluctuationToPredictiveSignal(
    input.distributions,
    input.fluctuationPatterns,
    input.currentState
  );

  // パス3: 予測 → Aha
  const p2a = buildPredictiveToAhaSignal(input.cloneResult);

  // パス4: Aha → 矛盾
  const a2c = buildAhaToContradictionFeedback(
    input.contradictionMap,
    input.recentInsights,
    input.verifiedPredictions
  );

  // 各パスの活性度を計算
  const pathActivities = {
    contradiction_to_fluctuation:
      c2f.priorityAxes.length > 0
        ? Math.min(1, c2f.priorityAxes.length / 5)
        : 0,
    fluctuation_to_predictive:
      f2p.contextSensitiveAxes.length > 0
        ? Math.min(
            1,
            f2p.contextSensitiveAxes.reduce((s, a) => s + Math.abs(a.contextualBias), 0) /
              f2p.contextSensitiveAxes.length
          )
        : 0,
    predictive_to_aha:
      p2a.predictionErrors.length > 0
        ? p2a.predictionErrors.reduce((s, e) => s + e.surpriseScore, 0) /
          p2a.predictionErrors.length
        : 0,
    aha_to_contradiction:
      a2c.contradictionUpdates.filter((u) => u.status !== "unchanged").length /
      Math.max(1, a2c.contradictionUpdates.length),
  };

  const activityValues = Object.values(pathActivities);
  const overallResonance =
    activityValues.reduce((s, v) => s + v, 0) / activityValues.length;

  // 最も活性化しているパスを特定
  const dominantPath = Object.entries(pathActivities).reduce((a, b) =>
    a[1] > b[1] ? a : b
  );

  const dominantPathNames: Record<string, string> = {
    contradiction_to_fluctuation: "矛盾→揺らぎ（矛盾の動的追跡が活発）",
    fluctuation_to_predictive: "揺らぎ→予測（状況による自己変動が大きい）",
    predictive_to_aha: "予測→発見（予測が外れ、新たな自己像が浮上中）",
    aha_to_contradiction: "発見→矛盾（洞察が矛盾構造を更新中）",
  };

  // ネットワーク状態のナラティブ生成
  const networkNarrative = generateNetworkNarrative(
    pathActivities,
    c2f,
    f2p,
    p2a,
    a2c
  );

  return {
    contradictionToFluctuation: c2f,
    fluctuationToPredictive: f2p,
    predictiveToAha: p2a,
    ahaToContradiction: a2c,
    overallResonance,
    dominantResonancePath: dominantPathNames[dominantPath[0]] ?? dominantPath[0],
    networkNarrative,
    generatedAt: new Date().toISOString(),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Enhanced Engine Inputs — 共鳴信号で強化されたエンジン入力
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 共鳴信号で強化された揺らぎエンジンへの優先軸リスト
 * → dailyOrchestrator が軸選択時にこのweightを参照する
 */
export function getResonanceEnhancedAxisPriorities(
  signal: ContradictionToFluctuationSignal,
  baseDistributions: AxisDistribution[]
): { axisId: TraitAxisKey; priority: number; reason: string }[] {
  const priorities: { axisId: TraitAxisKey; priority: number; reason: string }[] = [];

  for (const dist of baseDistributions) {
    const contradictionWeight = signal.contradictionWeights[dist.axis] ?? 0;
    const hint = signal.trackingHints.find((h) => h.axisId === dist.axis);

    // 基本優先度: 安定度が低い（揺らいでいる）軸ほど高い
    let priority = 1 - dist.stability;

    // 矛盾ブースト: 矛盾が大きい軸の優先度を上げる
    priority += contradictionWeight * 0.5;

    // 矛盾があるのに安定している → 抑圧の可能性 → 最高優先度
    if (contradictionWeight >= 0.4 && dist.stability >= 0.7) {
      priority += 0.8;
    }

    let reason = "";
    if (contradictionWeight >= 0.4 && dist.stability >= 0.7) {
      reason = `${dist.axis}: 矛盾が大きいのに安定 — 抑圧の可能性。揺さぶる質問を投入`;
    } else if (hint) {
      reason = hint.reason;
    } else if (contradictionWeight > 0) {
      reason = `矛盾度${Math.round(contradictionWeight * 100)}%の軸を優先追跡`;
    } else {
      reason = `安定度${Math.round(dist.stability * 100)}%`;
    }

    priorities.push({ axisId: dist.axis, priority: Math.min(2, priority), reason });
  }

  return priorities.sort((a, b) => b.priority - a.priority);
}

/**
 * 共鳴信号で強化された予測分身への文脈条件
 * → predictiveClone の SituationContext を拡張する
 */
export function getResonanceEnhancedContext(
  signal: FluctuationToPredictiveSignal,
  baseContext: SituationContext
): {
  enhancedContext: SituationContext;
  axisBiases: Partial<Record<TraitAxisKey, number>>;
  activePatternNames: string[];
} {
  // 揺らぎ信号から各軸のバイアスを抽出
  const axisBiases: Partial<Record<TraitAxisKey, number>> = {};
  for (const cs of signal.contextSensitiveAxes) {
    axisBiases[cs.axisId] = cs.contextualBias;
  }

  return {
    enhancedContext: baseContext,
    axisBiases,
    activePatternNames: signal.activePatterns.map((p) => p.patternName),
  };
}

/**
 * 共鳴信号から生成されたAhaエンジンへの追加パターン
 * → ahaEngine の DetectedPattern[] に追加する
 */
export function getResonanceEnhancedPatterns(
  signal: PredictiveToAhaSignal
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // 予測誤差 → contradiction パターンとして変換
  for (const error of signal.predictionErrors) {
    patterns.push({
      patternType: "contradiction",
      axisId: error.relatedAxes[0] ?? null,
      descriptionJa: `予測が外れた: 「${error.scenario}」で${error.predictedLabel}を選ぶと思われたが、異なる選択をした（サプライズ度${Math.round(error.surpriseScore * 100)}%）`,
      confidence: error.surpriseScore,
      metadata: {
        source: "resonance_network",
        scenarioId: error.scenarioId,
        growthHypothesis: error.growthHypothesis,
      },
    });
  }

  // 予測不能ゾーン → behavioral_blind パターンとして変換
  for (const zone of signal.unpredictableZones) {
    if (zone.isBlindSpotCandidate) {
      patterns.push({
        patternType: "behavioral_blind",
        axisId: null,
        descriptionJa: `予測不能領域: ${zone.area} — ${zone.reason}`,
        confidence: 0.6,
        metadata: {
          source: "resonance_network",
          isBlindSpotCandidate: true,
        },
      });
    }
  }

  return patterns;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Internal Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { ConditionShift } from "./fluctuationEngine";

function findActiveConditionShift(
  dist: AxisDistribution,
  state: ObservationState
): ConditionShift | null {
  // 現在のstateに一致する条件を検索
  const stateConditions = [
    `energy_${state.energy}`,
    `emotion_${state.emotion}`,
    `social_${state.social}`,
    `time_${state.timeOfDay}`,
  ];

  let bestMatch: ConditionShift | null = null;
  let bestAbsShift = 0;

  for (const cond of dist.conditions) {
    if (
      stateConditions.some((sc) => cond.condition.includes(sc)) &&
      Math.abs(cond.shift) > bestAbsShift
    ) {
      bestMatch = cond;
      bestAbsShift = Math.abs(cond.shift);
    }
  }

  return bestMatch;
}

function extractRelatedAxes(pred: ClonePrediction): TraitAxisKey[] {
  // 予測のコンテキスト感度が高い場合、関連軸があると推定
  // scenarioId からカテゴリを使って代表軸を返す
  const categoryAxes: Record<string, TraitAxisKey[]> = {
    decision: ["cautious_vs_bold", "plan_vs_spontaneous"],
    social: ["introvert_vs_extrovert", "individual_vs_social"],
    stress: ["stress_isolation_vs_social", "emotional_variability"],
    creative: ["analytical_vs_intuitive", "minimal_vs_maximal"],
    conflict: ["direct_vs_diplomatic", "independence_vs_harmony"],
  };
  return categoryAxes[pred.category] ?? [];
}

function generateGrowthHypothesis(pred: ClonePrediction): string {
  const category = pred.category;
  const confidence = pred.confidence;

  if (confidence < 0.4) {
    return `この領域（${category}）はまだ予測精度が低い。より多くの観測が必要`;
  }

  const hypotheses: Record<string, string> = {
    decision: "判断基準が最近変化した可能性。新しい価値観が芽生えているかもしれない",
    social: "社会的な振る舞いが揺らいでいる。関係性や環境の変化が影響している可能性",
    stress: "ストレスへの対処法が変化中。以前の方法が効かなくなっているのかもしれない",
    creative: "創造性の源泉がシフトしている。新しいインスピレーション源と出会った可能性",
    conflict: "対立への向き合い方が変わりつつある。成長の兆候",
  };

  return hypotheses[category] ?? "このパターンの変化は、内面の再構成を示唆している";
}

function generateNetworkNarrative(
  activities: Record<string, number>,
  c2f: ContradictionToFluctuationSignal,
  f2p: FluctuationToPredictiveSignal,
  p2a: PredictiveToAhaSignal,
  a2c: AhaToContradictionFeedback
): string {
  const parts: string[] = [];

  // 矛盾→揺らぎが活発な場合
  if (activities.contradiction_to_fluctuation > 0.3) {
    const count = c2f.priorityAxes.length;
    parts.push(`${count}つの矛盾が揺らぎの中で追跡されている`);
  }

  // 揺らぎ→予測が活発な場合
  if (activities.fluctuation_to_predictive > 0.2) {
    const topBias = f2p.contextSensitiveAxes[0];
    if (topBias) {
      parts.push(
        `今の状態では${topBias.activeCondition}の影響で予測が変動中`
      );
    }
  }

  // 予測→Ahaが活発な場合
  if (activities.predictive_to_aha > 0.3) {
    const topError = p2a.predictionErrors[0];
    if (topError) {
      parts.push(`予測が外れた場面がある — 新しい自分が見え始めている`);
    }
  }

  // Aha→矛盾が活発な場合
  const updatedCount = a2c.contradictionUpdates.filter(
    (u) => u.status !== "unchanged"
  ).length;
  if (updatedCount > 0) {
    parts.push(`${updatedCount}つの矛盾が新たな洞察で更新された`);
  }

  if (parts.length === 0) {
    return "共鳴ネットワークは静穏。新しい観測データを待っている状態";
  }

  return parts.join("。") + "。";
}
