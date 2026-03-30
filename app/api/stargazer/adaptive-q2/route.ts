// app/api/stargazer/adaptive-q2/route.ts
// 適応的Q2生成API — Q1の回答と行動シグナルからQ2を動的に生成する

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  generateAdaptiveQ2,
  type Q1Context,
} from "@/lib/stargazer/adaptiveQ2";
import {
  persistAdaptiveQuestionAsset,
  recordAdaptiveQuestionServed,
  selectAdaptiveQuestionFromPool,
} from "@/lib/stargazer/adaptiveQuestionPool";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { TRAIT_AXES } from "@/lib/stargazer/traitAxes";

/**
 * POST: Q1の回答コンテキストを受け取り、適応的Q2を生成して返す
 *
 * Request body:
 * - questionText: string
 * - axisId: TraitAxisKey
 * - selectedOptionLabel: string
 * - score: number
 * - options: { label: string; score: number }[]
 * - responseTimeMs: number
 * - averageResponseTimeMs: number
 * - answerChanged: boolean
 * - previousAnswerLabel?: string
 * - unchosenHoverDurations?: Record<string, number>
 * - sessionDepth?: number
 *
 * Response:
 * - ok: boolean
 * - question: AdaptiveQuestion
 */
export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      questionText,
      axisId,
      selectedOptionLabel,
      score,
      options,
      responseTimeMs,
      averageResponseTimeMs,
      answerChanged,
      previousAnswerLabel,
      unchosenHoverDurations,
      sessionDepth,
    } = body as {
      questionText: string;
      axisId: string;
      selectedOptionLabel: string;
      score: number;
      options: { label: string; score: number }[];
      responseTimeMs: number;
      averageResponseTimeMs: number;
      answerChanged: boolean;
      previousAnswerLabel?: string;
      unchosenHoverDurations?: Record<string, number>;
      sessionDepth?: number;
    };

    // Validate required fields
    if (!questionText || !axisId || selectedOptionLabel == null || score == null) {
      return NextResponse.json(
        { error: "Missing required fields: questionText, axisId, selectedOptionLabel, score" },
        { status: 400 },
      );
    }

    // Validate axisId
    const validAxis = TRAIT_AXES.find((a) => a.id === axisId);
    if (!validAxis) {
      return NextResponse.json(
        { error: `Invalid axisId: ${axisId}` },
        { status: 400 },
      );
    }

    // Fetch existing axis scores and previous scores for this axis
    const { data: axisSnapshots } = await supabase
      .from("stargazer_axis_snapshots")
      .select("axis_id, score")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    const existingAxisScores: Partial<Record<TraitAxisKey, number>> = {};
    const previousScoresOnAxis: number[] = [];

    if (axisSnapshots) {
      // Build axis scores map (latest score per axis)
      const seen = new Set<string>();
      for (const snap of axisSnapshots) {
        if (!seen.has(snap.axis_id)) {
          seen.add(snap.axis_id);
          existingAxisScores[snap.axis_id as TraitAxisKey] = Number(snap.score);
        }
        // Collect previous scores for the current axis
        if (snap.axis_id === axisId) {
          previousScoresOnAxis.push(Number(snap.score));
        }
      }
    }

    const q1Context: Q1Context = {
      questionText,
      axisId: axisId as TraitAxisKey,
      selectedOptionLabel,
      score,
      options: options ?? [],
      responseTimeMs: responseTimeMs ?? 5000,
      averageResponseTimeMs: averageResponseTimeMs ?? 5000,
      answerChanged: answerChanged ?? false,
      previousAnswerLabel,
      unchosenHoverDurations,
      existingAxisScores,
      previousScoresOnAxis:
        previousScoresOnAxis.length > 0 ? previousScoresOnAxis : undefined,
      sessionDepth: sessionDepth ?? 0,
    };

    const retrieved = await selectAdaptiveQuestionFromPool({
      q1Context,
      userId: user.id,
      supabase,
    });
    if (retrieved) {
      await recordAdaptiveQuestionServed({
        userId: user.id,
        questionKey: retrieved.questionKey,
        supabase,
        q1Context,
        question: retrieved.question,
      });
      return NextResponse.json({
        ok: true,
        question: retrieved.question,
      });
    }

    const adaptiveQuestion = await generateAdaptiveQ2(q1Context);
    const questionKey = await persistAdaptiveQuestionAsset({
      question: adaptiveQuestion,
      q1Context,
    });
    const persistedQuestion = questionKey
      ? { ...adaptiveQuestion, questionKey }
      : adaptiveQuestion;

    if (questionKey) {
      await recordAdaptiveQuestionServed({
        userId: user.id,
        questionKey,
        supabase,
        q1Context,
        question: persistedQuestion,
      });
    }

    return NextResponse.json({
      ok: true,
      question: persistedQuestion,
    });
  } catch (error) {
    console.error("[adaptive-q2] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
