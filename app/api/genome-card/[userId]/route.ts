// GET /api/genome-card/[userId] — 相手の Genome Card（visibility フィルタ適用）
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { assembleGenomeForUser } from "@/lib/genome/assembleForUser";
import { filterGenomeByVisibility } from "@/lib/genome/filterByVisibility";
import type { VisibilityLevel } from "@/lib/genome/cardTypes";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId: targetUserId } = await params;
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 自分自身のカードなら /api/genome-card にリダイレクト
    if (targetUserId === user.id) {
      return NextResponse.json({ error: "Use /api/genome-card for own card" }, { status: 400 });
    }

    // 相互接続を確認
    const { data: conn } = await supabase
      .from("genome_connections")
      .select("*")
      .or(
        `and(requester_id.eq.${user.id},target_id.eq.${targetUserId}),` +
        `and(requester_id.eq.${targetUserId},target_id.eq.${user.id})`
      )
      .eq("status", "accepted")
      .maybeSingle();

    if (!conn) {
      return NextResponse.json({ error: "Not connected" }, { status: 403 });
    }

    // 相手が自分に設定した公開レベルを取得
    const isRequester = conn.requester_id === targetUserId;
    const visibilityLevel = (isRequester
      ? conn.visibility_requester
      : conn.visibility_target) as VisibilityLevel;

    // 相手のプロフィール情報
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", targetUserId)
      .maybeSingle();

    // 相手の Genome 組立
    const { genome, visualization, cardExtras } = await assembleGenomeForUser(supabase, targetUserId);

    const card = filterGenomeByVisibility(
      targetUserId,
      profile?.display_name ?? null,
      profile?.avatar_url ?? null,
      genome,
      visualization,
      visibilityLevel,
      cardExtras,
    );

    return NextResponse.json({ ok: true, card, visibilityLevel, connectionId: conn.id });
  } catch (error) {
    console.error("genome-card/[userId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
