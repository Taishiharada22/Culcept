import "server-only";

import type { AIProviderName, RunAIParams } from "./types";

export type RouterDecision = {
  primary: AIProviderName;
  fallback: AIProviderName | null;
  reason: string;
  longPromptThresholdChars: number;
  fallbackEnabled: boolean;
};

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function envNumber(name: string, fallback: number): number {
  const value = Number((process.env[name] ?? "").trim());
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function envString(name: string, fallback: string): string {
  const value = (process.env[name] ?? "").trim();
  return value || fallback;
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
  const routerEnabled = envBool("AI_ROUTER_ENABLED", true);
  const fallbackEnabled = envBool("AI_FALLBACK_ENABLED", true);
  const defaultProvider = envString("AI_DEFAULT_PROVIDER", "ollama") as AIProviderName;
  const longPromptThresholdChars = envNumber("AI_LONG_PROMPT_THRESHOLD_CHARS", 3500);

  if (!routerEnabled) {
    return {
      primary: defaultProvider,
      fallback: fallbackEnabled ? (defaultProvider === "ollama" ? "gemini" : "ollama") : null,
      reason: "router_disabled",
      longPromptThresholdChars,
      fallbackEnabled,
    };
  }

  const preferred = params.preferredProvider;
  if (preferred) {
    const other: AIProviderName = preferred === "ollama" ? "gemini" : "ollama";
    return {
      primary: preferred,
      fallback: fallbackEnabled && params.allowFallback !== false ? other : null,
      reason: "preferred_provider",
      longPromptThresholdChars,
      fallbackEnabled,
    };
  }

  const promptLength = (params.prompt ?? "").length + (params.systemPrompt ?? "").length;
  const isLongPrompt = promptLength > longPromptThresholdChars;

  if (isLongPrompt) {
    return {
      primary: "gemini",
      fallback: fallbackEnabled && params.allowFallback !== false ? "ollama" : null,
      reason: "long_prompt_prefers_gemini",
      longPromptThresholdChars,
      fallbackEnabled,
    };
  }

  if (HIGH_QUALITY_TASK_TYPES.has(params.taskType)) {
    return {
      primary: "gemini",
      fallback: fallbackEnabled && params.allowFallback !== false ? "ollama" : null,
      reason: "task_prefers_high_quality",
      longPromptThresholdChars,
      fallbackEnabled,
    };
  }

  if (LOW_COST_TASK_TYPES.has(params.taskType)) {
    return {
      primary: "ollama",
      fallback: fallbackEnabled && params.allowFallback !== false ? "gemini" : null,
      reason: "task_prefers_low_cost",
      longPromptThresholdChars,
      fallbackEnabled,
    };
  }

  return {
    primary: defaultProvider,
    fallback: fallbackEnabled && params.allowFallback !== false
      ? (defaultProvider === "ollama" ? "gemini" : "ollama")
      : null,
    reason: "default_provider",
    longPromptThresholdChars,
    fallbackEnabled,
  };
}
