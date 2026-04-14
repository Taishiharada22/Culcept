/**
 * GET /api/coalter/status?threadId=xxx — CoAlterのペア状態を取得（副作用なし）
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { CoAlterApiResponse } from "@/lib/coalter/types";

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

    return NextResponse.json<CoAlterApiResponse>({
      ok: true,
      data: {
        state: pairState.state,
        pairStateId: pairState.id,
        initiatedBy: pairState.initiated_by,
        isInitiator: pairState.initiated_by === user.id,
      },
    });
  } catch (e) {
    console.error("[CoAlter] Status error:", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
