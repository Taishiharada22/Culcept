import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIServiceClient } from "./db";
import { runGemini } from "./providers/gemini";
import {
  AIProviderError,
  type AIRunResult,
  type AIProviderName,
  type AIProviderResponse,
  type RunAIParams,
} from "./types";
import { isStargazerStudentTask } from "@/lib/stargazer/studentTrack";
import { isOrbiterStudentTask } from "@/lib/orbiter/studentTrack";
import { isIdentityStudentTask } from "@/lib/identity/studentTrack";

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function envString(name: string, fallback = ""): string {
  const raw = (process.env[name] ?? "").trim();
  return raw || fallback;
}

function envNumber(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return value;
}

const TEACHER_ELIGIBLE_TASK_TYPES = new Set([
  "high_quality_chat",
  "detailed_analysis",
  "creative_writing",
]);

function needsLegacyTeacherSourceAiRunId(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("source_ai_run_id") &&
    normalized.includes("null value")
  );
}

function needsLegacyTeacherResponseText(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("teacher_response_text") &&
    normalized.includes("null value")
  );
}

function isMissingColumnError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("could not find the column")
  );
}

function defaultRequireJsonForTask(taskType: string): boolean {
  return (
    isStargazerStudentTask(taskType) ||
    isOrbiterStudentTask(taskType) ||
    isIdentityStudentTask(taskType)
  );
}

function defaultMaxOutputTokensForTask(taskType: string): number | undefined {
  if (isStargazerStudentTask(taskType)) return 4096;
  if (isOrbiterStudentTask(taskType)) return 2048;
  if (isIdentityStudentTask(taskType)) return 3072;
  return undefined;
}

function normalizeProviderName(value: string): AIProviderName | null {
  if (value === "gemini") return value;
  if (value === "openai") return value;
  return null;
}

function isMalformedStructuredOutputError(error: unknown): boolean {
  return error instanceof AIProviderError && error.code === "malformed_structured_output";
}

type TeacherGenerationResult = {
  response: AIProviderResponse;
  metadata: Record<string, unknown>;
};

async function generateTeacherResponse(args: {
  promptText: string;
  systemPrompt?: string | null;
  taskType: string;
  requireJson?: boolean;
  jsonSchema?: RunAIParams["jsonSchema"];
  maxOutputTokens?: number | null;
}): Promise<TeacherGenerationResult> {
  const teacherModel = envString("GEMINI_TEACHER_MODEL") || undefined;
  const requireJson = args.requireJson ?? defaultRequireJsonForTask(args.taskType);
  const maxOutputTokens =
    args.maxOutputTokens ?? defaultMaxOutputTokensForTask(args.taskType);
  const strictRetryCount = Math.max(
    0,
    Math.trunc(envNumber("AI_TEACHER_JSON_RETRY_COUNT", 1)),
  );

  let attempt = 0;
  let lastError: unknown = null;

  const strictRecoveryPrompt = `${args.promptText}\n\nImportant teacher recovery note: your previous output was malformed JSON. Return strictly valid JSON only. Use double-quoted keys and strings, no trailing commas, and no markdown fences.`;
  const rawFallbackPrompt = `${args.promptText}\n\nTeacher fallback note: if strict JSON is unstable, return the best teacher answer as raw text or plain JSON without markdown fences. Preserve as much useful structure as possible.`;

  const runAttempt = async (request: {
    prompt: string;
    requireJson: boolean;
    mode: "strict" | "strict_retry" | "raw_fallback";
  }): Promise<TeacherGenerationResult> => {
    attempt += 1;
    const response = await runGemini(
      {
        prompt: request.prompt,
        systemPrompt: args.systemPrompt ?? undefined,
        jsonSchema: request.requireJson ? args.jsonSchema : undefined,
        requireJson: request.requireJson,
        maxOutputTokens,
      },
      {
        model: teacherModel,
      },
    );

    return {
      response,
      metadata: {
        teacherMode: request.mode,
        teacherAttempts: attempt,
        teacherRequireJson: request.requireJson,
        recoveredFromMalformedStructuredOutput: request.mode !== "strict",
      },
    };
  };

  try {
    return await runAttempt({
      prompt: args.promptText,
      requireJson,
      mode: "strict",
    });
  } catch (error) {
    lastError = error;
    if (!requireJson || !isMalformedStructuredOutputError(error)) {
      throw error;
    }
  }

  for (let retryIndex = 0; retryIndex < strictRetryCount; retryIndex += 1) {
    try {
      return await runAttempt({
        prompt: strictRecoveryPrompt,
        requireJson: true,
        mode: "strict_retry",
      });
    } catch (error) {
      lastError = error;
      if (!isMalformedStructuredOutputError(error)) {
        throw error;
      }
    }
  }

  try {
    return await runAttempt({
      prompt: rawFallbackPrompt,
      requireJson: false,
      mode: "raw_fallback",
    });
  } catch (error) {
    throw lastError ?? error;
  }
}

async function hasTeacherOutputForRun(
  client: SupabaseClient,
  aiRunId: string,
): Promise<boolean> {
  const query = async (filter: string) =>
    client
      .from("teacher_outputs")
      .select("id", { count: "exact", head: true })
      .or(filter);

  let result = await query(`ai_run_id.eq.${aiRunId},source_ai_run_id.eq.${aiRunId}`);
  if (result.error && isMissingColumnError(result.error.message)) {
    result = await query(`ai_run_id.eq.${aiRunId}`);
  }

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.count ?? 0) > 0;
}

async function insertTeacherOutputRow(args: {
  client: SupabaseClient;
  aiRunId: string;
  taskType: string;
  studentProvider: string;
  studentModel: string | null;
  studentResponse: string | null;
  studentLatencyMs?: number | null;
  teacherProvider: string;
  teacherModel: string | null;
  teacherResponse: string;
  teacherInputTokens?: number | null;
  teacherOutputTokens?: number | null;
  metadata?: Record<string, unknown> | null;
}): Promise<{ ok: boolean; inserted: boolean; error?: string }> {
  const row = {
    ai_run_id: args.aiRunId,
    task_type: args.taskType,
    student_provider: args.studentProvider,
    student_model: args.studentModel,
    student_response: args.studentResponse,
    teacher_provider: args.teacherProvider,
    teacher_model: args.teacherModel,
    teacher_response: args.teacherResponse,
    metadata: {
      ...(args.metadata ?? {}),
      studentLatencyMs: args.studentLatencyMs ?? null,
      teacherInputTokens: args.teacherInputTokens ?? null,
      teacherOutputTokens: args.teacherOutputTokens ?? null,
    },
  };

  let { error } = await args.client.from("teacher_outputs").insert(row);
  if (
    error &&
    (
      needsLegacyTeacherSourceAiRunId(error.message) ||
      needsLegacyTeacherResponseText(error.message)
    )
  ) {
    const retry = await args.client.from("teacher_outputs").insert({
      ...row,
      source_ai_run_id: args.aiRunId,
      teacher_response_text: args.teacherResponse,
    });
    error = retry.error;
  }

  if (error) {
    return {
      ok: false,
      inserted: false,
      error: error.message,
    };
  }

  return {
    ok: true,
    inserted: true,
  };
}

export async function ensureTeacherOutputForStoredRun(args: {
  aiRunId: string;
  taskType: string;
  promptText: string;
  systemPrompt?: string | null;
  studentProvider: string;
  studentModel?: string | null;
  studentResponse?: string | null;
  studentLatencyMs?: number | null;
  success: boolean;
  fallbackUsed?: boolean;
  cacheHit?: boolean;
  metadata?: Record<string, unknown> | null;
  requireJson?: boolean;
  jsonSchema?: RunAIParams["jsonSchema"];
  maxOutputTokens?: number | null;
  client?: SupabaseClient | null;
}): Promise<{ inserted: boolean; skipped: boolean; reason?: string }> {
  const client = args.client ?? getAIServiceClient();
  if (!client) {
    return { inserted: false, skipped: true, reason: "service_role_unavailable" };
  }

  const syntheticParams = {
    taskType: args.taskType,
    prompt: args.promptText,
    metadata: args.metadata ?? undefined,
  } satisfies Pick<RunAIParams, "taskType" | "prompt" | "metadata">;
  const provider = normalizeProviderName(args.studentProvider);
  if (!provider) {
    return { inserted: false, skipped: true, reason: "unsupported_student_provider" };
  }
  const syntheticResult = {
    text: args.studentResponse ?? "",
    provider,
    model: args.studentModel ?? "",
    latencyMs: args.studentLatencyMs ?? 0,
    success: args.success,
    fallbackUsed: args.fallbackUsed ?? false,
    cacheHit: args.cacheHit ?? false,
  } satisfies Pick<
    AIRunResult,
    "text" | "provider" | "model" | "latencyMs" | "success" | "fallbackUsed" | "cacheHit"
  >;

  if (!shouldGenerateTeacherOutput({ params: syntheticParams, result: syntheticResult })) {
    return { inserted: false, skipped: true, reason: "teacher_not_eligible" };
  }

  if (await hasTeacherOutputForRun(client, args.aiRunId)) {
    return { inserted: false, skipped: true, reason: "teacher_already_exists" };
  }

  const teacherResult = await generateTeacherResponse({
    promptText: args.promptText,
    systemPrompt: args.systemPrompt ?? undefined,
    taskType: args.taskType,
    requireJson: args.requireJson,
    jsonSchema: args.jsonSchema,
    maxOutputTokens: args.maxOutputTokens ?? undefined,
  });
  const teacherResponse = teacherResult.response;

  if (!teacherResponse.text?.trim()) {
    return { inserted: false, skipped: true, reason: "empty_teacher_output" };
  }

  const inserted = await insertTeacherOutputRow({
    client,
    aiRunId: args.aiRunId,
    taskType: args.taskType,
    studentProvider: provider,
    studentModel: args.studentModel ?? null,
    studentResponse: args.studentResponse ?? null,
    studentLatencyMs: args.studentLatencyMs ?? null,
    teacherProvider: teacherResponse.provider,
    teacherModel: teacherResponse.model ?? null,
    teacherResponse: teacherResponse.text,
    teacherInputTokens: teacherResponse.inputTokens ?? null,
    teacherOutputTokens: teacherResponse.outputTokens ?? null,
    metadata: {
      ...(args.metadata ?? {}),
      ...teacherResult.metadata,
    },
  });

  if (!inserted.ok) {
    console.warn("[ai/eval] teacher output insert failed:", inserted.error);
    return { inserted: false, skipped: true, reason: inserted.error ?? "insert_failed" };
  }

  return { inserted: true, skipped: false };
}

export function shouldGenerateTeacherOutput(args: {
  params: Pick<RunAIParams, "taskType" | "prompt" | "metadata">;
  result: Pick<AIRunResult, "text" | "provider" | "model" | "latencyMs" | "success" | "fallbackUsed" | "cacheHit">;
}): boolean {
  if (!args.result.success) return false;
  if (args.result.cacheHit) return false;
  if (args.params.metadata?.suppressTeacher === true) return false;

  // Universal learning: ALL successful AI calls (Gemini, OpenAI, future providers)
  // generate teacher outputs. The student LLM learns from every interaction
  // to eventually become Aneurasync's own specialized model.
  return true;
}

export async function maybeGenerateTeacherOutput(args: {
  aiRunId: string;
  params: RunAIParams;
  result: AIRunResult;
}): Promise<void> {
  if (!shouldGenerateTeacherOutput(args)) return;

  try {
    await ensureTeacherOutputForStoredRun({
      aiRunId: args.aiRunId,
      taskType: args.params.taskType,
      promptText: args.params.prompt,
      systemPrompt: args.params.systemPrompt ?? null,
      studentProvider: args.result.provider,
      studentModel: args.result.model,
      studentResponse: args.result.text,
      studentLatencyMs: args.result.latencyMs,
      success: args.result.success,
      fallbackUsed: args.result.fallbackUsed,
      cacheHit: args.result.cacheHit,
      metadata:
        args.params.metadata &&
        typeof args.params.metadata === "object" &&
        !Array.isArray(args.params.metadata)
          ? (args.params.metadata as Record<string, unknown>)
          : null,
      requireJson: args.params.requireJson,
      jsonSchema: args.params.jsonSchema,
      maxOutputTokens: args.params.maxOutputTokens ?? null,
    });
  } catch (error) {
    console.warn("[ai/eval] teacher generation failed:", error);
  }
}
