import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/rendezvous/tribe-pool?tribeId=xxx
 * Tribe内のRendezvous参加者数を返す
 */
export async function GET(request: NextRequest) {
  try {
    const tribeId = request.nextUrl.searchParams.get("tribeId");
    if (!tribeId) {
      return NextResponse.json({ ok: false, error: "tribeId required" }, { status: 400 });
    }

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Get tribe members who have enabled Rendezvous profiles
    const { data: members } = await supabase
      .from("tribe_memberships")
      .select("user_id")
      .eq("tribe_id", tribeId);

    if (!members || members.length === 0) {
      return NextResponse.json({ ok: true, count: 0 });
    }

    const memberIds = members.map((m) => m.user_id);

    const { count } = await supabase
      .from("rendezvous_profiles")
      .select("id", { count: "exact", head: true })
      .in("user_id", memberIds)
      .eq("is_enabled", true);

    return NextResponse.json({ ok: true, count: count ?? 0 });
  } catch (err: any) {
    console.error("[tribe-pool] error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
