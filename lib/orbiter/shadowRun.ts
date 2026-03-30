import "server-only";

import {
  getEntryTrafficRole,
  isTaskTypeIncluded,
  listModelRegistryEntries,
} from "@/lib/ai/modelRegistry";
import { logAiRun } from "@/lib/ai/logging";
import { maybeGenerateTeacherOutput } from "@/lib/ai/eval";
import { runGemini } from "@/lib/ai/providers/gemini";
import { parseStructuredJsonWithRecovery } from "@/lib/ai/structuredJson";
import type {
  AIRunResult,
  AIProviderResponse,
  RunAIParams,
  StructuredOutput,
} from "@/lib/ai/types";
import { getAIServiceClient } from "@/lib/ai/db";
import { ORBITER_STUDENT_MODEL_KEY } from "./studentModelRegistry";
import { isOrbiterStudentTask } from "./studentTrack";

function readEnvToggle(name: string): boolean | null {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return null;
}

function envNumber(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return value;
}

function mergeMetadata(
  base: Record<string, unknown> | null | undefined,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(base ?? {}),
    ...extra,
  };
}

function toStructuredOrNull(value: unknown): StructuredOutput | null {
  if (!value || typeof value !== "object") return null;
  return value as StructuredOutput;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 4);
}

function normalizeConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.max(0, Math.min(1, parsed));
}

function tryParseJsonText(text: string): unknown {
  return parseStructuredJsonWithRecovery(text);
}

function validateOrbiterMemorySummary(
  value: unknown,
): { summary: string; salientMemories: string[]; confidence: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const summary = normalizeText(record.summary);
  const salientMemories = normalizeStringList(record.salientMemories);
  const confidence = normalizeConfidence(record.confidence);

  if (!summary || summary.length < 40 || summary.length > 260) {
    return null;
  }
  if (salientMemories.length === 0) {
    return null;
  }

  return {
    summary,
    salientMemories,
    confidence,
  };
}

function parseOrbiterMemorySummary(args: {
  structured: unknown;
  text: string;
}): { summary: string; salientMemories: string[]; confidence: number } | null {
  const structuredSummary = validateOrbiterMemorySummary(args.structured);
  if (structuredSummary) return structuredSummary;

  try {
    const parsedText = tryParseJsonText(args.text);
    return validateOrbiterMemorySummary(parsedText);
  } catch {
    return null;
  }
}

function hashSeedToPercent(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 100;
}

function needsLegacyOverallScore(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("overall_score") && normalized.includes("null value");
}

function needsLegacyEvalStatus(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("status") && normalized.includes("null value");
}

async function executeShadowProvider(
  params: RunAIParams,
  provider: "gemini",
  modelOverride: string | null,
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

  return runGemini(request, { model: modelOverride ?? undefined });
}

async function executeShadowProviderWithRecovery(args: {
  params: RunAIParams;
  provider: "gemini";
  modelOverride: string | null;
}): Promise<{
  output: AIProviderResponse;
  structured: StructuredOutput | null;
  metadata: Record<string, unknown>;
}> {
  const strictRetryCount = Math.max(
    0,
    Math.trunc(envNumber("ORBITER_SHADOW_JSON_RETRY_COUNT", 1)),
  );
  const strictRecoveryPrompt = `${args.params.prompt}\n\nImportant recovery note: your previous output was malformed. Return strictly valid JSON only. Use double-quoted keys and strings, no trailing commas, and no markdown fences.`;
  const rawFallbackPrompt = `${args.params.prompt}\n\nFallback note: return only one JSON object with the required keys. Do not use markdown fences.`;

  const attempts: Array<{
    mode: "strict" | "strict_retry" | "raw_fallback";
    params: RunAIParams;
  }> = [
    {
      mode: "strict",
      params: args.params,
    },
    ...Array.from({ length: strictRetryCount }, () => ({
      mode: "strict_retry" as const,
      params: {
        ...args.params,
        prompt: strictRecoveryPrompt,
      },
    })),
    {
      mode: "raw_fallback",
      params: {
        ...args.params,
        prompt: rawFallbackPrompt,
        requireJson: false,
        jsonSchema: undefined,
      },
    },
  ];

  let lastError: Error | null = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];

    try {
      const output = await executeShadowProvider(
        attempt.params,
        args.provider,
        args.modelOverride,
      );
      const parsedSummary = parseOrbiterMemorySummary({
        structured: output.structured,
        text: output.text,
      });

      if (!parsedSummary) {
        lastError = new Error("invalid_shadow_summary_payload");
        continue;
      }

      return {
        output,
        structured: toStructuredOrNull(output.structured) ?? parsedSummary,
        metadata: {
          shadowAttemptMode: attempt.mode,
          shadowAttemptCount: index + 1,
          shadowRecoveredFromMalformedStructuredOutput: attempt.mode !== "strict",
        },
      };
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("shadow_provider_failed");
    }
  }

  throw lastError ?? new Error("shadow_provider_failed");
}

function shouldRunShadowForRequest(args: {
  params: RunAIParams;
  primaryAiRunId: string;
  shadowModelConfigured: boolean;
}): { enabled: boolean; reason?: string; samplePercent: number } {
  const explicitToggle = readEnvToggle("ORBITER_SHADOW_ENABLED");
  if (explicitToggle === false) {
    return { enabled: false, reason: "shadow_disabled", samplePercent: 0 };
  }
  if (!args.shadowModelConfigured) {
    return {
      enabled: false,
      reason: "shadow_model_not_configured",
      samplePercent: 0,
    };
  }

  const samplePercent = Math.max(
    0,
    Math.min(100, Math.trunc(envNumber("ORBITER_SHADOW_SAMPLE_PERCENT", 100))),
  );
  if (samplePercent <= 0) {
    return {
      enabled: false,
      reason: "shadow_sampling_disabled",
      samplePercent,
    };
  }

  const samplingSeed =
    args.params.sessionId ??
    args.params.userId ??
    args.primaryAiRunId ??
    args.params.prompt;
  if (hashSeedToPercent(samplingSeed) >= samplePercent) {
    return {
      enabled: false,
      reason: "shadow_sample_skipped",
      samplePercent,
    };
  }

  return { enabled: true, samplePercent };
}

function evaluateOrbiterShadow(args: {
  primaryStructured: StructuredOutput | null;
  primaryText: string;
  shadowStructured: StructuredOutput | null;
  shadowText: string;
}): {
  score: number | null;
  passed: boolean;
  metadata: Record<string, unknown>;
} {
  const primary = parseOrbiterMemorySummary({
    structured: args.primaryStructured,
    text: args.primaryText,
  });
  const shadow = parseOrbiterMemorySummary({
    structured: args.shadowStructured,
    text: args.shadowText,
  });
  const primaryMemories = primary?.salientMemories.length ?? 0;
  const shadowMemories = shadow?.salientMemories.length ?? 0;
  const valid = shadow ? 1 : 0;
  const countAlignment =
    primaryMemories > 0 || shadowMemories > 0
      ? 1 -
        Math.abs(primaryMemories - shadowMemories) /
          Math.max(primaryMemories, shadowMemories, 1)
      : 1;
  const confidenceValid =
    shadow && Number.isFinite(shadow.confidence) ? 1 : 0;

  const score =
    shadow == null
      ? 0
      : Math.max(
          0,
          Math.min(1, valid * 0.6 + countAlignment * 0.25 + confidenceValid * 0.15),
        );

  return {
    score,
    passed: shadow != null && shadow.summary.length >= 40 && shadowMemories > 0,
    metadata: {
      evalTrack: "orbiter_shadow",
      primarySalientMemories: primaryMemories,
      shadowSalientMemories: shadowMemories,
      countAlignment,
      primaryValid: primary != null,
      shadowValid: shadow != null,
    },
  };
}

export async function maybeRunOrbiterShadow(args: {
  params: RunAIParams;
  primaryAiRunId: string;
  primaryResult: AIRunResult;
}): Promise<{ shadowAiRunId: string | null; skippedReason?: string }> {
  if (!isOrbiterStudentTask(args.params.taskType)) {
    return { shadowAiRunId: null, skippedReason: "not_orbiter_task" };
  }
  if (args.params.metadata?.shadowPass === true) {
    return { shadowAiRunId: null, skippedReason: "already_shadow_pass" };
  }

  const registry = await listModelRegistryEntries({
    includeInactive: false,
    limit: 200,
  });
  if (!registry.ok) {
    return { shadowAiRunId: null, skippedReason: "registry_unavailable" };
  }

  const shadowEntry = registry.rows.find((row) => {
    if (getEntryTrafficRole(row) !== "shadow") return false;
    if (!isTaskTypeIncluded(row, args.params.taskType)) return false;
    const track = String(row.metadata?.studentTrack ?? "");
    return track === "orbiter" || row.modelKey === ORBITER_STUDENT_MODEL_KEY;
  });

  const shadowDecision = shouldRunShadowForRequest({
    params: args.params,
    primaryAiRunId: args.primaryAiRunId,
    shadowModelConfigured: Boolean(shadowEntry),
  });
  if (!shadowDecision.enabled) {
    return {
      shadowAiRunId: null,
      skippedReason: shadowDecision.reason ?? "shadow_disabled",
    };
  }
  if (!shadowEntry) {
    return { shadowAiRunId: null, skippedReason: "shadow_model_not_configured" };
  }

  const shadowMetadata = mergeMetadata(args.params.metadata ?? null, {
    studentTrack: "orbiter",
    shadowPass: true,
    suppressShadow: true,
    needsTeacher: true,
    suppressTeacher: false,
    shadowOfAiRunId: args.primaryAiRunId,
    shadowOfTaskType: args.params.taskType,
    shadowOfProvider: args.primaryResult.provider,
    shadowOfModel: args.primaryResult.model,
    selectedRole: "shadow",
    selectedModelKey: shadowEntry.modelKey,
    selectedModelVersion: shadowEntry.modelVersion,
    selectedProvider: shadowEntry.provider,
    selectedModelOverride: shadowEntry.providerModel,
    shadowSamplePercent: shadowDecision.samplePercent,
    userFacing: false,
  });

  const shadowParams: RunAIParams = {
    ...args.params,
    allowFallback: false,
    preferredProvider: shadowEntry.provider,
    metadata: shadowMetadata,
  };

  const startedAt = Date.now();

  try {
    const recovered = await executeShadowProviderWithRecovery({
      params: shadowParams,
      provider: shadowEntry.provider,
      modelOverride: shadowEntry.providerModel,
    });
    const shadowRunMetadata = mergeMetadata(shadowMetadata, recovered.metadata);
    const output = recovered.output;
    const shadowStructured = recovered.structured;

    const shadowResult: AIRunResult = {
      text: output.text,
      provider: output.provider,
      model: output.model,
      latencyMs: Date.now() - startedAt,
      success: true,
      structured: shadowStructured,
      fallbackUsed: false,
      cacheHit: false,
      cacheKey: null,
      confidence: output.confidence ?? null,
      errorMessage: null,
      aiRunId: null,
    };

    const shadowAiRunId = await logAiRun({
      userId: shadowParams.userId,
      sessionId: shadowParams.sessionId,
      taskType: shadowParams.taskType,
      provider: output.provider,
      model: output.model,
      promptText: shadowParams.prompt,
      systemPrompt: shadowParams.systemPrompt,
      responseText: output.text,
      structuredJson: toStructuredOrNull(output.structured),
      success: true,
      latencyMs: shadowResult.latencyMs,
      inputTokens: output.inputTokens ?? null,
      outputTokens: output.outputTokens ?? null,
      fallbackUsed: false,
      metadata: shadowRunMetadata,
    });

    shadowResult.aiRunId = shadowAiRunId;

    if (shadowAiRunId) {
      await maybeGenerateTeacherOutput({
        aiRunId: shadowAiRunId,
        params: {
          ...shadowParams,
          metadata: shadowRunMetadata,
        },
        result: shadowResult,
      });

      const evalResult = evaluateOrbiterShadow({
        primaryStructured: args.primaryResult.structured,
        primaryText: args.primaryResult.text,
        shadowStructured: shadowResult.structured,
        shadowText: shadowResult.text,
      });
      const client = getAIServiceClient();
      if (client) {
        let { error } = await client.from("ai_eval_runs").insert({
          ai_run_id: shadowAiRunId,
          task_type: shadowParams.taskType,
          eval_type: "orbiter_shadow",
          score: evalResult.score,
          passed: evalResult.passed,
          metadata: {
            ...evalResult.metadata,
            primaryAiRunId: args.primaryAiRunId,
          },
        });

        if (
          error &&
          (needsLegacyOverallScore(error.message) ||
            needsLegacyEvalStatus(error.message))
        ) {
          const retry = await client.from("ai_eval_runs").insert({
            ai_run_id: shadowAiRunId,
            task_type: shadowParams.taskType,
            eval_type: "orbiter_shadow",
            score: evalResult.score,
            overall_score: evalResult.score,
            status: evalResult.passed ? "passed" : "failed",
            passed: evalResult.passed,
            metadata: {
              ...evalResult.metadata,
              primaryAiRunId: args.primaryAiRunId,
            },
          });
          error = retry.error;
        }

        if (error) {
          console.warn(
            "[orbiter/shadowRun] failed to insert shadow eval:",
            error.message,
          );
        }
      }
    }

    return { shadowAiRunId };
  } catch (error) {
    const shadowAiRunId = await logAiRun({
      userId: shadowParams.userId,
      sessionId: shadowParams.sessionId,
      taskType: shadowParams.taskType,
      provider: shadowEntry.provider,
      model: shadowEntry.providerModel ?? shadowEntry.modelVersion,
      promptText: shadowParams.prompt,
      systemPrompt: shadowParams.systemPrompt,
      responseText: null,
      structuredJson: null,
      success: false,
      latencyMs: Date.now() - startedAt,
      fallbackUsed: false,
      errorMessage: error instanceof Error ? error.message : "shadow_failed",
      metadata: shadowMetadata,
    });

    return {
      shadowAiRunId,
      skippedReason: error instanceof Error ? error.message : "shadow_failed",
    };
  }
}
