/**
 * Plan Anchors API — POST + GET (A-2)
 *
 * - POST /api/plan/anchors    Bundle (source + anchors) を atomic（best-effort）に作成
 * - GET  /api/plan/anchors    自分の sources + anchors を一覧
 *
 * 不変原則:
 *   1. userId は **必ず auth.getUser() から取得**。request body の userId は無視
 *   2. validation は pure 関数 (validateCreateExternalAnchorInput /
 *      validateCreateExternalAnchorSourceInput) を再利用。SoT は lib/plan/
 *   3. RLS は二重防御として有効（Repository の .eq('user_id', userId) と DB Policy）
 *   4. error 形式は culcept 既存慣習 `{ok, data} / {ok, error}` に整合
 *
 * 範囲外:
 *   - delete は [sourceId]/route.ts
 *   - W1-6 passive drift logging
 *   - W1-8 Home 導線
 *   - service_role の使用
 */

import { NextResponse } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";
import { createSupabaseExternalAnchorRepository } from "@/lib/plan/external-anchor-repository-supabase";
import {
  parseJsonBody,
  requireAuthenticatedUser,
} from "@/lib/plan/api-helpers";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/plan/anchors
// body: { source: CreateExternalAnchorSourceInput, anchors: CreateExternalAnchorInput[] }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();

    // 1. auth gate
    const auth = await requireAuthenticatedUser(supabase);
    if (!auth.ok) return auth.response;

    // 2. body parse
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const body = parsed.value;
    if (body === null || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "body must be an object with source + anchors" },
        { status: 400 }
      );
    }

    const obj = body as Record<string, unknown>;
    const source = obj.source;
    const anchors = obj.anchors;

    if (source === undefined || source === null || typeof source !== "object") {
      return NextResponse.json(
        { ok: false, error: "source is required (object)" },
        { status: 400 }
      );
    }
    if (!Array.isArray(anchors)) {
      return NextResponse.json(
        { ok: false, error: "anchors is required (array)" },
        { status: 400 }
      );
    }

    // 3. Repository 呼び出し
    const repo = createSupabaseExternalAnchorRepository(supabase);
    const result = await repo.createSourceWithAnchors(auth.userId, {
      source: source as Parameters<typeof repo.createSourceWithAnchors>[1]["source"],
      anchors: anchors as Parameters<typeof repo.createSourceWithAnchors>[1]["anchors"],
    });

    if (!result.ok) {
      // validation / DB CHECK 違反は 422
      return NextResponse.json(
        { ok: false, error: "validation_error", errors: result.errors },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: { source: result.source, anchors: result.anchors },
    });
  } catch (e) {
    console.error("[Plan/Anchors] POST error:", e);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/plan/anchors
// 自分の sources + anchors（全件）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function GET() {
  try {
    const supabase = await supabaseServer();

    const auth = await requireAuthenticatedUser(supabase);
    if (!auth.ok) return auth.response;

    const repo = createSupabaseExternalAnchorRepository(supabase);
    const [sources, anchors] = await Promise.all([
      repo.listSources(auth.userId),
      repo.listAnchors(auth.userId),
    ]);

    return NextResponse.json({
      ok: true,
      data: { sources, anchors },
    });
  } catch (e) {
    console.error("[Plan/Anchors] GET error:", e);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
