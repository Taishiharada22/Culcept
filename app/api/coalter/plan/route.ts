/**
 * CoAlter Plan Shelf API
 *
 * GET  /api/coalter/plan?threadId=xxx&date=2026-04-17 — Plan Shelf一覧取得
 * POST /api/coalter/plan — 候補を採用（Plan Shelfに追加）
 * DELETE /api/coalter/plan?itemId=xxx — Plan Shelfからアイテム削除
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { addPlanItem, getPlanItems, removePlanItem } from "@/lib/coalter/planShelf";
import type { CoAlterApiResponse } from "@/lib/coalter/types";

export async function GET(request: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("threadId");
    const date = searchParams.get("date") ?? undefined;

    if (!threadId) {
      return NextResponse.json({ ok: false, error: "threadId is required" }, { status: 400 });
    }

    const items = await getPlanItems(supabase, threadId, date);

    return NextResponse.json<CoAlterApiResponse>({
      ok: true,
      data: { items },
    });
  } catch (e) {
    console.error("[CoAlter/Plan] GET error:", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { threadId, sessionId, targetDate, timeSlot, title, description, practicalInfo, url, category, alternatives } = body;

    if (!threadId || !sessionId || !targetDate || !title) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    // alternatives バリデーション（Phase 1.5.3 ②）
    // 要素の shape を最低限チェック。異常値は null に落として本体採用を壊さない
    let safeAlternatives: Array<{ title: string; oneLiner: string; practicalInfo?: string | null; url?: string | null }> | null = null;
    if (Array.isArray(alternatives)) {
      safeAlternatives = alternatives
        .filter((a: unknown): a is { title: string; oneLiner: string } =>
          typeof a === "object" && a !== null &&
          typeof (a as { title?: unknown }).title === "string" &&
          typeof (a as { oneLiner?: unknown }).oneLiner === "string",
        )
        .slice(0, 4) // 最大4件（rank 2〜5）
        .map((a) => ({
          title: (a as { title: string }).title,
          oneLiner: (a as { oneLiner: string }).oneLiner,
          practicalInfo: ((a as { practicalInfo?: string | null }).practicalInfo) ?? null,
          url: ((a as { url?: string | null }).url) ?? null,
        }));
      if (safeAlternatives.length === 0) safeAlternatives = null;
    }

    const item = await addPlanItem(supabase, {
      threadId,
      sessionId,
      targetDate,
      timeSlot: timeSlot ?? null,
      title,
      description: description ?? "",
      practicalInfo: practicalInfo ?? null,
      url: url ?? null,
      category: category ?? "other",
      createdBy: user.id,
      alternatives: safeAlternatives,
    });

    if (!item) {
      return NextResponse.json({ ok: false, error: "Failed to add plan item" }, { status: 500 });
    }

    return NextResponse.json<CoAlterApiResponse>({
      ok: true,
      data: { item },
    });
  } catch (e) {
    console.error("[CoAlter/Plan] POST error:", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("itemId");

    if (!itemId) {
      return NextResponse.json({ ok: false, error: "itemId is required" }, { status: 400 });
    }

    const success = await removePlanItem(supabase, itemId);

    return NextResponse.json<CoAlterApiResponse>({
      ok: true,
      data: { deleted: success },
    });
  } catch (e) {
    console.error("[CoAlter/Plan] DELETE error:", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
