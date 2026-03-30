/**
 * Home Alter フォローアップ API
 *
 * GET: 直近24h以内の Home Alter 判断があれば返す（「やった？」表示用）
 * POST: ユーザーの実行報告を記録
 *
 * 計測指標:
 *   - 提案実行率 = executed / total followups
 *   - 後悔方向 = did_regret の分布
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { checkStargazerTier } from "@/lib/stargazer/tierGuard";

export async function GET() {
  try {
    const tierCheck = await checkStargazerTier("alter");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId } = tierCheck;

    const supabase = await supabaseServer();

    // 直近24h以内の Home Alter 判断を取得（未フォローアップのもの）
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentJudgment } = await supabase
      .from("stargazer_analytics")
      .select("id, metadata, created_at")
      .eq("user_id", userId)
      .eq("event", "home_alter_judgment")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!recentJudgment) {
      return NextResponse.json({ pending: false });
    }

    // 既にフォローアップ済みか確認
    const { data: existingFollowup } = await supabase
      .from("stargazer_analytics")
      .select("id")
      .eq("user_id", userId)
      .eq("event", "home_alter_followup")
      .eq("metadata->>judgment_id", recentJudgment.id)
      .limit(1)
      .single();

    if (existingFollowup) {
      return NextResponse.json({ pending: false });
    }

    // 元の質問を取得
    const sessionId = recentJudgment.metadata?.session_id;
    let question = "";
    if (sessionId) {
      const { data: dialogue } = await supabase
        .from("stargazer_alter_dialogues")
        .select("message")
        .eq("user_id", userId)
        .eq("session_id", sessionId)
        .eq("role", "user")
        .order("created_at", { ascending: true })
        .limit(1)
        .single();
      question = dialogue?.message ?? "";
    }

    return NextResponse.json({
      pending: true,
      judgmentId: recentJudgment.id,
      actionShape: recentJudgment.metadata?.action_shape,
      decisionStance: recentJudgment.metadata?.decision_stance,
      question: question.slice(0, 100),
      askedAt: recentJudgment.created_at,
    });
  } catch (error) {
    console.error("[followup] GET error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tierCheck = await checkStargazerTier("alter");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId } = tierCheck;

    const supabase = await supabaseServer();

    const body = await request.json();
    const {
      judgmentId,
      executed,       // boolean: 提案を実行したか
      satisfaction,   // 1-5: やってみてどうだったか (executed=true の場合)
      skipReason,     // string: やらなかった理由 (executed=false の場合)
    } = body;

    if (!judgmentId || typeof executed !== "boolean") {
      return NextResponse.json({ error: "judgmentId と executed が必要です" }, { status: 400 });
    }

    // 元の judgment を取得して action_shape を記録
    const { data: judgment } = await supabase
      .from("stargazer_analytics")
      .select("metadata")
      .eq("id", judgmentId)
      .eq("user_id", userId)
      .single();

    if (!judgment) {
      return NextResponse.json({ error: "判断が見つかりません" }, { status: 404 });
    }

    // フォローアップを記録
    const { error } = await supabase.from("stargazer_analytics").insert({
      user_id: userId,
      event: "home_alter_followup",
      feature: "home_alter",
      metadata: {
        judgment_id: judgmentId,
        action_shape: judgment.metadata?.action_shape,
        decision_stance: judgment.metadata?.decision_stance,
        executed,
        satisfaction: executed ? (satisfaction ?? null) : null,
        skip_reason: !executed ? (skipReason ?? null) : null,
      },
    });

    if (error) {
      console.error("[followup] Insert error:", error);
      return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[followup] POST error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
