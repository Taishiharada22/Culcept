import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST: タイプの「しっくり度」フィードバックを保存
 *
 * Body:
 *   - typeCode: string (割り当てられたタイプコード) ※ archetypeCode も後方互換で受付
 *   - fitScore: number (1-5: 1=全く違う, 5=まさに自分)
 *   - alternativeCode?: string (ユーザーが「こっちが近い」と選んだタイプ)
 *   - freeText?: string (自由記述)
 *
 * 用途:
 *   - タイプ解決の精度測定（しっくり率の算出）
 *   - 低スコア時の次点タイプ提示後、alternativeCode で真のタイプを学習
 *   - 蓄積データで定義の重み調整候補を特定
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { typeCode: rawTypeCode, archetypeCode: rawArchetypeCode, fitScore, alternativeCode, freeText } = body as {
      typeCode?: string;
      archetypeCode?: string;
      fitScore: number;
      alternativeCode?: string;
      freeText?: string;
    };

    // backward compat: accept either typeCode or archetypeCode
    const typeCode = rawTypeCode || rawArchetypeCode;
    if (!typeCode || typeof typeCode !== "string") {
      return NextResponse.json({ error: "typeCode が必要です" }, { status: 400 });
    }
    if (typeof fitScore !== "number" || fitScore < 1 || fitScore > 5) {
      return NextResponse.json({ error: "fitScore は 1-5 の数値で指定してください" }, { status: 400 });
    }

    const metadata = {
      fit_score: fitScore,
      fit_alternative: alternativeCode || null,
      fit_feedback_text: freeText ? freeText.slice(0, 500) : null,
      fit_feedback_at: new Date().toISOString(),
    };

    // stargazer_resolved_types の axis_scores JSONB に _fit_feedback を保存
    // オンボーディング結果画面ではDB保存より先にフィードバックが送られるケースがあるため、
    // レコードがなければ最小限のレコードを upsert で作成する
    const { data: existing, error: fetchError } = await supabase
      .from("stargazer_resolved_types")
      .select("id, axis_scores")
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) {
      console.error("[type-feedback] DB fetch error for user:", user.id.slice(0, 8), fetchError.message);
      return NextResponse.json({ error: "データ取得に失敗しました" }, { status: 500 });
    }

    let saveError: { message: string } | null = null;

    if (existing) {
      // 既存レコードがある場合: axis_scores にマージ
      const updatedScores = {
        ...(existing.axis_scores as Record<string, unknown> ?? {}),
        _fit_feedback: metadata,
      };
      const { error } = await supabase
        .from("stargazer_resolved_types")
        .update({ axis_scores: updatedScores })
        .eq("id", existing.id);
      saveError = error;
    } else {
      // レコードがまだない場合: フィードバックだけで最小レコードを作成
      // 後で observations API が完全データで upsert する際に axis_scores がマージされる
      console.info("[type-feedback] No resolved type yet for user:", user.id.slice(0, 8), "— creating minimal record");
      const { error } = await supabase
        .from("stargazer_resolved_types")
        .upsert({
          user_id: user.id,
          archetype_code: typeCode,
          axis_scores: { _fit_feedback: metadata },
          confidence: 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      saveError = error;
    }

    if (saveError) {
      console.error("[type-feedback] Save failed for user:", user.id.slice(0, 8), saveError.message);
      return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
    }

    console.info("[type-feedback] Saved", {
      userId: user.id.slice(0, 8),
      typeCode,
      fitScore,
      alternativeCode: alternativeCode || "none",
      hadExistingRecord: !!existing,
    });

    // 全ユーザーの統計（しっくり率）を返す — 将来のUI表示用
    return NextResponse.json({
      ok: true,
      saved: true,
      fitScore,
      typeCode,
      alternativeCode: alternativeCode || null,
    });
  } catch (error) {
    console.error("[type-feedback] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
