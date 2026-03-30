// lib/stargazer/patternDetectionEngine.ts
// Personal Pattern Detection Engine — 行動・観測データから個人パターンを検出
//
// サーバーサイド専用。純粋な統計関数群。
// 入力: stargazer_behavioral_signals + stargazer_profiles (axis snapshots)
// 出力: stargazer_detected_patterns に格納するパターン配列

import { TRAIT_AXES, type TraitAxisKey } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type PatternType =
  | "weekday"           // 曜日傾向
  | "time_of_day"       // 時間帯傾向
  | "avoidance"         // カテゴリ回避
  | "cycle"             // スコアサイクル
  | "hesitation"        // 応答躊躇
  | "contradiction"     // 自己申告 vs 行動の矛盾
  | "behavioral_blind"; // 行動的盲点

export interface DetectedPattern {
  patternType: PatternType;
  axisId: string | null;
  descriptionJa: string;
  confidence: number; // 0-1
  metadata: Record<string, unknown>;
}

export interface BehavioralSignal {
  signal_type: string;
  value: number;
  context: string | null;
  question_id: string | null;
  session_date: string;
  recorded_at: string;
}

export interface AxisSnapshot {
  date: string;
  axisId: string;
  score: number;
  dayOfWeek: number; // 0=Sun, 6=Sat
  hour: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Statistical Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function autocorrelation(arr: number[], lag: number): number {
  if (arr.length <= lag || arr.length < 4) return 0;
  const m = mean(arr);
  const sd = stdDev(arr);
  if (sd === 0) return 0;

  let sum = 0;
  const n = arr.length - lag;
  for (let i = 0; i < n; i++) {
    sum += (arr[i] - m) * (arr[i + lag] - m);
  }
  return sum / (n * sd * sd);
}

function groupBy<T>(
  arr: T[],
  keyFn: (item: T) => string,
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Axis label lookup
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function axisLabel(axisId: string): string {
  const def = TRAIT_AXES.find((a) => a.id === axisId);
  if (!def) return axisId;
  return `${def.labelLeft}/${def.labelRight}`;
}

function axisShortLabel(axisId: string): string {
  const def = TRAIT_AXES.find((a) => a.id === axisId);
  if (!def) return axisId;
  // Use the more descriptive side or combine
  return `${def.labelLeft}↔${def.labelRight}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Day-of-week helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DAY_NAMES_JA = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Time-of-day helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type TimePeriod = "morning" | "afternoon" | "evening" | "late_night";

function hourToTimePeriod(hour: number): TimePeriod {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "late_night";
}

const TIME_PERIOD_LABELS_JA: Record<TimePeriod, string> = {
  morning: "朝",
  afternoon: "昼",
  evening: "夕方〜夜",
  late_night: "深夜",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Weekday Patterns
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 曜日ごとの軸スコア傾向を検出する。
 * ある曜日の平均が全体平均から 1.5 標準偏差以上離れていればパターンとして報告。
 * 最低 14 データポイントが必要（約2週間分）。
 */
export function detectWeekdayPatterns(
  snapshots: AxisSnapshot[],
): DetectedPattern[] {
  if (snapshots.length < 14) return [];

  const byAxis = groupBy(snapshots, (s) => s.axisId);
  const patterns: DetectedPattern[] = [];

  for (const [axisId, axisSnapshots] of Object.entries(byAxis)) {
    if (axisSnapshots.length < 14) continue;

    const allScores = axisSnapshots.map((s) => s.score);
    const overallMean = mean(allScores);
    const overallStd = stdDev(allScores);
    if (overallStd === 0) continue;

    // Group by day of week
    const byDay = groupBy(axisSnapshots, (s) => String(s.dayOfWeek));

    for (const [dayStr, daySnapshots] of Object.entries(byDay)) {
      if (daySnapshots.length < 2) continue;

      const dayMean = mean(daySnapshots.map((s) => s.score));
      const deviation = dayMean - overallMean;
      const deviationRatio = Math.abs(deviation) / overallStd;

      if (deviationRatio < 1.5) continue;

      const dayIndex = parseInt(dayStr, 10);
      const dayName = DAY_NAMES_JA[dayIndex] ?? `曜日${dayStr}`;
      const direction = deviation > 0 ? "高く" : "低く";
      const label = axisShortLabel(axisId);
      const absDev = Math.abs(Math.round(deviation * 100) / 100);

      const dataPoints = axisSnapshots.length;
      const confidence = Math.min(
        1.0,
        Math.min(1.0, dataPoints / 28) * (deviationRatio / 1.5),
      );

      patterns.push({
        patternType: "weekday",
        axisId,
        descriptionJa: `${dayName}に「${label}」が平均より${absDev}${direction}なる傾向があります`,
        confidence: Math.round(confidence * 100) / 100,
        metadata: {
          dayOfWeek: dayIndex,
          dayName,
          deviation: Math.round(deviation * 1000) / 1000,
          deviationRatio: Math.round(deviationRatio * 100) / 100,
          daySamples: daySnapshots.length,
          totalSamples: dataPoints,
        },
      });
    }
  }

  return patterns;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Time-of-Day Patterns
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 時間帯ごとの軸スコアと応答速度の傾向を検出する。
 * 最低 10 セッション分のデータが必要。
 */
export function detectTimeOfDayPatterns(
  signals: BehavioralSignal[],
  snapshots: AxisSnapshot[],
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // --- Axis score by time period ---
  if (snapshots.length >= 10) {
    const byAxis = groupBy(snapshots, (s) => s.axisId);

    for (const [axisId, axisSnapshots] of Object.entries(byAxis)) {
      if (axisSnapshots.length < 10) continue;

      const overallMean = mean(axisSnapshots.map((s) => s.score));
      const overallStd = stdDev(axisSnapshots.map((s) => s.score));
      if (overallStd === 0) continue;

      const byPeriod = groupBy(axisSnapshots, (s) =>
        hourToTimePeriod(s.hour),
      );

      for (const [period, periodSnapshots] of Object.entries(byPeriod)) {
        if (periodSnapshots.length < 3) continue;

        const periodMean = mean(periodSnapshots.map((s) => s.score));
        const deviation = periodMean - overallMean;
        const deviationRatio = Math.abs(deviation) / overallStd;

        if (deviationRatio < 1.2) continue;

        const periodLabel =
          TIME_PERIOD_LABELS_JA[period as TimePeriod] ?? period;
        const label = axisShortLabel(axisId);
        const absDev = Math.abs(Math.round(deviation * 100) / 100);
        const direction = deviation > 0 ? "高い" : "低い";

        const confidence = Math.min(
          1.0,
          Math.min(1.0, axisSnapshots.length / 20) * (deviationRatio / 1.5),
        );

        patterns.push({
          patternType: "time_of_day",
          axisId,
          descriptionJa: `${periodLabel}の回答では「${label}」が平均より${absDev}ポイント${direction}傾向があります`,
          confidence: Math.round(confidence * 100) / 100,
          metadata: {
            timePeriod: period,
            deviation: Math.round(deviation * 1000) / 1000,
            deviationRatio: Math.round(deviationRatio * 100) / 100,
            periodSamples: periodSnapshots.length,
          },
        });
      }
    }
  }

  // --- Response time by time period ---
  const responseTimeSignals = signals.filter(
    (s) => s.signal_type === "response_speed" || s.signal_type === "response_time",
  );
  if (responseTimeSignals.length >= 10) {
    const byPeriod = groupBy(responseTimeSignals, (s) => {
      const hour = new Date(s.recorded_at).getHours();
      return hourToTimePeriod(hour);
    });

    const allTimes = responseTimeSignals.map((s) => s.value);
    const overallMedian = median(allTimes);

    for (const [period, periodSignals] of Object.entries(byPeriod)) {
      if (periodSignals.length < 3) continue;

      const periodMean = mean(periodSignals.map((s) => s.value));
      const ratio = periodMean / overallMedian;

      if (ratio > 1.5 || ratio < 0.6) {
        const periodLabel =
          TIME_PERIOD_LABELS_JA[period as TimePeriod] ?? period;
        const desc =
          ratio > 1.5
            ? `${periodLabel}の回答は全体より時間がかかる傾向があります（平均の${Math.round(ratio * 100)}%）`
            : `${periodLabel}の回答は全体より速い傾向があります（平均の${Math.round(ratio * 100)}%）`;

        patterns.push({
          patternType: "time_of_day",
          axisId: null,
          descriptionJa: desc,
          confidence: Math.min(1.0, periodSignals.length / 15) * 0.7,
          metadata: {
            timePeriod: period,
            meanResponseTime: Math.round(periodMean),
            overallMedian: Math.round(overallMedian),
            ratio: Math.round(ratio * 100) / 100,
          },
        });
      }
    }
  }

  return patterns;
}

/** Simple median helper */
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Category Avoidance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * カテゴリ回避パターンを検出する。
 * - 特定カテゴリの回答速度が中央値の50%未満 => 軽視的回答
 * - 特定カテゴリの出現頻度が期待値より有意に低い => 回避
 */
export function detectCategoryAvoidance(
  signals: BehavioralSignal[],
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Gather signals with question category from context
  const withCategory = signals.filter(
    (s) =>
      s.context != null &&
      s.context.length > 0 &&
      (s.signal_type === "response_speed" ||
        s.signal_type === "response_time" ||
        s.signal_type === "answer_speed_category" ||
        s.signal_type === "category_avoidance"),
  );

  if (withCategory.length < 10) return patterns;

  // --- Dismissive answers: fast response by category ---
  const responseSignals = withCategory.filter(
    (s) => s.signal_type === "response_speed" || s.signal_type === "response_time",
  );

  if (responseSignals.length >= 10) {
    const allTimes = responseSignals.map((s) => s.value);
    const overallMedian = median(allTimes);
    const threshold = overallMedian * 0.5;

    const byCategory = groupBy(responseSignals, (s) => s.context ?? "unknown");

    for (const [category, catSignals] of Object.entries(byCategory)) {
      if (catSignals.length < 3) continue;

      const catMean = mean(catSignals.map((s) => s.value));
      if (catMean < threshold) {
        const confidence = Math.min(1.0, catSignals.length / 8) * 0.75;
        patterns.push({
          patternType: "avoidance",
          axisId: null,
          descriptionJa: `「${category}」カテゴリの質問に対して、回答速度が非常に速い傾向があります（軽視的回答の可能性）`,
          confidence: Math.round(confidence * 100) / 100,
          metadata: {
            category,
            categoryMeanMs: Math.round(catMean),
            overallMedianMs: Math.round(overallMedian),
            sampleCount: catSignals.length,
            type: "dismissive",
          },
        });
      }
    }
  }

  // --- Avoidance: category frequency significantly lower than expected ---
  const avoidanceSignals = withCategory.filter(
    (s) => s.signal_type === "category_avoidance",
  );
  if (avoidanceSignals.length >= 3) {
    const byCategory = groupBy(avoidanceSignals, (s) => s.context ?? "unknown");
    for (const [category, catSignals] of Object.entries(byCategory)) {
      // value > 0 means avoidance was detected
      const avoidanceCount = catSignals.filter((s) => s.value > 0).length;
      if (avoidanceCount >= 2) {
        const confidence = Math.min(1.0, avoidanceCount / 5) * 0.8;
        patterns.push({
          patternType: "avoidance",
          axisId: null,
          descriptionJa: `「${category}」カテゴリの質問を一貫して避ける傾向があります`,
          confidence: Math.round(confidence * 100) / 100,
          metadata: {
            category,
            avoidanceCount,
            totalSignals: catSignals.length,
            type: "avoidance",
          },
        });
      }
    }
  }

  // --- Frequency-based avoidance: category appears less than expected ---
  const allCategories = new Set(
    withCategory.map((s) => s.context).filter(Boolean),
  );
  if (allCategories.size >= 3) {
    const expectedPerCategory = withCategory.length / allCategories.size;
    const byCategory = groupBy(withCategory, (s) => s.context ?? "unknown");

    for (const [category, catSignals] of Object.entries(byCategory)) {
      const ratio = catSignals.length / expectedPerCategory;
      if (ratio < 0.4 && catSignals.length >= 2) {
        const confidence = Math.min(1.0, allCategories.size / 5) * 0.6;
        patterns.push({
          patternType: "avoidance",
          axisId: null,
          descriptionJa: `「${category}」カテゴリの質問への回答数が他のカテゴリに比べて著しく少ない傾向があります`,
          confidence: Math.round(confidence * 100) / 100,
          metadata: {
            category,
            count: catSignals.length,
            expectedCount: Math.round(expectedPerCategory),
            ratio: Math.round(ratio * 100) / 100,
            type: "frequency",
          },
        });
      }
    }
  }

  return patterns;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Score Cycles (Autocorrelation)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 軸スコアの周期的変動を自己相関で検出する。
 * 各軸に 21 以上のデータポイントが必要。
 * ラグ 3-14 日で自己相関 > 0.4 ならサイクルとして報告（軸ごとに最強のみ）。
 */
export function detectScoreCycles(
  snapshots: AxisSnapshot[],
  minCycleDays: number = 3,
  maxCycleDays: number = 14,
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const byAxis = groupBy(snapshots, (s) => s.axisId);

  for (const [axisId, axisSnapshots] of Object.entries(byAxis)) {
    if (axisSnapshots.length < 21) continue;

    // Sort by date and build a daily time series
    const sorted = [...axisSnapshots].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    // Build daily series: average scores per day
    const dailyMap = new Map<string, number[]>();
    for (const s of sorted) {
      const dateKey = s.date.slice(0, 10); // YYYY-MM-DD
      if (!dailyMap.has(dateKey)) dailyMap.set(dateKey, []);
      dailyMap.get(dateKey)!.push(s.score);
    }

    const dailyEntries = [...dailyMap.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    if (dailyEntries.length < 21) continue;

    const dailySeries = dailyEntries.map(
      ([, scores]) => mean(scores),
    );

    // Find best autocorrelation in lag range
    let bestLag = -1;
    let bestAc = 0;

    for (let lag = minCycleDays; lag <= maxCycleDays; lag++) {
      if (lag >= dailySeries.length - 3) break;
      const ac = autocorrelation(dailySeries, lag);
      if (ac > bestAc) {
        bestAc = ac;
        bestLag = lag;
      }
    }

    if (bestAc > 0.4 && bestLag > 0) {
      const label = axisShortLabel(axisId);
      const confidence = Math.min(
        1.0,
        Math.min(1.0, dailySeries.length / 30) * (bestAc / 0.6),
      );

      patterns.push({
        patternType: "cycle",
        axisId,
        descriptionJa: `「${label}」が約${bestLag}日周期で変動する傾向があります`,
        confidence: Math.round(confidence * 100) / 100,
        metadata: {
          cycleDays: bestLag,
          autocorrelation: Math.round(bestAc * 1000) / 1000,
          dataPoints: dailySeries.length,
        },
      });
    }
  }

  return patterns;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Response Time Anomalies (Hesitation)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 応答時間の異常（躊躇）を検出する。
 * 全体平均から 2 標準偏差以上遅い質問やカテゴリを報告。
 */
export function detectResponseTimeAnomalies(
  signals: BehavioralSignal[],
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  const responseSignals = signals.filter(
    (s) => s.signal_type === "response_speed" || s.signal_type === "response_time",
  );
  if (responseSignals.length < 10) return patterns;

  const allTimes = responseSignals.map((s) => s.value);
  const overallMean = mean(allTimes);
  const overallStd = stdDev(allTimes);
  if (overallStd === 0) return patterns;

  const threshold = overallMean + 2 * overallStd;

  // --- Per question ---
  const byQuestion = groupBy(
    responseSignals.filter((s) => s.question_id != null),
    (s) => s.question_id!,
  );

  for (const [questionId, qSignals] of Object.entries(byQuestion)) {
    if (qSignals.length < 2) continue;
    const qMean = mean(qSignals.map((s) => s.value));
    if (qMean > threshold) {
      const ratio = qMean / overallMean;
      const confidence = Math.min(1.0, qSignals.length / 5) * 0.7;
      patterns.push({
        patternType: "hesitation",
        axisId: null,
        descriptionJa: `質問「${questionId}」に対して、平均より${Math.round(ratio)}倍長く考える傾向があります`,
        confidence: Math.round(confidence * 100) / 100,
        metadata: {
          questionId,
          meanResponseTimeMs: Math.round(qMean),
          overallMeanMs: Math.round(overallMean),
          ratio: Math.round(ratio * 100) / 100,
          sampleCount: qSignals.length,
        },
      });
    }
  }

  // --- Per axis context (category/axis) ---
  const withContext = responseSignals.filter(
    (s) => s.context != null && s.context.length > 0,
  );
  if (withContext.length >= 8) {
    const byContext = groupBy(withContext, (s) => s.context!);

    for (const [context, ctxSignals] of Object.entries(byContext)) {
      if (ctxSignals.length < 3) continue;
      const ctxMean = mean(ctxSignals.map((s) => s.value));
      if (ctxMean > threshold) {
        const ratio = ctxMean / overallMean;

        // Try to resolve context to an axis label
        const ctxLabel = isTraitAxisKey(context)
          ? axisShortLabel(context)
          : context;

        const confidence = Math.min(1.0, ctxSignals.length / 6) * 0.75;
        patterns.push({
          patternType: "hesitation",
          axisId: isTraitAxisKey(context) ? context : null,
          descriptionJa: `「${ctxLabel}」に関する質問で、平均より${Math.round(ratio)}倍長く考える傾向があります`,
          confidence: Math.round(confidence * 100) / 100,
          metadata: {
            context,
            meanResponseTimeMs: Math.round(ctxMean),
            overallMeanMs: Math.round(overallMean),
            ratio: Math.round(ratio * 100) / 100,
            sampleCount: ctxSignals.length,
          },
        });
      }
    }
  }

  return patterns;
}

/** Check if a string is a valid TraitAxisKey */
function isTraitAxisKey(s: string): s is TraitAxisKey {
  return TRAIT_AXES.some((a) => a.id === s);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. Behavioral Contradictions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 自己申告と行動の矛盾を検出する。
 * - answer_revision シグナルで、最初の直感と最終回答が軸トレンドと逆方向
 * - 応答時間が非常に長いのにスコアが極端 => 自己欺瞞の可能性
 */
export function detectBehavioralContradictions(
  signals: BehavioralSignal[],
  snapshots: AxisSnapshot[],
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // --- Answer revision contradictions ---
  const revisionSignals = signals.filter(
    (s) =>
      s.signal_type === "answer_revision" ||
      s.signal_type === "decision_reversal" ||
      s.signal_type === "hesitation_pattern",
  );

  if (revisionSignals.length >= 3 && snapshots.length >= 5) {
    // Group revisions by axis (from context)
    const byAxis = groupBy(
      revisionSignals.filter((s) => s.context != null && isTraitAxisKey(s.context)),
      (s) => s.context!,
    );

    for (const [axisId, axisRevisions] of Object.entries(byAxis)) {
      if (axisRevisions.length < 2) continue;

      // Get the axis trend from snapshots
      const axisSnapshots = snapshots.filter((s) => s.axisId === axisId);
      if (axisSnapshots.length < 3) continue;

      const axisMean = mean(axisSnapshots.map((s) => s.score));

      // Count how many revisions go against the axis trend
      let contradictionCount = 0;
      for (const rev of axisRevisions) {
        // value > 0 means revised toward positive, value < 0 toward negative
        const revisionDirection = rev.value > 0 ? 1 : -1;
        const trendDirection = axisMean > 0 ? 1 : -1;
        if (revisionDirection !== trendDirection) {
          contradictionCount++;
        }
      }

      const contradictionRate = contradictionCount / axisRevisions.length;
      if (contradictionRate >= 0.5 && contradictionCount >= 2) {
        const label = axisShortLabel(axisId);
        const confidence =
          Math.min(1.0, axisRevisions.length / 6) *
          contradictionRate *
          0.8;

        patterns.push({
          patternType: "contradiction",
          axisId,
          descriptionJa: `「${label}」について、最初の直感と最終回答が頻繁に矛盾しています`,
          confidence: Math.round(confidence * 100) / 100,
          metadata: {
            contradictionCount,
            totalRevisions: axisRevisions.length,
            contradictionRate:
              Math.round(contradictionRate * 100) / 100,
            axisMean: Math.round(axisMean * 1000) / 1000,
          },
        });
      }
    }
  }

  // --- Long response time + extreme score => possible self-deception ---
  const responseSignals = signals.filter(
    (s) =>
      (s.signal_type === "response_speed" || s.signal_type === "response_time") &&
      s.context != null,
  );

  if (responseSignals.length >= 8 && snapshots.length >= 5) {
    const allTimes = responseSignals.map((s) => s.value);
    const overallMean = mean(allTimes);
    const overallStd = stdDev(allTimes);
    const slowThreshold = overallMean + 1.5 * overallStd;

    // Find axes where response is slow but score is extreme
    const byContext = groupBy(
      responseSignals.filter((s) => isTraitAxisKey(s.context!)),
      (s) => s.context!,
    );

    for (const [axisId, ctxSignals] of Object.entries(byContext)) {
      if (ctxSignals.length < 3) continue;

      const ctxMeanTime = mean(ctxSignals.map((s) => s.value));
      if (ctxMeanTime <= slowThreshold) continue;

      // Check if axis score is extreme
      const axisSnapshots = snapshots.filter((s) => s.axisId === axisId);
      if (axisSnapshots.length < 3) continue;

      const axisScoreMean = mean(axisSnapshots.map((s) => s.score));
      const axisScoreStd = stdDev(axisSnapshots.map((s) => s.score));

      // Extreme = mean is close to -1 or +1 with low variance
      const isExtreme = Math.abs(axisScoreMean) > 0.6 && axisScoreStd < 0.3;
      if (!isExtreme) continue;

      const label = axisShortLabel(axisId);
      const confidence =
        Math.min(1.0, ctxSignals.length / 8) * 0.65;

      patterns.push({
        patternType: "behavioral_blind",
        axisId,
        descriptionJa: `「${label}」について、回答に時間がかかるのにスコアが一貫して極端です。確信的に見えますが、内面で葛藤がある可能性があります`,
        confidence: Math.round(confidence * 100) / 100,
        metadata: {
          meanResponseTimeMs: Math.round(ctxMeanTime),
          overallMeanMs: Math.round(overallMean),
          axisScoreMean: Math.round(axisScoreMean * 1000) / 1000,
          axisScoreStd: Math.round(axisScoreStd * 1000) / 1000,
          sampleCount: ctxSignals.length,
        },
      });
    }
  }

  return patterns;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. Full Pattern Detection (Orchestrator)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全6種のパターン検出を実行し、重複を排除して信頼度順に上位20件を返す。
 */
export function runFullPatternDetection(
  signals: BehavioralSignal[],
  snapshots: AxisSnapshot[],
): DetectedPattern[] {
  const all: DetectedPattern[] = [
    ...detectWeekdayPatterns(snapshots),
    ...detectTimeOfDayPatterns(signals, snapshots),
    ...detectCategoryAvoidance(signals),
    ...detectScoreCycles(snapshots),
    ...detectResponseTimeAnomalies(signals),
    ...detectBehavioralContradictions(signals, snapshots),
  ];

  // Deduplicate by (patternType, axisId) — keep highest confidence
  const deduped = new Map<string, DetectedPattern>();
  for (const pattern of all) {
    const key = `${pattern.patternType}:${pattern.axisId ?? "__null__"}`;
    const existing = deduped.get(key);
    if (!existing || existing.confidence < pattern.confidence) {
      deduped.set(key, pattern);
    }
  }

  // Sort by confidence descending, return top 20
  return [...deduped.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 20);
}
