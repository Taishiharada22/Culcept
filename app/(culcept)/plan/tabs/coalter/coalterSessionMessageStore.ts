/**
 * coalterSessionMessageStore — DB-backed session message **adapter skeleton**
 *   （injected port に対する実装・**実 Supabase / route / fetch なし**）
 *
 * 正本: docs/coalter-plan-session-message-schema-rls-design.md
 *      + docs/sql-drafts/20260613120000_plan_coalter_session_messages_DRAFT.sql（local smoke 済）。
 *
 * 位置づけ:
 *   - pure 同期契約 `CoAlterSessionMessageRepository`（coalterSessionMessageRepository.ts）は
 *     **そのまま保持**（in-memory harness 用）。本ファイルは **async な DB-facing 版**を追加する。
 *   - DB I/O は **`SessionMessageDbPort`（最小 injected interface）**越しにのみ行う。
 *     **Supabase client を import しない**・route/server action なし・実 fetch なし・生成型不要。
 *     具象 port（Supabase 実装）は別 GO（実 send/write は HARD GATE）。
 *
 * 不変（schema/RLS 設計と 1:1）:
 *   - send authority: draft は author を持たない。author は **server-stamped `authorContext`** から。
 *     adapter は row.author_user_id に **authorContext の id のみ**を入れる（client 詐称不可・boundary 担保）。
 *   - membership は port 経由で確認し repository rejection に写像（DB RLS が最終ゲート・adapter は fail-fast）。
 *   - **system/CoAlter append は HOLD**（port に特権 insert を持たせない・本 adapter は実書き込みをしない）。
 *   - message body は共有テキストのみ（projection/private/slot 列を持ち込まない）。
 *   - thread/pair 非依存（threadId/pairStateId を入出力に持たない）。
 */

import type {
  CoAlterSessionMessage,
  CoAlterSessionMessageDraft,
  CoAlterSessionMessageKind,
} from "./coalterSessionMessageContract";
import type {
  AppendRejectionReason,
  AppendResult,
  AppendSystemMessageInput,
  ServerStampedAuthorContext,
} from "./coalterSessionMessageRepository";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DB row 形（snake_case・migration draft の列に対応）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** plan_coalter_session_messages の 1 行（読み出し）。**projection 列を持たない**（schema と一致）。 */
export interface SessionMessageRow {
  readonly id: string;
  readonly session_id: string;
  readonly author_kind: "participant" | "coalter";
  /** participant のみ非 null・coalter は null（DB CHECK と一致）。 */
  readonly author_user_id: string | null;
  readonly kind: CoAlterSessionMessageKind;
  readonly visibility: "shared";
  readonly body: string;
  readonly client_message_id: string | null;
  readonly created_at: string;
}

/** participant message の insert payload（**author_user_id は server-stamped 値のみ**）。 */
export interface NewParticipantMessageRow {
  readonly session_id: string;
  readonly author_kind: "participant";
  readonly author_user_id: string;
  readonly kind: CoAlterSessionMessageKind;
  readonly visibility: "shared";
  readonly body: string;
  readonly client_message_id: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 最小 DB port（Supabase 非依存・具象は別 GO）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * adapter が依存する **最小 DB interface**。Supabase 型を一切露出しない。
 *
 * - `fetchParticipantUserIds`: 当該 session の participant user id 群。**session 不在は null**。
 *   （実装は RLS 下の membership 読み。co-participant 可視化の RLS 戦略は schema 設計の open question。）
 * - `fetchSessionMessageRows`: 当該 session の message 行（RLS 済み想定）。
 * - `insertParticipantMessageRow`: participant message を 1 行 insert。
 *   idempotency 衝突（同一 session_id,author_user_id,client_message_id）時は **既存行を返し `deduped:true`**。
 *
 * ★ **system/CoAlter insert メソッドは存在しない**（特権 write HOLD を port 形で固定）。
 */
export interface SessionMessageDbPort {
  fetchParticipantUserIds(sessionId: string): Promise<readonly string[] | null>;
  fetchSessionMessageRows(sessionId: string): Promise<readonly SessionMessageRow[]>;
  insertParticipantMessageRow(
    row: NewParticipantMessageRow,
  ): Promise<{ readonly row: SessionMessageRow; readonly deduped: boolean }>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// async DB-facing store 契約（同期 repository を壊さず追加）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** participant append の入力（draft+authorContext は同期契約と同型・idempotency key を additive に追加）。 */
export interface AppendParticipantMessageDbInput {
  readonly sessionId: string;
  /** author を持たない（client は sender を主張しない）。 */
  readonly draft: CoAlterSessionMessageDraft;
  /** server-stamped 送信主体（author の唯一の源）。 */
  readonly authorContext: ServerStampedAuthorContext;
  /** idempotency トークン（retry/二重送信吸収・任意）。 */
  readonly clientMessageId?: string;
}

/** DB-facing な async store（同期 `CoAlterSessionMessageRepository` の async 対応版）。 */
export interface CoAlterSessionMessageStore {
  listSessionMessages(sessionId: string): Promise<readonly CoAlterSessionMessage[]>;
  appendParticipantMessage(
    input: AppendParticipantMessageDbInput,
  ): Promise<AppendResult>;
  /** **HOLD**: system/CoAlter 書き込みは未実装（特権経路は CEO GO 待ち）。常に throw。 */
  appendSystemMessage(input: AppendSystemMessageInput): Promise<AppendResult>;
}

/** system/CoAlter append が HOLD であることを示す error message（実書き込みをしない印）。 */
export const SYSTEM_APPEND_HOLD_MESSAGE =
  "CoAlter system/coalter append is HOLD: privileged write path (service_role / SECURITY DEFINER) is not implemented and requires explicit CEO GO.";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// row → view 写像（pure）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * DB row → `CoAlterSessionMessage`。**body は共有テキストのみ**（row に projection 列がない）。
 * reactions は MVP schema に列がないため付さない（型は optional・schema と一致）。
 */
export function rowToSessionMessage(row: SessionMessageRow): CoAlterSessionMessage {
  const author =
    row.author_kind === "coalter"
      ? ({ kind: "coalter" } as const)
      : (() => {
          if (row.author_user_id === null) {
            // DB CHECK が防ぐが、念のため（participant なのに author 不在＝壊れ行）。
            throw new Error("corrupt row: participant message without author_user_id");
          }
          return { kind: "participant", userId: row.author_user_id } as const;
        })();
  return {
    id: row.id,
    sessionId: row.session_id,
    author,
    kind: row.kind,
    visibility: "shared",
    body: row.body,
    createdAt: row.created_at,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// factory（injected port のみに依存）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function reject(reason: AppendRejectionReason): AppendResult {
  return { ok: false, reason };
}

/**
 * DB-backed store を minimal port から組み立てる（**実 Supabase 非依存**）。
 * 具象 port は別 GO（実 send/write は HARD GATE）。テストは fake port のみで通す。
 */
export function createDbBackedSessionMessageStore(
  port: SessionMessageDbPort,
): CoAlterSessionMessageStore {
  return {
    async listSessionMessages(sessionId) {
      const rows = await port.fetchSessionMessageRows(sessionId);
      return rows.map(rowToSessionMessage);
    },

    async appendParticipantMessage(input) {
      const memberIds = await port.fetchParticipantUserIds(input.sessionId);
      if (memberIds === null) return reject("session_not_found");
      if (input.draft.body.trim() === "") return reject("empty_body");
      // ★ author は server-stamped context のみ（draft からではない・詐称不可）。
      const userId = input.authorContext.authenticatedUserId;
      if (!memberIds.includes(userId)) return reject("not_a_participant");
      const { row } = await port.insertParticipantMessageRow({
        session_id: input.sessionId,
        author_kind: "participant",
        author_user_id: userId,
        kind: input.draft.kind,
        visibility: "shared",
        body: input.draft.body,
        client_message_id: input.clientMessageId ?? null,
      });
      return { ok: true, message: rowToSessionMessage(row) };
    },

    async appendSystemMessage(_input) {
      // HOLD: 特権 write を行わない（port にも system insert は無い）。
      throw new Error(SYSTEM_APPEND_HOLD_MESSAGE);
    },
  };
}
