import "server-only";

import {
  AIProviderError,
  type AIProviderRequest,
  type AIProviderResponse,
} from "../types";
import {
  buildStructuredJsonRecoveryDebug,
  parseStructuredJsonWithRecovery,
} from "../structuredJson";

/**
 * OpenAI Provider — Gemini 503 フェイルオーバー用
 *
 * SDK 不使用（raw fetch）。Gemini provider と同じインターフェース。
 * OPENAI_API_KEY が未設定の場合は api_key_missing で即 throw し、
 * router 側で次の provider（または失敗）に進む。
 *
 * デフォルトモデル: gpt-4o-mini（低コスト・低レイテンシ）
 */

function envNumber(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function getApiKey(): string {
  return (process.env.OPENAI_API_KEY ?? "").trim();
}

function getModel(): string {
  return (process.env.OPENAI_MODEL_DEFAULT ?? "gpt-4o-mini").trim();
}

function parseStructured(text: string): Record<string, unknown> | unknown[] {
  try {
    return parseStructuredJsonWithRecovery(text);
  } catch (error) {
    const debug = buildStructuredJsonRecoveryDebug(text);
    throw new AIProviderError({
      provider: "openai",
      code: "malformed_structured_output",
      message:
        error instanceof Error
          ? `OpenAI returned malformed JSON: ${error.message}`
          : "OpenAI returned malformed JSON",
      retryable: true,
      responseText: text,
      metadata: {
        structuredOutputDebug: {
          baseCandidate: debug.baseCandidate,
          extractedCandidate: debug.extractedCandidate,
          repairedCandidate: debug.repairedCandidate,
        },
      },
    });
  }
}

export async function runOpenAI(
  request: AIProviderRequest,
  options?: { model?: string },
): Promise<AIProviderResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new AIProviderError({
      provider: "openai",
      code: "api_key_missing",
      message: "OPENAI_API_KEY is not configured",
      retryable: false,
    });
  }

  const model = (options?.model ?? getModel()).trim() || getModel();
  const timeoutMs =
    request.timeoutMs ?? envNumber("OPENAI_TIMEOUT_MS", 30_000);

  const endpoint = "https://api.openai.com/v1/chat/completions";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Build messages array (system + user)
  const messages: Array<{ role: string; content: string }> = [];

  if (request.systemPrompt?.trim()) {
    let systemContent = request.systemPrompt.trim();
    if (request.requireJson) {
      systemContent += "\n\nYou must return exactly one valid JSON value. Return JSON only. Do not use markdown fences.";
    }
    messages.push({ role: "system", content: systemContent });
  } else if (request.requireJson) {
    messages.push({
      role: "system",
      content: "You must return exactly one valid JSON value. Return JSON only. Do not use markdown fences.",
    });
  }

  let userContent = request.prompt.trim();
  if (request.requireJson && request.jsonSchema) {
    userContent += `\n\nJSON schema:\n${JSON.stringify(request.jsonSchema)}`;
  }
  messages.push({ role: "user", content: userContent });

  // Build request payload
  const payload: Record<string, unknown> = {
    model,
    messages,
  };
  if (request.temperature !== undefined) {
    payload.temperature = request.temperature;
  }
  if (request.frequencyPenalty !== undefined) {
    payload.frequency_penalty = request.frequencyPenalty;
  }
  if (request.presencePenalty !== undefined) {
    payload.presence_penalty = request.presencePenalty;
  }
  if (request.maxOutputTokens !== undefined) {
    payload.max_tokens = request.maxOutputTokens;
  }
  if (request.requireJson) {
    payload.response_format = { type: "json_object" };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AIProviderError({
        provider: "openai",
        code: "http_error",
        message: `OpenAI request failed (${response.status}): ${body.slice(0, 500)}`,
        retryable: response.status >= 500 || response.status === 429,
        status: response.status,
      });
    }

    const raw = await response.json();
    const choice = raw?.choices?.[0];
    const text = choice?.message?.content?.trim() ?? "";

    if (!text) {
      throw new AIProviderError({
        provider: "openai",
        code: "empty_output",
        message: "OpenAI returned an empty response",
        retryable: true,
      });
    }

    const usage = raw?.usage;
    let structured: Record<string, unknown> | unknown[] | null = null;
    if (request.requireJson) {
      try {
        structured = parseStructured(text);
      } catch (error) {
        if (error instanceof AIProviderError) {
          error.metadata = {
            ...(error.metadata ?? {}),
            finishReason: choice?.finish_reason ?? null,
            usageMetadata: usage ?? null,
          };
        }
        throw error;
      }
    }

    return {
      provider: "openai",
      model,
      text,
      structured,
      inputTokens:
        typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null,
      outputTokens:
        typeof usage?.completion_tokens === "number"
          ? usage.completion_tokens
          : null,
      confidence: null,
    };
  } catch (error) {
    if (error instanceof AIProviderError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AIProviderError({
        provider: "openai",
        code: "timeout",
        message: `OpenAI timed out after ${timeoutMs}ms`,
        retryable: true,
      });
    }

    throw new AIProviderError({
      provider: "openai",
      code: "request_failed",
      message:
        error instanceof Error
          ? `OpenAI request failed: ${error.message}`
          : "OpenAI request failed",
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}
