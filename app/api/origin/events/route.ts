import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// POST — Origin イベントを stargazer_analytics テーブルに記録
// Body: { event: string, metadata?: Record<string, unknown> }
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { event, metadata } = body as {
      event: string;
      metadata?: Record<string, unknown>;
    };

    if (!event || typeof event !== "string") {
      return NextResponse.json(
        { error: "event string required" },
        { status: 400 },
      );
    }

    const { error } = await supabase.from("stargazer_analytics").insert({
      user_id: user.id,
      event,
      feature: "origin",
      metadata: metadata ?? {},
    });

    if (error) {
      console.error("[origin/events] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[origin/events] unexpected:", e);
    return NextResponse.json(
      { error: "Originイベントの記録に失敗しました" },
      { status: 500 },
    );
  }
}
