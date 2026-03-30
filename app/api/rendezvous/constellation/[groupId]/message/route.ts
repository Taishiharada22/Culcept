import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// =============================================================================
// POST /api/rendezvous/constellation/[groupId]/message
// 星座グループチャットへメッセージ送信
// =============================================================================

export async function POST(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { groupId } = await params;
    const userId = auth.user.id;
    const body = await req.json();
    const { content } = body as { content: string };

    if (!content?.trim()) {
      return NextResponse.json({ ok: false, error: "Empty message" }, { status: 400 });
    }

    // 星座の存在 + メンバー確認
    const { data: constellation } = await supabaseAdmin
      .from("rendezvous_constellations")
      .select("id, member_ids, state, expires_at")
      .eq("id", groupId)
      .single();

    if (!constellation) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    if (!(constellation.member_ids as string[]).includes(userId)) {
      return NextResponse.json({ ok: false, error: "Not a member" }, { status: 403 });
    }

    if (constellation.state === "expired") {
      return NextResponse.json({ ok: false, error: "Constellation expired" }, { status: 400 });
    }

    // メッセージ挿入
    const { data: msg, error } = await supabaseAdmin
      .from("rendezvous_constellation_messages")
      .insert({
        constellation_id: groupId,
        sender_id: userId,
        content: content.trim().slice(0, 1000),
      })
      .select("id, created_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: "Failed to send" }, { status: 500 });
    }

    // 匿名ラベル生成（メンバー順序で「星A」「星B」等）
    const memberIndex = (constellation.member_ids as string[]).indexOf(userId);
    const labels = ["星A", "星B", "星C", "星D", "星E"];

    return NextResponse.json({
      ok: true,
      message: {
        id: msg.id,
        senderLabel: labels[memberIndex] ?? `星${memberIndex + 1}`,
        isMe: true,
        content: content.trim().slice(0, 1000),
        createdAt: msg.created_at,
      },
    });
  } catch (err) {
    console.error("[constellation/message] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
