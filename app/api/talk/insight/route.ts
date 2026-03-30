// GET /api/talk/insight?targetUserId=xxx
// Gemini LLM で会話インサイトを生成（teacher/student パイプライン経由）
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { assembleGenomeForUser } from "@/lib/genome/assembleForUser";
import { filterGenomeByVisibility } from "@/lib/genome/filterByVisibility";
import { generateConversationInsightsLLM } from "@/lib/genome/conversationIntelligenceLLM";

export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const targetUserId = req.nextUrl.searchParams.get("targetUserId");
    if (!targetUserId) return NextResponse.json({ error: "Missing targetUserId" }, { status: 400 });

    // 接続確認
    const { data: conn } = await supabase
      .from("genome_connections")
      .select("id")
      .eq("status", "accepted")
      .or(
        `and(requester_id.eq.${user.id},target_id.eq.${targetUserId}),` +
        `and(requester_id.eq.${targetUserId},target_id.eq.${user.id})`
      )
      .maybeSingle();

    if (!conn) return NextResponse.json({ error: "Not connected" }, { status: 403 });

    // 両者のGenomeを取得
    const [myGenome, theirGenome] = await Promise.all([
      assembleGenomeForUser(supabase, user.id),
      assembleGenomeForUser(supabase, targetUserId),
    ]);

    // プロフィール取得
    const [myProfile, theirProfile] = await Promise.all([
      supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle(),
      supabase.from("profiles").select("display_name, avatar_url").eq("id", targetUserId).maybeSingle(),
    ]);

    const myCard = filterGenomeByVisibility(
      user.id, myProfile.data?.display_name ?? null, myProfile.data?.avatar_url ?? null,
      myGenome.genome, myGenome.visualization, 3, myGenome.cardExtras,
    );
    const theirCard = filterGenomeByVisibility(
      targetUserId, theirProfile.data?.display_name ?? null, theirProfile.data?.avatar_url ?? null,
      theirGenome.genome, theirGenome.visualization, 3, theirGenome.cardExtras,
    );

    // LLM で会話インサイト生成（自動的に teacher_outputs に蓄積）
    const insight = await generateConversationInsightsLLM(theirCard, myCard);

    return NextResponse.json({ ok: true, insight });
  } catch (error) {
    console.error("talk/insight error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
