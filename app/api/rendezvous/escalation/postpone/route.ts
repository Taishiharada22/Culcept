import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ---------------------------------------------------------------------------
// POST — エスカレーションを1日延長（「あと1日だけ任せる」）
// ---------------------------------------------------------------------------
export async function POST() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: row } = await supabaseAdmin
      .from("rendezvous_escalation_state")
      .select("id, postpone_used_at")
      .eq("user_id", auth.user.id)
      .is("baton_changed_at", null)
      .is("auto_archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) {
      return NextResponse.json(
        { error: "No active escalation" },
        { status: 404 },
      );
    }

    if (row.postpone_used_at) {
      return NextResponse.json(
        { error: "Already postponed" },
        { status: 409 },
      );
    }

    const { error } = await supabaseAdmin
      .from("rendezvous_escalation_state")
      .update({ postpone_used_at: new Date().toISOString() })
      .eq("id", row.id);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[escalation/postpone] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
