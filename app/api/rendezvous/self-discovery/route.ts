import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// =============================================================================
// GET /api/rendezvous/self-discovery
// Returns active (non-dismissed) discovery cards for the user
// =============================================================================

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const userId = auth.user.id;

    const { data: cards, error } = await supabaseAdmin
      .from("self_discovery_cards")
      .select(
        "id, card_type, title_ja, body_ja, subtext_ja, data_points, significance, candidate_id, seen_at, created_at",
      )
      .eq("user_id", userId)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("[self-discovery] query error:", error);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch discovery cards" },
        { status: 500 },
      );
    }

    const mapped = (cards ?? []).map((c: any) => ({
      id: c.id,
      type: c.card_type,
      title: c.title_ja,
      body: c.body_ja,
      subtext: c.subtext_ja ?? undefined,
      dataPoints: c.data_points ?? {},
      significance: c.significance ?? 0,
      candidateId: c.candidate_id ?? undefined,
      seenAt: c.seen_at ?? null,
      createdAt: c.created_at,
    }));

    return NextResponse.json({ ok: true, cards: mapped });
  } catch (err: unknown) {
    console.error("[rendezvous/self-discovery]", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
