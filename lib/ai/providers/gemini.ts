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

function getApiKey(): string {
  return (process.env.GEMINI_API_KEY ?? "").trim();
}

function getModel(): string {
  return (
    process.env.GEMINI_MODEL_DEFAULT ??
    process.env.GEMINI_MODEL ??
    "gemini-2.0-flash"
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

function parseStructured(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("Structured response is not a JSON object");
  } catch (error) {
    throw new AIProviderError({
      provider: "gemini",
      code: "malformed_structured_output",
      message:
        error instanceof Error
          ? `Gemini returned malformed JSON: ${error.message}`
          : "Gemini returned malformed JSON",
      retryable: true,
    });
  }
}

export async function runGemini(
  request: AIProviderRequest,
  options?: { model?: string },
): Promise<AIProviderResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new AIProviderError({
      provider: "gemini",
      code: "api_key_missing",
      message: "GEMINI_API_KEY is not configured",
      retryable: false,
    });
  }

  const model = (options?.model ?? getModel()).trim() || getModel();
  const timeoutMs =
    request.timeoutMs ?? envNumber("GEMINI_TIMEOUT_MS", 30_000);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const parts: Array<{ text: string }> = [];

  const prompt = buildPrompt(request).trim();
  if (prompt) {
    parts.push({ text: prompt });
  }

  const contents: Array<{
    role: string;
    parts: Array<{ text: string }>;
  }> = [];

  if (request.systemPrompt?.trim()) {
    contents.push({
      role: "user",
      parts: [{ text: request.systemPrompt.trim() }],
    });
    contents.push({
      role: "model",
      parts: [{ text: "Understood." }],
    });
  }

  contents.push({
    role: "user",
    parts,
  });

  const payload: Record<string, unknown> = {
    contents,
  };

  const generationConfig: Record<string, unknown> = {};
  if (request.temperature !== undefined) {
    generationConfig.temperature = request.temperature;
  }
  if (request.maxOutputTokens !== undefined) {
    generationConfig.maxOutputTokens = request.maxOutputTokens;
  }
  if (request.requireJson) {
    generationConfig.responseMimeType = "application/json";
  }
  if (Object.keys(generationConfig).length > 0) {
    payload.generationConfig = generationConfig;
  }

  try {
    const response = await fetch(`${endpoint}?key=${apiKey}`, {
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
        provider: "gemini",
        code: "http_error",
        message: `Gemini request failed (${response.status}): ${body.slice(0, 500)}`,
        retryable: response.status >= 500 || response.status === 429,
        status: response.status,
      });
    }

    const raw = await response.json();

    const candidate = raw?.candidates?.[0];
    const text =
      candidate?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("")
        .trim() ?? "";

    if (!text) {
      throw new AIProviderError({
        provider: "gemini",
        code: "empty_output",
        message: "Gemini returned an empty response",
        retryable: true,
      });
    }

    const structured = request.requireJson ? parseStructured(text) : null;

    const usage = raw?.usageMetadata;

    return {
      provider: "gemini",
      model,
      text,
      structured,
      inputTokens:
        typeof usage?.promptTokenCount === "number" ? usage.promptTokenCount : null,
      outputTokens:
        typeof usage?.candidatesTokenCount === "number"
          ? usage.candidatesTokenCount
          : null,
      confidence: null,
    };
  } catch (error) {
    if (error instanceof AIProviderError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AIProviderError({
        provider: "gemini",
        code: "timeout",
        message: `Gemini timed out after ${timeoutMs}ms`,
        retryable: true,
      });
    }

    throw new AIProviderError({
      provider: "gemini",
      code: "request_failed",
      message:
        error instanceof Error
          ? `Gemini request failed: ${error.message}`
          : "Gemini request failed",
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}
