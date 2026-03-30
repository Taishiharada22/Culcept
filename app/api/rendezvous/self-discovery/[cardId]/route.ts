import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// =============================================================================
// PATCH /api/rendezvous/self-discovery/[cardId]
// Mark a discovery card as seen or dismissed
// =============================================================================

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  try {
    const { cardId } = await params;

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const userId = auth.user.id;
    const body = await req.json();
    const action = body.action as "seen" | "dismissed" | undefined;

    if (!action || !["seen", "dismissed"].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "Invalid action. Must be 'seen' or 'dismissed'." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const updateData =
      action === "seen" ? { seen_at: now } : { dismissed_at: now };

    const { error } = await supabaseAdmin
      .from("self_discovery_cards")
      .update(updateData)
      .eq("id", cardId)
      .eq("user_id", userId);

    if (error) {
      console.error("[self-discovery/cardId] update error:", error);
      return NextResponse.json(
        { ok: false, error: "Failed to update card" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, action, cardId });
  } catch (err: unknown) {
    console.error("[rendezvous/self-discovery/cardId]", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
