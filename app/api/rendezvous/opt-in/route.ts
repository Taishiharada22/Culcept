import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

    // Use supabaseAdmin for all DB operations (cross-user reads bypass RLS)
    // Upsert profile: create if new, set is_enabled = true if exists
    const { error: profileErr } = await supabaseAdmin
      .from("rendezvous_profiles")
      .upsert(
        {
          user_id: userId,
          is_enabled: true,
          is_paused: false,
          primary_category: "friendship",
          enabled_categories: ["friendship"],
          notification_enabled: true,
          notification_delay_mode: "standard",
          notification_delay_min_minutes: 180,
          notification_delay_max_minutes: 720,
          show_in_home: true,
          visibility_scope: "all",
          avatar_version: 1,
        },
        { onConflict: "user_id" },
      );

    if (profileErr)
      return NextResponse.json(
        { ok: false, error: profileErr.message },
        { status: 500 },
      );

    // Upsert preferences: create with defaults if not exists
    const { error: prefsErr } = await supabaseAdmin
      .from("rendezvous_preferences")
      .upsert(
        {
          user_id: userId,
          desired_relation_types: ["friendship"],
          stability_vs_stimulation: 0.5,
          similarity_vs_complementarity: 0.2,
          excluded_relation_types: [],
          excluded_traits: [],
          matching_vector: {},
        },
        { onConflict: "user_id", ignoreDuplicates: true },
      );

    if (prefsErr)
      return NextResponse.json(
        { ok: false, error: prefsErr.message },
        { status: 500 },
      );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[rendezvous/opt-in] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
