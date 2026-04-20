/**
 * POST /api/coalter/end — CoAlterセッションを終了 or ペアのopt-out
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { CoAlterApiResponse } from "@/lib/coalter/types";

export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { threadId, action } = body as { threadId?: string; action?: "end_session" | "opt_out" };

    if (!threadId) {
      return NextResponse.json({ ok: false, error: "threadId is required" }, { status: 400 });
    }

    const effectiveAction = action ?? "end_session";

    // ペア状態を取得
    const { data: pairState } = await supabase
      .from("coalter_pair_states")
      .select("id, state, user_a, user_b")
      .eq("thread_id", threadId)
      .single();

    if (!pairState) {
      return NextResponse.json({ ok: false, error: "No CoAlter state found" }, { status: 404 });
    }

    if (pairState.user_a !== user.id && pairState.user_b !== user.id) {
      return NextResponse.json({ ok: false, error: "Not a participant" }, { status: 403 });
    }

    if (effectiveAction === "opt_out") {
      // ペア全体を無効化
      await supabase
        .from("coalter_pair_states")
        .update({
          state: "disabled",
          disabled_at: new Date().toISOString(),
          disabled_by: user.id,
        })
        .eq("id", pairState.id);

      // アクティブなセッションも終了
      await supabase
        .from("coalter_sessions")
        .update({ state: "cancelled", ended_at: new Date().toISOString() })
        .eq("pair_state_id", pairState.id)
        .eq("state", "active");

      return NextResponse.json<CoAlterApiResponse>({
        ok: true,
        data: { state: "disabled" },
      });
    }

    // end_session: アクティブ or 完了セッションを終了（両ユーザーからの dismiss 対応）
    const { error } = await supabase
      .from("coalter_sessions")
      .update({ state: "cancelled", ended_at: new Date().toISOString() })
      .eq("pair_state_id", pairState.id)
      .in("state", ["active", "completed"]);

    if (error) {
      console.error("[CoAlter] Failed to end session:", error);
    }

    return NextResponse.json<CoAlterApiResponse>({
      ok: true,
      data: { state: "enabled" },
    });
  } catch (e) {
    console.error("[CoAlter] End error:", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
