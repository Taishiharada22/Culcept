/**
 * C5-E: CoAlter **非永続 brain preview** handler（**read-only・DB write なし・保存なし**）
 *
 * 設計正本: docs/coalter-c5-implementation-preflight.md（§5 E 採用）。
 *
 * 役割: session の participant message を user-RLS で read し、**server 側で** C4 brain core
 *   （`buildCoAlterBrainPreview`）で CoAlter preview を生成して返す。**DB に保存しない**。
 *
 * 不変:
 *   - **gate**（`planCoAlterBrainPreviewEnabled()`・OFF→404）。
 *   - **保存しない**: insert/update/delete なし・`author_kind='coalter'` の DB 書込なし・new policy/migration なし。
 *   - body は **server 生成のみ**（brain）。client から CoAlter body / author を受け取らない（GET・body 無し）。
 *   - read は store.listSessionMessages（DB RLS が member 判定・非 participant は空＝preview insufficient）。
 *   - service_role/SECURITY DEFINER なし・realtime/send/`/talk` mutation なし。
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { planCoAlterBrainPreviewEnabled } from "@/lib/plan/featureFlags";
import { createDbBackedSessionMessageStore } from "@/app/(culcept)/plan/tabs/coalter/coalterSessionMessageStore";
import { createSupabaseSessionMessagePort } from "./coalterSessionMessageSupabasePort";
import { buildCoAlterBrainPreview } from "@/lib/coalter/preview/brainPreviewCore";

export interface CoAlterPreviewDeps {
  readonly supabase: SupabaseClient;
}

/**
 * GET /api/coalter/sessions/:sessionId/preview の本体（read-only・非永続）。
 *   gate OFF→404 / 未認証→401 / member は participant messages から **server 生成 preview**（保存なし）。
 */
export async function handleCoAlterPreview(
  sessionId: string,
  deps: CoAlterPreviewDeps,
): Promise<NextResponse> {
  if (!planCoAlterBrainPreviewEnabled()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const {
    data: { user },
  } = await deps.supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  // read（user-RLS）: 非 participant は空 → preview は insufficient（他 session の preview を取れない）。
  const store = createDbBackedSessionMessageStore(createSupabaseSessionMessagePort(deps.supabase));
  const messages = await store.listSessionMessages(sessionId);
  // ★ server 生成・**保存しない**（返すだけ）。client は body を渡せない（GET）。
  const result = buildCoAlterBrainPreview(messages);
  return NextResponse.json({ ok: true, ...result }, { status: 200 });
}
