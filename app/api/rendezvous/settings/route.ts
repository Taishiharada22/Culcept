import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

export async function GET(request: NextRequest) {
  try {
    // Auth via supabaseServer (user-scoped)
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const userId = auth.user.id;

    // Use supabaseAdmin for all DB operations (cross-user reads bypass RLS)
    const [profileResult, preferencesResult] = await Promise.all([
      supabaseAdmin
        .from("rendezvous_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("rendezvous_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (profileResult.error)
      return NextResponse.json(
        { ok: false, error: profileResult.error.message },
        { status: 500 },
      );
    if (preferencesResult.error)
      return NextResponse.json(
        { ok: false, error: preferencesResult.error.message },
        { status: 500 },
      );

    const defaultProfile = {
      isPaused: false,
      enabledCategories: ["friendship"] as RendezvousCategory[],
      displayName: null,
      avatarAssetUrl: null,
      notificationEnabled: true,
      notificationDelayMode: "standard",
      publicMoodSummary: null,
      publicStyleSummary: null,
      isEnabled: false,
      contextStates: {"friend":"inactive","romance":"inactive","partner":"inactive","business":"inactive","community":"inactive"},
      autoStandbyThresholdHours: 4,
      standbyActive: false,
      gender: null,
      dateOfBirth: null,
      smoking: null,
      drinking: null,
      occupationCategory: null,
      educationLevel: null,
      prefecture: null,
      languages: [],
    };

    const defaultPreferences = {
      desiredRelationTypes: ["friendship"] as RendezvousCategory[],
      communicationStyle: null,
      pacePreference: null,
      distancePreference: null,
      depthPreference: null,
      stabilityVsStimulation: 0.5,
      similarityVsComplementarity: 0.2,
      initiativePreference: null,
      emotionalExpressionPreference: null,
      conflictResolutionPreference: null,
      excludedRelationTypes: [],
      excludedTraits: [],
      matchingVector: {},
    };

    const profile = profileResult.data
      ? {
          isPaused: profileResult.data.is_paused,
          enabledCategories: profileResult.data.enabled_categories,
          displayName: profileResult.data.display_name,
          avatarAssetUrl: profileResult.data.avatar_asset_url,
          notificationEnabled: profileResult.data.notification_enabled,
          notificationDelayMode: profileResult.data.notification_delay_mode,
          publicMoodSummary: profileResult.data.public_mood_summary,
          publicStyleSummary: profileResult.data.public_style_summary,
          isEnabled: profileResult.data.is_enabled,
          contextStates: profileResult.data.context_states ?? {"friend":"inactive","romance":"inactive","partner":"inactive","business":"inactive","community":"inactive"},
          autoStandbyThresholdHours: profileResult.data.auto_standby_threshold_hours ?? 4,
          standbyActive: profileResult.data.standby_active ?? false,
          gender: profileResult.data.gender ?? null,
          dateOfBirth: profileResult.data.date_of_birth ?? null,
          smoking: profileResult.data.smoking ?? null,
          drinking: profileResult.data.drinking ?? null,
          occupationCategory: profileResult.data.occupation_category ?? null,
          educationLevel: profileResult.data.education_level ?? null,
          prefecture: profileResult.data.prefecture ?? null,
          languages: profileResult.data.languages ?? [],
          profile_details: profileResult.data.profile_details ?? {},
        }
      : defaultProfile;

    const preferences = preferencesResult.data
      ? {
          desiredRelationTypes:
            preferencesResult.data.desired_relation_types,
          communicationStyle: preferencesResult.data.communication_style,
          pacePreference: preferencesResult.data.pace_preference,
          distancePreference: preferencesResult.data.distance_preference,
          depthPreference: preferencesResult.data.depth_preference,
          stabilityVsStimulation:
            preferencesResult.data.stability_vs_stimulation,
          similarityVsComplementarity:
            preferencesResult.data.similarity_vs_complementarity,
          initiativePreference:
            preferencesResult.data.initiative_preference,
          emotionalExpressionPreference:
            preferencesResult.data.emotional_expression_preference,
          conflictResolutionPreference:
            preferencesResult.data.conflict_resolution_preference,
          excludedRelationTypes:
            preferencesResult.data.excluded_relation_types,
          excludedTraits: preferencesResult.data.excluded_traits,
          matchingVector: preferencesResult.data.matching_vector,
        }
      : defaultPreferences;

    return NextResponse.json({ ok: true, profile, preferences });
  } catch (err: any) {
    console.error("[rendezvous/settings] GET error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth via supabaseServer (user-scoped)
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const userId = auth.user.id;
    const body = await request.json();

    const updateData: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };

    if (body.isPaused !== undefined) updateData.is_paused = body.isPaused;
    if (body.enabledCategories !== undefined)
      updateData.enabled_categories = body.enabledCategories;
    if (body.displayName !== undefined)
      updateData.display_name = body.displayName;
    if (body.avatarAssetUrl !== undefined)
      updateData.avatar_asset_url = body.avatarAssetUrl;
    if (body.notificationEnabled !== undefined)
      updateData.notification_enabled = body.notificationEnabled;
    if (body.notificationDelayMode !== undefined)
      updateData.notification_delay_mode = body.notificationDelayMode;
    if (body.publicMoodSummary !== undefined)
      updateData.public_mood_summary = body.publicMoodSummary;
    if (body.publicStyleSummary !== undefined)
      updateData.public_style_summary = body.publicStyleSummary;
    if (body.contextStates !== undefined) updateData.context_states = body.contextStates;
    if (body.autoStandbyThresholdHours !== undefined) updateData.auto_standby_threshold_hours = body.autoStandbyThresholdHours;
    if (body.standbyActive !== undefined) {
      updateData.standby_active = body.standbyActive;
      if (body.standbyActive) {
        updateData.standby_activated_at = new Date().toISOString();
      }
    }
    if (body.onboardingCompletedAt !== undefined)
      updateData.onboarding_completed_at = body.onboardingCompletedAt;
    // P0-P3 プロフィールフィールド
    if (body.gender !== undefined) updateData.gender = body.gender;
    if (body.dateOfBirth !== undefined) updateData.date_of_birth = body.dateOfBirth;
    if (body.smoking !== undefined) updateData.smoking = body.smoking;
    if (body.drinking !== undefined) updateData.drinking = body.drinking;
    if (body.occupationCategory !== undefined) updateData.occupation_category = body.occupationCategory;
    if (body.educationLevel !== undefined) updateData.education_level = body.educationLevel;
    if (body.prefecture !== undefined) updateData.prefecture = body.prefecture;
    if (body.languages !== undefined) updateData.languages = body.languages;
    if (body.hobbies !== undefined) updateData.hobbies = body.hobbies;
    // DealbreakerProfile: profile_details JSONB (ライフスタイル、結婚意欲、子ども希望など)
    if (body.profile_details !== undefined) updateData.profile_details = body.profile_details;

    // Use supabaseAdmin for all DB operations (cross-user reads bypass RLS)
    const { data, error } = await supabaseAdmin
      .from("rendezvous_profiles")
      .upsert(updateData, { onConflict: "user_id" })
      .select()
      .single();

    if (error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );

    return NextResponse.json({ ok: true, profile: data });
  } catch (err: any) {
    console.error("[rendezvous/settings] POST error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
