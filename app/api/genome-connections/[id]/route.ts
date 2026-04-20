// PATCH /api/genome-connections/[id] — 承認/拒否/ブロック
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

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

    // 承認時: Talk スレッドを作成（talk_threads は INSERT ポリシー無しのため service role 経由）
    //
    // [C4 2026-04-20] service-role 不在や upsert 失敗を silent に許すと、UI 側
    //   （TalkPageClient, CardViewClient）で connection_id を thread_id として扱う
    //   フォールバックに化けて FK / RLS 不整合が発生する。accept は talk_threads
    //   行の存在まで含めて成立する契約に揃える。失敗時は 500 で明示。
    if (action === "accept") {
      const admin = getAdminClient();
      if (!admin) {
        console.error("[genome-connections] accept aborted: service_role_unavailable");
        return NextResponse.json(
          { error: "Service role unavailable" },
          { status: 500 },
        );
      }
      const { error: upsertErr } = await admin
        .from("talk_threads")
        .upsert(
          { connection_id: connectionId },
          { onConflict: "connection_id" },
        );
      if (upsertErr) {
        console.error("[genome-connections] talk_threads upsert failed:", upsertErr);
        return NextResponse.json(
          { error: "Talk thread creation failed" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ ok: true, status: statusMap[action] });
  } catch (error) {
    console.error("genome-connections/[id] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
