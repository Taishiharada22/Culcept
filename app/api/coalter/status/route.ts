/**
 * GET /api/coalter/status?threadId=xxx — CoAlterのペア状態を取得（副作用なし）
 *
 * ペアが enabled の場合、アクティブなセッション + 提案カードも返す。
 * これにより、相手が起動した提案を両方のクライアントで表示できる。
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { CoAlterApiResponse, ProposalCard } from "@/lib/coalter/types";

export async function GET(request: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("threadId");

    if (!threadId) {
      return NextResponse.json({ ok: false, error: "threadId is required" }, { status: 400 });
    }

    const { data: pairState } = await supabase
      .from("coalter_pair_states")
      .select("id, state, initiated_by, user_a, user_b")
      .eq("thread_id", threadId)
      .single();

    if (!pairState) {
      return NextResponse.json<CoAlterApiResponse>({
        ok: true,
        data: { state: "inactive", pairStateId: null, initiatedBy: null },
      });
    }

    // ── enabled の場合、アクティブなセッション + 提案カードを探す ──
    let activeProposal: ProposalCard | null = null;
    let activeSessionId: string | null = null;

    if (pairState.state === "enabled") {
      // 最新のアクティブ or 完了セッションを取得（cancelled 以外）
      const { data: session } = await supabase
        .from("coalter_sessions")
        .select("id, state")
        .eq("pair_state_id", pairState.id)
        .in("state", ["active", "completed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (session) {
        activeSessionId = session.id;
        // セッションの提案カードを取得
        const { data: msg } = await supabase
          .from("coalter_messages")
          .select("metadata")
          .eq("session_id", session.id)
          .eq("role", "coalter")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (msg?.metadata?.proposalCard) {
          activeProposal = msg.metadata.proposalCard as ProposalCard;
        }
      }
    }

    return NextResponse.json<CoAlterApiResponse>({
      ok: true,
      data: {
        state: pairState.state,
        pairStateId: pairState.id,
        initiatedBy: pairState.initiated_by,
        isInitiator: pairState.initiated_by === user.id,
        // 提案カード（両方のクライアントで表示するため）
        activeSessionId,
        activeProposal,
      },
    });
  } catch (e) {
    console.error("[CoAlter] Status error:", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
