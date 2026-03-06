import "server-only";

import {
  AIProviderError,
  type AIProviderRequest,
  type AIProviderResponse,
} from "../types";

function envNumber(name: string, fallback: number): number {
  const value = Number((process.env[name] ?? "").trim());
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function getBaseUrl(): string {
  const raw =
    process.env.OLLAMA_BASE_URL ??
    process.env.OLLAMA_HOST ??
    "http://127.0.0.1:11434";
  return raw.trim().replace(/\/+$/, "");
}

function getModel(): string {
  return (
    process.env.OLLAMA_MODEL_DEFAULT ??
    process.env.OLLAMA_MODEL ??
    "llama3.1"
  ).trim();
}

function buildPrompt(request: AIProviderRequest): string {
  const schemaText = request.jsonSchema
    ? `\n\nOutput JSON only. Follow this JSON schema:\n${JSON.stringify(request.jsonSchema, null, 2)}`
    : "";

  const structured = request.requireJson
    ? "\n\nReturn strictly valid JSON only. Do not add prose before or after JSON."
    : "";

  return `${request.prompt}${structured}${schemaText}`;
}

function normalizeTextContent(payload: any): string {
  const content =
    payload?.message?.content ??
    payload?.response ??
    payload?.content ??
    "";
  return typeof content === "string" ? content.trim() : "";
}

function parseStructured(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("Structured response is not a JSON object");
  } catch (error) {
    throw new AIProviderError({
      provider: "ollama",
      code: "malformed_structured_output",
      message:
        error instanceof Error
          ? `Ollama returned malformed JSON: ${error.message}`
          : "Ollama returned malformed JSON",
      retryable: true,
    });
  }
}

export async function runOllama(
  request: AIProviderRequest,
  options?: { model?: string },
): Promise<AIProviderResponse> {
  const model = (options?.model ?? getModel()).trim() || getModel();
  const baseUrl = getBaseUrl();
  const timeoutMs =
    request.timeoutMs ?? envNumber("OLLAMA_TIMEOUT_MS", 20_000);

  const endpoint = `${baseUrl}/api/chat`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (request.systemPrompt?.trim()) {
    messages.push({ role: "system", content: request.systemPrompt.trim() });
  }

  const prompt = buildPrompt(request).trim();
  if (prompt) {
    messages.push({ role: "user", content: prompt });
  }

  const payload: Record<string, unknown> = {
    model,
    stream: false,
    messages,
  };

  if (request.temperature !== undefined || request.maxOutputTokens !== undefined) {
    const options: Record<string, unknown> = {};
    if (request.temperature !== undefined) options.temperature = request.temperature;
    if (request.maxOutputTokens !== undefined) {
      options.num_predict = request.maxOutputTokens;
    }
    payload.options = options;
  }

  if (request.requireJson || request.jsonSchema) {
    payload.format = "json";
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AIProviderError({
        provider: "ollama",
        code: "http_error",
        message: `Ollama request failed (${response.status}): ${body.slice(0, 300)}`,
        retryable: response.status >= 500 || response.status === 429,
        status: response.status,
      });
    }

    const raw = await response.json();
    const text = normalizeTextContent(raw);

    if (!text) {
      throw new AIProviderError({
        provider: "ollama",
        code: "empty_output",
        message: "Ollama returned an empty response",
        retryable: true,
      });
    }

    const structured = request.requireJson ? parseStructured(text) : null;

    return {
      provider: "ollama",
      model,
      text,
      structured,
      inputTokens:
        typeof raw?.prompt_eval_count === "number" ? raw.prompt_eval_count : null,
      outputTokens:
        typeof raw?.eval_count === "number" ? raw.eval_count : null,
      confidence: null,
    };
  } catch (error) {
    if (error instanceof AIProviderError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AIProviderError({
        provider: "ollama",
        code: "timeout",
        message: `Ollama timed out after ${timeoutMs}ms`,
        retryable: true,
      });
    }

    throw new AIProviderError({
      provider: "ollama",
      code: "request_failed",
      message:
        error instanceof Error
          ? `Ollama request failed: ${error.message}`
          : "Ollama request failed",
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}
