/**
 * POST /api/coalter/activate — CoAlterを有効化する（同意リクエスト発行）
 *
 * 初回: pending_consent を作成し、相手に通知
 * 既に enabled: そのまま返す
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { COALTER_FLAGS } from "@/lib/coalter/flags";
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
        // 即 enabled に昇格
        await supabase
          .from("coalter_pair_states")
          .update({ state: "enabled", accepted_at: new Date().toISOString() })
          .eq("id", existing.id);
        return NextResponse.json<CoAlterApiResponse>({
          ok: true,
          data: { pairStateId: existing.id, state: "enabled" },
        });
      }
      // disabled → 即 enabled
      await supabase
        .from("coalter_pair_states")
        .update({
          state: "enabled",
          initiated_by: user.id,
          accepted_at: new Date().toISOString(),
          disabled_at: null,
          disabled_by: null,
        })
        .eq("id", existing.id);

      return NextResponse.json<CoAlterApiResponse>({
        ok: true,
        data: { pairStateId: existing.id, state: "enabled" },
      });
    }

    // 新規作成 — 即 enabled（同意フロー不要）
    //
    // [M1 C3] flag ON のときだけ onboarded_at を stamp する。
    //   - 旧ペア (migration 前) の onboarded_at は null のまま残すのが契約。
    //     新規 activate パスに限定することで「旧ペア再 activate で stamp」の
    //     取り違えを避ける（= "最初の activate" の意味を壊さない）。
    //   - flag OFF のときは column に触れないので従来 insert と完全一致。
    const nowIso = new Date().toISOString();
    const insertRow: Record<string, unknown> = {
      thread_id: threadId,
      thread_type: "talk",
      user_a: userA,
      user_b: userB,
      state: "enabled",
      initiated_by: user.id,
      accepted_at: nowIso,
    };
    if (COALTER_FLAGS.pairOnboardingEnabled) {
      insertRow.onboarded_at = nowIso;
    }

    const { data: created, error } = await supabase
      .from("coalter_pair_states")
      .insert(insertRow)
      .select("id")
      .single();

    if (error) {
      console.error("[CoAlter] Failed to create pair state:", error);
      return NextResponse.json({ ok: false, error: "Failed to activate" }, { status: 500 });
    }

    // [M1 C3] fairness ledger seed row (bias_score=0)
    //   - **session_id IS NULL = onboarding seed** の唯一の発生源。
    //     これ以外の insert (engine.ts 内) は必ず有効な session.id を入れる。
    //   - 集計系は既定で `WHERE session_id IS NOT NULL` を付けて seed を除外する。
    //     意図的に含めたい場合のみコメントで明示して残す運用。
    //   - session_id は migration で nullable 化済み。
    //   - 失敗しても activate 自体は成功扱い（fail-open、ledger は内部計測）。
    if (COALTER_FLAGS.pairOnboardingEnabled) {
      const { error: seedError } = await supabase.from("coalter_fairness_ledger").insert({
        pair_state_id: created.id,
        session_id: null,
        bias_score: 0,
        decided_at: nowIso,
      });
      if (seedError) {
        console.error("[CoAlter] Fairness ledger seed failed (fail-open):", seedError);
      }
    }

    return NextResponse.json<CoAlterApiResponse>({
      ok: true,
      data: { pairStateId: created.id, state: "enabled" },
    });
  } catch (e) {
    console.error("[CoAlter] Activate error:", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
