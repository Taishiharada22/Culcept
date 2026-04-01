import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/tour-states — ログインユーザーの全ツアー既読状態を返す
// ---------------------------------------------------------------------------
export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("tour_seen_states")
    .select("tour_key, seen_version, seen_at")
    .eq("user_id", user.id);

  if (error) {
    // PGRST205 = table not found (migration not yet applied)
    if (error.code === "PGRST205" || error.code === "42P01") {
      console.warn("[tour-states] table not found — returning empty states (migration pending)");
      return NextResponse.json({ ok: true, states: {}, _tableMissing: true });
    }
    console.error("[tour-states] GET error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Map to { [tour_key]: seen_version }
  const states: Record<string, number> = {};
  for (const row of data ?? []) {
    states[row.tour_key] = row.seen_version;
  }

  return NextResponse.json({ ok: true, states });
}

// ---------------------------------------------------------------------------
// POST /api/tour-states — ツアー既読を upsert（save → read-back）
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { tour_key?: string; version?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const { tour_key, version } = body;
  if (!tour_key || typeof tour_key !== "string") {
    return NextResponse.json({ ok: false, error: "tour_key required" }, { status: 400 });
  }
  const v = typeof version === "number" && version > 0 ? version : 1;

  // Upsert
  const { error: upsertError } = await supabase
    .from("tour_seen_states")
    .upsert(
      { user_id: user.id, tour_key, seen_version: v, seen_at: new Date().toISOString() },
      { onConflict: "user_id,tour_key" },
    );

  if (upsertError) {
    // PGRST205 = table not found (migration not yet applied)
    if (upsertError.code === "PGRST205" || upsertError.code === "42P01") {
      console.warn("[tour-states] table not found — skipping upsert (migration pending)");
      return NextResponse.json({ ok: true, _tableMissing: true });
    }
    console.error("[tour-states] POST upsert error:", upsertError);
    return NextResponse.json({ ok: false, error: upsertError.message }, { status: 500 });
  }

  // Read-back
  const { data: readBack, error: readBackError } = await supabase
    .from("tour_seen_states")
    .select("tour_key, seen_version, seen_at")
    .eq("user_id", user.id)
    .eq("tour_key", tour_key)
    .single();

  if (readBackError) {
    console.error("[tour-states] POST read-back error:", readBackError);
    return NextResponse.json({ ok: true, readBackFailed: true });
  }

  return NextResponse.json({
    ok: true,
    state: { tour_key: readBack.tour_key, seen_version: readBack.seen_version },
  });
}
