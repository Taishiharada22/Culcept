import "server-only";

import {
  PRIMARY_AI_PROVIDER,
  type AIProviderName,
  type RunAIParams,
} from "./types";

export type RouterDecision = {
  primary: AIProviderName;
  fallback: AIProviderName | null;
  reason: string;
  longPromptThresholdChars: number;
  fallbackEnabled: boolean;
};

function envNumber(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

const HIGH_QUALITY_TASK_TYPES = new Set([
  "high_quality_chat",
  "detailed_analysis",
  "creative_writing",
]);

const LOW_COST_TASK_TYPES = new Set([
  "summary",
  "classification",
  "extraction",
  "tagging",
  "short_answer",
]);

export function resolveRouterDecision(params: RunAIParams): RouterDecision {
  const longPromptThresholdChars = envNumber("AI_LONG_PROMPT_THRESHOLD_CHARS", 3500);
  const promptLength = (params.prompt ?? "").length + (params.systemPrompt ?? "").length;
  const isLongPrompt = promptLength > longPromptThresholdChars;
  let reason = "gemini_only_default";
  if (params.preferredProvider === PRIMARY_AI_PROVIDER) {
    reason = "preferred_provider";
  } else if (params.preferredProvider && params.preferredProvider !== PRIMARY_AI_PROVIDER) {
    reason = "preferred_provider_disabled";
  } else if (isLongPrompt) {
    reason = "long_prompt_prefers_gemini";
  } else if (HIGH_QUALITY_TASK_TYPES.has(params.taskType)) {
    reason = "task_prefers_high_quality";
  } else if (LOW_COST_TASK_TYPES.has(params.taskType)) {
    reason = "low_cost_route_removed_gemini_only";
  }

  return {
    primary: PRIMARY_AI_PROVIDER,
    fallback: null,
    reason,
    longPromptThresholdChars,
    fallbackEnabled: false,
  };
}
