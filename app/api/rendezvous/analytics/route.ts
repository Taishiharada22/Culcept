// app/api/rendezvous/analytics/route.ts
// Rendezvous 3枠計測 — POST でイベント記録、GET で集計取得

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Valid events
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VALID_EVENTS = new Set([
  // Hub
  "rendezvous_hub_view",
  "rendezvous_lane_click",
  // List / Detail
  "rendezvous_list_view",
  "rendezvous_candidate_open",
  // Actions
  "rendezvous_candidate_like",
  "rendezvous_candidate_pass",
  "rendezvous_mutual",
  "rendezvous_chat_start",
  // Romance
  "romance_gate_view",
  "romance_gate_pass",
  "romance_swipe",
  // Connection
  "connection_submode_switch",
  // Partner
  "partner_onboarding_start",
  "partner_lifeplan_save",
  "partner_verification_gate_block",
  // Dropout
  "rendezvous_dropout",
]);

const VALID_LANES = new Set(["romance", "connection", "partner"]);
const VALID_SUBMODES = new Set(["friendship", "community", "business"]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST — イベント記録
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Anonymous: accept silently
      return NextResponse.json({ ok: true });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const event = body.event as string;
    if (!event || !VALID_EVENTS.has(event)) {
      return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
    }

    const lane = body.lane as string | undefined;
    if (lane && !VALID_LANES.has(lane)) {
      return NextResponse.json({ ok: false, error: "invalid_lane" }, { status: 400 });
    }

    const submode = body.submode as string | undefined;
    if (submode && !VALID_SUBMODES.has(submode)) {
      return NextResponse.json({ ok: false, error: "invalid_submode" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("rendezvous_analytics").insert({
      user_id: user.id,
      event,
      lane: lane ?? null,
      submode: submode ?? null,
      metadata: (body.metadata as Record<string, unknown>) ?? {},
    });

    if (error) {
      console.error("[api/rendezvous/analytics] insert error:", error);
    }

    return NextResponse.json({ ok: !error });
  } catch (err) {
    console.error("[api/rendezvous/analytics] POST error:", err);
    // Always 200 for analytics — never break client UX
    return NextResponse.json({ ok: false });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET — 3枠集計（管理者 or 自ユーザー）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const days = 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // ユーザー自身のイベント集計
    const { data, error } = await supabaseAdmin
      .from("rendezvous_analytics")
      .select("event, lane, submode, created_at")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[api/rendezvous/analytics] GET error:", error);
      return NextResponse.json({ error: "query_failed" }, { status: 500 });
    }

    return NextResponse.json({
      userId: user.id,
      days,
      events: data ?? [],
    });
  } catch (err) {
    console.error("[api/rendezvous/analytics] GET error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
