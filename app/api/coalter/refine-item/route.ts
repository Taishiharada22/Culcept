/**
 * POST /api/coalter/refine-item — 採用済みプランの局所リファインメント候補生成
 *
 * Phase 1.5.3 ④
 *
 * Body: { itemId: string, direction: RefineDirection }
 * Response: { candidate: RefineCandidate }
 *
 * - 採用済みプランを「direction の方向に少しだけずらした」差し替え候補を 1 件生成
 * - 実際の差し替え（DB 更新）は PATCH /api/coalter/plan 側で行う
 * - 認可: ペアに参加しているユーザーのみ、かつ自分が採用したプランのみ
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  generateRefinedCandidate,
  isRefineDirection,
} from "@/lib/coalter/refineItem";
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
    const { itemId, direction } = body ?? {};

    if (!itemId || typeof itemId !== "string") {
      return NextResponse.json(
        { ok: false, error: "itemId is required" },
        { status: 400 },
      );
    }
    if (!isRefineDirection(direction)) {
      return NextResponse.json(
        { ok: false, error: "invalid direction" },
        { status: 400 },
      );
    }

    // 対象プランを取得 + 所有チェック
    const { data: row, error: fetchError } = await supabase
      .from("coalter_plan_items")
      .select(
        "id, thread_id, title, description, practical_info, time_slot, category, target_date, created_by",
      )
      .eq("id", itemId)
      .single();

    if (fetchError || !row) {
      return NextResponse.json(
        { ok: false, error: "Plan item not found" },
        { status: 404 },
      );
    }

    // 自分が採用した項目だけ refine できる
    if (row.created_by !== user.id) {
      return NextResponse.json(
        { ok: false, error: "You can only refine items you adopted" },
        { status: 403 },
      );
    }

    // ペア参加者かも念のため確認
    const { data: pairState } = await supabase
      .from("coalter_pair_states")
      .select("user_a, user_b")
      .eq("thread_id", row.thread_id)
      .single();

    if (
      !pairState ||
      (pairState.user_a !== user.id && pairState.user_b !== user.id)
    ) {
      return NextResponse.json(
        { ok: false, error: "Not a participant" },
        { status: 403 },
      );
    }

    const candidate = await generateRefinedCandidate({
      userId: user.id,
      direction,
      item: {
        title: row.title as string,
        description: (row.description as string) ?? "",
        practicalInfo: (row.practical_info as string) ?? null,
        timeSlot: (row.time_slot as string) ?? null,
        category: (row.category as string) ?? "other",
        targetDate: row.target_date as string,
      },
    });

    return NextResponse.json<CoAlterApiResponse>({
      ok: true,
      data: { candidate },
    });
  } catch (e) {
    console.error("[CoAlter/RefineItem] error:", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
