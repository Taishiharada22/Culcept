import "server-only";

import { getAIServiceClient } from "./db";
import { runGemini } from "./providers/gemini";
import type { AIRunResult, RunAIParams } from "./types";

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

const TEACHER_ELIGIBLE_TASK_TYPES = new Set([
  "high_quality_chat",
  "detailed_analysis",
  "creative_writing",
]);

export function shouldGenerateTeacherOutput(args: {
  params: Pick<RunAIParams, "taskType" | "prompt" | "metadata">;
  result: Pick<AIRunResult, "text" | "provider" | "model" | "latencyMs" | "success" | "fallbackUsed" | "cacheHit">;
}): boolean {
  const teacherEnabled = envBool("AI_TEACHER_ENABLED", false);
  if (!teacherEnabled) return false;

  if (!args.result.success) return false;
  if (args.result.cacheHit) return false;
  if (args.params.metadata?.suppressTeacher === true) return false;

  if (args.result.provider === "gemini") return false;

  if (TEACHER_ELIGIBLE_TASK_TYPES.has(args.params.taskType)) return true;
  if (args.params.metadata?.needsTeacher === true) return true;

  return false;
}

export async function maybeGenerateTeacherOutput(args: {
  aiRunId: string;
  params: RunAIParams;
  result: AIRunResult;
}): Promise<void> {
  if (!shouldGenerateTeacherOutput(args)) return;

  try {
    const client = getAIServiceClient();
    if (!client) return;

    const teacherResponse = await runGemini(
      {
        prompt: args.params.prompt,
        systemPrompt: args.params.systemPrompt,
        jsonSchema: args.params.jsonSchema,
        requireJson: args.params.requireJson,
        temperature: args.params.temperature,
        maxOutputTokens: args.params.maxOutputTokens,
      },
      {},
    );

    if (!teacherResponse.text?.trim()) return;

    const row = {
      ai_run_id: args.aiRunId,
      task_type: args.params.taskType,
      student_provider: args.result.provider,
      student_model: args.result.model,
      student_response: args.result.text,
      teacher_provider: teacherResponse.provider,
      teacher_model: teacherResponse.model,
      teacher_response: teacherResponse.text,
      metadata: {
        studentLatencyMs: args.result.latencyMs,
        teacherInputTokens: teacherResponse.inputTokens,
        teacherOutputTokens: teacherResponse.outputTokens,
      },
    };

    const { error } = await client.from("teacher_outputs").insert(row);
    if (error) {
      console.warn("[ai/eval] teacher output insert failed:", error.message);
    }
  } catch (error) {
    console.warn("[ai/eval] teacher generation failed:", error);
  }
}
