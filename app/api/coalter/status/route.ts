/**
 * GET /api/coalter/status?threadId=xxx — CoAlterのペア状態を取得（副作用なし）
 *
 * ペアが enabled の場合、アクティブなセッション + 提案カードも返す。
 * これにより、相手が起動した提案を両方のクライアントで表示できる。
 *
 * Phase 6.D (2026-04-19):
 *   `activeCard` (Phase 2 discriminated union) を追加で返すようになった。
 *   CEO 条件:
 *     1) 後方互換優先 — `activeProposal` は維持、`activeCard` は加算
 *     2) source of truth は `metadata.card` — 再合成は fallback のみ
 *     3) mode 非依存で返す — decision/negotiate/clarify そのまま
 *   詳細は `lib/coalter/statusResolver.ts` を参照。
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type {
  CoAlterApiResponse,
  CoAlterCard,
  ProposalCard,
} from "@/lib/coalter/types";
import { resolveActiveFromMetadata } from "@/lib/coalter/statusResolver";

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

    // ── enabled の場合、アクティブなセッション + 提案カード/Card を探す ──
    let activeProposal: ProposalCard | null = null;
    let activeCard: CoAlterCard | null = null;
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
        // セッションの最新 coalter message の metadata を取得
        const { data: msg } = await supabase
          .from("coalter_messages")
          .select("metadata")
          .eq("session_id", session.id)
          .eq("role", "coalter")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        // Phase 6.D: resolver 一本化。mode 非依存で decoded。
        const resolved = resolveActiveFromMetadata(
          (msg?.metadata ?? null) as
            | Parameters<typeof resolveActiveFromMetadata>[0]
            | null,
        );
        activeProposal = resolved.activeProposal;
        activeCard = resolved.activeCard;
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
        // Phase 6.D: Phase 2 discriminated union（decision/negotiate/clarify）
        activeCard,
      },
    });
  } catch (e) {
    console.error("[CoAlter] Status error:", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
