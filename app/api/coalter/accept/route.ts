/**
 * POST /api/coalter/accept — CoAlterの同意を受理する
 *
 * pending_consent → enabled に遷移
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { AcceptRequest, CoAlterApiResponse } from "@/lib/coalter/types";

export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as AcceptRequest;
    const { threadId } = body;

    if (!threadId) {
      return NextResponse.json({ ok: false, error: "threadId is required" }, { status: 400 });
    }

    // ペア状態を取得
    const { data: pairState } = await supabase
      .from("coalter_pair_states")
      .select("id, state, initiated_by, user_a, user_b")
      .eq("thread_id", threadId)
      .single();

    if (!pairState) {
      return NextResponse.json({ ok: false, error: "No pending CoAlter request" }, { status: 404 });
    }

    // 参加者であることを確認
    if (pairState.user_a !== user.id && pairState.user_b !== user.id) {
      return NextResponse.json({ ok: false, error: "Not a participant" }, { status: 403 });
    }

    // 起動者自身が accept するのは不正（相手の同意が必要）
    if (pairState.initiated_by === user.id) {
      return NextResponse.json(
        { ok: false, error: "Cannot accept own request" },
        { status: 400 },
      );
    }

    if (pairState.state !== "pending_consent") {
      return NextResponse.json<CoAlterApiResponse>({
        ok: true,
        data: { pairStateId: pairState.id, state: pairState.state },
      });
    }

    // enabled に更新
    const { error } = await supabase
      .from("coalter_pair_states")
      .update({
        state: "enabled",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", pairState.id);

    if (error) {
      console.error("[CoAlter] Failed to accept:", error);
      return NextResponse.json({ ok: false, error: "Failed to accept" }, { status: 500 });
    }

    return NextResponse.json<CoAlterApiResponse>({
      ok: true,
      data: { pairStateId: pairState.id, state: "enabled" },
    });
  } catch (e) {
    console.error("[CoAlter] Accept error:", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
