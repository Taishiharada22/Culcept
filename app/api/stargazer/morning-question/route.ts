// app/api/stargazer/morning-question/route.ts
// 朝の一問 — サーバー永続化 API
//
// POST: 回答を保存（stargazer_daily_states.raw_answers.morning_question に upsert）
// GET:  指定日の回答を取得（?date=YYYY-MM-DD）

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface MorningAnswerPayload {
  questionId: string;
  answer: string;
  insight: string;
  responseTimeMs: number;
  date: string; // YYYY-MM-DD (JST)
}

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
// GET: 指定日の朝の一問回答を取得
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
      console.error("[morning-question GET] DB error:", error);
      return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
    }

    const rawAnswers = (data?.raw_answers ?? {}) as Record<string, unknown>;
    const morningAnswer = rawAnswers.morning_question ?? null;

    return NextResponse.json({ ok: true, answer: morningAnswer });
  } catch (err) {
    console.error("[morning-question GET] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST: 朝の一問回答を保存
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

    const { questionId, answer, insight, responseTimeMs, date } =
      body as MorningAnswerPayload;

    // Validation
    if (!questionId || typeof questionId !== "string") {
      return NextResponse.json({ error: "questionId が必要です" }, { status: 400 });
    }
    if (!answer || typeof answer !== "string") {
      return NextResponse.json({ error: "answer が必要です" }, { status: 400 });
    }
    if (!date || !isValidDate(date)) {
      return NextResponse.json(
        { error: "date が必要です (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    const morningData = {
      questionId,
      answer,
      insight: typeof insight === "string" ? insight.slice(0, 500) : "",
      responseTimeMs: typeof responseTimeMs === "number" ? responseTimeMs : 0,
      answeredAt: new Date().toISOString(),
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
    const mergedRaw = { ...existingRaw, morning_question: morningData };

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
      console.error("[morning-question POST] Upsert error:", upsertError);
      return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
    }

    // Step 3: Read-back confirmation
    const savedAnswer = (upserted?.raw_answers as Record<string, unknown>)
      ?.morning_question ?? null;

    console.info("[morning-question POST] Saved", {
      userId: userId.slice(0, 8),
      date,
      questionId,
      answer,
    });

    return NextResponse.json({ ok: true, answer: savedAnswer });
  } catch (err) {
    console.error("[morning-question POST] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
