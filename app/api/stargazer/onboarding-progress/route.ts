// app/api/stargazer/onboarding-progress/route.ts
// 18問オンボーディング進捗のサーバー保存・読み込み
// stargazer_profiles.stage_progress を使用（既存JSONB、マイグレーション不要）

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export interface OnboardingProgressPayload {
  /** 現在の回答リスト */
  answers: {
    questionId: string;
    value: string;
    numericValue: number;
    responseTimeMs: number;
    axes: Record<string, number>;
  }[];
  /** 次に答えるべき問題インデックス（0-based） */
  nextIndex: number;
  /** 保存タイムスタンプ */
  savedAt: string;
}

// ── GET: 進捗を読み込む ──
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ progress: null }, { status: 200 });

    const { data } = await supabase
      .from("stargazer_profiles")
      .select("stage_progress")
      .eq("user_id", user.id)
      .maybeSingle();

    const stageProgress = data?.stage_progress as Record<string, unknown> | null;
    const progress = stageProgress?.v5_onboarding as OnboardingProgressPayload | null;

    // 48時間以内のデータのみ有効
    if (progress?.savedAt) {
      const age = Date.now() - new Date(progress.savedAt).getTime();
      if (age > 48 * 60 * 60 * 1000) {
        return NextResponse.json({ progress: null });
      }
    }

    return NextResponse.json({ progress: progress ?? null });
  } catch (err) {
    console.error("[onboarding-progress GET]", err);
    return NextResponse.json({ progress: null });
  }
}

// ── POST: 進捗を保存 ──
export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = (await request.json()) as Partial<OnboardingProgressPayload>;
    if (!Array.isArray(body.answers)) {
      return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
    }

    const progress: OnboardingProgressPayload = {
      answers: body.answers,
      nextIndex: body.nextIndex ?? body.answers.length,
      savedAt: new Date().toISOString(),
    };

    // 既存の stage_progress を取得してマージ（他フィールドを壊さない）
    const { data: existing } = await supabase
      .from("stargazer_profiles")
      .select("stage_progress")
      .eq("user_id", user.id)
      .maybeSingle();

    const existingProgress = (existing?.stage_progress as Record<string, unknown>) ?? {};
    const merged = { ...existingProgress, v5_onboarding: progress };

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
