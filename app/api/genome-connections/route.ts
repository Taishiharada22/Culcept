// GET /api/genome-connections — 接続一覧
// POST /api/genome-connections — リクエスト送信
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 自分が関わる接続を取得（最大200件）
    const { data: connections, error } = await supabase
      .from("genome_connections")
      .select("*")
      .or(`requester_id.eq.${user.id},target_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    // 相手のプロフィール情報を取得
    const counterpartIds = (connections ?? []).map((c) =>
      c.requester_id === user.id ? c.target_id : c.requester_id
    );
    const uniqueIds = [...new Set(counterpartIds)];

    let profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
    if (uniqueIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", uniqueIds);
      for (const p of profiles ?? []) {
        profileMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
      }
    }

    // Talk スレッドID を取得
    const acceptedIds = (connections ?? [])
      .filter((c) => c.status === "accepted")
      .map((c) => c.id);
    let threadMap: Record<string, string> = {};
    if (acceptedIds.length > 0) {
      const { data: threads } = await supabase
        .from("talk_threads")
        .select("id, connection_id")
        .in("connection_id", acceptedIds);
      for (const t of threads ?? []) {
        threadMap[t.connection_id] = t.id;
      }
    }

    const result = (connections ?? []).map((c) => {
      const counterpartId = c.requester_id === user.id ? c.target_id : c.requester_id;
      const profile = profileMap[counterpartId];
      return {
        id: c.id,
        requesterId: c.requester_id,
        targetId: c.target_id,
        status: c.status,
        visibilityRequester: c.visibility_requester,
        visibilityTarget: c.visibility_target,
        createdAt: c.created_at,
        respondedAt: c.responded_at,
        counterpart: {
          userId: counterpartId,
          displayName: profile?.display_name ?? null,
          avatarUrl: profile?.avatar_url ?? null,
        },
        threadId: threadMap[c.id] ?? null,
      };
    });

    return NextResponse.json({ ok: true, connections: result });
  } catch (error) {
    console.error("genome-connections GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const targetId = body?.targetId;
    const visibility = [1, 2, 3].includes(body?.visibility) ? body.visibility as number : 2; // デフォルト「会話」レベル
    if (!targetId || typeof targetId !== "string" || targetId === user.id) {
      return NextResponse.json({ error: "Invalid target" }, { status: 400 });
    }
    // UUID形式チェック
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
      return NextResponse.json({ error: "Invalid target ID format" }, { status: 400 });
    }

    // 既存接続チェック
    const { data: existing } = await supabase
      .from("genome_connections")
      .select("id, status")
      .or(
        `and(requester_id.eq.${user.id},target_id.eq.${targetId}),` +
        `and(requester_id.eq.${targetId},target_id.eq.${user.id})`
      )
      .maybeSingle();

    if (existing) {
      if (existing.status === "accepted") {
        return NextResponse.json({ error: "Already connected" }, { status: 409 });
      }
      if (existing.status === "pending") {
        return NextResponse.json({ error: "Request already pending" }, { status: 409 });
      }
      if (existing.status === "blocked") {
        return NextResponse.json({ error: "Cannot connect" }, { status: 403 });
      }
    }

    const { data: conn, error } = await supabase
      .from("genome_connections")
      .insert({
        requester_id: user.id,
        target_id: targetId,
        status: "pending",
        visibility_requester: visibility,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, connection: conn });
  } catch (error) {
    console.error("genome-connections POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
