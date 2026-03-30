// app/api/stargazer/pool/seed/route.ts
// 初期シード生成API — ~500問の質問プールを一括投入

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/isAdmin";
import { authorizeInternalRequest } from "@/lib/ai/internalAuth";
import {
  generateQuestions,
  buildQuestionKey,
  toPoolInsert,
} from "@/lib/stargazer/questionGenerator";
import { persistStargazerGenerationCandidates } from "@/lib/stargazer/trainingAssets";
import {
  buildSeedPlan,
  batchSeedPlans,
} from "@/lib/stargazer/questionSeedData";

export const maxDuration = 300; // seed は長時間かかるため 5 分

export async function POST(request: NextRequest) {
  try {
    // Auth: session-based (browser) OR internal token (curl)
    const internal = authorizeInternalRequest(request);

    if (!internal.ok) {
      console.warn("[seed] internal auth failed:", internal.reason,
        "| auth header present:", !!request.headers.get("authorization"));
    }

    const supabase = await supabaseServer();

    if (!internal.ok) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !isAdminEmail(user.email)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Check if already seeded
    const { count } = await supabase
      .from("stargazer_question_pool")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    if ((count ?? 0) >= 100) {
      return NextResponse.json({
        ok: true,
        message: `Pool already has ${count} active questions. Skipping seed.`,
        skipped: true,
      });
    }

    const batchId = `batch_${Date.now().toString(36)}_seed`;

    // Create batch record
    const seedPlan = buildSeedPlan();
    const requests = batchSeedPlans(seedPlan);

    await supabase.from("stargazer_generation_batches").insert({
      id: batchId,
      batch_type: "seed",
      target_axis: null,
      target_dimensions: null,
      requested_count: requests.reduce((sum, r) => sum + r.count, 0),
      status: "running",
    });

    let totalGenerated = 0;
    let totalAccepted = 0;
    let totalRejected = 0;
    const aiRunIds: string[] = [];
    const errors: string[] = [];

    // Process requests sequentially (avoid rate limits)
    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];

      try {
        const result = await generateQuestions(req);
        if (result.aiRunId) aiRunIds.push(result.aiRunId);

        totalGenerated += result.questions.length;

        const acceptedAudit = result.audit.filter((entry) => entry.accepted);
        const inserts = result.questions.map((q, j) => {
          const key = buildQuestionKey(
            req.axisId,
            req.subject,
            req.phrasingStyle,
            j,
          );
          if (acceptedAudit[j]) {
            acceptedAudit[j] = {
              ...acceptedAudit[j],
              acceptedEntityId: key,
            };
          }
          return toPoolInsert(q, req, key, batchId, result.aiRunId);
        });

        if (inserts.length > 0) {
          const { error } = await supabase
            .from("stargazer_question_pool")
            .insert(inserts);

          if (error) {
            console.error(`[seed] Insert error for batch ${i}:`, error.message);
            errors.push(`batch ${i}: ${error.message}`);
            totalRejected += inserts.length;
            await persistStargazerGenerationCandidates({
              supabase,
              aiRunId: result.aiRunId,
              batchId,
              taskType: "stargazer_question_generation",
              sourceStage: "seed",
              requestContext: req,
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
              sourceStage: "seed",
              requestContext: req,
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
            sourceStage: "seed",
            requestContext: req,
            entries: result.audit,
          });
        }

        // Log progress every 10 batches
        if ((i + 1) % 10 === 0) {
          console.info(
            `[seed] Progress: ${i + 1}/${requests.length} batches, ${totalAccepted} accepted`,
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown error";
        console.error(`[seed] Batch ${i} failed:`, msg);
        errors.push(`batch ${i}: ${msg}`);
      }
    }

    // Update batch record
    await supabase
      .from("stargazer_generation_batches")
      .update({
        generated_count: totalGenerated,
        accepted_count: totalAccepted,
        rejected_count: totalRejected,
        ai_run_ids: aiRunIds.slice(0, 50), // Limit array size
        status: errors.length > 0 ? "completed" : "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", batchId);

    return NextResponse.json({
      ok: true,
      batchId,
      totalBatches: requests.length,
      generated: totalGenerated,
      accepted: totalAccepted,
      rejected: totalRejected,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    console.error("[pool/seed] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
