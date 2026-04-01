// app/api/stargazer/daily-tip-feedback/route.ts
// 今日の一手フィードバック — サーバー永続化 API
//
// POST: フィードバックを保存 (stargazer_daily_states.raw_answers.daily_tip_feedback に upsert)
// GET:  指定日のフィードバックを取得 (?date=YYYY-MM-DD)

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DailyTipFeedbackPayload {
  date: string; // YYYY-MM-DD (JST)
  rating: string; // "very_accurate" | "somewhat_accurate" | "slightly_off" | "quite_off"
  memo?: string;
  suggestionId?: string;
}

const VALID_RATINGS = [
  "very_accurate",
  "somewhat_accurate",
  "slightly_off",
  "quite_off",
] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s: string): boolean {
  return DATE_RE.test(s) && !isNaN(Date.parse(s));
}

async function getAuthUserId(): Promise<string | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET: 指定日の今日の一手フィードバックを取得
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    if (!date || !isValidDate(date)) {
      return NextResponse.json(
        { error: "date パラメータが必要です (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("stargazer_daily_states")
      .select("raw_answers")
      .eq("user_id", userId)
      .eq("observation_date", date)
      .maybeSingle();

    if (error) {
      console.error("[daily-tip-feedback GET] DB error:", error);
      return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
    }

    const rawAnswers = (data?.raw_answers ?? {}) as Record<string, unknown>;
    const feedback = rawAnswers.daily_tip_feedback ?? null;

    return NextResponse.json({ ok: true, feedback });
  } catch (err) {
    console.error("[daily-tip-feedback GET] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST: 今日の一手フィードバックを保存
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { date, rating, memo, suggestionId } =
      body as DailyTipFeedbackPayload;

    // Validation
    if (!date || !isValidDate(date)) {
      return NextResponse.json(
        { error: "date が必要です (YYYY-MM-DD)" },
        { status: 400 },
      );
    }
    if (!rating || !VALID_RATINGS.includes(rating as typeof VALID_RATINGS[number])) {
      return NextResponse.json(
        { error: "rating が不正です" },
        { status: 400 },
      );
    }

    const feedbackData = {
      date,
      rating,
      memo: typeof memo === "string" ? memo.slice(0, 500) : "",
      suggestionId: typeof suggestionId === "string" ? suggestionId.slice(0, 100) : "",
      submittedAt: new Date().toISOString(),
    };

    const supabase = await supabaseServer();

    // Step 1: Fetch existing row (if any) to merge raw_answers
    const { data: existing } = await supabase
      .from("stargazer_daily_states")
      .select("raw_answers")
      .eq("user_id", userId)
      .eq("observation_date", date)
      .maybeSingle();

    const existingRaw = (existing?.raw_answers ?? {}) as Record<string, unknown>;
    const mergedRaw = { ...existingRaw, daily_tip_feedback: feedbackData };

    // Step 2: Upsert into stargazer_daily_states
    const { data: upserted, error: upsertError } = await supabase
      .from("stargazer_daily_states")
      .upsert(
        {
          user_id: userId,
          observation_date: date,
          raw_answers: mergedRaw,
        },
        { onConflict: "user_id,observation_date" },
      )
      .select("raw_answers")
      .single();

    if (upsertError) {
      console.error("[daily-tip-feedback POST] Upsert error:", upsertError);
      return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
    }

    // Step 3: Read-back confirmation
    const savedFeedback = (upserted?.raw_answers as Record<string, unknown>)
      ?.daily_tip_feedback ?? null;

    console.info("[daily-tip-feedback POST] Saved", {
      userId: userId.slice(0, 8),
      date,
      rating,
    });

    return NextResponse.json({ ok: true, feedback: savedFeedback });
  } catch (err) {
    console.error("[daily-tip-feedback POST] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
