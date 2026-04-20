import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { QUESTIONS, computeScores } from "@/lib/talk/quickObserveQuestions";

// ============================================================
// POST /api/talk/quick-observe
//
// トーク画面内ミニ観測の回答を axis_snapshots に保存する。
// 30問の回答から intent 用11軸のスコアを算出して一括保存。
//
// スコアリングロジックは lib/talk/quickObserveQuestions.ts に一元化。
// 学術基盤: ECR-S / ROCI-II / ERQ / Self-Monitoring / BFI-2-XS
// ============================================================

/** 質問の選択肢 */
interface QuickObserveAnswer {
  questionId: string;
  optionId: string;
}

export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401 });
  }

  let body: { answers: QuickObserveAnswer[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }

  const totalQuestions = QUESTIONS.length; // 30

  if (!body.answers || !Array.isArray(body.answers) || body.answers.length < totalQuestions) {
    return NextResponse.json({
      ok: false,
      code: "incomplete_answers",
      details: { received: body.answers?.length ?? 0, required: totalQuestions },
    }, { status: 400 });
  }

  // ── 回答 → 軸スコアに変換（共通エンジン使用） ──
  const axisResults = computeScores(body.answers);

  // ── axis_snapshots に保存 ──
  const sessionDate = new Date().toISOString().slice(0, 10);
  const rows = axisResults.map(({ axis, score, confidence }) => ({
    user_id: user.id,
    axis_id: axis,
    score,
    confidence, // 軸ごとの動的信頼度（0.22〜0.78）
    observation_layer: "quick_observe",
    session_date: sessionDate,
  }));

  const { error: insertError } = await supabase
    .from("stargazer_axis_snapshots")
    .insert(rows);

  if (insertError) {
    return NextResponse.json({
      ok: false,
      code: "save_failed",
      details: { error: insertError.message },
    }, { status: 500 });
  }

  // 成功レスポンス: 軸ごとのスコア+信頼度を返す
  const scores: Record<string, number> = {};
  const confidences: Record<string, number> = {};
  for (const r of axisResults) {
    scores[r.axis] = r.score;
    confidences[r.axis] = r.confidence;
  }

  return NextResponse.json({
    ok: true,
    savedAxes: axisResults.length,
    scores,
    confidences,
  });
}
