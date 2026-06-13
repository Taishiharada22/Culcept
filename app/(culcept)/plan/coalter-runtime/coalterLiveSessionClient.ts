/**
 * coalterLiveSessionClient — CoAlter 本文の **live read/send クライアント**（pure 関数）
 *
 * 配置: `tabs/coalter/`（UI tab folder）は backend-free guard 維持のため、`/api/coalter` を叩く
 *   coupling は **ここ（runtime）に隔離**する（port/handler を `app/api/coalter/_lib/` に出したのと同型）。
 *
 * 制約（CEO local-only bundle 2026-06-13）:
 *   - read = GET /api/coalter/sessions/:id/messages（user-RLS）。send = POST 同 route。
 *   - **body は {body, clientMessageId} のみ**。author/userId/source を送らない（server stamp）。
 *   - thread 非依存・`/talk` 不触・read receipt/realtime/typing なし。
 *   - 失敗（401/404/その他）は fail-closed（呼び出し側が fixture へ戻す）。
 */

import type { CoAlterSessionMessage } from "@/app/(culcept)/plan/tabs/coalter/coalterSessionMessageContract";
import type { SessionParticipant } from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionContract";

/** UI 側 live 状態。 */
export type LiveSessionState = "off" | "loading" | "live" | "unavailable";

export type LiveFetchResult =
  | { readonly ok: true; readonly messages: readonly CoAlterSessionMessage[] }
  | { readonly ok: false; readonly status: number | null };

export type LiveSendResult =
  | { readonly ok: true; readonly message: CoAlterSessionMessage }
  | { readonly ok: false; readonly status: number | null };

function messagesUrl(sessionId: string): string {
  return `/api/coalter/sessions/${encodeURIComponent(sessionId)}/messages`;
}

/**
 * session messages を **GET ちょうど 1 回**読む（user-RLS・非 member は空配列で返る想定）。
 * fetchImpl は test 注入用（既定は global fetch・same-origin cookie で認証）。
 */
export async function fetchLiveSessionMessagesOnce(
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LiveFetchResult> {
  try {
    const res = await fetchImpl(messagesUrl(sessionId), {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!res.ok) return { ok: false, status: res.status };
    const json = (await res.json()) as { ok?: boolean; messages?: CoAlterSessionMessage[] };
    if (!json.ok || !Array.isArray(json.messages)) return { ok: false, status: res.status };
    return { ok: true, messages: json.messages };
  } catch {
    return { ok: false, status: null };
  }
}

/**
 * participant message を送信（**POST body は {body, clientMessageId} のみ**）。
 * author は server が stamp する＝client は author/userId/source を送らない。
 * 201 = 新規 or idempotent 既存返し。失敗は status 付きで返す（fail-closed）。
 */
export async function postLiveSessionMessageOnce(
  sessionId: string,
  input: { readonly body: string; readonly clientMessageId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<LiveSendResult> {
  try {
    const res = await fetchImpl(messagesUrl(sessionId), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      // ★ body は内容と冪等トークンのみ（author authority を client から送らない）
      body: JSON.stringify({ body: input.body, clientMessageId: input.clientMessageId }),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const json = (await res.json()) as { ok?: boolean; message?: CoAlterSessionMessage };
    if (!json.ok || !json.message) return { ok: false, status: res.status };
    return { ok: true, message: json.message };
  } catch {
    return { ok: false, status: null };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// body 選択（pure・fixture ⇄ live の決定を unit-test 可能にする）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CoAlterBodySelection {
  readonly messages: readonly CoAlterSessionMessage[];
  readonly participants: readonly SessionParticipant[];
  readonly isLive: boolean;
}

/**
 * 本文を fixture か live のどちらから描画するか決める。
 * **live は `state==="live"` のときだけ**（off/loading/unavailable は fixture へ fail-closed）。
 */
export function selectCoAlterBody(args: {
  readonly liveState: LiveSessionState;
  readonly liveMessages: readonly CoAlterSessionMessage[];
  readonly liveParticipants: readonly SessionParticipant[];
  readonly fixtureMessages: readonly CoAlterSessionMessage[];
  readonly fixtureParticipants: readonly SessionParticipant[];
}): CoAlterBodySelection {
  if (args.liveState === "live") {
    return { messages: args.liveMessages, participants: args.liveParticipants, isLive: true };
  }
  return { messages: args.fixtureMessages, participants: args.fixtureParticipants, isLive: false };
}

/**
 * live 表示用の participants を組む（**raw userId を表示に出さない**）。
 * - relation bound（C-1）があればその resolved participants（self「あなた」+ counterpart）。
 * - なければ viewer 自身のみ（self ラベル）。未解決 author は panel が中立ラベルにフォールバック。
 */
export function buildLiveParticipants(
  viewerUserId: string | null | undefined,
  relationParticipants: readonly SessionParticipant[] | null,
): readonly SessionParticipant[] {
  if (relationParticipants && relationParticipants.length > 0) return relationParticipants;
  if (viewerUserId) {
    return [
      {
        userId: viewerUserId,
        source: { kind: "self", userId: viewerUserId },
        displayName: "あなた",
        initial: "あ",
        tone: "sky",
      },
    ];
  }
  return [];
}
