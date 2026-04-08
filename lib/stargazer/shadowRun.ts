import "server-only";

import {
  getEntryTrafficRole,
  isTaskTypeIncluded,
  listModelRegistryEntries,
} from "@/lib/ai/modelRegistry";
import { logAiRun } from "@/lib/ai/logging";
import { maybeGenerateTeacherOutput } from "@/lib/ai/eval";
import { runGemini } from "@/lib/ai/providers/gemini";
import { runOpenAI } from "@/lib/ai/providers/openai";
import type {
  AIRunResult,
  AIProviderName,
  AIProviderResponse,
  RunAIParams,
  StructuredOutput,
} from "@/lib/ai/types";
import { getAIServiceClient } from "@/lib/ai/db";
import { STARGAZER_STUDENT_MODEL_KEY } from "./studentModelRegistry";
import { isStargazerStudentTask } from "./studentTrack";

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

function toStructuredOrNull(
  value: unknown,
): StructuredOutput | null {
  if (!value || typeof value !== "object") return null;
  return value as StructuredOutput;
}

function normalizeShadowCandidates(
  taskType: string,
  structured: StructuredOutput | null,
): Array<Record<string, unknown>> {
  if (Array.isArray(structured)) {
    return structured.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object" && !Array.isArray(item),
    );
  }

  if (!structured || typeof structured !== "object") {
    return [];
  }

  const objectValue = structured as Record<string, unknown>;
  if (
    isStargazerStudentTask(taskType) &&
    taskType === "stargazer_lens_discovery" &&
    Array.isArray(objectValue.lenses)
  ) {
    return objectValue.lenses.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object" && !Array.isArray(item),
    );
  }

  if (
    (taskType === "stargazer_question_generation" ||
      taskType === "stargazer_question_expansion") &&
    Array.isArray(objectValue.questions)
  ) {
    return objectValue.questions.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object" && !Array.isArray(item),
    );
  }

  const arrayKey = Object.keys(objectValue).find((key) =>
    Array.isArray(objectValue[key]),
  );
  if (!arrayKey) return [];

  return (objectValue[arrayKey] as unknown[]).filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === "object" && !Array.isArray(item),
  );
}

function isValidShadowQuestion(candidate: Record<string, unknown>): boolean {
  if (typeof candidate.prompt !== "string" || !candidate.prompt.trim()) return false;
  if (!Array.isArray(candidate.options) || candidate.options.length !== 4) return false;
  return candidate.options.every((option) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) return false;
    const record = option as Record<string, unknown>;
    return (
      typeof record.label === "string" &&
      record.label.trim().length > 0 &&
      typeof record.score === "number" &&
      Number.isFinite(record.score)
    );
  });
}

function isValidShadowLens(candidate: Record<string, unknown>): boolean {
  return (
    typeof candidate.name_ja === "string" &&
    candidate.name_ja.trim().length > 0 &&
    typeof candidate.description === "string" &&
    candidate.description.trim().length > 0 &&
    Array.isArray(candidate.probing_targets) &&
    candidate.probing_targets.length > 0 &&
    Array.isArray(candidate.related_axes) &&
    candidate.related_axes.length > 0
  );
}

function evaluateShadowCandidates(args: {
  taskType: string;
  primaryStructured: StructuredOutput | null;
  shadowStructured: StructuredOutput | null;
}): {
  score: number | null;
  passed: boolean;
  metadata: Record<string, unknown>;
} {
  const primaryCandidates = normalizeShadowCandidates(
    args.taskType,
    args.primaryStructured,
  );
  const shadowCandidates = normalizeShadowCandidates(
    args.taskType,
    args.shadowStructured,
  );

  const validCount = shadowCandidates.filter((candidate) =>
    args.taskType === "stargazer_lens_discovery"
      ? isValidShadowLens(candidate)
      : isValidShadowQuestion(candidate),
  ).length;

  const primaryCount = primaryCandidates.length;
  const shadowCount = shadowCandidates.length;
  const hasStructured = shadowCount > 0 ? 1 : 0;
  const validRatio = shadowCount > 0 ? validCount / shadowCount : 0;
  const countAlignment =
    primaryCount > 0 || shadowCount > 0
      ? 1 - Math.abs(primaryCount - shadowCount) / Math.max(primaryCount, shadowCount, 1)
      : 0;

  const score =
    shadowCount === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            hasStructured * 0.25 + validRatio * 0.5 + countAlignment * 0.25,
          ),
        );

  return {
    score,
    passed: shadowCount > 0 && validRatio >= 0.75 && countAlignment >= 0.5,
    metadata: {
      evalTrack: "stargazer_shadow",
      primaryCount,
      shadowCount,
      validCount,
      validRatio,
      countAlignment,
      previewPrompts: shadowCandidates
        .slice(0, 3)
        .map((candidate) => candidate.prompt ?? candidate.name_ja ?? null),
    },
  };
}

function hashSeedToPercent(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 100;
}

function needsLegacyOverallScore(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("overall_score") &&
    normalized.includes("null value")
  );
}

function needsLegacyEvalStatus(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("status") &&
    normalized.includes("null value")
  );
}

async function executeShadowProvider(
  params: RunAIParams,
  provider: AIProviderName,
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

  if (provider === "openai") {
    return runOpenAI(request, { model: modelOverride ?? undefined });
  }
  return runGemini(request, { model: modelOverride ?? undefined });
}

function shouldRunShadowForRequest(args: {
  params: RunAIParams;
  primaryAiRunId: string;
  shadowModelConfigured: boolean;
}): { enabled: boolean; reason?: string; samplePercent: number } {
  const explicitToggle = readEnvToggle("STARGAZER_SHADOW_ENABLED");
  if (explicitToggle !== true) {
    return {
      enabled: false,
      reason: "shadow_disabled",
      samplePercent: 0,
    };
  }

  if (!args.shadowModelConfigured) {
    return {
      enabled: false,
      reason: "shadow_model_not_configured",
      samplePercent: 0,
    };
  }

  const samplePercentRaw = envNumber("STARGAZER_SHADOW_SAMPLE_PERCENT", 100);
  const samplePercent = Math.max(0, Math.min(100, Math.trunc(samplePercentRaw)));
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
  const bucket = hashSeedToPercent(samplingSeed);
  if (bucket >= samplePercent) {
    return {
      enabled: false,
      reason: "shadow_sample_skipped",
      samplePercent,
    };
  }

  if (explicitToggle === true) {
    return { enabled: true, samplePercent };
  }

  return {
    enabled: true,
    samplePercent,
  };
}

export async function maybeRunStargazerShadow(args: {
  params: RunAIParams;
  primaryAiRunId: string;
  primaryResult: AIRunResult;
}): Promise<{ shadowAiRunId: string | null; skippedReason?: string }> {
  if (!isStargazerStudentTask(args.params.taskType)) {
    return { shadowAiRunId: null, skippedReason: "not_stargazer_task" };
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
    return track === "stargazer" || row.modelKey === STARGAZER_STUDENT_MODEL_KEY;
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
    studentTrack: "stargazer",
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
    const output = await executeShadowProvider(
      shadowParams,
      shadowEntry.provider,
      shadowEntry.providerModel,
    );

    const shadowResult: AIRunResult = {
      text: output.text,
      provider: output.provider,
      model: output.model,
      latencyMs: Date.now() - startedAt,
      success: true,
      structured: toStructuredOrNull(output.structured),
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
      metadata: shadowMetadata,
    });

    shadowResult.aiRunId = shadowAiRunId;

    if (shadowAiRunId) {
      await maybeGenerateTeacherOutput({
        aiRunId: shadowAiRunId,
        params: shadowParams,
        result: shadowResult,
      });

      const evalResult = evaluateShadowCandidates({
        taskType: shadowParams.taskType,
        primaryStructured: args.primaryResult.structured,
        shadowStructured: shadowResult.structured,
      });

      const client = getAIServiceClient();
      if (client) {
        let { error } = await client.from("ai_eval_runs").insert({
          ai_run_id: shadowAiRunId,
          task_type: shadowParams.taskType,
          eval_type: "stargazer_shadow",
          score: evalResult.score,
          passed: evalResult.passed,
          metadata: {
            ...evalResult.metadata,
            primaryAiRunId: args.primaryAiRunId,
          },
        });

        if (
          error &&
          (
            needsLegacyOverallScore(error.message) ||
            needsLegacyEvalStatus(error.message)
          )
        ) {
          const retry = await client.from("ai_eval_runs").insert({
            ai_run_id: shadowAiRunId,
            task_type: shadowParams.taskType,
            eval_type: "stargazer_shadow",
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
            "[stargazer/shadowRun] failed to insert shadow eval:",
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
