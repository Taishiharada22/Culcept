import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;
    const body = await request.json();
    const active = !!body.active;

    const updateData: Record<string, unknown> = {
      user_id: userId,
      standby_active: active,
      updated_at: new Date().toISOString(),
    };
    if (active) {
      updateData.standby_activated_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin
      .from("rendezvous_profiles")
      .upsert(updateData, { onConflict: "user_id" })
      .select()
      .single();

    if (error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, standbyActive: active });
  } catch (err: any) {
    console.error("[rendezvous/standby] POST error:", err);
    return NextResponse.json({ ok: false, error: err.message ?? "Internal error" }, { status: 500 });
  }
}
