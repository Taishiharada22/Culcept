// lib/stargazer/metamorphosisLaw.ts
// Layer 5: 変容律 (Metamorphosis Law) — パーソナリティ変化の法則性
//
// 原理: 性格は固定されたものではなく、ある法則に従って変化する
// 変容律は、その変化のパターン（周期性、トリガー、方向性）を捉える
//
// 解析対象:
// 1. 周期的揺らぎ (Cyclical Fluctuation): 曜日・季節・時間帯による変動
// 2. トリガーパターン (Trigger Pattern): 変化を引き起こす条件
// 3. 回復弾力 (Resilience): ストレス後にどの程度戻るか
// 4. 変容方向 (Transformation Vector): 長期的な変化の方向性

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 時系列の軸スコアデータポイント */
export interface AxisTimePoint {
  axisId: TraitAxisKey;
  score: number;
  date: string;       // YYYY-MM-DD
  timeOfDay?: string;  // morning / afternoon / night
  context?: string;    // friends / work / alone etc.
  energy?: string;     // high / low / stressed / relaxed
}

/** 周期的揺らぎパターン */
export interface CyclicalPattern {
  axisId: TraitAxisKey;
  /** 揺らぎの種類 */
  cycleType: "daily" | "weekly" | "monthly" | "contextual";
  /** パターンの説明 */
  description: string;
  /** 平均からの振れ幅 */
  amplitude: number;
  /** パターンの信頼度 */
  confidence: number;
  /** 周期のピーク条件 */
  peakCondition: string;
  /** 周期の谷条件 */
  troughCondition: string;
}

/** トリガーパターン — 変化を引き起こす条件 */
export interface TriggerPattern {
  /** トリガーとなる条件 */
  trigger: string;
  /** 影響を受ける軸 */
  affectedAxes: TraitAxisKey[];
  /** スコアの変化方向 */
  direction: "positive" | "negative";
  /** 変化の大きさ */
  magnitude: number;
  /** 観測された回数 */
  observedCount: number;
  /** 解釈 */
  interpretation: string;
}

/** 回復弾力 — ストレスからの回復特性 */
export interface ResilienceProfile {
  /** 全体的な回復力 (0-1) */
  overallResilience: number;
  /** 回復が早い領域 */
  quickRecoveryAxes: TraitAxisKey[];
  /** 回復が遅い領域 */
  slowRecoveryAxes: TraitAxisKey[];
  /** 回復パターンの特徴 */
  pattern: "elastic" | "gradual" | "stepwise" | "oscillating";
  /** パターンの説明 */
  description: string;
}

/** 変容方向 — 長期的な変化の方向性 */
export interface TransformationVector {
  axisId: TraitAxisKey;
  /** 30日前のスコア */
  pastScore: number;
  /** 現在のスコア */
  currentScore: number;
  /** 変化の速度 (per day) */
  velocity: number;
  /** 変化の安定性 (0-1) */
  consistency: number;
  /** 変化の解釈 */
  interpretation: string;
}

/** 変容律の全出力 */
export interface MetamorphosisLawResult {
  cyclicalPatterns: CyclicalPattern[];
  triggerPatterns: TriggerPattern[];
  resilience: ResilienceProfile;
  transformationVectors: TransformationVector[];
  /** 変容の一行要約 */
  summary: string;
  /** データ充足度 */
  dataCompleteness: number;
  /** 解析日時 */
  analyzedAt: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Computation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 時系列データから変容律を解析
 */
export function analyzeMetamorphosisLaw(
  timePoints: AxisTimePoint[],
): MetamorphosisLawResult {
  if (timePoints.length < 10) {
    return emptyMetamorphosisResult("観測データが10件以上必要です。日々の観測を続けてください。");
  }

  const cyclicalPatterns = detectCyclicalPatterns(timePoints);
  const triggerPatterns = detectTriggerPatterns(timePoints);
  const resilience = analyzeResilience(timePoints);
  const transformationVectors = computeTransformationVectors(timePoints);

  const summary = generateMetamorphosisSummary(
    cyclicalPatterns,
    triggerPatterns,
    resilience,
    transformationVectors,
  );

  // データ充足度: 軸数 × 観測日数
  const uniqueAxes = new Set(timePoints.map((p) => p.axisId)).size;
  const uniqueDates = new Set(timePoints.map((p) => p.date)).size;
  const dataCompleteness = Math.min((uniqueAxes * uniqueDates) / 100, 1);

  return {
    cyclicalPatterns,
    triggerPatterns,
    resilience,
    transformationVectors,
    summary,
    dataCompleteness,
    analyzedAt: new Date().toISOString(),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cyclical Patterns
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectCyclicalPatterns(timePoints: AxisTimePoint[]): CyclicalPattern[] {
  const patterns: CyclicalPattern[] = [];

  // 時間帯別パターン検出
  const axisIds = [...new Set(timePoints.map((p) => p.axisId))];

  for (const axisId of axisIds) {
    const axisPoints = timePoints.filter((p) => p.axisId === axisId);
    if (axisPoints.length < 5) continue;

    // 時間帯別集計
    const byTime: Record<string, number[]> = {};
    for (const p of axisPoints) {
      const key = p.timeOfDay ?? "unknown";
      if (!byTime[key]) byTime[key] = [];
      byTime[key].push(p.score);
    }

    const timeAvgs = Object.entries(byTime)
      .map(([time, scores]) => ({
        time,
        avg: scores.reduce((s, v) => s + v, 0) / scores.length,
        count: scores.length,
      }))
      .filter((t) => t.count >= 2);

    if (timeAvgs.length >= 2) {
      const maxTime = timeAvgs.reduce((a, b) => (a.avg > b.avg ? a : b));
      const minTime = timeAvgs.reduce((a, b) => (a.avg < b.avg ? a : b));
      const amplitude = maxTime.avg - minTime.avg;

      if (amplitude > 0.15) {
        const axis = TRAIT_AXES.find((a) => a.id === axisId);
        patterns.push({
          axisId,
          cycleType: "daily",
          description: `${axis?.labelLeft ?? ""}—${axis?.labelRight ?? ""}: 時間帯によって揺れるパターンがある`,
          amplitude,
          confidence: Math.min(axisPoints.length / 15, 1),
          peakCondition: `${maxTime.time}の時間帯`,
          troughCondition: `${minTime.time}の時間帯`,
        });
      }
    }

    // コンテキスト別パターン検出
    const byContext: Record<string, number[]> = {};
    for (const p of axisPoints) {
      if (!p.context) continue;
      if (!byContext[p.context]) byContext[p.context] = [];
      byContext[p.context].push(p.score);
    }

    const ctxAvgs = Object.entries(byContext)
      .map(([ctx, scores]) => ({
        ctx,
        avg: scores.reduce((s, v) => s + v, 0) / scores.length,
        count: scores.length,
      }))
      .filter((c) => c.count >= 2);

    if (ctxAvgs.length >= 2) {
      const maxCtx = ctxAvgs.reduce((a, b) => (a.avg > b.avg ? a : b));
      const minCtx = ctxAvgs.reduce((a, b) => (a.avg < b.avg ? a : b));
      const amplitude = maxCtx.avg - minCtx.avg;

      if (amplitude > 0.2) {
        const axis = TRAIT_AXES.find((a) => a.id === axisId);
        patterns.push({
          axisId,
          cycleType: "contextual",
          description: `${axis?.labelLeft ?? ""}—${axis?.labelRight ?? ""}: 場面によって変わるパターンがある`,
          amplitude,
          confidence: Math.min(axisPoints.length / 15, 1),
          peakCondition: `${maxCtx.ctx}の場面で`,
          troughCondition: `${minCtx.ctx}の場面で`,
        });
      }
    }
  }

  return patterns.sort((a, b) => b.amplitude - a.amplitude).slice(0, 5);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Trigger Patterns
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectTriggerPatterns(timePoints: AxisTimePoint[]): TriggerPattern[] {
  const triggers: TriggerPattern[] = [];

  // エネルギー状態によるトリガー検出
  const energyStates = ["high_energy", "low_energy", "stressed", "relaxed"];
  const axisIds = [...new Set(timePoints.map((p) => p.axisId))];

  for (const axisId of axisIds) {
    const axisPoints = timePoints.filter((p) => p.axisId === axisId);
    const allAvg = axisPoints.reduce((s, p) => s + p.score, 0) / axisPoints.length;

    for (const energy of energyStates) {
      const energyPoints = axisPoints.filter((p) => p.energy === energy);
      if (energyPoints.length < 3) continue;

      const energyAvg = energyPoints.reduce((s, p) => s + p.score, 0) / energyPoints.length;
      const diff = energyAvg - allAvg;

      if (Math.abs(diff) > 0.15) {
        const axis = TRAIT_AXES.find((a) => a.id === axisId);
        const dirLabel = diff > 0 ? axis?.labelRight : axis?.labelLeft;
        const energyLabel =
          energy === "stressed" ? "ストレス時" :
          energy === "relaxed" ? "リラックス時" :
          energy === "high_energy" ? "エネルギー高い時" : "エネルギー低い時";

        triggers.push({
          trigger: energyLabel,
          affectedAxes: [axisId],
          direction: diff > 0 ? "positive" : "negative",
          magnitude: Math.abs(diff),
          observedCount: energyPoints.length,
          interpretation: `${energyLabel}に「${dirLabel}」の傾向が強まる`,
        });
      }
    }
  }

  return triggers.sort((a, b) => b.magnitude - a.magnitude).slice(0, 5);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Resilience
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function analyzeResilience(timePoints: AxisTimePoint[]): ResilienceProfile {
  // ストレス後の回復パターンを分析
  const stressedPoints = timePoints.filter((p) => p.energy === "stressed");
  const relaxedPoints = timePoints.filter((p) => p.energy === "relaxed" || p.energy === "high_energy");

  if (stressedPoints.length < 2 || relaxedPoints.length < 2) {
    return {
      overallResilience: 0.5,
      quickRecoveryAxes: [],
      slowRecoveryAxes: [],
      pattern: "gradual",
      description: "回復パターンの解析にはストレス時とリラックス時の両方のデータが必要です",
    };
  }

  const axisIds = [...new Set(timePoints.map((p) => p.axisId))];
  const quickRecovery: TraitAxisKey[] = [];
  const slowRecovery: TraitAxisKey[] = [];

  for (const axisId of axisIds) {
    const stressAvg = stressedPoints
      .filter((p) => p.axisId === axisId)
      .reduce((s, p, _, a) => s + p.score / a.length, 0);
    const relaxAvg = relaxedPoints
      .filter((p) => p.axisId === axisId)
      .reduce((s, p, _, a) => s + p.score / a.length, 0);

    const gap = Math.abs(relaxAvg - stressAvg);
    if (gap < 0.1) quickRecovery.push(axisId);
    else if (gap > 0.3) slowRecovery.push(axisId);
  }

  const overallResilience = axisIds.length > 0
    ? quickRecovery.length / axisIds.length
    : 0.5;

  const pattern: "elastic" | "gradual" | "stepwise" | "oscillating" =
    overallResilience > 0.7 ? "elastic" :
    overallResilience > 0.4 ? "gradual" :
    slowRecovery.length > quickRecovery.length ? "stepwise" : "oscillating";

  const descriptions: Record<typeof pattern, string> = {
    elastic: "ストレスを受けても素早く元の状態に戻る弾力的なパターン。回復力が高い。",
    gradual: "ストレスからゆっくりと回復するパターン。時間をかけて自然に戻る。",
    stepwise: "ストレスの影響が段階的に残るパターン。一部の領域は変化を保持する傾向。",
    oscillating: "ストレス後に揺り戻しがあるパターン。一時的に反対方向に振れてから安定する。",
  };

  return {
    overallResilience,
    quickRecoveryAxes: quickRecovery.slice(0, 3),
    slowRecoveryAxes: slowRecovery.slice(0, 3),
    pattern,
    description: descriptions[pattern],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Transformation Vectors
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function computeTransformationVectors(timePoints: AxisTimePoint[]): TransformationVector[] {
  const vectors: TransformationVector[] = [];
  const axisIds = [...new Set(timePoints.map((p) => p.axisId))];

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().split("T")[0];

  for (const axisId of axisIds) {
    const axisPoints = timePoints
      .filter((p) => p.axisId === axisId)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (axisPoints.length < 5) continue;

    const earlyPoints = axisPoints.filter((p) => p.date <= cutoff);
    const recentPoints = axisPoints.filter((p) => p.date > cutoff);

    if (earlyPoints.length < 2 || recentPoints.length < 2) continue;

    const pastScore = earlyPoints.reduce((s, p) => s + p.score, 0) / earlyPoints.length;
    const currentScore = recentPoints.reduce((s, p) => s + p.score, 0) / recentPoints.length;
    const velocity = (currentScore - pastScore) / 30;

    // 変化の一貫性: 日次変化の方向が一致している割合
    let consistentDays = 0;
    const direction = currentScore > pastScore ? 1 : -1;
    for (let i = 1; i < axisPoints.length; i++) {
      const dayChange = axisPoints[i].score - axisPoints[i - 1].score;
      if (dayChange * direction > 0) consistentDays++;
    }
    const consistency = axisPoints.length > 1 ? consistentDays / (axisPoints.length - 1) : 0;

    if (Math.abs(velocity) > 0.003) {
      const axis = TRAIT_AXES.find((a) => a.id === axisId);
      const dir = velocity > 0 ? axis?.labelRight : axis?.labelLeft;

      vectors.push({
        axisId,
        pastScore,
        currentScore,
        velocity,
        consistency,
        interpretation: `「${dir}」の方向へ${
          Math.abs(velocity) > 0.01 ? "明確に" : "ゆっくりと"
        }変化している${consistency > 0.6 ? "（一貫した変化）" : "（揺れながらの変化）"}`,
      });
    }
  }

  return vectors.sort((a, b) => Math.abs(b.velocity) - Math.abs(a.velocity)).slice(0, 5);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Summary Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateMetamorphosisSummary(
  cyclical: CyclicalPattern[],
  triggers: TriggerPattern[],
  resilience: ResilienceProfile,
  vectors: TransformationVector[],
): string {
  const parts: string[] = [];

  if (vectors.length > 0) {
    parts.push(`長期的に${vectors[0].interpretation}`);
  }

  if (cyclical.length > 0) {
    parts.push(`${cyclical[0].peakCondition}と${cyclical[0].troughCondition}で揺れるパターンがある`);
  }

  if (triggers.length > 0) {
    parts.push(triggers[0].interpretation);
  }

  parts.push(resilience.description);

  return parts.join("。") + "。";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Empty result
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function emptyMetamorphosisResult(message: string): MetamorphosisLawResult {
  return {
    cyclicalPatterns: [],
    triggerPatterns: [],
    resilience: {
      overallResilience: 0,
      quickRecoveryAxes: [],
      slowRecoveryAxes: [],
      pattern: "gradual",
      description: message,
    },
    transformationVectors: [],
    summary: message,
    dataCompleteness: 0,
    analyzedAt: new Date().toISOString(),
  };
}
