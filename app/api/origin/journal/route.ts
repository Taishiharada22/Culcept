import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/origin/journal?days=30
 * Fetch journal entries for the authenticated user, ordered by date desc.
 */
export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  // Support ?dates=YYYY-MM-DD,YYYY-MM-DD for On This Day feature
  const datesParam = req.nextUrl.searchParams.get("dates");
  if (datesParam) {
    const dateList = datesParam.split(",").filter(Boolean).slice(0, 10);
    const { data, error } = await supabase
      .from("origin_journal_entries")
      .select("*")
      .eq("user_id", user.id)
      .in("date", dateList)
      .order("date", { ascending: false });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, entries: data ?? [] });
  }

  const days = Number(req.nextUrl.searchParams.get("days") ?? "30");
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("origin_journal_entries")
    .select("*")
    .eq("user_id", user.id)
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, entries: data ?? [] });
}

/**
 * POST /api/origin/journal
 * Upsert a journal entry for a given date.
 */
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    date,
    title,
    body: journalBody,
    voice_transcript,
    emotion_tags,
    tomorrow_note,
    inner_weather_ref,
    completed_task_ids,
    body_memo,
    shadow_text,
    ai_summary,
    forecast_result,
    surprise_observation,
  } = body;

  if (!date) return NextResponse.json({ ok: false, error: "date is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("origin_journal_entries")
    .upsert(
      {
        user_id: user.id,
        date,
        title: title ?? "",
        body: journalBody ?? "",
        voice_transcript: voice_transcript ?? null,
        emotion_tags: emotion_tags ?? [],
        tomorrow_note: tomorrow_note ?? null,
        inner_weather_ref: inner_weather_ref ?? null,
        completed_task_ids: completed_task_ids ?? [],
        body_memo: body_memo ?? null,
        shadow_text: shadow_text ?? null,
        ai_summary: ai_summary ?? null,
        forecast_result: forecast_result ?? null,
        surprise_observation: surprise_observation ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, entry: data });
}
