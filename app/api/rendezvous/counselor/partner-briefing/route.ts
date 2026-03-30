import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyCandidateBelongsToUser } from "@/lib/rendezvous/helpers";
import { generatePartnerBriefing } from "@/lib/rendezvous/counselor/partnerCounselor";
import { computePartnerScore } from "@/lib/rendezvous/partnerScoring";
import { computeAttachmentCompatibility, deriveAttachmentProfile } from "@/lib/rendezvous/attachmentProfile";
import { computeConflictRepairCompatibility } from "@/lib/rendezvous/conflictRepair";
import { computeLifePlanProfile } from "@/lib/rendezvous/lifePlanVector";
import type { LifePlanProfile, LifePlanResponse } from "@/lib/rendezvous/lifePlanVector";
import { reasonCodesToTexts, cautionCodesToTexts } from "@/lib/rendezvous/evaluate";

/**
 * Partner 枠専用ブリーフィング API
 *
 * GET /api/rendezvous/counselor/partner-briefing?candidateId=xxx
 *
 * 3層統合スコアを算出し、Partner 専用のブリーフィングを生成して返す。
 * キャッシュがある場合はキャッシュを返す。
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const candidateId = req.nextUrl.searchParams.get("candidateId");
    if (!candidateId) {
      return NextResponse.json(
        { error: "candidateId query param is required" },
        { status: 400 },
      );
    }

    const userId = user.id;

    // Verify candidate belongs to requesting user
    const ownership = await verifyCandidateBelongsToUser(supabaseAdmin, candidateId, userId);
    if (!ownership) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    // Check cache
    const { data: existing } = await supabaseAdmin
      .from("rendezvous_pre_briefings")
      .select("*")
      .eq("candidate_id", candidateId)
      .eq("user_id", userId)
      .single();

    if (existing?.briefing_data && (existing.briefing_data as Record<string, unknown>).compatibilityInsight) {
      return NextResponse.json({ briefing: existing.briefing_data, cached: true });
    }

    // Get candidate info
    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("user_a, user_b, category, reason_codes, reason_texts, caution_codes, caution_texts, a_to_b_score, b_to_a_score")
      .eq("id", candidateId)
      .single();

    if (!candidate || candidate.category !== "partner") {
      return NextResponse.json({ error: "Not a partner candidate" }, { status: 400 });
    }

    const counterpartUserId = candidate.user_a === userId ? candidate.user_b : candidate.user_a;

    // Fetch Stargazer profiles for both users
    const [selfStargazer, counterpartStargazer] = await Promise.all([
      supabaseAdmin.from("stargazer_profiles").select("axis_scores, resolved_type").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("stargazer_profiles").select("axis_scores, resolved_type").eq("user_id", counterpartUserId).maybeSingle(),
    ]);

    const selfScores = (selfStargazer.data?.axis_scores ?? {}) as Record<string, number>;
    const counterpartScores = (counterpartStargazer.data?.axis_scores ?? {}) as Record<string, number>;

    // Fetch Life Plan profiles
    const [selfLpResponses, counterpartLpResponses] = await Promise.all([
      supabaseAdmin.from("partner_life_plan_responses").select("question_id, value, response_time_ms").eq("user_id", userId),
      supabaseAdmin.from("partner_life_plan_responses").select("question_id, value, response_time_ms").eq("user_id", counterpartUserId),
    ]);

    let selfLifePlan: LifePlanProfile | undefined;
    let counterpartLifePlan: LifePlanProfile | undefined;

    if (selfLpResponses.data?.length) {
      const responses: LifePlanResponse[] = selfLpResponses.data.map((r) => ({
        questionId: r.question_id,
        value: r.value,
        responseTimeMs: r.response_time_ms ?? undefined,
      }));
      selfLifePlan = computeLifePlanProfile(responses);
    }

    if (counterpartLpResponses.data?.length) {
      const responses: LifePlanResponse[] = counterpartLpResponses.data.map((r) => ({
        questionId: r.question_id,
        value: r.value,
        responseTimeMs: r.response_time_ms ?? undefined,
      }));
      counterpartLifePlan = computeLifePlanProfile(responses);
    }

    // Fetch matching vectors for attachment computation
    const [selfPrefs, counterpartPrefs] = await Promise.all([
      supabaseAdmin.from("rendezvous_preferences").select("matching_vector").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("rendezvous_preferences").select("matching_vector").eq("user_id", counterpartUserId).maybeSingle(),
    ]);

    const defaultVector = { distance_need: 0.5, emotional_openness: 0.5, conflict_directness: 0.5, stability_need: 0.5, depth_speed: 0.5 };

    // Compute attachment and repair compatibility
    const selfAttachment = Object.keys(selfScores).length > 0
      ? deriveAttachmentProfile({
          matchingVector: (selfPrefs.data?.matching_vector as typeof defaultVector) ?? defaultVector,
          stargazerScores: selfScores,
        })
      : undefined;
    const counterpartAttachment = Object.keys(counterpartScores).length > 0
      ? deriveAttachmentProfile({
          matchingVector: (counterpartPrefs.data?.matching_vector as typeof defaultVector) ?? defaultVector,
          stargazerScores: counterpartScores,
        })
      : undefined;

    const attachmentFit = selfAttachment && counterpartAttachment
      ? computeAttachmentCompatibility(selfAttachment, counterpartAttachment)
      : undefined;

    // Compute Partner 3-layer score
    const layer1Avg = ((candidate.a_to_b_score ?? 0) + (candidate.b_to_a_score ?? 0)) / 2;
    const partnerResult = computePartnerScore(layer1Avg, {
      aStargazerScores: selfScores,
      bStargazerScores: counterpartScores,
      attachmentFit: attachmentFit ?? 0.5,
      repairCapacity: 0.5, // TODO: compute from conflictRepair profiles when available
      aLifePlanProfile: selfLifePlan,
      bLifePlanProfile: counterpartLifePlan,
    });

    // Generate Partner briefing
    const briefing = await generatePartnerBriefing({
      candidateId,
      userId,
      counterpartUserId,
      partnerResult,
      selfLifePlan,
      counterpartLifePlan,
      selfStargazerType: selfStargazer.data?.resolved_type ?? undefined,
      counterpartStargazerType: counterpartStargazer.data?.resolved_type ?? undefined,
      existingReasonTexts: reasonCodesToTexts(candidate.reason_texts ?? []),
      existingCautionTexts: cautionCodesToTexts(candidate.caution_texts ?? []),
    });

    // Store in DB (upsert)
    await supabaseAdmin
      .from("rendezvous_pre_briefings")
      .upsert({
        candidate_id: candidateId,
        user_id: userId,
        briefing_data: briefing as unknown as Record<string, unknown>,
      }, { onConflict: "candidate_id,user_id" });

    // Log partner scoring result
    await supabaseAdmin
      .from("partner_scoring_logs")
      .insert({
        candidate_id: candidateId,
        user_a: userId,
        user_b: counterpartUserId,
        layer1_score: partnerResult.layer1Score,
        layer15_score: partnerResult.layer15Score,
        layer2_score: partnerResult.layer2Score,
        total_score: partnerResult.total,
        process_vector: partnerResult.processVector ?? null,
        life_plan_fit: partnerResult.lifePlanFit ?? null,
        guard_result: partnerResult.guardResult,
        partner_reason_codes: partnerResult.partnerReasonCodes,
        partner_caution_codes: partnerResult.partnerCautionCodes,
      });

    return NextResponse.json({
      briefing,
      partnerScore: {
        total: partnerResult.total,
        layer1: partnerResult.layer1Score,
        layer15: partnerResult.layer15Score,
        layer2: partnerResult.layer2Score,
      },
      cached: false,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[counselor/partner-briefing] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
