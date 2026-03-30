import "server-only";

import { getPeriodLabel } from "./periods";
import { getAtmosphereLabel } from "./atmosphereData";
import { getPerspectiveLabel } from "./perspectiveData";
import { getComparisonLabel } from "./comparisonData";
import { getTriggerLabel } from "./triggerData";

export type RecoveryPromptInput = {
  period: string;
  atmosphere: string;
  perspective: string;
  comparison: string;
  triggers: string[];
};

/**
 * Build a minimal prompt for memory recovery.
 * Drastically reduced size for local LLMs with limited context/speed.
 */
export function buildRecoveryPrompt(input: RecoveryPromptInput): {
  prompt: string;
  systemPrompt: string;
} {
  const systemPrompt = `記憶の断片から自分像を推測描写する。断定禁止、「〜かもしれません」調。日本語JSON。`;

  const periodLabel = getPeriodLabel(input.period);
  const atmosphereLabel = getAtmosphereLabel(input.atmosphere);
  const perspectiveLabel = getPerspectiveLabel(input.perspective);
  const comparisonLabel = getComparisonLabel(input.comparison);
  const triggerLabels = input.triggers.map(getTriggerLabel).join("、");

  const prompt = `時期:${periodLabel} 空気感:${atmosphereLabel} 他人視点:${perspectiveLabel} 今との違い:${comparisonLabel} トリガー:${triggerLabels}

JSON: {"narrative":"2-3文の推測描写","title":"15字以内の具体的タイトル（抽象語のみ禁止）","echoes":["今に残るもの x2-3"],"layers":{"events":"その頃何が起きていたか1文","innerState":"内面の状態1文","learnedPatterns":"覚えた動き方1文","presentImpact":"今への影響1文","deepDivePrompts":["深掘り質問 x3"]}}`;

  return { prompt, systemPrompt };
}
