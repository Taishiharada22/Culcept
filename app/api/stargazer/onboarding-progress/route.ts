// app/api/stargazer/onboarding-progress/route.ts
// オンボーディング進捗のサーバー保存・読み込み
// stargazer_profiles.stage_progress を使用（既存JSONB、マイグレーション不要）
// v5_onboarding: 18問フェーズ / v5_questionflow: 53問フェーズ

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export interface OnboardingProgressPayload {
  /** 現在の回答リスト */
  answers: {
    questionId: string;
    value: string | number;
    numericValue?: number;
    responseTimeMs?: number;
    axes?: Record<string, number>;
  }[];
  /** 次に答えるべき問題インデックス（0-based） */
  nextIndex: number;
  /** 保存タイムスタンプ */
  savedAt: string;
  /** 全完了フラグ */
  completed?: boolean;
  /** 18問完了時のクラスタ結果（復元用） */
  clusterResult?: unknown;
  /** 18問完了時の軸スコア（復元用） */
  axisScores?: Record<string, number>;
  /** Cognitive Fit 回答（途中保存・復元用） */
  cfAnswers?: { questionId: string; value: number; responseTimeMs?: number }[];
}

type PhaseKey = "onboarding" | "questionflow";
const STAGE_KEY: Record<PhaseKey, string> = {
  onboarding: "v5_onboarding",
  questionflow: "v5_questionflow",
};

// ── GET: 進捗を読み込む（両フェーズ返却） ──
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ progress: null, questionflowProgress: null }, { status: 200 });

    const { data } = await supabase
      .from("stargazer_profiles")
      .select("stage_progress")
      .eq("user_id", user.id)
      .maybeSingle();

    const stageProgress = data?.stage_progress as Record<string, unknown> | null;

    // 18問フェーズ
    const onboarding = stageProgress?.v5_onboarding as OnboardingProgressPayload | null;
    let progress: OnboardingProgressPayload | null = onboarding ?? null;
    if (progress?.savedAt) {
      const age = Date.now() - new Date(progress.savedAt).getTime();
      if (age > 48 * 60 * 60 * 1000) progress = null;
    }

    // 53問フェーズ
    const qfRaw = stageProgress?.v5_questionflow as OnboardingProgressPayload | null;
    let questionflowProgress: OnboardingProgressPayload | null = qfRaw ?? null;
    if (questionflowProgress?.savedAt) {
      const age = Date.now() - new Date(questionflowProgress.savedAt).getTime();
      if (age > 48 * 60 * 60 * 1000) questionflowProgress = null;
    }
    // completed=true で answers が空の場合 → 全問完了済み（結果表示フェーズ）
    // null にせず completed フラグを保持して返す（リフレッシュ時の結果フェーズ復元に必要）

    return NextResponse.json({ progress, questionflowProgress });
  } catch (err) {
    console.error("[onboarding-progress GET]", err);
    return NextResponse.json({ progress: null, questionflowProgress: null });
  }
}

// ── POST: 進捗を保存 ──
export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = (await request.json()) as Partial<OnboardingProgressPayload> & {
      phase?: PhaseKey;
      completed?: boolean;
      clusterResult?: unknown;
      axisScores?: Record<string, number>;
      cfAnswers?: { questionId: string; value: number; responseTimeMs?: number }[];
    };
    if (!Array.isArray(body.answers)) {
      return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
    }

    // Reject empty non-completion payloads (no answers and not a completion signal)
    if (body.answers.length === 0 && !body.completed) {
      return NextResponse.json({ ok: false, error: "empty answers without completion flag" }, { status: 400 });
    }

    const phase: PhaseKey = body.phase ?? "onboarding";
    if (!["onboarding", "questionflow"].includes(phase)) {
      return NextResponse.json({ ok: false, error: "invalid phase" }, { status: 400 });
    }
    const stageKey = STAGE_KEY[phase];

    const progress: OnboardingProgressPayload = {
      answers: body.answers,
      nextIndex: body.nextIndex ?? body.answers.length,
      savedAt: new Date().toISOString(),
      ...(body.completed ? { completed: true } : {}),
      ...(body.clusterResult ? { clusterResult: body.clusterResult } : {}),
      ...(body.axisScores ? { axisScores: body.axisScores as Record<string, number> } : {}),
      ...(body.cfAnswers && body.cfAnswers.length > 0 ? { cfAnswers: body.cfAnswers } : {}),
    };

    // 既存の stage_progress を取得してマージ（他フィールドを壊さない）
    const { data: existing } = await supabase
      .from("stargazer_profiles")
      .select("stage_progress")
      .eq("user_id", user.id)
      .maybeSingle();

    const existingProgress = (existing?.stage_progress as Record<string, unknown>) ?? {};
    const merged = { ...existingProgress, [stageKey]: progress };

    await supabase
      .from("stargazer_profiles")
      .upsert({ user_id: user.id, stage_progress: merged }, { onConflict: "user_id" });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[onboarding-progress POST]", err);
    return NextResponse.json({ ok: false, error: "server error" }, { status: 500 });
  }
}

// ── DELETE: 進捗を削除（完了・破棄時） ──
export async function DELETE() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const { data: existing } = await supabase
      .from("stargazer_profiles")
      .select("stage_progress")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing?.stage_progress) {
      const updated = { ...(existing.stage_progress as Record<string, unknown>) };
      delete updated.v5_onboarding;
      delete updated.v5_questionflow;
      await supabase
        .from("stargazer_profiles")
        .update({ stage_progress: updated })
        .eq("user_id", user.id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[onboarding-progress DELETE]", err);
    return NextResponse.json({ ok: false });
  }
}
