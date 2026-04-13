// app/api/stargazer/feedback/route.ts
// フィードバック収集API — 初回体験後のユーザーフィードバックを保存

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

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
    const { type, data } = body as {
      type: string;
      data: Record<string, unknown>;
    };

    if (!type || !data) {
      return NextResponse.json(
        { error: "Missing type or data" },
        { status: 400 },
      );
    }

    // stargazer_observations テーブルに feedback として保存
    // 専用テーブルは不要 — 汎用 observations に type="feedback" で記録
    const { error } = await supabase.from("stargazer_observations").insert({
      user_id: user.id,
      observation_type: "feedback",
      question_id: `feedback_${type}`,
      answer_value: {
        feedbackType: type,
        ...data,
      },
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[Feedback] Save failed:", error);
      // Non-critical — log but return success (localStorage has backup)
      return NextResponse.json({ ok: true, persisted: false });
    }

    return NextResponse.json({ ok: true, persisted: true });
  } catch (error) {
    console.error("[Feedback] API error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
