/**
 * POST /api/coalter/activate — CoAlterを有効化する（同意リクエスト発行）
 *
 * 初回: pending_consent を作成し、相手に通知
 * 既に enabled: そのまま返す
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { ActivateRequest, CoAlterApiResponse } from "@/lib/coalter/types";

export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ActivateRequest;
    const { threadId } = body;

    if (!threadId) {
      return NextResponse.json({ ok: false, error: "threadId is required" }, { status: 400 });
    }

    // スレッドの参加者を特定
    const { data: thread } = await supabase
      .from("talk_threads")
      .select("id, connection_id, genome_connections!inner(requester_id, target_id, status)")
      .eq("id", threadId)
      .single();

    if (!thread) {
      return NextResponse.json({ ok: false, error: "Thread not found" }, { status: 404 });
    }

    const conn = thread.genome_connections as unknown as {
      requester_id: string;
      target_id: string;
      status: string;
    };

    // 参加者であることを確認
    if (conn.requester_id !== user.id && conn.target_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Not a participant" }, { status: 403 });
    }

    // 接続が accepted であることを確認
    if (conn.status !== "accepted") {
      return NextResponse.json({ ok: false, error: "Connection not accepted" }, { status: 400 });
    }

    const userA = conn.requester_id < conn.target_id ? conn.requester_id : conn.target_id;
    const userB = conn.requester_id < conn.target_id ? conn.target_id : conn.requester_id;

    // 既存のペア状態を確認
    const { data: existing } = await supabase
      .from("coalter_pair_states")
      .select("id, state")
      .eq("thread_id", threadId)
      .single();

    if (existing) {
      if (existing.state === "enabled") {
        return NextResponse.json<CoAlterApiResponse>({
          ok: true,
          data: { pairStateId: existing.id, state: "enabled" },
        });
      }
      if (existing.state === "pending_consent") {
        return NextResponse.json<CoAlterApiResponse>({
          ok: true,
          data: { pairStateId: existing.id, state: "pending_consent" },
        });
      }
      // disabled → 再度 pending_consent
      await supabase
        .from("coalter_pair_states")
        .update({
          state: "pending_consent",
          initiated_by: user.id,
          disabled_at: null,
          disabled_by: null,
        })
        .eq("id", existing.id);

      return NextResponse.json<CoAlterApiResponse>({
        ok: true,
        data: { pairStateId: existing.id, state: "pending_consent" },
      });
    }

    // 新規作成
    const { data: created, error } = await supabase
      .from("coalter_pair_states")
      .insert({
        thread_id: threadId,
        thread_type: "talk",
        user_a: userA,
        user_b: userB,
        state: "pending_consent",
        initiated_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[CoAlter] Failed to create pair state:", error);
      return NextResponse.json({ ok: false, error: "Failed to activate" }, { status: 500 });
    }

    return NextResponse.json<CoAlterApiResponse>({
      ok: true,
      data: { pairStateId: created.id, state: "pending_consent" },
    });
  } catch (e) {
    console.error("[CoAlter] Activate error:", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
