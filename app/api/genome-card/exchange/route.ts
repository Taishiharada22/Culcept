// POST /api/genome-card/exchange — カード交換を記録
// GET  /api/genome-card/exchange?targetUserId=xxx — 交換状態チェック
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// talk_threads は INSERT ポリシーが無いため service role で upsert する。
//
// [C4 2026-04-20] 失敗を silent に握りつぶすと connection_id を thread_id として
//   扱う UI 側の型的嘘が観測できなくなる（accepted なのに talk_threads 行が無い
//   状態）。ここでは throw し、caller で 500 を返して顕在化する。
async function ensureTalkThread(connectionId: string): Promise<void> {
  const admin = getAdminClient();
  if (!admin) {
    throw new Error("service_role_unavailable");
  }
  const { error } = await admin
    .from("talk_threads")
    .upsert({ connection_id: connectionId }, { onConflict: "connection_id" });
  if (error) {
    throw new Error(`talk_threads_upsert_failed: ${error.message}`);
  }
}

/**
 * GET: 特定ユーザーとのカード交換ステータスを取得
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get("targetUserId");
    if (!targetUserId) {
      return NextResponse.json(
        { error: "targetUserId required" },
        { status: 400 },
      );
    }

    // genome_connections テーブルで accepted 状態の接続を検索
    const { data: conn } = await supabase
      .from("genome_connections")
      .select("id, status, created_at, responded_at")
      .or(
        `and(requester_id.eq.${user.id},target_id.eq.${targetUserId}),` +
          `and(requester_id.eq.${targetUserId},target_id.eq.${user.id})`,
      )
      .eq("status", "accepted")
      .maybeSingle();

    if (conn) {
      return NextResponse.json({
        exchanged: true,
        exchangedAt: conn.responded_at ?? conn.created_at,
      });
    }

    // pending リクエストも確認
    const { data: pending } = await supabase
      .from("genome_connections")
      .select("id, status, requester_id, created_at")
      .or(
        `and(requester_id.eq.${user.id},target_id.eq.${targetUserId}),` +
          `and(requester_id.eq.${targetUserId},target_id.eq.${user.id})`,
      )
      .eq("status", "pending")
      .maybeSingle();

    if (pending) {
      return NextResponse.json({
        exchanged: false,
        pending: true,
        requestedBy: pending.requester_id === user.id ? "self" : "other",
        requestedAt: pending.created_at,
      });
    }

    return NextResponse.json({ exchanged: false });
  } catch (error) {
    console.error("[genome-card/exchange] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST: カード交換リクエストを作成（または自動承認）
 * body: { targetUserId: string, candidateId?: string }
 *
 * Rendezvous の mutual_liked/chat_opened 状態なら自動承認
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { targetUserId, candidateId } = body as {
      targetUserId?: string;
      candidateId?: string;
    };

    if (!targetUserId) {
      return NextResponse.json(
        { error: "targetUserId required" },
        { status: 400 },
      );
    }

    if (targetUserId === user.id) {
      return NextResponse.json(
        { error: "Cannot exchange with yourself" },
        { status: 400 },
      );
    }

    // 既存の接続チェック
    const { data: existing } = await supabase
      .from("genome_connections")
      .select("id, status")
      .or(
        `and(requester_id.eq.${user.id},target_id.eq.${targetUserId}),` +
          `and(requester_id.eq.${targetUserId},target_id.eq.${user.id})`,
      )
      .in("status", ["accepted", "pending"])
      .maybeSingle();

    if (existing?.status === "accepted") {
      return NextResponse.json({
        ok: true,
        status: "already_exchanged",
        connectionId: existing.id,
      });
    }

    // 相手からの pending がある場合は自動承認
    if (existing?.status === "pending") {
      const { error: updateErr } = await supabase
        .from("genome_connections")
        .update({
          status: "accepted",
          responded_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateErr) {
        console.error("[genome-card/exchange] accept error:", updateErr);
        return NextResponse.json(
          { error: "Exchange failed" },
          { status: 500 },
        );
      }

      await ensureTalkThread(existing.id);

      return NextResponse.json({
        ok: true,
        status: "exchanged",
        connectionId: existing.id,
      });
    }

    // Rendezvous 経由で mutual_liked/chat_opened なら自動承認
    let autoAccept = false;
    if (candidateId) {
      const { data: candidate } = await supabase
        .from("rendezvous_candidates")
        .select("state")
        .eq("id", candidateId)
        .maybeSingle();

      if (
        candidate?.state === "mutual_liked" ||
        candidate?.state === "chat_opened"
      ) {
        autoAccept = true;
      }
    }

    // 新規接続を作成
    const now = new Date().toISOString();
    const { data: newConn, error: insertErr } = await supabase
      .from("genome_connections")
      .insert({
        requester_id: user.id,
        target_id: targetUserId,
        status: autoAccept ? "accepted" : "pending",
        responded_at: autoAccept ? now : null,
        visibility_requester: 2,
        visibility_target: 2,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("[genome-card/exchange] insert error:", insertErr);
      return NextResponse.json(
        { error: "Exchange failed" },
        { status: 500 },
      );
    }

    if (autoAccept) {
      await ensureTalkThread(newConn.id);
    }

    return NextResponse.json({
      ok: true,
      status: autoAccept ? "exchanged" : "pending",
      connectionId: newConn.id,
    });
  } catch (error) {
    console.error("[genome-card/exchange] POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
