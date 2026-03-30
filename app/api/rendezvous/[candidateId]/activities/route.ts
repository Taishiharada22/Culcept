import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  pickParallelQuestion,
  pickCategoryParallelQuestion,
  pickStyleDuetRounds,
  pickFutureScene,
  getAvailableActivities,
  computeStyleDuetOverlap,
  generateParallelQuestionInsight,
  generateStyleDuetInsight,
  type ActivityType,
} from "@/lib/rendezvous/activityEngine";
import { generateFutureScene } from "@/lib/rendezvous/futureSceneGenerator";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

type RouteCtx = { params: Promise<{ candidateId: string }> };

/**
 * GET /api/rendezvous/[candidateId]/activities
 * アクティビティ一覧 + 利用可能なアクティビティ
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = auth.user;

    // Verify user is part of candidate
    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b, category, overall_score")
      .eq("id", candidateId)
      .single();

    if (!candidate || (candidate.user_a !== user.id && candidate.user_b !== user.id))
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const iAmA = candidate.user_a === user.id;

    // Fetch activities
    const { data: activities } = await supabaseAdmin
      .from("rendezvous_activities")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });

    const list = (activities ?? []).map((a: Record<string, unknown>) => ({
      id: a.id,
      candidateId: a.candidate_id,
      activityType: a.activity_type,
      payload: a.payload,
      myAnswer: iAmA ? a.user_a_answer : a.user_b_answer,
      theirAnswer: iAmA ? a.user_b_answer : a.user_a_answer,
      revealed: a.revealed,
      insightText: a.insight_text,
      createdAt: a.created_at,
    }));

    const available = getAvailableActivities(
      (activities ?? []).map((a: Record<string, unknown>) => ({
        id: a.id as string,
        candidateId: a.candidate_id as string,
        activityType: a.activity_type as ActivityType,
        payload: a.payload as Record<string, unknown>,
        userAAnswer: a.user_a_answer as Record<string, unknown> | null,
        userBAnswer: a.user_b_answer as Record<string, unknown> | null,
        revealed: a.revealed as boolean,
        insightText: a.insight_text as string | null,
        createdAt: a.created_at as string,
      })),
    );

    return NextResponse.json({
      ok: true,
      activities: list,
      available,
      iAmA,
      category: candidate.category,
    });
  } catch (err: unknown) {
    console.error("[activities] GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/rendezvous/[candidateId]/activities
 * action: "create" → 新しいアクティビティ作成
 * action: "answer" → 回答送信
 * action: "reveal" → 同時開示
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = auth.user;

    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b, category, overall_score")
      .eq("id", candidateId)
      .single();

    if (!candidate || (candidate.user_a !== user.id && candidate.user_b !== user.id))
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const iAmA = candidate.user_a === user.id;
    const body = await req.json();
    const { action } = body;

    // ── Create new activity ──
    if (action === "create") {
      const { activityType } = body as { activityType: ActivityType; action: string };
      const category = (candidate.category as RendezvousCategory) ?? "friendship";

      let payload: Record<string, unknown> = {};

      if (activityType === "parallel_question") {
        // Get used question IDs
        const { data: existing } = await supabaseAdmin
          .from("rendezvous_activities")
          .select("payload")
          .eq("candidate_id", candidateId)
          .eq("activity_type", "parallel_question");

        const usedIds = (existing ?? []).map(
          (a: Record<string, unknown>) =>
            ((a.payload as Record<string, unknown>)?.questionId as string) ?? "",
        );

        // Try category-specific question first, then fallback to generic
        const question =
          pickCategoryParallelQuestion(category, usedIds) ??
          pickParallelQuestion(usedIds);

        if (!question)
          return NextResponse.json({ error: "No more questions" }, { status: 400 });

        payload = {
          questionId: question.id,
          questionText: question.text,
          category: question.category ?? category,
        };
      } else if (activityType === "style_duet") {
        const rounds = pickStyleDuetRounds(5);
        payload = { rounds };
      } else if (activityType === "future_scene") {
        const { data: existing } = await supabaseAdmin
          .from("rendezvous_activities")
          .select("payload")
          .eq("candidate_id", candidateId)
          .eq("activity_type", "future_scene");

        const usedIds = (existing ?? []).map(
          (a: Record<string, unknown>) =>
            ((a.payload as Record<string, unknown>)?.scenarioId as string) ?? "",
        );
        const scene = pickFutureScene(usedIds);
        if (!scene)
          return NextResponse.json({ error: "No more scenes" }, { status: 400 });

        const generated = generateFutureScene({
          scenario: scene.scenario,
          context: scene.context,
          category,
          syncPercent: Math.round((candidate.overall_score ?? 0.5) * 100),
        });

        payload = {
          scenarioId: scene.id,
          scenario: scene.scenario,
          context: scene.context,
          panels: generated.panels,
          mood: generated.mood,
        };
      } else {
        return NextResponse.json({ error: "Invalid activity type" }, { status: 400 });
      }

      const { data: created, error } = await supabaseAdmin
        .from("rendezvous_activities")
        .insert({
          candidate_id: candidateId,
          activity_type: activityType,
          payload,
        })
        .select("*")
        .single();

      if (error) throw error;
      return NextResponse.json({ ok: true, activity: created });
    }

    // ── Submit answer ──
    if (action === "answer") {
      const { activityId, answer } = body as {
        activityId: string;
        answer: unknown;
        action: string;
      };

      const column = iAmA ? "user_a_answer" : "user_b_answer";
      const { error } = await supabaseAdmin
        .from("rendezvous_activities")
        .update({ [column]: answer })
        .eq("id", activityId)
        .eq("candidate_id", candidateId);

      if (error) throw error;

      // Check if both answered -> auto-generate insight
      const { data: activity } = await supabaseAdmin
        .from("rendezvous_activities")
        .select("*")
        .eq("id", activityId)
        .single();

      if (activity?.user_a_answer && activity?.user_b_answer && !activity?.revealed) {
        let insightText: string | null = null;
        const actPayload = activity.payload as Record<string, unknown>;

        if (activity.activity_type === "parallel_question") {
          const aText =
            ((activity.user_a_answer as Record<string, unknown>)?.text as string) ?? "";
          const bText =
            ((activity.user_b_answer as Record<string, unknown>)?.text as string) ?? "";
          insightText = generateParallelQuestionInsight(
            (actPayload.questionText as string) ?? "",
            aText,
            bText,
          );
        } else if (activity.activity_type === "style_duet") {
          const aChoices =
            ((activity.user_a_answer as Record<string, unknown>)?.choices as string[]) ??
            [];
          const bChoices =
            ((activity.user_b_answer as Record<string, unknown>)?.choices as string[]) ??
            [];
          const overlap = computeStyleDuetOverlap(aChoices, bChoices);
          insightText = generateStyleDuetInsight(overlap.overlapPercent);

          // Store overlap in payload
          await supabaseAdmin
            .from("rendezvous_activities")
            .update({
              payload: { ...actPayload, overlapResult: overlap },
              insight_text: insightText,
            })
            .eq("id", activityId);
        }

        if (insightText && activity.activity_type !== "style_duet") {
          await supabaseAdmin
            .from("rendezvous_activities")
            .update({ insight_text: insightText })
            .eq("id", activityId);
        }
      }

      return NextResponse.json({ ok: true });
    }

    // ── Reveal ──
    if (action === "reveal") {
      const { activityId } = body as { activityId: string; action: string };

      const { data: activity } = await supabaseAdmin
        .from("rendezvous_activities")
        .select("*")
        .eq("id", activityId)
        .eq("candidate_id", candidateId)
        .single();

      if (!activity)
        return NextResponse.json({ error: "Activity not found" }, { status: 404 });

      if (!activity.user_a_answer || !activity.user_b_answer)
        return NextResponse.json(
          { error: "Both answers required" },
          { status: 400 },
        );

      if (activity.revealed)
        return NextResponse.json({ ok: true, already: true });

      const { error } = await supabaseAdmin
        .from("rendezvous_activities")
        .update({ revealed: true })
        .eq("id", activityId);

      if (error) throw error;

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    console.error("[activities] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
