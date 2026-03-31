import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const VALID_RATINGS = ["positive", "negative"] as const;
const VALID_FEATURES = [
  "alter", "gemini_reading", "micro_insight", "deepening_probe", "relational_context", "other",
] as const;

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const {
      session_id,
      response_id,
      rating,
      free_text,
      target_feature,
      response_metadata,
    } = body;

    // Validation
    if (!session_id || typeof session_id !== "string") {
      return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    }
    if (!response_id || typeof response_id !== "string") {
      return NextResponse.json({ error: "response_id is required" }, { status: 400 });
    }
    if (!VALID_RATINGS.includes(rating)) {
      return NextResponse.json({ error: "rating must be 'positive' or 'negative'" }, { status: 400 });
    }

    const feature = VALID_FEATURES.includes(target_feature) ? target_feature : "alter";
    const text = typeof free_text === "string" ? free_text.trim().slice(0, 2000) : null;
    const metadata = typeof response_metadata === "object" && response_metadata !== null
      ? response_metadata
      : {};

    const { error: insertError } = await supabase
      .from("stargazer_alter_feedback")
      .insert({
        user_id: user.id,
        session_id,
        response_id,
        rating,
        free_text: text || null,
        target_feature: feature,
        response_metadata: metadata,
      });

    if (insertError) {
      console.error("[alter-feedback] Insert failed:", insertError.message);
      return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[alter-feedback] Unexpected error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
