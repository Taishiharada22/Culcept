import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { applyProgressiveAnswer, getNextQuestions, PROGRESSIVE_QUESTIONS } from "@/lib/rendezvous/progressiveProfile";
import type { MatchingVector } from "@/lib/rendezvous/types";

/**
 * POST /api/rendezvous/progressive-answer
 * プログレッシブ質問への回答を受け取り、MatchingVectorを更新する
 *
 * body: { questionId: string, answer: number (0-1) }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { questionId, answer } = body as { questionId?: string; answer?: number };

    if (!questionId || answer === undefined || answer < 0 || answer > 1) {
      return NextResponse.json(
        { error: "questionId (string) and answer (0-1) required" },
        { status: 400 },
      );
    }

    // 現在のMatchingVector取得（rendezvous_preferences.matching_vector に格納）
    const { data: prefsRow } = await supabaseAdmin
      .from("rendezvous_preferences")
      .select("matching_vector")
      .eq("user_id", user.id)
      .single();

    if (!prefsRow?.matching_vector) {
      return NextResponse.json(
        { error: "MatchingVector not found" },
        { status: 404 },
      );
    }

    const currentVector = prefsRow.matching_vector as MatchingVector;

    // 質問オブジェクトを解決
    const question = PROGRESSIVE_QUESTIONS.find((q) => q.id === questionId);
    if (!question) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 },
      );
    }

    // 回答を適用してベクトルを更新（answerを選択肢インデックスとして渡す）
    const updatedVector = applyProgressiveAnswer(currentVector, question, answer);

    // DB更新（rendezvous_preferences.matching_vector を更新）
    const { error: updateError } = await supabaseAdmin
      .from("rendezvous_preferences")
      .update({
        matching_vector: updatedVector,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[progressive-answer] Update error:", updateError);
      return NextResponse.json({ error: "Failed to update vector" }, { status: 500 });
    }

    // 回答履歴をDBに記録
    await supabaseAdmin.from("rendezvous_progressive_answers").insert({
      user_id: user.id,
      question_id: questionId,
      answer_value: answer,
      vector_before: currentVector,
      vector_after: updatedVector,
    });

    // 心理学プロファイルも再計算
    let warning: string | undefined;
    try {
      const profileRes = await fetch(new URL("/api/rendezvous/psychological-profile", req.url), {
        method: "POST",
        headers: { cookie: req.headers.get("cookie") ?? "" },
      });
      if (!profileRes.ok) {
        console.error("[progressive-answer] psychological-profile returned", profileRes.status);
        warning = "一部の保存に失敗しました";
      }
    } catch (e) {
      console.error("[progressive-answer] psychological-profile fetch failed:", e);
      warning = "一部の保存に失敗しました";
    }

    return NextResponse.json({
      ok: true,
      updatedVector,
      ...(warning && { warning }),
    });
  } catch (err) {
    console.error("[progressive-answer] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * GET /api/rendezvous/progressive-answer
 * 次に出すべきプログレッシブ質問を取得
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 回答済み質問IDを取得
    const { data: answered } = await supabaseAdmin
      .from("rendezvous_progressive_answers")
      .select("question_id")
      .eq("user_id", user.id);

    const answeredIds = (answered ?? []).map((r) => r.question_id);
    const questions = getNextQuestions({
      userId: user.id,
      answeredQuestionIds: answeredIds,
      recentlyAnsweredIds: [],
      date: new Date(),
      maxQuestions: 3,
    });

    return NextResponse.json({ questions, answeredCount: answeredIds.length });
  } catch (err) {
    console.error("[progressive-answer] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
