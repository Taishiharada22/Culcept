import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { RendezvousCategory, MatchingVector } from "@/lib/rendezvous/types";
import { buildInitialMatchingVector } from "@/lib/rendezvous/onboardingOrchestrator";

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;

    const body = await request.json();
    const {
      partialVector,
      discoveredAxes,
      confidence,
      selectedQuestions,
      enabledCategories,
      dealbreakers,
    } = body as {
      partialVector: Partial<MatchingVector>;
      discoveredAxes: { axis: string; label: string; value: number; confidence: number }[];
      confidence: Record<string, number>;
      selectedQuestions: string[];
      enabledCategories: RendezvousCategory[];
      dealbreakers?: {
        marriageIntent?: string;
        childrenPreference?: string;
        lifestyleMorningNight?: number;
        smokingStatus?: string;
        smokingTolerance?: string;
      };
    };

    // Stargazerスコアを事前取得してベクトル融合に使用
    const { data: stargazerForFusion } = await supabaseAdmin
      .from("stargazer_axis_snapshots")
      .select("axis_id, score")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(33);

    // Stargazer融合マッチングベクトルを構築（Orchestrator経由）
    const stargazerScores: Record<string, number> = {};
    if (stargazerForFusion) {
      const seen = new Set<string>();
      for (const row of stargazerForFusion) {
        if (!seen.has(row.axis_id)) {
          seen.add(row.axis_id);
          stargazerScores[row.axis_id] = Number(row.score);
        }
      }
    }

    // Stargazer融合マッチングベクトルを構築（Orchestrator経由）
    const hasStargazer = Object.keys(stargazerScores).length >= 10;
    const orchestratedVector = hasStargazer
      ? buildInitialMatchingVector({ stargazerScores })
      : null;

    const fullVector: MatchingVector = orchestratedVector ?? {
      conversation_temperature: partialVector.conversation_temperature ?? 0.5,
      distance_need: partialVector.distance_need ?? 0.5,
      depth_speed: partialVector.depth_speed ?? 0.5,
      stability_need: partialVector.stability_need ?? 0.5,
      stimulation_need: partialVector.stimulation_need ?? 0.5,
      initiative: partialVector.initiative ?? 0.5,
      emotional_openness: partialVector.emotional_openness ?? 0.5,
      conflict_directness: partialVector.conflict_directness ?? 0.5,
      social_energy: partialVector.social_energy ?? 0.5,
      structure_preference: partialVector.structure_preference ?? 0.5,
    };

    const primaryCategory = enabledCategories[0] ?? "friendship";

    // Upsert rendezvous profile
    // verification_status / review_status を明示指定。
    // DB DEFAULT が CHECK 制約と不整合の場合に備える。
    const { error: profileErr } = await supabaseAdmin
      .from("rendezvous_profiles")
      .upsert(
        {
          user_id: userId,
          is_enabled: true,
          is_paused: false,
          primary_category: primaryCategory,
          enabled_categories: enabledCategories,
          verification_status: "unverified",
          review_status: "not_submitted",
          onboarding_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (profileErr) {
      console.error("Profile upsert error:", profileErr);
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    // ① Dealbreaker データを profile_details に保存（romantic/partner のみ）
    if (dealbreakers && (enabledCategories.includes("romantic") || enabledCategories.includes("partner"))) {
      const profileDetails: Record<string, unknown> = {
        marriageIntent: dealbreakers.marriageIntent,
        childrenPreference: dealbreakers.childrenPreference,
      };
      if (dealbreakers.lifestyleMorningNight !== undefined) {
        profileDetails.lifestyleMorningNight = dealbreakers.lifestyleMorningNight;
      }
      if (dealbreakers.smokingStatus) {
        profileDetails.smokingStatus = dealbreakers.smokingStatus;
      }
      if (dealbreakers.smokingTolerance) {
        profileDetails.smokingTolerance = dealbreakers.smokingTolerance;
      }

      const { error: dealbreakerErr } = await supabaseAdmin
        .from("rendezvous_profiles")
        .update({
          profile_details: profileDetails,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (dealbreakerErr) {
        console.warn("Dealbreaker save warning:", dealbreakerErr);
      }
    }

    // Upsert rendezvous preferences with matching vector
    const { error: prefsErr } = await supabaseAdmin
      .from("rendezvous_preferences")
      .upsert(
        {
          user_id: userId,
          desired_relation_types: enabledCategories,
          matching_vector: fullVector,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (prefsErr) {
      console.error("Preferences upsert error:", prefsErr);
      return NextResponse.json({ error: prefsErr.message }, { status: 500 });
    }

    // Save onboarding data (vector confidence, discovered axes, selected questions)
    const { error: onboardingErr } = await supabaseAdmin
      .from("rendezvous_onboarding")
      .upsert(
        {
          user_id: userId,
          partial_vector: partialVector,
          discovered_axes: discoveredAxes,
          confidence,
          selected_questions: selectedQuestions,
          enabled_categories: enabledCategories,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (onboardingErr) {
      // Non-critical: log but don't fail
      console.warn("Onboarding data save warning:", onboardingErr);
    }

    // Fetch Stargazer axis snapshots for richer avatar personality
    const { data: stargazerAxes } = await supabaseAdmin
      .from("stargazer_axis_snapshots")
      .select("axis_id, score, confidence")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    // Deduplicate to latest per axis
    const latestAxes: { axis_id: string; score: number; confidence?: number }[] = [];
    const seenAxes = new Set<string>();
    if (stargazerAxes) {
      for (const row of stargazerAxes) {
        if (!seenAxes.has(row.axis_id)) {
          seenAxes.add(row.axis_id);
          latestAxes.push({
            axis_id: row.axis_id,
            score: Number(row.score),
            confidence: row.confidence ? Number(row.confidence) : undefined,
          });
        }
      }
    }

    // Initialize avatar personality with Stargazer enrichment
    const { initializePersonality, initializeSkills } = await import("@/lib/rendezvous/avatarPersonality");
    const personality = initializePersonality(fullVector, latestAxes.length > 0 ? latestAxes : undefined);
    const avatarSkillsData = initializeSkills(fullVector, latestAxes.length > 0 ? latestAxes : undefined);

    const { error: skillsErr } = await supabaseAdmin
      .from("avatar_skills")
      .upsert(
        {
          user_id: userId,
          skills: avatarSkillsData,
          personality_state: personality,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (skillsErr) {
      console.warn("Avatar skills save warning:", skillsErr);
    }

    // Create first avatar activity schedule
    const { error: scheduleErr } = await supabaseAdmin
      .from("avatar_activity_schedule")
      .insert({
        user_id: userId,
        activity_type: "first_exploration",
        payload: {
          questions: selectedQuestions,
          categories: enabledCategories,
        },
        scheduled_at: new Date().toISOString(),
        status: "pending",
      });

    if (scheduleErr) {
      console.warn("Activity schedule warning:", scheduleErr);
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("Onboarding API error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
