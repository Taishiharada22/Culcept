// lib/stargazer/microEMABridge.ts
// Micro-EMA → 軸スコアのブリッジ
// EMAデータを集約し、メイン軸スコアに部分的な更新を適用する

import type { TraitAxisKey } from "./traitAxes";
import { getEntries } from "./microEMA";

const AXIS_SCORES_KEY = "stargazer_axis_scores_v1";
const EMA_LAST_APPLIED_KEY = "stargazer_ema_last_applied_v1";
const TRANSFORM_INTENTS_KEY = "stargazer_transform_intents_v1";
const TRANSFORM_PROGRESS_KEY = "stargazer_transform_progress_v1";

/**
 * Apply recent Micro-EMA data as a weighted partial update to axis scores.
 *
 * Design: EMA scores carry less weight than formal observation (0.15 factor),
 * since they're quick 5-second snapshots, not deep reflection.
 * This function is idempotent — it tracks which entries have been applied.
 *
 * Returns the number of entries applied.
 */
export function applyEMAToAxisScores(): number {
  try {
    const entries = getEntries();
    if (entries.length === 0) return 0;

    // Get last applied timestamp
    const lastApplied = localStorage.getItem(EMA_LAST_APPLIED_KEY) || "1970-01-01";

    // Filter to unapplied entries
    const newEntries = entries.filter(e => e.timestamp > lastApplied);
    if (newEntries.length === 0) return 0;

    // Load current axis scores
    const raw = localStorage.getItem(AXIS_SCORES_KEY);
    if (!raw) return 0; // No axis scores yet
    const axisScores: Partial<Record<TraitAxisKey, number>> = JSON.parse(raw);

    // Group new entries by axis and compute average
    const axisAverages: Partial<Record<TraitAxisKey, { sum: number; count: number }>> = {};
    for (const entry of newEntries) {
      if (!axisAverages[entry.axis]) {
        axisAverages[entry.axis] = { sum: 0, count: 0 };
      }
      axisAverages[entry.axis]!.sum += entry.score;
      axisAverages[entry.axis]!.count += 1;
    }

    // Apply weighted partial update
    const EMA_WEIGHT = 0.15; // EMA carries 15% influence compared to formal observation

    for (const [axis, data] of Object.entries(axisAverages) as [TraitAxisKey, { sum: number; count: number }][]) {
      const emaAvg = data.sum / data.count;
      const currentScore = axisScores[axis] ?? 0;

      // Weighted blend: current score stays dominant, EMA nudges it
      axisScores[axis] = currentScore * (1 - EMA_WEIGHT) + emaAvg * EMA_WEIGHT;

      // Clamp to -1..1
      axisScores[axis] = Math.max(-1, Math.min(1, axisScores[axis]!));
    }

    // Save updated scores
    localStorage.setItem(AXIS_SCORES_KEY, JSON.stringify(axisScores));

    // Update last applied timestamp
    const latestTimestamp = newEntries[newEntries.length - 1].timestamp;
    localStorage.setItem(EMA_LAST_APPLIED_KEY, latestTimestamp);

    return newEntries.length;
  } catch {
    return 0;
  }
}

// ── Transformation Progress Auto-Check ──

interface TransformIntent {
  axisId: string;
  direction: "increase" | "decrease";
  baselineScore: number;
  createdAt: string;
}

interface TransformProgress {
  axisId: string;
  baselineScore: number;
  currentScore: number;
  delta: number;
  direction: "increase" | "decrease";
  isProgressing: boolean;
  checkedAt: string;
}

/**
 * 自動変容進捗チェック。
 * transformation_readiness 質問の回答から保存された意図（intents）と
 * 現在の軸スコアを比較し、進捗を静かに更新する。
 *
 * 呼び出し元: StargazerHome の loadRealData() 内で applyEMAToAxisScores() と一緒に呼ぶ。
 */
export function autoCheckTransformationProgress(): TransformProgress[] {
  try {
    const rawIntents = localStorage.getItem(TRANSFORM_INTENTS_KEY);
    if (!rawIntents) return [];

    const intents: TransformIntent[] = JSON.parse(rawIntents);
    if (intents.length === 0) return [];

    const rawScores = localStorage.getItem(AXIS_SCORES_KEY);
    if (!rawScores) return [];

    const axisScores: Partial<Record<string, number>> = JSON.parse(rawScores);
    const results: TransformProgress[] = [];

    for (const intent of intents) {
      const currentScore = axisScores[intent.axisId];
      if (currentScore === undefined) continue;

      const delta = currentScore - intent.baselineScore;
      const isProgressing =
        intent.direction === "increase" ? delta > 0.05 : delta < -0.05;

      results.push({
        axisId: intent.axisId,
        baselineScore: intent.baselineScore,
        currentScore,
        delta,
        direction: intent.direction,
        isProgressing,
        checkedAt: new Date().toISOString(),
      });
    }

    // 進捗データを保存（UIが後から読める）
    if (results.length > 0) {
      localStorage.setItem(TRANSFORM_PROGRESS_KEY, JSON.stringify(results));
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * 変容意図を保存する。
 * transformation_readiness 質問への回答後に呼ばれる。
 */
export function saveTransformIntent(
  axisId: string,
  direction: "increase" | "decrease",
  baselineScore: number,
): void {
  try {
    const rawIntents = localStorage.getItem(TRANSFORM_INTENTS_KEY);
    const intents: TransformIntent[] = rawIntents ? JSON.parse(rawIntents) : [];

    // 同じ軸の古い意図を上書き
    const filtered = intents.filter((i) => i.axisId !== axisId);
    filtered.push({
      axisId,
      direction,
      baselineScore,
      createdAt: new Date().toISOString(),
    });

    localStorage.setItem(TRANSFORM_INTENTS_KEY, JSON.stringify(filtered));
  } catch {
    // Non-fatal
  }
}
