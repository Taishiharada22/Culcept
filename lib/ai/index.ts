import "server-only";

import { lookupSemanticCache, writeSemanticCache } from "./cache";
import { maybeGenerateTeacherOutput } from "./eval";
import { logAiRun } from "./logging";
import { resolveModelSelection, toModelSelectionMetadata } from "./modelSelection";
import { runGemini } from "./providers/gemini";
import { runOllama } from "./providers/ollama";
import { resolveRouterDecision } from "./router";
import {
  AIProviderError,
  isAIProviderError,
  type AIRunResult,
  type AIProviderName,
  type AIProviderResponse,
  type RunAIParams,
} from "./types";

function normalizeErrorMessage(error: unknown): string {
  if (isAIProviderError(error)) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "unknown_error";
}

function asRecordOrNull(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function mergeMetadata(
  base: Record<string, unknown> | null | undefined,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(asRecordOrNull(base) ?? {}),
    ...extra,
  };
}

async function executeProvider(
  provider: AIProviderName,
  params: RunAIParams,
  options?: { modelOverride?: string | null },
): Promise<AIProviderResponse> {
  const request = {
    prompt: params.prompt,
    systemPrompt: params.systemPrompt,
    jsonSchema: params.jsonSchema,
    requireJson: params.requireJson,
    temperature: params.temperature,
    maxOutputTokens: params.maxOutputTokens,
    timeoutMs: params.timeoutMs,
    inputParts: params.inputParts,
  };

  const modelOverride = (options?.modelOverride ?? "").trim();

  if (provider === "ollama") {
    return runOllama(request, {
      model: modelOverride || undefined,
    });
  }

  if (provider === "gemini") {
    return runGemini(request, {
      model: modelOverride || undefined,
    });
  }

  throw new AIProviderError({
    provider,
    code: "unknown_provider",
    message: `Unsupported provider: ${provider}`,
    retryable: false,
  });
}

function toStructuredOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function runAI(params: RunAIParams): Promise<AIRunResult> {
  const startedAt = Date.now();
  const selectionDecision = await resolveModelSelection(params);
  const selectionMetadata = toModelSelectionMetadata(selectionDecision);

  const effectiveMetadata = mergeMetadata(params.metadata ?? null, selectionMetadata);
  const effectiveParams: RunAIParams = {
    ...params,
    preferredProvider: selectionDecision.preferredProvider ?? params.preferredProvider,
    metadata: effectiveMetadata,
  };

  const decision = resolveRouterDecision(effectiveParams);
  const cacheLookup = await lookupSemanticCache(effectiveParams);

  if (cacheLookup.cacheHit && cacheLookup.cached) {
    const latencyMs = Date.now() - startedAt;
    const cached = cacheLookup.cached;

    const aiRunId = await logAiRun({
      userId: effectiveParams.userId,
      sessionId: effectiveParams.sessionId,
      taskType: effectiveParams.taskType,
      provider: cached.provider,
      model: cached.model,
      promptText: effectiveParams.prompt,
      systemPrompt: effectiveParams.systemPrompt,
      responseText: cached.text,
      structuredJson: cached.structured,
      success: true,
      latencyMs,
      fallbackUsed: false,
      metadata: {
        ...effectiveMetadata,
        routerReason: "cache_hit",
        routerPrimary: decision.primary,
        routerFallback: decision.fallback,
        longPromptThresholdChars: decision.longPromptThresholdChars,
        cacheHit: true,
        cacheKey: cacheLookup.cacheKey,
        cacheReason: cacheLookup.reason,
        cacheSourceAiRunId: cached.sourceAiRunId,
      },
    });

    console.info("[ai/run] cache hit", {
      taskType: effectiveParams.taskType,
      provider: cached.provider,
      model: cached.model,
      cacheKey: cacheLookup.cacheKey,
      selectedModelKey: selectionDecision.selectedModelKey,
      selectedRole: selectionDecision.selectedRole,
    });

    return {
      text: cached.text,
      provider: cached.provider,
      model: cached.model,
      latencyMs,
      success: true,
      structured: cached.structured,
      fallbackUsed: false,
      cacheHit: true,
      cacheKey: cacheLookup.cacheKey,
      confidence: null,
      errorMessage: null,
      aiRunId,
    };
  }

  const providersToTry: AIProviderName[] = [decision.primary];
  if (decision.fallback && decision.fallback !== decision.primary) {
    providersToTry.push(decision.fallback);
  }

  let fallbackUsed = false;
  let lastError: unknown = null;
  let lastProvider: AIProviderName = decision.primary;
  let output: AIProviderResponse | null = null;

  for (let index = 0; index < providersToTry.length; index++) {
    const provider = providersToTry[index];
    lastProvider = provider;

    try {
      const modelOverride =
        provider === selectionDecision.preferredProvider
          ? selectionDecision.modelOverride
          : null;

      const result = await executeProvider(provider, effectiveParams, {
        modelOverride,
      });

      if (!result.text?.trim()) {
        throw new AIProviderError({
          provider,
          code: "empty_output",
          message: `${provider} returned empty output`,
          retryable: true,
        });
      }
      output = result;
      fallbackUsed = index > 0;
      if (fallbackUsed) {
        console.warn("[ai/run] fallback provider used", {
          taskType: effectiveParams.taskType,
          primary: decision.primary,
          fallback: provider,
        });
      }
      break;
    } catch (error) {
      lastError = error;
      console.warn("[ai/run] provider attempt failed", {
        provider,
        taskType: effectiveParams.taskType,
        error: normalizeErrorMessage(error),
      });

      const canTryFallback = index < providersToTry.length - 1;
      if (!canTryFallback) {
        break;
      }
    }
  }

  const latencyMs = Date.now() - startedAt;

  if (!output) {
    const errorMessage = normalizeErrorMessage(lastError);

    const aiRunId = await logAiRun({
      userId: effectiveParams.userId,
      sessionId: effectiveParams.sessionId,
      taskType: effectiveParams.taskType,
      provider: lastProvider,
      model: "",
      promptText: effectiveParams.prompt,
      systemPrompt: effectiveParams.systemPrompt,
      responseText: null,
      structuredJson: null,
      success: false,
      latencyMs,
      fallbackUsed,
      errorMessage,
      metadata: {
        ...effectiveMetadata,
        routerReason: decision.reason,
        routerPrimary: decision.primary,
        routerFallback: decision.fallback,
        longPromptThresholdChars: decision.longPromptThresholdChars,
        cacheHit: false,
        cacheKey: cacheLookup.cacheKey,
        cacheReason: cacheLookup.reason,
      },
    });

    return {
      text: "",
      provider: lastProvider,
      model: "",
      latencyMs,
      success: false,
      structured: null,
      fallbackUsed,
      cacheHit: false,
      cacheKey: cacheLookup.cacheKey,
      confidence: null,
      errorMessage,
      aiRunId,
    };
  }

  const result: AIRunResult = {
    text: output.text,
    provider: output.provider,
    model: output.model,
    latencyMs,
    success: true,
    structured: toStructuredOrNull(output.structured),
    fallbackUsed,
    cacheHit: false,
    cacheKey: cacheLookup.cacheKey,
    confidence: output.confidence ?? null,
    errorMessage: null,
    aiRunId: null,
  };

  const aiRunId = await logAiRun({
    userId: effectiveParams.userId,
    sessionId: effectiveParams.sessionId,
    taskType: effectiveParams.taskType,
    provider: output.provider,
    model: output.model,
    promptText: effectiveParams.prompt,
    systemPrompt: effectiveParams.systemPrompt,
    responseText: output.text,
    structuredJson: toStructuredOrNull(output.structured),
    success: true,
    latencyMs,
    inputTokens: output.inputTokens ?? null,
    outputTokens: output.outputTokens ?? null,
    fallbackUsed,
    metadata: {
      ...effectiveMetadata,
      routerReason: decision.reason,
      routerPrimary: decision.primary,
      routerFallback: decision.fallback,
      longPromptThresholdChars: decision.longPromptThresholdChars,
      cacheHit: false,
      cacheKey: cacheLookup.cacheKey,
      cacheReason: cacheLookup.reason,
      selectedProvider: selectionDecision.preferredProvider,
      selectedModelOverride: selectionDecision.modelOverride,
      selectedModelApplied:
        output.provider === selectionDecision.preferredProvider &&
        (!selectionDecision.modelOverride ||
          output.model === selectionDecision.modelOverride),
    },
  });

  result.aiRunId = aiRunId;

  if (cacheLookup.cacheKey && aiRunId && output.text.trim()) {
    await writeSemanticCache({
      cacheKey: cacheLookup.cacheKey,
      params: effectiveParams,
      sourceAiRunId: aiRunId,
      output: {
        text: output.text,
        structured: toStructuredOrNull(output.structured),
        provider: output.provider,
        model: output.model,
      },
      metadata: {
        routeTaskType: effectiveParams.taskType,
        routerReason: decision.reason,
        selectedModelKey: selectionDecision.selectedModelKey,
        selectedRole: selectionDecision.selectedRole,
      },
    });
  }

  if (aiRunId) {
    void maybeGenerateTeacherOutput({
      aiRunId,
      params: effectiveParams,
      result,
    });
  }

  return result;
}

export * from "./types";
