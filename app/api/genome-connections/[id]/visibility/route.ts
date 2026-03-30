// PUT /api/genome-connections/[id]/visibility — 公開レベル変更
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function PUT(
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

    const { level } = await req.json();
    if (![1, 2, 3].includes(level)) {
      return NextResponse.json({ error: "Invalid level (1-3)" }, { status: 400 });
    }

    // 接続を取得
    const { data: conn } = await supabase
      .from("genome_connections")
      .select("requester_id, target_id, status")
      .eq("id", connectionId)
      .single();

    if (!conn) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (conn.status !== "accepted") {
      return NextResponse.json({ error: "Connection not accepted" }, { status: 400 });
    }

    // 自分が requester か target かで更新するカラムを決定
    const column = conn.requester_id === user.id
      ? "visibility_requester"
      : conn.target_id === user.id
        ? "visibility_target"
        : null;

    if (!column) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    const { error: updateErr } = await supabase
      .from("genome_connections")
      .update({ [column]: level })
      .eq("id", connectionId);

    if (updateErr) throw updateErr;

    return NextResponse.json({ ok: true, level });
  } catch (error) {
    console.error("visibility PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
