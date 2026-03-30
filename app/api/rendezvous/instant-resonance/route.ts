import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  inferInitialVector,
  type ResonanceChoice,
} from "@/lib/rendezvous/instantResonance";

// ============================================================
// POST /api/rendezvous/instant-resonance
// 選択結果を保存し、推定ベクトルを返す
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const choices: ResonanceChoice[] = body.choices;

    if (!Array.isArray(choices) || choices.length === 0) {
      return NextResponse.json(
        { error: "choices array is required" },
        { status: 400 },
      );
    }

    // Validate each choice
    for (const c of choices) {
      if (!c.cardId || !["a", "b"].includes(c.selected)) {
        return NextResponse.json(
          { error: "Invalid choice format" },
          { status: 400 },
        );
      }
    }

    // Infer vector from choices
    const result = inferInitialVector(choices);

    // Save raw choices (upsert: delete old ones first, then insert new)
    await supabaseAdmin
      .from("rendezvous_resonance_choices")
      .delete()
      .eq("user_id", user.id);

    const rows = choices.map((c) => ({
      user_id: user.id,
      card_id: c.cardId,
      selected: c.selected,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("rendezvous_resonance_choices")
      .insert(rows);

    if (insertError) {
      console.error("Failed to save resonance choices:", insertError);
      return NextResponse.json(
        { error: "Failed to save choices" },
        { status: 500 },
      );
    }

    // Build full matching_vector by filling in defaults for missing axes
    const DEFAULT_VALUE = 0.5;
    const allAxes = [
      "conversation_temperature",
      "distance_need",
      "depth_speed",
      "stability_need",
      "stimulation_need",
      "initiative",
      "emotional_openness",
      "conflict_directness",
      "social_energy",
      "structure_preference",
    ] as const;

    const fullVector: Record<string, number> = {};
    for (const axis of allAxes) {
      fullVector[axis] =
        (result.partialVector as Record<string, number>)[axis] ?? DEFAULT_VALUE;
    }

    // Upsert matching_vector into rendezvous_preferences
    const { data: existing } = await supabaseAdmin
      .from("rendezvous_preferences")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (existing) {
      await supabaseAdmin
        .from("rendezvous_preferences")
        .update({
          matching_vector: fullVector,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    } else {
      await supabaseAdmin.from("rendezvous_preferences").insert({
        user_id: user.id,
        desired_relation_types: ["friendship"],
        matching_vector: fullVector,
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("instant-resonance POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ============================================================
// GET /api/rendezvous/instant-resonance
// 既存の選択結果を返す
// ============================================================

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: rows, error } = await supabaseAdmin
      .from("rendezvous_resonance_choices")
      .select("card_id, selected, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to fetch resonance choices:", error);
      return NextResponse.json(
        { error: "Failed to fetch choices" },
        { status: 500 },
      );
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ choices: [], result: null });
    }

    const choices: ResonanceChoice[] = rows.map((r) => ({
      cardId: r.card_id,
      selected: r.selected as "a" | "b",
    }));

    const result = inferInitialVector(choices);

    return NextResponse.json({ choices, result });
  } catch (err) {
    console.error("instant-resonance GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
