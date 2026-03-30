import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { refreshOrbiterMemorySummary } from "@/lib/orbiter/memorySummary";
import { loadPreviousDigest } from "@/lib/orbiter/existentialDigest";
import type { OrbiterContext, OrbiterIntelligence, OrbiterMemoryState } from "@/lib/orbiter/types";

dotenv.config({ path: ".env.local" });

function buildSyntheticMemoryState(): OrbiterMemoryState {
  return {
    memos: [],
    latestHypothesis: null,
    pendingQuestion: null,
    milestoneCount: 0,
    revisionCount: 0,
  };
}

function buildSyntheticIntelligence(): OrbiterIntelligence {
  return {
    attractionProfile: null,
    frictionForecast: null,
    selfStateReport: null,
    sceneRecommendation: null,
    trajectoryForecast: {
      type: "slow_deep",
      typeLabel: "ゆっくり深まる型",
      typeDescription: "急がずに観測を積み重ねるほど理解が深まりやすい",
      phases: [],
      estimatedPace: "slow",
      paceNarrative: "即断よりも観察継続が向いている",
      keyRiskAxis: null,
    },
    dualOutfit: null,
    headline: {
      tone: "tentative",
      intent: "pattern_noticed",
      message: "まだ観測量は少ないが、反応の揺れ方に一貫性が見え始めている。",
      confidence: 0.56,
    },
    nextMove: {
      type: "reflect",
      suggestion: "反応が変わる条件をもう1つ観測する",
      reason: "記憶要約 track の shadow 検証用に、次観測ポイントを明確化する",
      experimentGoal: "観測条件ごとの自然な反応差を見極める",
      priority: 0.42,
    },
    memoryDigest: {
      hasHypothesis: true,
      latestMilestone: "初期反応の種別が見え始めた",
      revisionCount: 0,
    },
  } as OrbiterIntelligence;
}

async function main() {
  process.env.ORBITER_SHADOW_ENABLED = process.env.ORBITER_SHADOW_ENABLED ?? "true";
  process.env.AI_FALLBACK_ENABLED = "false";

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

  const { data: stateRow, error: stateError } = await supabase
    .from("rendezvous_user_states")
    .select("user_id, candidate_id, state")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (stateError) {
    throw new Error(`failed_to_load_user_state:${stateError.message}`);
  }
  if (!stateRow?.user_id || !stateRow?.candidate_id) {
    throw new Error("missing_rendezvous_user_state");
  }

  const memoryState = buildSyntheticMemoryState();
  const previousDigest = await loadPreviousDigest(
    supabase,
    stateRow.user_id,
  );
  const orbiterContext: OrbiterContext = {
    visitCount: 1,
    candidateState: stateRow.state ?? "seen",
    category: "unknown",
    hasReflection: false,
    daysSinceDelivery: 0,
    daysUntilExpiry: null,
    hoursSinceLastVisit: null,
  };

  const refreshErrors: string[] = [];
  let refreshResult:
    | Awaited<ReturnType<typeof refreshOrbiterMemorySummary>>
    | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    refreshResult = await refreshOrbiterMemorySummary({
      supabase,
      userId: stateRow.user_id,
      candidateId: stateRow.candidate_id,
      memoryState,
      newMemos: [
        {
          memoType: "observation",
          content: "会話の立ち上がりよりも、少し間を置いた後の反応の方が自然に伸びている。",
          confidence: 0.64,
          linkedMemoId: null,
          metadata: {
            triggerSignal: "shadow_probe",
            visitCount: 1,
            attempt,
          },
        },
      ],
      orbiterContext,
      orbiterIntelligence: buildSyntheticIntelligence(),
      currentDigest: previousDigest,
      sessionId: `${stateRow.candidate_id}:shadow-probe:${attempt}`,
    });

    if (refreshResult.ok && refreshResult.aiRunId) {
      break;
    }

    refreshErrors.push(refreshResult.reason ?? "unknown");
  }

  if (!refreshResult?.ok || !refreshResult.aiRunId) {
    throw new Error(
      `refresh_failed:${refreshErrors.join(" | ") || refreshResult?.reason || "unknown"}`,
    );
  }

  const primaryAiRunId = refreshResult.aiRunId;

  const [
    aiRunsRes,
    teacherOutputsRes,
    evalRes,
    summaryRes,
    registryRes,
  ] = await Promise.all([
    supabase
      .from("ai_runs")
      .select("id, task_type, provider, model, metadata, structured_json, created_at")
      .gte("created_at", started)
      .eq("task_type", "orbiter_memory_summary")
      .order("created_at", { ascending: true }),
    supabase
      .from("teacher_outputs")
      .select("id, ai_run_id, source_ai_run_id, task_type, teacher_provider, teacher_model, created_at")
      .gte("created_at", started)
      .eq("task_type", "orbiter_memory_summary")
      .order("created_at", { ascending: true }),
    supabase
      .from("ai_eval_runs")
      .select("id, ai_run_id, task_type, eval_type, score, passed, metadata, created_at")
      .gte("created_at", started)
      .eq("eval_type", "orbiter_shadow")
      .order("created_at", { ascending: true }),
    supabase
      .from("orbiter_memory_summaries")
      .select("ai_run_id, summary_text, source_memo_count, source_new_memo_count, quality_metrics, updated_at")
      .eq("user_id", stateRow.user_id)
      .eq("candidate_id", stateRow.candidate_id)
      .maybeSingle(),
    supabase
      .from("model_registry")
      .select("id, model_key, model_version, provider, model_role, traffic_role, metadata, is_active")
      .eq("model_key", "orbiter_student")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
  ]);

  const aiRuns = aiRunsRes.data ?? [];
  const teacherOutputs = teacherOutputsRes.data ?? [];
  const shadowEvals = evalRes.data ?? [];
  const primaryRun = aiRuns.find((row) => row.id === primaryAiRunId) ?? null;
  const shadowRun =
    aiRuns.find((row) => row.metadata?.shadowOfAiRunId === primaryAiRunId) ?? null;

  console.log(
    JSON.stringify(
      {
        seed: {
          userId: stateRow.user_id,
          candidateId: stateRow.candidate_id,
          state: stateRow.state,
        },
        primaryAiRunId,
        shadowAiRunId: shadowRun?.id ?? null,
        registry: (registryRes.data ?? []).map((row) => ({
          id: row.id,
          modelKey: row.model_key,
          modelVersion: row.model_version,
          provider: row.provider,
          trafficRole: row.traffic_role ?? row.model_role,
          studentTrack:
            row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
              ? (row.metadata.studentTrack ?? null)
              : null,
        })),
        aiRuns: aiRuns.map((row) => ({
          id: row.id,
          provider: row.provider,
          model: row.model,
          shadowPass: row.metadata?.shadowPass ?? false,
          shadowOfAiRunId: row.metadata?.shadowOfAiRunId ?? null,
          selectedRole: row.metadata?.selectedRole ?? null,
          userFacing: row.metadata?.userFacing ?? true,
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
        summaryRow: summaryRes.data
          ? {
              aiRunId: summaryRes.data.ai_run_id,
              summaryText: summaryRes.data.summary_text,
              sourceMemoCount: summaryRes.data.source_memo_count,
              sourceNewMemoCount: summaryRes.data.source_new_memo_count,
            }
          : null,
        errors: [
          aiRunsRes.error?.message,
          teacherOutputsRes.error?.message,
          evalRes.error?.message,
          summaryRes.error?.message,
          registryRes.error?.message,
          ...refreshErrors,
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
