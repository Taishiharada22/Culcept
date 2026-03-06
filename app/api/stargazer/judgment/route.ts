import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { useCase, context, targetDescription } = body;

    if (!useCase) {
      return NextResponse.json({ error: "Missing useCase" }, { status: 400 });
    }

    // Get user's personality profile for judgment
    const { data: profile } = await supabase
      .from("stargazer_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({
        error: "Profile not found. Continue observations to build your profile.",
      }, { status: 404 });
    }

    // Generate simulation result based on use case
    // In production, this would call an AI model with the user's profile
    let result;
    switch (useCase) {
      case "romance_matching":
        result = {
          attractionPoints: ["観察力の高さ", "独自の視点", "誠実な関心"],
          misalignmentRisks: ["テンポの違い", "表現方法の差"],
          approachSuggestion: "相手の話をまず聞く姿勢を見せつつ、自分の独自の視点をさりげなく共有する",
          tempoAdvice: "急がず、自然な距離感を保ちながら徐々に近づく",
        };
        break;
      case "friend_matching":
        result = {
          closenessLikelihood: "知的な共鳴がある場合、深い友情に発展しやすい",
          relationshipStyle: "少数精鋭の関係を好み、表面的な付き合いを避ける傾向",
          strengthPoints: ["深い対話力", "信頼構築の安定性", "独立しつつ共感できる距離感"],
          approachAdvice: "共通の知的関心事を見つけることが最も自然な接近方法",
        };
        break;
      case "conversation_message":
        result = {
          sendOrWait: "send_later" as const,
          sendOrWaitReason: "衝動的に送るより、少し整理してから送る方がらしさが出る",
          toneDirection: "率直だが配慮を忘れない、落ち着いたトーン",
          replyPolicy: "既読から返信まで適度な間を取り、考えた返答を返す",
        };
        break;
      default:
        return NextResponse.json({ error: "Unknown use case" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      useCase,
      result,
      context: context || null,
    });
  } catch (error) {
    console.error("Failed to generate judgment:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
