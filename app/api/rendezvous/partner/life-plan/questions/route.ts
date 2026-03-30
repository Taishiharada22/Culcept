import { NextResponse } from "next/server";
import { LIFE_PLAN_QUESTIONS, LIFE_PLAN_AXES } from "@/lib/rendezvous/lifePlanQuestions";

/**
 * GET /api/rendezvous/partner/life-plan/questions
 *
 * Life Plan 質問定義をクライアントに返す（認証不要・公開データ）
 */
export async function GET() {
  return NextResponse.json({
    questions: LIFE_PLAN_QUESTIONS.map((q) => ({
      id: q.id,
      questionText: q.questionText,
      leftLabel: q.leftLabel,
      rightLabel: q.rightLabel,
      scale: q.scale,
      category: q.category,
      note: q.note ?? null,
    })),
    axes: LIFE_PLAN_AXES.map((a) => ({
      id: a.id,
      labelLeft: a.labelLeft,
      labelRight: a.labelRight,
      description: a.description,
    })),
    totalQuestions: LIFE_PLAN_QUESTIONS.length,
  });
}
