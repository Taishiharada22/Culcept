import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { generateIceBreakers } from "@/lib/rendezvous/icebreakerTemplates";

/**
 * GET /api/rendezvous/[candidateId]/icebreakers
 * マッチ理由+カテゴリに基づく会話トピック候補を返す
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Fetch candidate with category and reason codes
    const { data: candidate, error } = await supabase
      .from("rendezvous_candidates")
      .select("id, category, reason_codes, state")
      .eq("id", candidateId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error || !candidate) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const reasonCodes = candidate.reason_codes ?? [];
    const category = candidate.category ?? "friendship";

    const iceBreakers = generateIceBreakers(category, reasonCodes, 3);

    return NextResponse.json({ ok: true, iceBreakers });
  } catch (err: any) {
    console.error("[icebreakers] error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
