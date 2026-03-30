import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  evaluatePair,
  reasonCodesToTexts,
  cautionCodesToTexts,
} from "@/lib/rendezvous";
import {
  normalizeUserPair,
  buildScheduledAt,
  buildExpiryAt,
} from "@/lib/rendezvous/helpers";
import type {
  RendezvousProfile,
  RendezvousPreferences,
  MatchingVector,
  DealbreakerProfile,
} from "@/lib/rendezvous/types";

export async function POST(request: NextRequest) {
  try {
    // Auth via CRON_SECRET
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const supabase = supabaseAdmin;
    const body = await request.json().catch(() => ({}));
    const batchSize = Math.min(
      Math.max(parseInt(body.batchSize ?? "50", 10), 1),
      200,
    );

    // Fetch pending encounter events
    const { data: events, error: eventsErr } = await supabase
      .from("encounter_events")
      .select("*")
      .eq("evaluation_status", "pending")
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (eventsErr)
      return NextResponse.json(
        { ok: false, error: eventsErr.message },
        { status: 500 },
      );

    if (!events || events.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        candidatesCreated: 0,
      });
    }

    let processed = 0;
    let candidatesCreated = 0;

    for (const event of events) {
      const eventId = event.id;
      const userA = event.user_a;
      const userB = event.user_b;

      try {
        // Mark as evaluating
        await supabase
          .from("encounter_events")
          .update({ evaluation_status: "evaluating" })
          .eq("id", eventId);

        // Check blocks (both directions)
        const { data: blocks } = await supabase
          .from("rendezvous_blocks")
          .select("id")
          .or(
            `and(blocker_user_id.eq.${userA},blocked_user_id.eq.${userB}),and(blocker_user_id.eq.${userB},blocked_user_id.eq.${userA})`,
          )
          .limit(1);

        if (blocks && blocks.length > 0) {
          await supabase
            .from("encounter_events")
            .update({
              evaluation_status: "not_eligible",
              evaluated_at: new Date().toISOString(),
            })
            .eq("id", eventId);
          processed++;
          continue;
        }

        // Check suppressions
        const [sLow, sHigh] = normalizeUserPair(userA, userB);
        const { data: suppressions } = await supabase
          .from("rendezvous_suppressions")
          .select("*")
          .eq("user_low", sLow)
          .eq("user_high", sHigh)
          .or(
            `until_at.is.null,until_at.gt.${new Date().toISOString()}`,
          );

        if (suppressions && suppressions.length > 0) {
          await supabase
            .from("encounter_events")
            .update({
              evaluation_status: "suppressed",
              evaluated_at: new Date().toISOString(),
            })
            .eq("id", eventId);
          processed++;
          continue;
        }

        // Load profiles
        const [profileARes, profileBRes] = await Promise.all([
          supabase
            .from("rendezvous_profiles")
            .select("*")
            .eq("user_id", userA)
            .eq("is_enabled", true)
            .eq("is_paused", false)
            .single(),
          supabase
            .from("rendezvous_profiles")
            .select("*")
            .eq("user_id", userB)
            .eq("is_enabled", true)
            .eq("is_paused", false)
            .single(),
        ]);

        if (
          profileARes.error ||
          !profileARes.data ||
          profileBRes.error ||
          !profileBRes.data
        ) {
          await supabase
            .from("encounter_events")
            .update({
              evaluation_status: "not_eligible",
              evaluated_at: new Date().toISOString(),
            })
            .eq("id", eventId);
          processed++;
          continue;
        }

        const profileA = profileARes.data as RendezvousProfile;
        const profileB = profileBRes.data as RendezvousProfile;

        // Load preferences
        const [prefsARes, prefsBRes] = await Promise.all([
          supabase
            .from("rendezvous_preferences")
            .select("*")
            .eq("user_id", userA)
            .single(),
          supabase
            .from("rendezvous_preferences")
            .select("*")
            .eq("user_id", userB)
            .single(),
        ]);

        if (
          prefsARes.error ||
          !prefsARes.data ||
          prefsBRes.error ||
          !prefsBRes.data
        ) {
          await supabase
            .from("encounter_events")
            .update({
              evaluation_status: "not_eligible",
              evaluated_at: new Date().toISOString(),
            })
            .eq("id", eventId);
          processed++;
          continue;
        }

        const preferencesA = prefsARes.data as RendezvousPreferences;
        const preferencesB = prefsBRes.data as RendezvousPreferences;
        const vectorA = preferencesA.matching_vector as MatchingVector;
        const vectorB = preferencesB.matching_vector as MatchingVector;

        // Load dealbreaker profiles (profile_details JSONB)
        const dealbreakerA = (profileA as any).profile_details as DealbreakerProfile | undefined;
        const dealbreakerB = (profileB as any).profile_details as DealbreakerProfile | undefined;

        // Evaluate pair
        const evalResult = evaluatePair({
          profileA,
          profileB,
          preferencesA,
          preferencesB,
          vectorA,
          vectorB,
          dealbreakerA,
          dealbreakerB,
        });

        if (!evalResult.mutual || !evalResult.bestCategory) {
          await supabase
            .from("encounter_events")
            .update({
              evaluation_status: "not_mutual",
              evaluated_at: new Date().toISOString(),
            })
            .eq("id", eventId);
          processed++;
          continue;
        }

        // Create candidate
        const expiresAt = buildExpiryAt().toISOString();
        const bestCat = evalResult.bestCategory;
        const abScore =
          evalResult.scoreABByCategory[bestCat]?.total ?? 0;
        const baScore =
          evalResult.scoreBAByCategory[bestCat]?.total ?? 0;

        const reasonTexts = reasonCodesToTexts(
          evalResult.reasonCodes as string[],
        );
        const cautionTexts = cautionCodesToTexts(
          evalResult.cautionCodes as string[],
        );

        const { data: candidateData, error: candidateErr } =
          await supabase
            .from("rendezvous_candidates")
            .insert({
              user_a: userA,
              user_b: userB,
              source_event_id: eventId,
              category: bestCat,
              a_to_b_score: abScore,
              b_to_a_score: baScore,
              overall_score: evalResult.overallScore,
              reason_codes: evalResult.reasonCodes,
              reason_texts: reasonTexts,
              caution_codes: evalResult.cautionCodes,
              caution_texts: cautionTexts,
              label: evalResult.label,
              state: "candidate_generated",
              expires_at: expiresAt,
            })
            .select("id")
            .single();

        if (candidateErr || !candidateData) {
          await supabase
            .from("encounter_events")
            .update({
              evaluation_status: "failed",
              evaluated_at: new Date().toISOString(),
            })
            .eq("id", eventId);
          processed++;
          continue;
        }

        const candidateId = candidateData.id;

        // Create user_states for both users
        await supabase.from("rendezvous_user_states").insert([
          {
            candidate_id: candidateId,
            user_id: userA,
            state: "unseen",
          },
          {
            candidate_id: candidateId,
            user_id: userB,
            state: "unseen",
          },
        ]);

        // Schedule notifications for both users
        const scheduledAtA = buildScheduledAt(profileA).toISOString();
        const scheduledAtB = buildScheduledAt(profileB).toISOString();

        await supabase.from("rendezvous_notifications").insert([
          {
            candidate_id: candidateId,
            user_id: userA,
            notification_type: "new_candidate",
            scheduled_for: scheduledAtA,
            status: "pending",
          },
          {
            candidate_id: candidateId,
            user_id: userB,
            notification_type: "new_candidate",
            scheduled_for: scheduledAtB,
            status: "pending",
          },
        ]);

        // Update encounter event
        await supabase
          .from("encounter_events")
          .update({
            evaluation_status: "candidate_created",
            evaluated_at: new Date().toISOString(),
            candidate_generated: true,
            candidate_id: candidateId,
          })
          .eq("id", eventId);

        // Log
        await supabase.from("rendezvous_candidate_logs").insert({
          candidate_id: candidateId,
          event_type: "candidate_created",
          payload: {
            source_event_id: eventId,
            category: bestCat,
            overall_score: evalResult.overallScore,
            a_to_b_score: abScore,
            b_to_a_score: baScore,
          },
        });

        candidatesCreated++;
        processed++;
      } catch (innerErr: any) {
        console.error(
          `[rendezvous/encounters/process] event ${eventId} failed:`,
          innerErr,
        );
        await supabase
          .from("encounter_events")
          .update({
            evaluation_status: "failed",
            evaluated_at: new Date().toISOString(),
          })
          .eq("id", eventId);
        processed++;
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      candidatesCreated,
    });
  } catch (err: any) {
    console.error("[rendezvous/encounters/process] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
