import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { INTENT_TRANSLATION_AXES } from "@/lib/talk/intentTranslation";

// ============================================================
// POST /api/talk/quick-observe
//
// トーク画面内ミニ観測の回答を axis_snapshots に保存する。
// 5問の回答から intent 用11軸のスコアを算出して一括保存。
// ============================================================

/** 1回答のスコア影響 */
interface AxisEffect {
  axis: string;
  delta: number;
}

/** 質問の選択肢 */
interface QuickObserveAnswer {
  questionId: string;
  optionId: string;
}

/**
 * 選択肢 → 軸スコア影響のマッピング。
 * 各選択肢が複数の軸に影響を与える。
 * スコアは -1 ～ +1 の範囲。中央 0 = ニュートラル。
 */
const OPTION_EFFECTS: Record<string, AxisEffect[]> = {
  // Q1: 伝えにくいことがあるとき
  q1_a: [
    { axis: "direct_vs_diplomatic", delta: -0.5 },
    { axis: "boundary_awareness", delta: 0.3 },
  ],
  q1_b: [
    { axis: "direct_vs_diplomatic", delta: 0.3 },
    { axis: "boundary_awareness", delta: 0.2 },
  ],
  q1_c: [
    { axis: "direct_vs_diplomatic", delta: 0.2 },
    { axis: "emotional_regulation", delta: 0.2 },
  ],
  q1_d: [
    { axis: "direct_vs_diplomatic", delta: 0.5 },
    { axis: "public_private_gap", delta: 0.3 },
  ],

  // Q2: 返信が遅いとき
  q2_a: [
    { axis: "attachment_style", delta: -0.5 },
    { axis: "reassurance_need", delta: -0.4 },
  ],
  q2_b: [
    { axis: "attachment_style", delta: -0.2 },
    { axis: "reassurance_need", delta: -0.1 },
  ],
  q2_c: [
    { axis: "attachment_style", delta: 0.3 },
    { axis: "reassurance_need", delta: 0.3 },
  ],
  q2_d: [
    { axis: "attachment_style", delta: 0.5 },
    { axis: "reassurance_need", delta: 0.5 },
  ],

  // Q3: 意見が合わないとき
  q3_a: [
    { axis: "conflict_style", delta: -0.5 },
    { axis: "emotional_regulation", delta: 0.3 },
  ],
  q3_b: [
    { axis: "conflict_style", delta: -0.2 },
    { axis: "emotional_regulation", delta: 0.4 },
  ],
  q3_c: [
    { axis: "conflict_style", delta: 0.3 },
    { axis: "emotional_regulation", delta: -0.1 },
  ],
  q3_d: [
    { axis: "conflict_style", delta: 0.5 },
    { axis: "emotional_regulation", delta: -0.3 },
  ],

  // Q4: 気持ちの波
  q4_a: [
    { axis: "emotional_variability", delta: -0.4 },
    { axis: "public_private_gap", delta: -0.2 },
  ],
  q4_b: [
    { axis: "emotional_variability", delta: 0.2 },
    { axis: "public_private_gap", delta: 0.4 },
  ],
  q4_c: [
    { axis: "emotional_variability", delta: 0.3 },
    { axis: "public_private_gap", delta: -0.3 },
  ],
  q4_d: [
    { axis: "emotional_variability", delta: 0.5 },
    { axis: "emotional_regulation", delta: -0.4 },
  ],

  // Q5: 親しくなりたい人がいるとき
  q5_a: [
    { axis: "relational_investment", delta: 0.4 },
    { axis: "intimacy_pace", delta: 0.3 },
  ],
  q5_b: [
    { axis: "relational_investment", delta: 0.2 },
    { axis: "intimacy_pace", delta: -0.2 },
  ],
  q5_c: [
    { axis: "self_disclosure_depth", delta: 0.4 },
    { axis: "relational_investment", delta: 0.2 },
  ],
  q5_d: [
    { axis: "relational_investment", delta: -0.3 },
    { axis: "intimacy_pace", delta: -0.4 },
  ],
};

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

  if (!body.answers || !Array.isArray(body.answers) || body.answers.length < 5) {
    return NextResponse.json({
      ok: false,
      code: "incomplete_answers",
      details: { received: body.answers?.length ?? 0, required: 5 },
    }, { status: 400 });
  }

  // ── 回答 → 軸スコアに変換 ──
  const axisScores: Record<string, number> = {};

  // 全軸を 0 で初期化
  for (const axis of INTENT_TRANSLATION_AXES) {
    axisScores[axis] = 0;
  }

  // 各回答の影響を累積
  for (const answer of body.answers) {
    const effects = OPTION_EFFECTS[answer.optionId];
    if (!effects) continue;
    for (const { axis, delta } of effects) {
      if (axis in axisScores) {
        axisScores[axis] += delta;
      }
    }
  }

  // スコアを -1 ～ +1 にクランプ
  for (const axis of Object.keys(axisScores)) {
    axisScores[axis] = Math.max(-1, Math.min(1, axisScores[axis]));
  }

  // ── axis_snapshots に保存 ──
  const sessionDate = new Date().toISOString().slice(0, 10);
  const rows = Object.entries(axisScores).map(([axisId, score]) => ({
    user_id: user.id,
    axis_id: axisId,
    score,
    confidence: 0.3, // ミニ観測なので低めの信頼度
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

  return NextResponse.json({
    ok: true,
    savedAxes: Object.keys(axisScores).length,
    scores: axisScores,
  });
}
