import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/origin/journal/search?q=xxx&tag=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Full-text search across journal body and title.
 * Optional: filter by emotion tag, date range.
 */
export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const tag = req.nextUrl.searchParams.get("tag")?.trim();
  const from = req.nextUrl.searchParams.get("from")?.trim();
  const to = req.nextUrl.searchParams.get("to")?.trim();

  // At least one filter must be provided
  if (!q && !tag && !from) {
    return NextResponse.json({ ok: true, entries: [] });
  }

  let query = supabase
    .from("origin_journal_entries")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(30);

  // Text search
  if (q) {
    const escaped = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const pattern = `%${escaped}%`;
    query = query.or(`body.ilike.${pattern},title.ilike.${pattern}`);
  }

  // Emotion tag filter (uses Postgres @> operator for array contains)
  if (tag) {
    query = query.contains("emotion_tags", [tag]);
  }

  // Date range
  if (from) {
    query = query.gte("date", from);
  }
  if (to) {
    query = query.lte("date", to);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, entries: data ?? [] });
}
