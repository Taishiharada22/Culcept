/**
 * Plan Anchor Items — PATCH /api/plan/anchor-items/[anchorId] (W1-X2)
 *
 * 単一 anchor の「教え直す」を提供する。
 *
 * 設計書: docs/alter-plan-w1x2-edit-anchor-mini-design.md §2, §5
 *
 * URL 設計上の重要原則:
 *   - 既存 /api/plan/anchors/[sourceId] は source 単位削除 (DELETE)
 *   - 本 endpoint /api/plan/anchor-items/[anchorId] は anchor 単位編集 (PATCH)
 *   - **同じ URL pattern で id の意味が method ごとに変わる設計を物理的に回避**
 *
 * 不変原則:
 *   1. auth.getUser() で userId 取得（body / param の userId は信用しない）
 *   2. patch から id / userId / sourceId / anchorKind は **物理 sanitization**
 *   3. user 不一致 / anchor 不在 → 404（情報漏洩防止のため同一視）
 *   4. validation 失敗 → 422 + errors
 *   5. RLS が物理層、明示 .eq('user_id', userId) が application 層、両方発火
 *
 * 範囲外:
 *   - kind 変更 / source 編集 / DELETE on anchor (source 単位削除のみ)
 *   - PUT (全置換は不要、PATCH の merged candidate で十分)
 */

import { NextResponse } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";
import { createSupabaseExternalAnchorRepository } from "@/lib/plan/external-anchor-repository-supabase";
import { requireAuthenticatedUser } from "@/lib/plan/api-helpers";
import { sanitizeAnchorPatch } from "@/lib/plan/anchor-update-validation";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ anchorId: string }> }
) {
  try {
    const supabase = await supabaseServer();

    const auth = await requireAuthenticatedUser(supabase);
    if (!auth.ok) return auth.response;

    const { anchorId } = await ctx.params;
    if (typeof anchorId !== "string" || anchorId.length === 0) {
      return NextResponse.json(
        { ok: false, error: "anchorId is required" },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    // Patch sanitization: id / userId / sourceId / anchorKind は物理削除（attacker への二重防御）
    const sanitized = sanitizeAnchorPatch(body);

    const repo = createSupabaseExternalAnchorRepository(supabase);
    const result = await repo.updateAnchor(auth.userId, anchorId, sanitized);

    if (!result.ok) {
      if (result.kind === "not_found") {
        return NextResponse.json(
          { ok: false, error: "not_found" },
          { status: 404 }
        );
      }
      // invalid
      return NextResponse.json(
        { ok: false, error: "validation_error", errors: result.errors },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: { anchor: result.anchor },
    });
  } catch (e) {
    console.error("[Plan/AnchorItems] PATCH error:", e);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
