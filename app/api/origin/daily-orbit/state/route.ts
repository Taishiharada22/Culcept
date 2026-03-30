import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET — Daily Orbit の状態を取得
// origin_profiles.daily_orbit_state から DailyOrbitStore を返す
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: row, error } = await supabase
      .from("origin_profiles")
      .select("daily_orbit_state")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[daily-orbit/state] GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // null = まだサーバーに保存されたことがない → クライアントは localStorage を使う
    return NextResponse.json({
      ok: true,
      state: row?.daily_orbit_state ?? null,
    });
  } catch (err) {
    console.error("[daily-orbit/state] GET error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — Daily Orbit の状態を保存
// DailyOrbitStore 全体を origin_profiles.daily_orbit_state に upsert
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
    const state = body.state;

    if (!state || typeof state !== "object") {
      return NextResponse.json(
        { error: "state is required" },
        { status: 400 },
      );
    }

    // origin_profiles が存在しない場合は作成、存在する場合は更新
    const { error } = await supabase
      .from("origin_profiles")
      .upsert(
        {
          user_id: user.id,
          daily_orbit_state: state,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (error) {
      console.error("[daily-orbit/state] POST error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[daily-orbit/state] POST error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
