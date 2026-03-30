import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ---------------------------------------------------------------------------
// POST — グローバル不在受入（RendezvousHome から呼ばれる）
// [candidateId]/absence action=accept のグローバル版。
// candidateId なしで不在を受け入れる（ユーザー全体の不在）。
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const absenceType = (body.absenceType as string) ?? "natural_rhythm";
    const hours = typeof body.hours === "number" ? body.hours : 24;

    const now = new Date();
    const endsAt = new Date(now.getTime() + hours * 60 * 60 * 1000);

    // グローバル不在: candidate_id = null で記録
    const { error } = await supabaseAdmin
      .from("rendezvous_absences")
      .insert({
        user_id: auth.user.id,
        candidate_id: null,
        absence_type: absenceType,
        started_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
        accepted: true,
      });

    if (error) {
      console.error("[absence-accept] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, endsAt: endsAt.toISOString() });
  } catch (err) {
    console.error("[absence-accept] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
