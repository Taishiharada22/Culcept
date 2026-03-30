import "server-only";

import { getAIServiceClient } from "./db";
import type { AIProviderName } from "./types";

export type LogAiRunParams = {
  userId?: string;
  sessionId?: string;
  taskType: string;
  provider: AIProviderName;
  model: string;
  promptText: string;
  systemPrompt?: string;
  responseText: string | null;
  structuredJson: Record<string, unknown> | unknown[] | null;
  success: boolean;
  latencyMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  fallbackUsed: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

function fallbackModelName(_provider: AIProviderName): string {
  return (
    process.env.GEMINI_MODEL_DEFAULT ??
    process.env.GEMINI_MODEL ??
    "gemini-2.5-flash"
  ).trim();
}

export async function logAiRun(params: LogAiRunParams): Promise<string | null> {
  try {
    const client = getAIServiceClient();
    if (!client) {
      console.warn("[ai/logging] service client unavailable, skipping log");
      return null;
    }

    const normalizedModel =
      (params.model ?? "").trim() || fallbackModelName(params.provider);

    const row = {
      user_id: params.userId ?? null,
      session_id: params.sessionId ?? null,
      task_type: params.taskType,
      provider: params.provider,
      model: normalizedModel,
      prompt_text: params.promptText,
      system_prompt: params.systemPrompt ?? null,
      response_text: params.responseText,
      structured_json: params.structuredJson,
      success: params.success,
      latency_ms: params.latencyMs,
      input_tokens: params.inputTokens ?? null,
      output_tokens: params.outputTokens ?? null,
      fallback_used: params.fallbackUsed,
      error_message: params.errorMessage ?? null,
      metadata: params.metadata ?? null,
    };

    const { data, error } = await client
      .from("ai_runs")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      console.warn("[ai/logging] failed to log ai_run:", error.message);
      return null;
    }

    return data?.id ?? null;
  } catch (error) {
    console.warn("[ai/logging] unexpected error:", error);
    return null;
  }
}
