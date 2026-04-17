/**
 * POST /api/coalter/plan/narrative — 2人にとってのコンテキスト narrative 生成＋保存
 *
 * Phase 1.5.3 ⑤
 *
 * Body: { itemId }
 * Response: { item: PlanItem }（narrative 付き）
 *
 * 挙動:
 *  - 対象プランが既に pair_narrative を持つ → LLM を呼ばずそのまま返す
 *  - 持たない → ペア両者のプロフィールをロードして LLM で生成 → DB 保存
 *
 * 認可:
 *  - 呼び出し者はペア（user_a / user_b）のどちらかであること
 *  - どちらのユーザーからも生成できる（narrative は 2 人共通のキャッシュ）
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { setPairNarrative } from "@/lib/coalter/planShelf";
import { loadCoAlterProfile } from "@/lib/coalter/profileLoader";
import { generatePairContextNarrative } from "@/lib/coalter/pairContextNarrative";
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
    const { itemId } = body ?? {};

    if (!itemId || typeof itemId !== "string") {
      return NextResponse.json({ ok: false, error: "itemId is required" }, { status: 400 });
    }

    // 対象プランを取得
    const { data: row } = await supabase
      .from("coalter_plan_items")
      .select("*")
      .eq("id", itemId)
      .single();

    if (!row) {
      return NextResponse.json({ ok: false, error: "Plan item not found" }, { status: 404 });
    }

    // ペア参加者確認
    const { data: pairState } = await supabase
      .from("coalter_pair_states")
      .select("user_a, user_b")
      .eq("thread_id", row.thread_id)
      .single();

    if (
      !pairState ||
      (pairState.user_a !== user.id && pairState.user_b !== user.id)
    ) {
      return NextResponse.json({ ok: false, error: "Not a participant" }, { status: 403 });
    }

    // 既にキャッシュあり → LLM 呼ばずそのまま返す
    const cached =
      typeof row.pair_narrative === "string" && row.pair_narrative.trim().length > 0
        ? row.pair_narrative
        : null;

    if (cached) {
      return NextResponse.json<CoAlterApiResponse>({
        ok: true,
        data: {
          item: {
            id: row.id,
            threadId: row.thread_id,
            sessionId: row.session_id,
            targetDate: row.target_date,
            timeSlot: row.time_slot ?? null,
            title: row.title,
            description: row.description,
            practicalInfo: row.practical_info ?? null,
            url: row.url ?? null,
            category: row.category,
            sortOrder: row.sort_order,
            createdBy: row.created_by,
            createdAt: row.created_at,
            isExpired: false,
            alternatives: Array.isArray(row.alternatives) ? row.alternatives : null,
            pairNarrative: cached,
          },
          cached: true,
        },
      });
    }

    // 双方のプロフィールをロード
    const [profileA, profileB] = await Promise.all([
      loadCoAlterProfile(supabase, pairState.user_a),
      loadCoAlterProfile(supabase, pairState.user_b),
    ]);

    // LLM で narrative 生成
    const result = await generatePairContextNarrative({
      userId: user.id,
      item: {
        title: row.title,
        description: row.description ?? "",
        practicalInfo: row.practical_info ?? null,
        category: row.category ?? "other",
        targetDate: row.target_date,
      },
      profileA,
      profileB,
    });

    // DB に保存
    const updated = await setPairNarrative(supabase, itemId, result.narrative);
    if (!updated) {
      return NextResponse.json({ ok: false, error: "Failed to persist narrative" }, { status: 500 });
    }

    return NextResponse.json<CoAlterApiResponse>({
      ok: true,
      data: { item: updated, cached: false },
    });
  } catch (e) {
    console.error("[CoAlter/Plan/Narrative] error:", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
