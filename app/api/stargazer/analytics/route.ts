// app/api/stargazer/analytics/route.ts
// Stargazer feature analytics — POST to track events, GET to read engagement.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  trackStargazerEvent,
  getFeatureEngagement,
  type StargazerEvent,
} from "@/lib/stargazer/analytics";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST — イベントを記録
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VALID_EVENTS: Set<string> = new Set<StargazerEvent>([
  "feature_view",
  "feature_interact",
  "prophecy_verify",
  "alter_turn",
  "whisper_shown",
  "whisper_clicked",
  "phase_advance",
  "session_complete",
]);

export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Anonymous users: silently accept but discard (no error to client)
      return NextResponse.json({ ok: true });
    }

    // Support both JSON and sendBeacon (which sends as blob)
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const event = body.event as string;
    if (!event || !VALID_EVENTS.has(event)) {
      return NextResponse.json(
        { ok: false, error: "invalid_event" },
        { status: 400 },
      );
    }

    const success = await trackStargazerEvent({
      userId: user.id,
      event: event as StargazerEvent,
      feature: (body.feature as string) ?? undefined,
      metadata: (body.metadata as Record<string, unknown>) ?? undefined,
      timestamp: (body.timestamp as string) ?? new Date().toISOString(),
    });

    return NextResponse.json({ ok: success });
  } catch (err) {
    console.error("[api/stargazer/analytics] POST error:", err);
    // Always return 200 for analytics — never break client UX
    return NextResponse.json({ ok: false });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET — 現在のユーザーのエンゲージメント統計を返す
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401 },
      );
    }

    const days = 30;
    const engagement = await getFeatureEngagement(user.id, days);

    return NextResponse.json({
      userId: user.id,
      days,
      engagement,
    });
  } catch (err) {
    console.error("[api/stargazer/analytics] GET error:", err);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 },
    );
  }
}
