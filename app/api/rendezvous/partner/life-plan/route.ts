import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeLifePlanProfile } from "@/lib/rendezvous/lifePlanVector";
import type { LifePlanResponse } from "@/lib/rendezvous/lifePlanVector";
import { LIFE_PLAN_QUESTIONS, LIFE_PLAN_AXIS_KEYS } from "@/lib/rendezvous/lifePlanQuestions";

/**
 * Life Plan 質問回答 API
 *
 * GET  /api/rendezvous/partner/life-plan — 回答済みデータ + 進捗を返す
 * POST /api/rendezvous/partner/life-plan — 回答を保存 + Profile を再計算
 *
 * POST Body:
 *   { responses: [{ questionId: string, value: number, responseTimeMs?: number }] }
 *
 * Response:
 *   {
 *     saved: number,
 *     progress: { totalQuestions, answeredCount, completionRate, unansweredIds },
 *     profile: LifePlanProfile | null
 *   }
 */

// ── GET: 現在の回答状況と Profile を返す ──

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;

    // 回答済みデータを取得
    const { data: responses, error: respErr } = await supabaseAdmin
      .from("partner_life_plan_responses")
      .select("question_id, value, response_time_ms, updated_at")
      .eq("user_id", userId);

    if (respErr) {
      return NextResponse.json({ error: respErr.message }, { status: 500 });
    }

    // キャッシュ済み Profile を取得
    const { data: cachedProfile } = await supabaseAdmin
      .from("partner_life_plan_profiles")
      .select("vector, confidence, overall_confidence, response_count, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    const answeredIds = new Set((responses ?? []).map((r: any) => r.question_id));
    const totalQuestions = LIFE_PLAN_QUESTIONS.length;
    const answeredCount = answeredIds.size;
    const unansweredIds = LIFE_PLAN_QUESTIONS
      .filter((q) => !answeredIds.has(q.id))
      .map((q) => q.id);

    // 軸別の回答カバレッジ
    const axisCoverage: Record<string, { total: number; answered: number }> = {};
    for (const key of LIFE_PLAN_AXIS_KEYS) {
      axisCoverage[key] = { total: 0, answered: 0 };
    }
    for (const q of LIFE_PLAN_QUESTIONS) {
      for (const axis of q.axes) {
        axisCoverage[axis.key] ??= { total: 0, answered: 0 };
        axisCoverage[axis.key].total++;
        if (answeredIds.has(q.id)) {
          axisCoverage[axis.key].answered++;
        }
      }
    }

    return NextResponse.json({
      responses: (responses ?? []).map((r: any) => ({
        questionId: r.question_id,
        value: r.value,
        responseTimeMs: r.response_time_ms,
        updatedAt: r.updated_at,
      })),
      progress: {
        totalQuestions,
        answeredCount,
        completionRate: totalQuestions > 0 ? answeredCount / totalQuestions : 0,
        unansweredIds,
        axisCoverage,
      },
      profile: cachedProfile
        ? {
            vector: cachedProfile.vector,
            confidence: cachedProfile.confidence,
            overallConfidence: cachedProfile.overall_confidence,
            responseCount: cachedProfile.response_count,
            updatedAt: cachedProfile.updated_at,
          }
        : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[partner/life-plan] GET error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST: 回答を保存 + Profile 再計算 ──

export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const body = await req.json();

    // Validate input
    const incoming: Array<{ questionId: string; value: number; responseTimeMs?: number }> =
      body.responses;

    if (!Array.isArray(incoming) || incoming.length === 0) {
      return NextResponse.json(
        { error: "responses must be a non-empty array" },
        { status: 400 },
      );
    }

    // 有効な質問IDのセット
    const validQuestionIds = new Set(LIFE_PLAN_QUESTIONS.map((q) => q.id));
    const questionScaleMap = new Map(
      LIFE_PLAN_QUESTIONS.map((q) => [q.id, q.scale]),
    );

    // Validate each response
    const validResponses: Array<{ questionId: string; value: number; responseTimeMs?: number }> = [];
    const errors: string[] = [];

    for (const r of incoming) {
      if (!r.questionId || typeof r.value !== "number") {
        errors.push(`Invalid response: questionId and value are required`);
        continue;
      }
      if (!validQuestionIds.has(r.questionId)) {
        errors.push(`Unknown questionId: ${r.questionId}`);
        continue;
      }
      const scale = questionScaleMap.get(r.questionId) ?? 5;
      if (r.value < 1 || r.value > scale) {
        errors.push(`Value ${r.value} out of range [1, ${scale}] for ${r.questionId}`);
        continue;
      }
      validResponses.push(r);
    }

    if (validResponses.length === 0) {
      return NextResponse.json(
        { error: "No valid responses", details: errors },
        { status: 400 },
      );
    }

    // UPSERT each response using RPC (冪等)
    let savedCount = 0;
    for (const r of validResponses) {
      const { error: rpcErr } = await supabaseAdmin.rpc("upsert_life_plan_response", {
        p_user_id: userId,
        p_question_id: r.questionId,
        p_value: r.value,
        p_response_time_ms: r.responseTimeMs ?? null,
      });
      if (rpcErr) {
        console.warn(`[partner/life-plan] upsert error for ${r.questionId}:`, rpcErr.message);
      } else {
        savedCount++;
      }
    }

    // 全回答を再取得して Profile を再計算
    const { data: allResponses } = await supabaseAdmin
      .from("partner_life_plan_responses")
      .select("question_id, value, response_time_ms")
      .eq("user_id", userId);

    const lifePlanResponses: LifePlanResponse[] = (allResponses ?? []).map((r: any) => ({
      questionId: r.question_id,
      value: r.value,
      responseTimeMs: r.response_time_ms ?? undefined,
    }));

    const profile = computeLifePlanProfile(lifePlanResponses);

    // Profile をキャッシュ (upsert)
    await supabaseAdmin
      .from("partner_life_plan_profiles")
      .upsert(
        {
          user_id: userId,
          vector: profile.vector as unknown as Record<string, unknown>,
          confidence: profile.confidence as unknown as Record<string, unknown>,
          overall_confidence: profile.overallConfidence,
          response_count: lifePlanResponses.length,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    // 進捗計算
    const answeredIds = new Set((allResponses ?? []).map((r: any) => r.question_id));
    const totalQuestions = LIFE_PLAN_QUESTIONS.length;
    const answeredCount = answeredIds.size;
    const unansweredIds = LIFE_PLAN_QUESTIONS
      .filter((q) => !answeredIds.has(q.id))
      .map((q) => q.id);

    return NextResponse.json({
      saved: savedCount,
      ...(errors.length > 0 ? { warnings: errors } : {}),
      progress: {
        totalQuestions,
        answeredCount,
        completionRate: totalQuestions > 0 ? answeredCount / totalQuestions : 0,
        unansweredIds,
      },
      profile: {
        vector: profile.vector,
        confidence: profile.confidence,
        overallConfidence: profile.overallConfidence,
        updatedAt: profile.updatedAt,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[partner/life-plan] POST error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
