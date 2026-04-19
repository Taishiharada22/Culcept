import "server-only";

import { lookupSemanticCache, writeSemanticCache } from "./cache";
import { maybeGenerateTeacherOutput } from "./eval";
import { logAiRun } from "./logging";
import { resolveModelSelection, toModelSelectionMetadata } from "./modelSelection";
import { runGemini } from "./providers/gemini";
import { runOpenAI } from "./providers/openai";
import { runStudent } from "./providers/student";
import { resolveRouterDecision } from "./router";
import { resolveStudentRouting, type StudentRoutingDecision } from "./studentRouting";
import { isStargazerStudentTask } from "@/lib/stargazer/studentTrack";
import { maybeRunStargazerShadow } from "@/lib/stargazer/shadowRun";
import { isOrbiterStudentTask } from "@/lib/orbiter/studentTrack";
import { maybeRunOrbiterShadow } from "@/lib/orbiter/shadowRun";
import { isIdentityStudentTask } from "@/lib/identity/studentTrack";
import { maybeRunIdentityShadow } from "@/lib/identity/shadowRun";
import {
  AIProviderError,
  PRIMARY_AI_PROVIDER,
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

function extractProviderErrorContext(error: unknown): {
  responseText: string | null;
  structuredJson: Record<string, unknown> | unknown[] | null;
  metadata: Record<string, unknown> | null;
} {
  if (!isAIProviderError(error)) {
    return {
      responseText: null,
      structuredJson: null,
      metadata: null,
    };
  }

  return {
    responseText:
      typeof error.responseText === "string" && error.responseText.trim()
        ? error.responseText
        : null,
    structuredJson: toStructuredOrNull(error.structured),
    metadata: asRecordOrNull(error.metadata),
  };
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
    frequencyPenalty: params.frequencyPenalty,
    presencePenalty: params.presencePenalty,
    maxOutputTokens: params.maxOutputTokens,
    timeoutMs: params.timeoutMs,
    inputParts: params.inputParts,
  };

  const modelOverride = (options?.modelOverride ?? "").trim();

  if (provider === PRIMARY_AI_PROVIDER) {
    return runGemini(request, {
      model: modelOverride || undefined,
    });
  }

  if (provider === "openai") {
    return runOpenAI(request, {
      model: modelOverride || undefined,
    });
  }

  if (provider === "student") {
    return runStudent(request, {
      model: modelOverride || undefined,
    });
  }

  throw new AIProviderError({
    provider: PRIMARY_AI_PROVIDER,
    code: "provider_disabled",
    message: `Unsupported provider: ${provider}`,
    retryable: false,
  });
}

function toStructuredOrNull(
  value: unknown,
): Record<string, unknown> | unknown[] | null {
  if (!value || typeof value !== "object") return null;
  // object でも array でも通す
  return value as Record<string, unknown> | unknown[];
}

function defaultModelForProvider(provider: AIProviderName): string {
  if (provider === "openai") {
    return (process.env.OPENAI_MODEL_DEFAULT ?? "gpt-4o-mini").trim();
  }
  return (
    process.env.GEMINI_MODEL_DEFAULT ??
    process.env.GEMINI_MODEL ??
    "gemini-2.5-flash"
  ).trim();
}

/**
 * Student provider 試行
 *
 * 成功すれば AIRunResult を返す。失敗すれば null を返し、
 * 呼び出し元の runAI() が既存 stable provider にフォールバックする。
 *
 * テレメトリ: 成功・失敗とも logAiRun に記録される。
 * metadata に studentRouting / studentFallbackReason を含む。
 */
async function attemptStudentProvider(
  params: RunAIParams,
  startedAt: number,
  decision: Extract<StudentRoutingDecision, { state: "eligible" }>,
): Promise<AIRunResult | null> {
  const studentTelemetry = {
    studentProvider: true,
    studentRouting: decision.reason,
    studentRolloutPercent: decision.rolloutPercent,
    studentAssignmentBucket: decision.assignmentBucket,
    studentSeedSource: decision.seedSource,
  };

  try {
    const output = await executeProvider("student", params, {});

    if (!output.text?.trim()) {
      console.warn("[ai/student] empty output, falling back to stable", {
        taskType: params.taskType,
      });
      await logAiRun({
        userId: params.userId,
        sessionId: params.sessionId,
        taskType: params.taskType,
        provider: "student",
        model: output.model,
        promptText: params.prompt,
        systemPrompt: params.systemPrompt,
        responseText: null,
        structuredJson: null,
        success: false,
        latencyMs: Date.now() - startedAt,
        fallbackUsed: false,
        errorMessage: "empty_output",
        metadata: {
          ...(params.metadata ?? {}),
          ...studentTelemetry,
          studentFallbackReason: "empty_output",
        },
      });
      return null;
    }

    const latencyMs = Date.now() - startedAt;

    const aiRunId = await logAiRun({
      userId: params.userId,
      sessionId: params.sessionId,
      taskType: params.taskType,
      provider: "student",
      model: output.model,
      promptText: params.prompt,
      systemPrompt: params.systemPrompt,
      responseText: output.text,
      structuredJson: null,
      success: true,
      latencyMs,
      inputTokens: output.inputTokens ?? null,
      outputTokens: output.outputTokens ?? null,
      fallbackUsed: false,
      metadata: {
        ...(params.metadata ?? {}),
        ...studentTelemetry,
      },
    });

    console.info("[ai/student] success", {
      taskType: params.taskType,
      model: output.model,
      latencyMs,
      outputLength: output.text.length,
    });

    return {
      text: output.text,
      provider: "student",
      model: output.model,
      latencyMs,
      success: true,
      structured: null,
      fallbackUsed: false,
      cacheHit: false,
      cacheKey: null,
      confidence: output.confidence ?? null,
      errorMessage: null,
      aiRunId,
    };
  } catch (error) {
    const errorMessage = normalizeErrorMessage(error);
    const latencyMs = Date.now() - startedAt;

    console.warn("[ai/student] failed, falling back to stable", {
      taskType: params.taskType,
      error: errorMessage,
      latencyMs,
    });

    await logAiRun({
      userId: params.userId,
      sessionId: params.sessionId,
      taskType: params.taskType,
      provider: "student",
      model: process.env.STUDENT_PROVIDER_MODEL ?? "qwen2.5-7b-instruct-lora-v2",
      promptText: params.prompt,
      systemPrompt: params.systemPrompt,
      responseText: isAIProviderError(error) ? (error.responseText ?? null) : null,
      structuredJson: null,
      success: false,
      latencyMs,
      fallbackUsed: false,
      errorMessage,
      metadata: {
        ...(params.metadata ?? {}),
        ...studentTelemetry,
        studentFallbackReason: errorMessage,
      },
    });

    return null; // Signal to fall through to stable provider
  }
}

export async function runAI(params: RunAIParams): Promise<AIRunResult> {
  const startedAt = Date.now();

  // ── Student Provider Pre-routing ──────────────────────────────
  // v2 LoRA Generation-only: feature flag ON + eligible task + canary 選出 → student 先行試行
  // 3-state decision:
  //   eligible → student 試行。成功なら即 return、失敗なら stable fallback (studentFallbackToStable)
  //   skipped  → stable 直行、telemetry に studentSkipped=true + reason を残す
  //   disabled → stable 直行、student 関連は記録しない
  const studentDecision = resolveStudentRouting(params);
  if (studentDecision.state === "eligible") {
    const studentResult = await attemptStudentProvider(params, startedAt, studentDecision);
    if (studentResult) return studentResult;
    // student failed → fall through to stable provider (studentFallbackToStable)
  }
  // ──────────────────────────────────────────────────────────────

  const selectionDecision = await resolveModelSelection(params);
  const selectionMetadata = toModelSelectionMetadata(selectionDecision);

  // Student 3-state telemetry merge
  //   eligible (reached here) → student was attempted but failed → studentFallbackToStable
  //   skipped                 → student was eligible but skipped pre-attempt → studentSkipped
  //   disabled                → no student annotation
  let studentStableMeta: Record<string, unknown> = {};
  if (studentDecision.state === "eligible") {
    studentStableMeta = {
      studentAttempted: true,
      studentFallbackToStable: true,
      studentRouting: studentDecision.reason,
      studentRolloutPercent: studentDecision.rolloutPercent,
      studentAssignmentBucket: studentDecision.assignmentBucket,
    };
  } else if (studentDecision.state === "skipped") {
    studentStableMeta = {
      studentSkipped: true,
      studentSkipReason: studentDecision.reason,
      ...(studentDecision.rolloutPercent !== undefined
        ? { studentRolloutPercent: studentDecision.rolloutPercent }
        : {}),
      ...(studentDecision.assignmentBucket !== undefined
        ? { studentAssignmentBucket: studentDecision.assignmentBucket }
        : {}),
      ...(studentDecision.promptChars !== undefined
        ? { studentPromptChars: studentDecision.promptChars }
        : {}),
      ...(studentDecision.maxPromptChars !== undefined
        ? { studentMaxPromptChars: studentDecision.maxPromptChars }
        : {}),
    };
  }
  const effectiveMetadata = mergeMetadata(
    mergeMetadata(params.metadata ?? null, selectionMetadata),
    studentStableMeta,
  );
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
      // S2a: params.modelOverride は呼び出し元の直接指定（env var ベース）。
      // model selection よりも優先する。
      const modelOverride =
        effectiveParams.modelOverride ??
        (provider === selectionDecision.preferredProvider
          ? selectionDecision.modelOverride
          : null);

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
    const providerErrorContext = extractProviderErrorContext(lastError);
    const failureModel =
      (lastProvider === selectionDecision.preferredProvider
        ? selectionDecision.modelOverride
        : null) ?? defaultModelForProvider(lastProvider);

    const aiRunId = await logAiRun({
      userId: effectiveParams.userId,
      sessionId: effectiveParams.sessionId,
      taskType: effectiveParams.taskType,
      provider: lastProvider,
      model: failureModel,
      promptText: effectiveParams.prompt,
      systemPrompt: effectiveParams.systemPrompt,
      responseText: providerErrorContext.responseText,
      structuredJson: providerErrorContext.structuredJson,
      success: false,
      latencyMs,
      fallbackUsed,
      errorMessage,
      metadata: {
        ...effectiveMetadata,
        ...(providerErrorContext.metadata ?? {}),
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
      text: providerErrorContext.responseText ?? "",
      provider: lastProvider,
      model: failureModel,
      latencyMs,
      success: false,
      structured: providerErrorContext.structuredJson,
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
    // Universal student learning: ALL AI calls generate teacher outputs
    // so the student LLM can learn from every Gemini/OpenAI interaction.
    // Fire-and-forget: teacher eval + shadow runs do not block the response.
    const teacherOutputPromise = maybeGenerateTeacherOutput({
      aiRunId,
      params: effectiveParams,
      result,
    }).catch(err => console.warn("[ai/eval] teacher generation failed (background):", err));

    // Domain-specific shadow runs compare primary vs shadow model outputs
    // Chained via .then() so they run after teacher output completes, but never block runAI()
    if (isStargazerStudentTask(effectiveParams.taskType)) {
      teacherOutputPromise.then(() =>
        maybeRunStargazerShadow({
          params: effectiveParams,
          primaryAiRunId: aiRunId,
          primaryResult: result,
        }),
      ).catch(err => console.warn("[ai/eval] stargazer shadow failed (background):", err));
    } else if (isOrbiterStudentTask(effectiveParams.taskType)) {
      teacherOutputPromise.then(() =>
        maybeRunOrbiterShadow({
          params: effectiveParams,
          primaryAiRunId: aiRunId,
          primaryResult: result,
        }),
      ).catch(err => console.warn("[ai/eval] orbiter shadow failed (background):", err));
    } else if (isIdentityStudentTask(effectiveParams.taskType)) {
      teacherOutputPromise.then(() =>
        maybeRunIdentityShadow({
          params: effectiveParams,
          primaryAiRunId: aiRunId,
          primaryResult: result,
        }),
      ).catch(err => console.warn("[ai/eval] identity shadow failed (background):", err));
    }
    // Non-domain tasks: teacher output already fire-and-forget above
  }

  return result;
}

export * from "./types";
