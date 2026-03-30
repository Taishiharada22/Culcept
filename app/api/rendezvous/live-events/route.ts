import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/rendezvous/live-events
 * 現在進行中・今後のライブイベント一覧を取得
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const now = new Date().toISOString();

    // Fetch current and upcoming events (ends_at > now)
    const { data: events, error } = await supabaseAdmin
      .from("live_events")
      .select("*")
      .gte("ends_at", now)
      .order("starts_at", { ascending: true })
      .limit(20);

    if (error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const formatted = (events ?? []).map((e: any) => {
      const startsAt = new Date(e.starts_at);
      const endsAt = new Date(e.ends_at);
      const nowMs = Date.now();
      const isActive = startsAt.getTime() <= nowMs && endsAt.getTime() >= nowMs;

      return {
        id: e.id,
        eventType: e.event_type,
        startsAt: e.starts_at,
        endsAt: e.ends_at,
        category: e.category,
        metadata: e.metadata,
        isActive,
        startsIn: isActive ? 0 : Math.max(0, startsAt.getTime() - nowMs),
      };
    });

    const active = formatted.filter((e: any) => e.isActive);
    const upcoming = formatted.filter((e: any) => !e.isActive);

    return NextResponse.json({
      ok: true,
      active,
      upcoming,
    });
  } catch (err: any) {
    console.error("[live-events] error:", err);
    return NextResponse.json({ ok: false, error: err.message ?? "Internal error" }, { status: 500 });
  }
}
