// PATCH /api/genome-connections/[id] — 承認/拒否/ブロック
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: connectionId } = await params;
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action } = await req.json();
    if (!["accept", "decline", "block"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // 接続を取得（target のみ応答可能）
    const { data: conn, error: fetchErr } = await supabase
      .from("genome_connections")
      .select("*")
      .eq("id", connectionId)
      .single();

    if (fetchErr || !conn) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    if (conn.target_id !== user.id) {
      return NextResponse.json({ error: "Only target can respond" }, { status: 403 });
    }

    if (conn.status !== "pending") {
      return NextResponse.json({ error: "Already responded" }, { status: 409 });
    }

    const statusMap: Record<string, string> = {
      accept: "accepted",
      decline: "declined",
      block: "blocked",
    };

    const { error: updateErr } = await supabase
      .from("genome_connections")
      .update({
        status: statusMap[action],
        responded_at: new Date().toISOString(),
      })
      .eq("id", connectionId);

    if (updateErr) throw updateErr;

    // 承認時: Talk スレッドを作成
    if (action === "accept") {
      await supabase.from("talk_threads").insert({
        connection_id: connectionId,
      });
    }

    return NextResponse.json({ ok: true, status: statusMap[action] });
  } catch (error) {
    console.error("genome-connections/[id] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
