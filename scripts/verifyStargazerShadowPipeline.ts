import "server-only";

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  buildQuestionKey,
  generateQuestions,
  toPoolInsert,
} from "@/lib/stargazer/questionGenerator";
import { persistStargazerGenerationCandidates } from "@/lib/stargazer/trainingAssets";
import {
  exportStargazerTeacherDataset,
  exportStargazerTrainingDataset,
} from "@/lib/stargazer/exportDataset";

dotenv.config({ path: ".env.local" });

process.env.AI_EXPORT_ENABLED = "true";

function extractPrompts(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const record = item as { prompt?: unknown };
        return typeof record.prompt === "string" ? record.prompt : null;
      })
      .filter((item): item is string => Boolean(item));
  }

  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray((value as { questions?: unknown[] }).questions)
  ) {
    return ((value as { questions: unknown[] }).questions ?? [])
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const record = item as { prompt?: unknown };
        return typeof record.prompt === "string" ? record.prompt : null;
      })
      .filter((item): item is string => Boolean(item));
  }

  return [];
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRole) {
    throw new Error("missing_supabase_env");
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const started = new Date().toISOString();
  const request = {
    axisId: "reassurance_need" as const,
    subject: "self" as const,
    energyTarget: "neutral" as const,
    phrasingStyle: "scenario" as const,
    angle: "self_reflection" as const,
    count: 1,
    existingPrompts: [],
  };
  const batchId = `probe_${Date.now().toString(36)}`;

  const result = await generateQuestions(request);
  const acceptedAudit = result.audit.filter((entry) => entry.accepted);
  const inserts = result.questions.map((question, index) => {
    const key = buildQuestionKey(
      request.axisId,
      request.subject,
      request.phrasingStyle,
      index,
    );
    if (acceptedAudit[index]) {
      acceptedAudit[index] = {
        ...acceptedAudit[index],
        acceptedEntityId: key,
      };
    }
    return toPoolInsert(question, request, key, batchId, result.aiRunId);
  });

  if (inserts.length > 0) {
    const insertResult = await supabase
      .from("stargazer_question_pool")
      .insert(inserts);

    if (insertResult.error) {
      await persistStargazerGenerationCandidates({
        supabase,
        aiRunId: result.aiRunId,
        batchId,
        taskType: "stargazer_question_generation",
        sourceStage: "pool_generate",
        requestContext: request,
        entries: [
          ...acceptedAudit.map((entry) => ({
            ...entry,
            accepted: false as const,
            acceptedEntityId: null,
            rejectionReason: `pool_insert_failed:${insertResult.error.message}`,
          })),
          ...result.audit.filter((entry) => !entry.accepted),
        ],
      });
      throw new Error(`pool_insert_failed:${insertResult.error.message}`);
    }
  }

  await persistStargazerGenerationCandidates({
    supabase,
    aiRunId: result.aiRunId,
    batchId,
    taskType: "stargazer_question_generation",
    sourceStage: "pool_generate",
    requestContext: request,
    entries: [
      ...acceptedAudit,
      ...result.audit.filter((entry) => !entry.accepted),
    ],
  });

  const [aiRunsRes, teacherOutputsRes, shadowEvalRes] = await Promise.all([
    supabase
      .from("ai_runs")
      .select("id, task_type, provider, model, structured_json, metadata, created_at")
      .gte("created_at", started)
      .eq("task_type", "stargazer_question_generation")
      .order("created_at", { ascending: true }),
    supabase
      .from("teacher_outputs")
      .select("id, ai_run_id, source_ai_run_id, task_type, teacher_provider, teacher_model, created_at")
      .gte("created_at", started)
      .eq("task_type", "stargazer_question_generation")
      .order("created_at", { ascending: true }),
    supabase
      .from("ai_eval_runs")
      .select("id, ai_run_id, task_type, eval_type, score, passed, metadata, created_at")
      .gte("created_at", started)
      .eq("eval_type", "stargazer_shadow")
      .order("created_at", { ascending: true }),
  ]);

  const training = await exportStargazerTrainingDataset({
    createdAfter: started,
    taskTypes: ["stargazer_question_generation"],
    limit: 50,
    onlySuccessful: false,
  });
  const teacherDataset = await exportStargazerTeacherDataset({
    createdAfter: started,
    taskTypes: ["stargazer_question_generation"],
    limit: 50,
    onlySuccessful: false,
  });

  const aiRuns = aiRunsRes.data ?? [];
  const teacherOutputs = teacherOutputsRes.data ?? [];
  const shadowEvals = shadowEvalRes.data ?? [];
  const primaryRun = aiRuns.find((row) => row.id === result.aiRunId) ?? null;
  const shadowRun =
    aiRuns.find((row) => row.metadata?.shadowPass === true) ?? null;
  const trainingRows = training.rows.filter((row) => row.aiRunId === result.aiRunId);
  const teacherRows = teacherDataset.rows.filter(
    (row) => row.aiRunId === result.aiRunId || row.aiRunId === shadowRun?.id,
  );

  console.log(
    JSON.stringify(
      {
        returnedQuestions: result.questions.map((question) => question.prompt),
        primaryAiRunId: result.aiRunId,
        primaryStructuredPrompts: extractPrompts(primaryRun?.structured_json ?? null),
        shadowStructuredPrompts: extractPrompts(shadowRun?.structured_json ?? null),
        aiRuns: aiRuns.map((row) => ({
          id: row.id,
          createdAt: row.created_at,
          provider: row.provider,
          model: row.model,
          selectedRole: row.metadata?.selectedRole ?? null,
          userFacing: row.metadata?.userFacing ?? true,
          shadowPass: row.metadata?.shadowPass ?? false,
          shadowOfAiRunId: row.metadata?.shadowOfAiRunId ?? null,
        })),
        teacherOutputs: teacherOutputs.map((row) => ({
          id: row.id,
          aiRunId: row.ai_run_id,
          sourceAiRunId: row.source_ai_run_id,
          taskType: row.task_type,
          teacherProvider: row.teacher_provider,
          teacherModel: row.teacher_model,
        })),
        shadowEvals: shadowEvals.map((row) => ({
          id: row.id,
          aiRunId: row.ai_run_id,
          evalType: row.eval_type,
          score: row.score,
          passed: row.passed,
          primaryAiRunId:
            row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
              ? (row.metadata.primaryAiRunId ?? null)
              : null,
        })),
        trainingRows: trainingRows.map((row) => ({
          id: row.id,
          aiRunId: row.aiRunId,
          acceptanceStatus: row.acceptanceStatus,
          teacherPresent: Boolean(row.teacherOutput.response),
          runScore: row.runOutcomeSummary?.downstreamScore ?? null,
          timesShown: row.runOutcomeSummary?.timesShown ?? null,
          observedAcceptedCount:
            row.runOutcomeSummary?.observedAcceptedCount ?? null,
        })),
        teacherDatasetRows: teacherRows.map((row) => ({
          aiRunId: row.aiRunId,
          teacherPresent: Boolean(row.teacherResponse),
          acceptedEntityIds: row.acceptedEntityIds,
          evalTypes: row.evals.map((evalRow) => evalRow.evalType),
        })),
        minTimesShownForScore:
          process.env.STARGAZER_RUN_SCORE_MIN_TIMES_SHOWN ?? "<default:5>",
        errors: [
          aiRunsRes.error?.message,
          teacherOutputsRes.error?.message,
          shadowEvalRes.error?.message,
        ].filter(Boolean),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
