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

function envNumber(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
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
    "gemini-2.5-flash"
  ).trim();
}

function buildPrompt(request: AIProviderRequest): string {
  const blocks = [request.prompt.trim()];

  if (request.requireJson) {
    blocks.push([
      "Structured output contract:",
      "- Return exactly one JSON value.",
      "- Output only JSON. No prose, no markdown fences, no comments, no explanations.",
      "- The first character must be { or [ and the last character must be } or ].",
      "- Use double quotes for every key and string.",
      "- Every string value must be single-line plain text.",
      "- Do not include literal newlines, carriage returns, tabs, backticks or triple backticks anywhere in string values.",
      "- Do not include unescaped double quote characters inside string values.",
      "- Do not add wrapper keys, status text, headings or notes.",
      "- Do not add keys outside the requested schema.",
      "- If a value is unknown, use null, [] or {} only when the schema allows it.",
    ].join("\n"));
  }

  if (request.requireJson && request.jsonSchema) {
    blocks.push(`JSON schema:\n${JSON.stringify(request.jsonSchema)}`);
  }

  return blocks.filter(Boolean).join("\n\n");
}

function buildSystemInstruction(request: AIProviderRequest): string | null {
  const instructions = [
    request.systemPrompt?.trim() ?? "",
    request.requireJson
      ? [
          "You must return exactly one valid JSON value that matches the schema.",
          "Return JSON only.",
          "Do not use markdown fences.",
          "Do not prepend or append any free text.",
          "All string values must be single-line plain text.",
          "Do not emit literal newlines, carriage returns, tabs or backticks inside string values.",
          "Do not emit unescaped double quote characters inside string values.",
          "Do not add keys outside the schema.",
        ].join("\n")
      : "",
  ].filter(Boolean);

  return instructions.length > 0 ? instructions.join("\n\n") : null;
}

function buildThinkingConfig(
  request: AIProviderRequest,
  model: string,
): Record<string, unknown> | null {
  if (!request.requireJson) return null;

  if (model.startsWith("gemini-2.5")) {
    return { thinkingBudget: 0 };
  }

  return null;
}

function parseStructured(text: string): Record<string, unknown> | unknown[] {
  try {
    return parseStructuredJsonWithRecovery(text);
  } catch (error) {
    const debug = buildStructuredJsonRecoveryDebug(text);
    throw new AIProviderError({
      provider: "gemini",
      code: "malformed_structured_output",
      message:
        error instanceof Error
          ? `Gemini returned malformed JSON: ${error.message}`
          : "Gemini returned malformed JSON",
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
  }> = [{
    role: "user",
    parts,
  }];

  const payload: Record<string, unknown> = {
    contents,
  };
  const systemInstruction = buildSystemInstruction(request);
  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const generationConfig: Record<string, unknown> = {};
  if (request.temperature !== undefined) {
    generationConfig.temperature = request.temperature;
  }
  if (request.maxOutputTokens !== undefined) {
    generationConfig.maxOutputTokens = request.maxOutputTokens;
  }
  if (request.requireJson) {
    generationConfig.responseMimeType = "application/json";
    if (request.jsonSchema) {
      generationConfig.responseJsonSchema = request.jsonSchema;
    }
    const thinkingConfig = buildThinkingConfig(request, model);
    if (thinkingConfig) {
      generationConfig.thinkingConfig = thinkingConfig;
    }
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

    const usage = raw?.usageMetadata;
    let structured: Record<string, unknown> | unknown[] | null = null;
    if (request.requireJson) {
      try {
        structured = parseStructured(text);
      } catch (error) {
        if (error instanceof AIProviderError) {
          error.metadata = {
            ...(error.metadata ?? {}),
            finishReason: candidate?.finishReason ?? null,
            usageMetadata: usage ?? null,
          };
        }
        throw error;
      }
    }

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
