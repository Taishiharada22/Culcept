// app/api/stargazer/pool/generate/route.ts
// バッチ質問生成API — coworkで質問プールを育てる

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/isAdmin";
import {
  generateQuestions,
  buildQuestionKey,
  toPoolInsert,
  validateGeneratedQuestion,
} from "@/lib/stargazer/questionGenerator";
import { TRAIT_AXIS_KEYS, type TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type {
  SubjectContext,
  EnergyTarget,
  PhrasingStyle,
  ObservationAngle,
  QuestionGenerationRequest,
} from "@/lib/stargazer/questionPoolTypes";
import {
  ALL_SUBJECTS,
  ALL_ENERGIES,
  ALL_PHRASING_STYLES,
  ALL_ANGLES,
} from "@/lib/stargazer/questionPoolTypes";
import { persistStargazerGenerationCandidates } from "@/lib/stargazer/trainingAssets";

export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      axisId,
      subject,
      energyTarget,
      phrasingStyle,
      angle,
      count = 5,
    } = body as {
      axisId?: string;
      subject?: string;
      energyTarget?: string;
      phrasingStyle?: string;
      angle?: string;
      count?: number;
    };

    // Validate inputs
    const effectiveAxis = axisId && TRAIT_AXIS_KEYS.includes(axisId as TraitAxisKey)
      ? (axisId as TraitAxisKey)
      : null;
    const effectiveSubject = subject && ALL_SUBJECTS.includes(subject as SubjectContext)
      ? (subject as SubjectContext)
      : "self";
    const effectiveEnergy = energyTarget && ALL_ENERGIES.includes(energyTarget as EnergyTarget)
      ? (energyTarget as EnergyTarget)
      : "neutral";
    const effectiveStyle = phrasingStyle && ALL_PHRASING_STYLES.includes(phrasingStyle as PhrasingStyle)
      ? (phrasingStyle as PhrasingStyle)
      : "direct";
    const effectiveAngle = angle && ALL_ANGLES.includes(angle as ObservationAngle)
      ? (angle as ObservationAngle)
      : "self_reflection";
    const effectiveCount = Math.min(Math.max(1, count), 10);

    // If no axis specified, auto-detect gap
    const targetAxes: TraitAxisKey[] = effectiveAxis
      ? [effectiveAxis]
      : await detectGapAxes(supabase);

    const batchId = `batch_${Date.now().toString(36)}_gen`;

    // Create batch record
    await supabase.from("stargazer_generation_batches").insert({
      id: batchId,
      batch_type: effectiveAxis ? "cowork" : "fill_gap",
      target_axis: effectiveAxis ?? null,
      target_dimensions: {
        subject: effectiveSubject,
        energyTarget: effectiveEnergy,
        phrasingStyle: effectiveStyle,
        angle: effectiveAngle,
      },
      requested_count: effectiveCount * targetAxes.length,
      status: "running",
    });

    let totalGenerated = 0;
    let totalAccepted = 0;
    let totalRejected = 0;
    const aiRunIds: string[] = [];

    for (const axis of targetAxes) {
      // Get existing prompts to avoid duplicates
      const { data: existing } = await supabase
        .from("stargazer_question_pool")
        .select("variant_json")
        .eq("axis_id", axis)
        .eq("subject", effectiveSubject)
        .eq("phrasing_style", effectiveStyle)
        .eq("is_active", true)
        .limit(10);

      const existingPrompts = (existing ?? [])
        .map((r) => (r.variant_json as { prompt?: string })?.prompt)
        .filter(Boolean) as string[];

      const genRequest: QuestionGenerationRequest = {
        axisId: axis,
        subject: effectiveSubject,
        energyTarget: effectiveEnergy,
        phrasingStyle: effectiveStyle,
        angle: effectiveAngle,
        count: effectiveCount,
        existingPrompts,
      };

      const result = await generateQuestions(genRequest);
      if (result.aiRunId) aiRunIds.push(result.aiRunId);

      totalGenerated += result.questions.length;

      // Insert valid questions
      const acceptedAudit = result.audit.filter((entry) => entry.accepted);
      const inserts = result.questions.map((q, i) => {
        const key = buildQuestionKey(axis, effectiveSubject, effectiveStyle, i);
        if (acceptedAudit[i]) {
          acceptedAudit[i] = {
            ...acceptedAudit[i],
            acceptedEntityId: key,
          };
        }
        return toPoolInsert(q, genRequest, key, batchId, result.aiRunId);
      });

      if (inserts.length > 0) {
        const { error } = await supabase
          .from("stargazer_question_pool")
          .insert(inserts);

        if (error) {
          console.error("[pool/generate] Insert error:", error.message);
          totalRejected += inserts.length;
          await persistStargazerGenerationCandidates({
            supabase,
            aiRunId: result.aiRunId,
            batchId,
            taskType: "stargazer_question_generation",
            sourceStage: "pool_generate",
            requestContext: genRequest,
            entries: [
              ...acceptedAudit.map((entry) => ({
                ...entry,
                accepted: false,
                acceptedEntityId: null,
                rejectionReason: `pool_insert_failed:${error.message}`,
              })),
              ...result.audit.filter((entry) => !entry.accepted),
            ],
          });
        } else {
          totalAccepted += inserts.length;
          await persistStargazerGenerationCandidates({
            supabase,
            aiRunId: result.aiRunId,
            batchId,
            taskType: "stargazer_question_generation",
            sourceStage: "pool_generate",
            requestContext: genRequest,
            entries: [
              ...acceptedAudit,
              ...result.audit.filter((entry) => !entry.accepted),
            ],
          });
        }
      } else if (result.audit.length > 0) {
        await persistStargazerGenerationCandidates({
          supabase,
          aiRunId: result.aiRunId,
          batchId,
          taskType: "stargazer_question_generation",
          sourceStage: "pool_generate",
          requestContext: genRequest,
          entries: result.audit,
        });
      }
    }

    // Update batch record
    await supabase
      .from("stargazer_generation_batches")
      .update({
        generated_count: totalGenerated,
        accepted_count: totalAccepted,
        rejected_count: totalRejected,
        ai_run_ids: aiRunIds,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", batchId);

    return NextResponse.json({
      ok: true,
      batchId,
      targetAxes,
      generated: totalGenerated,
      accepted: totalAccepted,
      rejected: totalRejected,
    });
  } catch (error) {
    console.error("[pool/generate] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * Detect axes with fewest pool questions for gap filling.
 */
async function detectGapAxes(supabase: Awaited<ReturnType<typeof supabaseServer>>): Promise<TraitAxisKey[]> {
  const { data } = await supabase
    .from("stargazer_question_pool")
    .select("axis_id")
    .eq("is_active", true);

  const counts = new Map<string, number>();
  for (const key of TRAIT_AXIS_KEYS) {
    counts.set(key, 0);
  }
  for (const row of data ?? []) {
    counts.set(row.axis_id, (counts.get(row.axis_id) ?? 0) + 1);
  }

  // Sort by count ascending, pick top 3 gaps
  return [...counts.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([axis]) => axis as TraitAxisKey);
}
