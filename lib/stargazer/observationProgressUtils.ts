// lib/stargazer/observationProgressUtils.ts
// 観測完了後の進捗計算ユーティリティ

import type { TraitAxisKey } from "./traitAxes";
import { getAxisLabels } from "./traitAxes";
import {
  SCENARIO_QUESTIONS,
  type ScenarioQuestion,
} from "./situationalQuestions";

export interface TouchedAxis {
  key: TraitAxisKey;
  label: string;
  totalWeight: number;
}

export interface AxisDelta {
  key: TraitAxisKey;
  label: string;
  delta: number; // positive = moved right, negative = moved left
}

/**
 * 今日の回答から、どの軸が触れられたかを算出
 */
export function computeTouchedAxes(
  answers: { questionId: string; optionId: string; axisId?: TraitAxisKey }[]
): TouchedAxis[] {
  const axisWeights: Record<string, number> = {};

  for (const answer of answers) {
    if (answer.axisId) {
      const key = answer.axisId as string;
      axisWeights[key] = (axisWeights[key] || 0) + 1;
      continue;
    }

    const question = SCENARIO_QUESTIONS.find((q) => q.id === answer.questionId);
    if (!question) continue;

    const option = question.options.find((o) => o.id === answer.optionId);
    if (!option?.axisMappings) continue;

    for (const mapping of option.axisMappings) {
      const key = mapping.key as string;
      axisWeights[key] = (axisWeights[key] || 0) + Math.abs(mapping.weight);
    }

    // Also check follow-ups
    if (question.followUps) {
      for (const fu of question.followUps) {
        if (fu.triggeredBy === answer.optionId) {
          for (const fuOpt of fu.options) {
            if (fuOpt.axisMappings) {
              for (const mapping of fuOpt.axisMappings) {
                const key = mapping.key as string;
                axisWeights[key] = (axisWeights[key] || 0) + Math.abs(mapping.weight) * 0.5;
              }
            }
          }
        }
      }
    }
  }

  return Object.entries(axisWeights)
    .map(([key, totalWeight]) => {
      const labels = getAxisLabels(key as TraitAxisKey);
      return {
        key: key as TraitAxisKey,
        label: labels ? `${labels.left}↔${labels.right}` : key,
        totalWeight,
      };
    })
    .sort((a, b) => b.totalWeight - a.totalWeight);
}

/**
 * localStorage からの連続観測日数を計算
 */
export function computeObservationStreak(): {
  streak: number;
  totalDays: number;
} {
  // 保存側は culcept_sg_observe_live_v1_ だが、旧データは culcept_sg_observe_v1_ にある
  const prefixes = ["culcept_sg_observe_live_v1_", "culcept_sg_observe_v1_"];
  const dateSet = new Set<string>();

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      for (const prefix of prefixes) {
        if (key.startsWith(prefix)) {
          const dateStr = key.replace(prefix, "");
          // YYYY-MM-DD 形式かチェック
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
          const data = localStorage.getItem(key);
          if (data) {
            try {
              const parsed = JSON.parse(data);
              if (parsed.completedAt) dateSet.add(dateStr);
            } catch {
              // Skip invalid entries
            }
          }
          break;
        }
      }
    }

    // retentionHooks の観測日リストも統合（最も信頼性の高いソース）
    const retentionDays = localStorage.getItem("culcept_sg_observation_days_v1");
    if (retentionDays) {
      try {
        const days: string[] = JSON.parse(retentionDays);
        for (const d of days) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dateSet.add(d);
        }
      } catch { /* skip */ }
    }
  } catch {
    return { streak: 0, totalDays: 0 };
  }

  const dates = Array.from(dateSet);

  if (dates.length === 0) return { streak: 0, totalDays: 0 };

  // Sort dates descending
  dates.sort((a, b) => b.localeCompare(a));

  // Calculate streak from today backwards
  const today = new Date();
  let streak = 0;
  let checkDate = new Date(today);

  for (let i = 0; i < 365; i++) {
    const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
    if (dates.includes(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return { streak, totalDays: dates.length };
}
