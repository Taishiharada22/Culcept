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

/** Task prefixes eligible for OpenAI failover */
const FAILOVER_ELIGIBLE_PREFIXES = [
  "stargazer_",    // All Stargazer tasks (Alter, prophecy, prediction, etc.)
  "orbiter_",      // Orbiter tasks
  "identity_",     // Identity tasks
  "perspective_",  // Perspective Engine tasks (task_query, classify) — PE critical path
  "morning_",      // Morning Protocol tasks (plan_extract, delta detect) — CEO: Gemini障害でV1ゴミ出力は許容不可
  "alter_morning_", // Alter Morning v2 pipeline (comprehension, narration) — W3-PR-5: Gemini 503 で null 落ち許容不可
  "coalter_",      // CoAlter tasks (proposal generation) — CEO: 503障害でCoAlter不在は許容不可
];

function isOpenAIFallbackAvailable(): boolean {
  return (process.env.OPENAI_API_KEY ?? "").trim().length > 0;
}

function isFailoverEligible(taskType: string): boolean {
  return FAILOVER_ELIGIBLE_PREFIXES.some((prefix) => taskType.startsWith(prefix));
}

export function resolveRouterDecision(params: RunAIParams): RouterDecision {
  const longPromptThresholdChars = envNumber("AI_LONG_PROMPT_THRESHOLD_CHARS", 3500);
  const promptLength = (params.prompt ?? "").length + (params.systemPrompt ?? "").length;
  const isLongPrompt = promptLength > longPromptThresholdChars;
  let reason = "gemini_only_default";
  if (params.preferredProvider === PRIMARY_AI_PROVIDER) {
    reason = "preferred_provider";
  } else if (params.preferredProvider) {
    // preferredProvider is set but not the primary → currently only "openai" reaches here
    reason = params.preferredProvider === "openai"
      ? "preferred_openai"
      : "preferred_provider_disabled";
  } else if (isLongPrompt) {
    reason = "long_prompt_prefers_gemini";
  } else if (HIGH_QUALITY_TASK_TYPES.has(params.taskType)) {
    reason = "task_prefers_high_quality";
  } else if (LOW_COST_TASK_TYPES.has(params.taskType)) {
    reason = "low_cost_route_removed_gemini_only";
  }

  // OpenAI fallback for latency-sensitive Alter tasks
  const fallbackAvailable = isOpenAIFallbackAvailable();
  const eligible = isFailoverEligible(params.taskType);
  const fallbackEnabled = fallbackAvailable && eligible;

  if (fallbackEnabled) {
    reason = reason === "gemini_only_default" ? "gemini_primary_openai_fallback" : reason;
  }

  return {
    primary: PRIMARY_AI_PROVIDER,
    fallback: fallbackEnabled ? "openai" : null,
    reason,
    longPromptThresholdChars,
    fallbackEnabled,
  };
}
