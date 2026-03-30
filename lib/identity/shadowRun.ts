import "server-only";

import {
  getEntryTrafficRole,
  isTaskTypeIncluded,
  listModelRegistryEntries,
} from "@/lib/ai/modelRegistry";
import { logAiRun } from "@/lib/ai/logging";
import { maybeGenerateTeacherOutput } from "@/lib/ai/eval";
import { runGemini } from "@/lib/ai/providers/gemini";
import type {
  AIRunResult,
  AIProviderResponse,
  RunAIParams,
  StructuredOutput,
} from "@/lib/ai/types";
import { getAIServiceClient } from "@/lib/ai/db";
import { IDENTITY_STUDENT_MODEL_KEY } from "./studentModelRegistry";
import {
  buildProfileText,
  computeContradictionScore,
  computeProfileConfidence,
  parseIdentityProfile,
  type IdentityProfileRecord,
} from "./profileUpdate";
import { isIdentityStudentTask } from "./studentTrack";

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

function hashSeedToPercent(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 100;
}

function toTextOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function overlapRatio(primary: string[], shadow: string[]): number {
  const primarySet = new Set(primary);
  const shadowSet = new Set(shadow);
  const base = new Set([...primarySet, ...shadowSet]);
  if (base.size === 0) return 1;
  let overlap = 0;
  for (const value of shadowSet) {
    if (primarySet.has(value)) overlap += 1;
  }
  return overlap / base.size;
}

function normalizeSemanticText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function buildCharacterBigrams(value: string): Set<string> {
  if (value.length <= 1) return new Set(value ? [value] : []);
  const grams = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    grams.add(value.slice(index, index + 2));
  }
  return grams;
}

function setOverlapRatio(left: Set<string>, right: Set<string>): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 1;
  let overlap = 0;
  for (const value of left) {
    if (right.has(value)) overlap += 1;
  }
  return overlap / union.size;
}

function semanticTextSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeSemanticText(left);
  const normalizedRight = normalizeSemanticText(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  if (
    normalizedLeft.length >= 2 &&
    normalizedRight.length >= 2 &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  ) {
    return 0.85;
  }

  const leftChars = new Set(normalizedLeft.split(""));
  const rightChars = new Set(normalizedRight.split(""));
  const charOverlap = setOverlapRatio(leftChars, rightChars);
  const bigramOverlap = setOverlapRatio(
    buildCharacterBigrams(normalizedLeft),
    buildCharacterBigrams(normalizedRight),
  );

  return Math.max(charOverlap, bigramOverlap);
}

function bestPairwiseSimilarity(left: string[], right: string[]): number {
  if (left.length === 0) return 1;
  if (right.length === 0) return 0;
  return (
    left.reduce((sum, leftValue) => {
      let best = 0;
      for (const rightValue of right) {
        best = Math.max(best, semanticTextSimilarity(leftValue, rightValue));
      }
      return sum + best;
    }, 0) / left.length
  );
}

function stableTraitAlignment(
  primary: IdentityProfileRecord,
  shadow: IdentityProfileRecord,
): number {
  const primaryLabels = primary.stableTraits.map((item) => item.label);
  const shadowLabels = shadow.stableTraits.map((item) => item.label);
  const primaryKeys = primary.stableTraits.map((item) => item.key);
  const shadowKeys = shadow.stableTraits.map((item) => item.key);
  return Math.max(
    overlapRatio(primaryKeys, shadowKeys),
    bestPairwiseSimilarity(primaryLabels, shadowLabels),
  );
}

function hypothesisAlignment(
  primary: IdentityProfileRecord,
  shadow: IdentityProfileRecord,
): number {
  const primaryStatements = primary.activeHypotheses.map((item) => item.statement);
  const shadowStatements = shadow.activeHypotheses.map((item) => item.statement);
  const primaryKeys = primary.activeHypotheses.map((item) => item.key);
  const shadowKeys = shadow.activeHypotheses.map((item) => item.key);
  return Math.max(
    overlapRatio(primaryKeys, shadowKeys),
    bestPairwiseSimilarity(primaryStatements, shadowStatements),
  );
}

function readinessAlignment(
  primary: IdentityProfileRecord,
  shadow: IdentityProfileRecord,
): number {
  const keys: Array<keyof IdentityProfileRecord["consumerReadiness"]> = [
    "stargazer",
    "orbiter",
    "recommendations",
  ];
  let matches = 0;
  for (const key of keys) {
    if (primary.consumerReadiness[key] === shadow.consumerReadiness[key]) {
      matches += 1;
    }
  }
  return matches / keys.length;
}

function evidenceCoverage(profile: IdentityProfileRecord): number {
  if (profile.stableTraits.length === 0) return 0;
  const covered = profile.stableTraits.filter(
    (trait) => trait.evidenceRefs.length > 0,
  ).length;
  return covered / profile.stableTraits.length;
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
  structured: StructuredOutput | IdentityProfileRecord | null;
  parsedProfile: IdentityProfileRecord;
  metadata: Record<string, unknown>;
}> {
  const strictRetryCount = Math.max(
    0,
    Math.trunc(envNumber("IDENTITY_SHADOW_JSON_RETRY_COUNT", 1)),
  );
  const profileRouteStrategy =
    toTextOrNull(args.params.metadata?.profileRouteStrategy) ?? "unknown";
  const sourceDensityBucket =
    toTextOrNull(args.params.metadata?.sourceDensityBucket) ?? "unknown";
  const useLowDensityTemplateRoute =
    profileRouteStrategy === "low_density_template_first" ||
    sourceDensityBucket === "very_low";
  const strictRecoveryPrompt = `${args.params.prompt}\n\nImportant recovery note: your previous output was malformed. Return strictly valid JSON only. Use double-quoted keys and strings, no trailing commas, and no markdown fences.`;
  const rawFallbackPrompt = `${args.params.prompt}\n\nFallback note: return only one JSON object with the required keys. Do not use markdown fences.`;
  const lowDensityTemplateRetryPrompt = [
    args.params.prompt,
    "前回はJSONが壊れていました。今回は1行JSONだけを返してください。",
    "不明な項目は null / [] / {} を使ってください。",
    '最小形: {"stableTraits":[{"key":"trait_key","label":"短い特性","confidence":0.55,"evidenceRefs":["source_ref"]}],"volatileState":{},"relationalStyle":{"pace":null,"distanceNeed":null,"confidence":0.5},"decisionStyle":{"mode":null,"confidence":0.5},"activeHypotheses":[],"openQuestions":[],"changedSinceLast":[],"contradictions":[],"consumerReadiness":{"stargazer":false,"orbiter":false,"recommendations":false}}',
  ].join("\n");
  const lowDensityFinalRawPrompt = [
    args.params.prompt,
    "最終回復です。1行JSONだけを返してください。",
    "文字列は短く、traitは1件で十分です。",
    "不明な項目は null / [] / {} を使ってください。",
  ].join("\n");

  const attempts: Array<{
    mode: "strict" | "strict_retry" | "raw_fallback";
    params: RunAIParams;
    promptVariant: string;
    schemaVariant: string;
    routeStrategy: string;
  }> = [
    ...(useLowDensityTemplateRoute
      ? ([
          {
            mode: "raw_fallback" as const,
            params: {
              ...args.params,
              requireJson: false,
              jsonSchema: undefined,
            },
            promptVariant: "identity_shadow_low_density_template_raw_v1",
            schemaVariant: "identity_shadow_template_recovery_v1",
            routeStrategy: "shadow_low_density_template_first",
          },
          {
            mode: "strict_retry" as const,
            params: {
              ...args.params,
              prompt: lowDensityTemplateRetryPrompt,
              requireJson: false,
              jsonSchema: undefined,
            },
            promptVariant: "identity_shadow_low_density_template_retry_v1",
            schemaVariant: "identity_shadow_template_recovery_v1",
            routeStrategy: "shadow_low_density_template_first",
          },
          {
            mode: "raw_fallback" as const,
            params: {
              ...args.params,
              prompt: lowDensityFinalRawPrompt,
              requireJson: false,
              jsonSchema: undefined,
            },
            promptVariant: "identity_shadow_low_density_final_raw_v1",
            schemaVariant: "identity_shadow_raw_recovery_v2",
            routeStrategy: "shadow_low_density_template_first",
          },
        ] satisfies Array<{
          mode: "strict" | "strict_retry" | "raw_fallback";
          params: RunAIParams;
          promptVariant: string;
          schemaVariant: string;
          routeStrategy: string;
        }>)
      : ([
          {
            mode: "strict" as const,
            params: args.params,
            promptVariant: "identity_shadow_strict_v1",
            schemaVariant: "identity_shadow_json_mode_v1",
            routeStrategy: "shadow_standard_json_mode",
          },
          ...Array.from({ length: strictRetryCount }, () => ({
            mode: "strict_retry" as const,
            params: {
              ...args.params,
              prompt: strictRecoveryPrompt,
            },
            promptVariant: "identity_shadow_strict_retry_v1",
            schemaVariant: "identity_shadow_json_mode_v1",
            routeStrategy: "shadow_standard_json_mode",
          })),
          {
            mode: "raw_fallback" as const,
            params: {
              ...args.params,
              prompt: rawFallbackPrompt,
              requireJson: false,
              jsonSchema: undefined,
            },
            promptVariant: "identity_shadow_raw_fallback_v1",
            schemaVariant: "identity_shadow_raw_recovery_v1",
            routeStrategy: "shadow_standard_json_mode",
          },
        ] satisfies Array<{
          mode: "strict" | "strict_retry" | "raw_fallback";
          params: RunAIParams;
          promptVariant: string;
          schemaVariant: string;
          routeStrategy: string;
        }>)),
  ];

  let lastError: Error | null = null;
  let lastAttemptMetadata: Record<string, unknown> = {};

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];

    try {
      const output = await executeShadowProvider(
        attempt.params,
        args.provider,
        args.modelOverride,
      );
      const parsedProfile = parseIdentityProfile({
        structured: output.structured,
        text: output.text,
      });

      if (!parsedProfile) {
        lastError = new Error("invalid_shadow_profile_payload");
        lastAttemptMetadata = {
          shadowAttemptMode: attempt.mode,
          shadowAttemptCount: index + 1,
          shadowPromptVariant: attempt.promptVariant,
          shadowSchemaVariant: attempt.schemaVariant,
          shadowRouteStrategy: attempt.routeStrategy,
          shadowRecoveredFromMalformedStructuredOutput: attempt.mode !== "strict",
        };
        continue;
      }

      return {
        output,
        structured: toStructuredOrNull(output.structured) ?? parsedProfile,
        parsedProfile,
        metadata: {
          shadowAttemptMode: attempt.mode,
          shadowAttemptCount: index + 1,
          shadowPromptVariant: attempt.promptVariant,
          shadowSchemaVariant: attempt.schemaVariant,
          shadowRouteStrategy: attempt.routeStrategy,
          shadowRecoveredFromMalformedStructuredOutput: attempt.mode !== "strict",
        },
      };
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("shadow_provider_failed");
      lastAttemptMetadata = {
        shadowAttemptMode: attempt.mode,
        shadowAttemptCount: index + 1,
        shadowPromptVariant: attempt.promptVariant,
        shadowSchemaVariant: attempt.schemaVariant,
        shadowRouteStrategy: attempt.routeStrategy,
        shadowRecoveredFromMalformedStructuredOutput: attempt.mode !== "strict",
      };
    }
  }

  if (lastError && lastAttemptMetadata && Object.keys(lastAttemptMetadata).length > 0) {
    Object.assign(lastError, {
      shadowAttemptMetadata: lastAttemptMetadata,
    });
  }
  throw lastError ?? new Error("shadow_provider_failed");
}

function shouldRunShadowForRequest(args: {
  params: RunAIParams;
  primaryAiRunId: string;
  shadowModelConfigured: boolean;
}): { enabled: boolean; reason?: string; samplePercent: number } {
  const explicitToggle = readEnvToggle("IDENTITY_SHADOW_ENABLED");
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
    Math.min(100, Math.trunc(envNumber("IDENTITY_SHADOW_SAMPLE_PERCENT", 100))),
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

export function evaluateIdentityShadow(args: {
  primaryStructured: StructuredOutput | null;
  primaryText: string;
  shadowStructured: StructuredOutput | null;
  shadowText: string;
}): {
  score: number | null;
  passed: boolean;
  metadata: Record<string, unknown>;
} {
  const primary = parseIdentityProfile({
    structured: args.primaryStructured,
    text: args.primaryText,
  });
  const shadow = parseIdentityProfile({
    structured: args.shadowStructured,
    text: args.shadowText,
  });

  if (!shadow) {
    return {
      score: 0,
      passed: false,
      metadata: {
        evalTrack: "identity_shadow",
        primaryValid: primary != null,
        shadowValid: false,
      },
    };
  }

  const primaryTraits = primary?.stableTraits.map((item) => item.key) ?? [];
  const shadowTraits = shadow.stableTraits.map((item) => item.key);
  const traitOverlap = primary ? stableTraitAlignment(primary, shadow) : 1;
  const hypothesisOverlap = primary ? hypothesisAlignment(primary, shadow) : 1;
  const shadowEvidenceCoverage = evidenceCoverage(shadow);
  const readinessScore = primary ? readinessAlignment(primary, shadow) : 1;
  const contradictionAlignment = primary
    ? Math.max(
        0,
        1 -
          Math.abs(computeContradictionScore(primary) - computeContradictionScore(shadow)),
      )
    : 1;
  const confidenceScore = computeProfileConfidence(shadow);

  const score = Math.max(
    0,
    Math.min(
      1,
      0.35 +
        traitOverlap * 0.2 +
        hypothesisOverlap * 0.1 +
        shadowEvidenceCoverage * 0.15 +
        readinessScore * 0.1 +
        contradictionAlignment * 0.05 +
        confidenceScore * 0.05,
    ),
  );

  return {
    score,
    passed:
      shadow.stableTraits.length > 0 &&
      shadowEvidenceCoverage === 1 &&
      shadow.openQuestions.length <= 2 &&
      readinessScore >= 2 / 3,
    metadata: {
      evalTrack: "identity_shadow",
      primaryValid: primary != null,
      shadowValid: true,
      primaryTraitCount: primaryTraits.length,
      shadowTraitCount: shadowTraits.length,
      traitOverlap,
      hypothesisOverlap,
      shadowEvidenceCoverage,
      readinessScore,
      contradictionAlignment,
      confidenceScore,
      shadowProfileText: buildProfileText(shadow),
    },
  };
}

export async function maybeRunIdentityShadow(args: {
  params: RunAIParams;
  primaryAiRunId: string;
  primaryResult: AIRunResult;
}): Promise<{ shadowAiRunId: string | null; skippedReason?: string }> {
  if (!isIdentityStudentTask(args.params.taskType)) {
    return { shadowAiRunId: null, skippedReason: "not_identity_task" };
  }
  if (
    args.params.metadata?.shadowPass === true ||
    args.params.metadata?.suppressShadow === true
  ) {
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
    return track === "identity" || row.modelKey === IDENTITY_STUDENT_MODEL_KEY;
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
    studentTrack: "identity",
    shadowPass: true,
    suppressShadow: true,
    needsTeacher: true,
    suppressTeacher: false,
    persistSnapshot: false,
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
      structuredJson: toStructuredOrNull(output.structured) ?? recovered.parsedProfile,
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

      const evalResult = evaluateIdentityShadow({
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
          eval_type: "identity_shadow",
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
            eval_type: "identity_shadow",
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
            "[identity/shadowRun] failed to insert shadow eval:",
            error.message,
          );
        }
      }
    }

    return { shadowAiRunId };
  } catch (error) {
    const errorMetadata =
      error instanceof Error &&
      "shadowAttemptMetadata" in error &&
      error.shadowAttemptMetadata &&
      typeof error.shadowAttemptMetadata === "object" &&
      !Array.isArray(error.shadowAttemptMetadata)
        ? (error.shadowAttemptMetadata as Record<string, unknown>)
        : {};
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
      metadata: {
        ...shadowMetadata,
        ...errorMetadata,
      },
    });

    return {
      shadowAiRunId,
      skippedReason: error instanceof Error ? error.message : "shadow_failed",
    };
  }
}
