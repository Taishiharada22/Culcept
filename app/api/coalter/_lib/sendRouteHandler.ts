/**
 * CoAlter local-only human send — route handler 本体（route.ts から呼ばれる pure-ish handler）
 *
 * 正本: docs/coalter-send-route-preflight.md（CEO GO 2026-06-13 local-only persistence/send bundle）。
 *
 * 不変:
 *   - **local-only gate**（`planCoAlterSendLocalEnabled()`・OFF なら 404）。
 *   - **server が auth user を確定**（`auth.getUser()`）→ author を server stamp（client は author を出せない）。
 *   - body は `{ body, clientMessageId? }` のみ。**author/userId/source を受け取らない**（送れば 400）。
 *   - membership は store/adapter が確認 + **DB RLS が最終ゲート**。
 *   - idempotency: 同一 clientMessageId は既存 message を返す（重複作らない）。
 *   - **system/CoAlter 送信なし・read receipt/realtime/typing なし・`/talk` mutation なし・service_role なし**。
 *
 * route.ts（app/api/coalter/sessions/[sessionId]/messages/route.ts）は本 handler に
 * `supabaseServer()` を注入するだけ（薄い wrapper）。本 handler は注入された client でテスト可能。
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { planCoAlterSendLocalEnabled } from "@/lib/plan/featureFlags";
import { stampServerAuthContext } from "@/app/(culcept)/plan/tabs/coalter/coalterSessionMessageRepository";
import { createDbBackedSessionMessageStore } from "@/app/(culcept)/plan/tabs/coalter/coalterSessionMessageStore";
import { createSupabaseSessionMessagePort } from "./coalterSessionMessageSupabasePort";

/** body に現れたら 400 にする「client が authority を主張する」キー群。 */
const FORBIDDEN_BODY_KEYS = [
  "author",
  "authorContext",
  "author_user_id",
  "authorUserId",
  "userId",
  "user_id",
  "sender",
  "senderId",
  "sender_id",
  "source",
] as const;

export interface CoAlterSendDeps {
  readonly supabase: SupabaseClient;
}

/**
 * GET /api/coalter/sessions/:sessionId/messages の本体（read・user-RLS）。
 *   - local-only gate（OFF→404）→ auth.getUser（無→401）→ store.listSessionMessages。
 *   - **RLS が読める message のみ**返す（非 member は空＝fail-closed・membership は DB が判定）。
 *   - read receipt を付けない・`/talk` を触らない・realtime なし。
 */
export async function handleCoAlterList(
  sessionId: string,
  deps: CoAlterSendDeps,
): Promise<NextResponse> {
  if (!planCoAlterSendLocalEnabled()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const {
    data: { user },
  } = await deps.supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const store = createDbBackedSessionMessageStore(
    createSupabaseSessionMessagePort(deps.supabase),
  );
  const messages = await store.listSessionMessages(sessionId);
  return NextResponse.json({ ok: true, messages }, { status: 200 });
}

/**
 * POST /api/coalter/sessions/:sessionId/messages の本体。
 * deps.supabase = user-RLS server client（route.ts が `supabaseServer()` を注入）。
 */
export async function handleCoAlterSend(
  req: Request,
  sessionId: string,
  deps: CoAlterSendDeps,
): Promise<NextResponse> {
  // 1) local-only gate
  if (!planCoAlterSendLocalEnabled()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const { supabase } = deps;

  // 2) server-side auth（authority の唯一の源）
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 3) body parse
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof raw !== "object" || raw === null) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const b = raw as Record<string, unknown>;

  // 4) client は sender authority を提供できない（author/userId/source を送れば 400）
  for (const k of FORBIDDEN_BODY_KEYS) {
    if (k in b) {
      return NextResponse.json(
        { ok: false, error: "author_not_allowed", field: k },
        { status: 400 },
      );
    }
  }

  const text = typeof b.body === "string" ? b.body : null;
  if (text === null) {
    return NextResponse.json({ ok: false, error: "body_required" }, { status: 400 });
  }
  const clientMessageId =
    typeof b.clientMessageId === "string" ? b.clientMessageId : undefined;

  // 5) append（author は server stamp・membership は store + DB RLS が確認）
  const store = createDbBackedSessionMessageStore(
    createSupabaseSessionMessagePort(supabase),
  );
  const result = await store.appendParticipantMessage({
    sessionId,
    draft: { kind: "chat", body: text },
    authorContext: stampServerAuthContext(user.id),
    clientMessageId,
  });

  // 6) AppendResult → HTTP
  if (!result.ok) {
    const status =
      result.reason === "session_not_found"
        ? 404
        : result.reason === "not_a_participant"
          ? 403
          : 422; // empty_body
    return NextResponse.json({ ok: false, error: result.reason }, { status });
  }

  return NextResponse.json({ ok: true, message: result.message }, { status: 201 });
}
