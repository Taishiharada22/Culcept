import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { submitSessionDecision } from "@/lib/rendezvous/sessionMatcher";

// =============================================================================
// POST /api/rendezvous/session/[sessionId]/decision
// セッション終了後の判定（もう一度話したい / パス）
// =============================================================================

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;
    const body = await req.json();
    const { decision } = body as { decision: "again" | "pass" };

    if (!decision || !["again", "pass"].includes(decision)) {
      return NextResponse.json({ ok: false, error: "Invalid decision" }, { status: 400 });
    }

    const result = await submitSessionDecision({
      sessionId,
      userId: auth.user.id,
      decision,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[session/decision] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
