/**
 * Plan Anchors DELETE — DELETE /api/plan/anchors/[sourceId] (A-2)
 *
 * Source 単位の cascade 削除。RLS と application 層の二重防御。
 *
 * 不変原則:
 *   1. auth.getUser() で userId 取得（body / param の userId は信用しない）
 *   2. user 不一致 / source 不在 → どちらも 200 で {deletedSource:false, deletedAnchors:0}
 *      （interface 不変原則: 情報漏洩防止のため両者を区別しない）
 *   3. RLS が物理層、明示 .eq('user_id', userId) が application 層、両方発火
 *
 * Next.js 15 App Router: dynamic params は Promise なので await
 */

import { NextResponse } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";
import { createSupabaseExternalAnchorRepository } from "@/lib/plan/external-anchor-repository-supabase";
import { requireAuthenticatedUser } from "@/lib/plan/api-helpers";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ sourceId: string }> }
) {
  try {
    const supabase = await supabaseServer();

    const auth = await requireAuthenticatedUser(supabase);
    if (!auth.ok) return auth.response;

    const { sourceId } = await ctx.params;
    if (typeof sourceId !== "string" || sourceId.length === 0) {
      return NextResponse.json(
        { ok: false, error: "sourceId is required" },
        { status: 400 }
      );
    }

    const repo = createSupabaseExternalAnchorRepository(supabase);
    const result = await repo.deleteSource(auth.userId, sourceId);

    // 不在 / user 不一致 でも 200 を返す（情報漏洩防止）。
    // caller は result.deletedSource を見て分岐する。
    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (e) {
    console.error("[Plan/Anchors] DELETE error:", e);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
