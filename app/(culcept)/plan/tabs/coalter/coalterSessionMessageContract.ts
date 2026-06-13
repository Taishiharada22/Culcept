/**
 * coalterSessionMessageContract — /plan CoAlter の **session message** 契約（型/契約 skeleton のみ）
 *
 * 正本: docs/coalter-plan-tab-c1-closeout-message-branch-design.md §5（CEO 承認 2026-06-12）。
 *
 * 位置づけ（CEO clarification）:
 *   - **session message = 共有の会話/イベントログ**（chat body の正本）。
 *     正本は CoAlterPlanSession（`coalterPlanSessionContract.ts`）であり、talk スレッドではない。
 *   - **message ⊥ projection を分離**: private 条件・per-viewer rationale・抽出 slot・
 *     Plan Intelligence 投影は **message body に入れない**（別の projection/condition 構造・将来・未実装）。
 *
 * スコープ（**型/契約 skeleton のみ・additive**）:
 *   - 永続化なし / persistence なし / send なし / runtime binding なし / fetch・API・DB なし。
 *   - fixture が既定のまま（UI 描画不変。本契約は consume 側未配線＝B-1 と同じパターン）。
 *   - **talk スレッド message とは別の型**（混同・複製を型で防ぐ・§「thread 境界」）。
 */

import {
  COALTER_SYSTEM_AUTHOR,
  isCoAlterSystemAuthor,
  type SessionParticipant,
} from "./coalterPlanSessionContract";
import type {
  ChatMessageFixture,
  CoAlterPlanSessionFixture,
} from "./coalterPlanSessionFixture";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Author（**anonymous/unresolved variant を持たない**）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * session message の author。
 *   - `{ kind: "participant"; userId }` … 人間参加者（**resolved な SessionParticipant の userId**）。
 *   - `{ kind: "coalter" }` … system actor（B-1 予約 author `COALTER_SYSTEM_AUTHOR` と同一名前空間）。
 *
 * ★ **anonymous/unresolved variant は存在しない**。T1b の thread-preview 匿名参加者
 *   （`CoAlterChatParticipant` の identityState="unresolved"）は **session message author に
 *   なれない**（型非互換）。「永続 session message は resolved participant author か system author」
 *   を型 + `isResolvedSessionMessageAuthor` で担保。
 */
export type CoAlterSessionMessageAuthor =
  | { readonly kind: "participant"; readonly userId: string }
  | { readonly kind: "coalter" };

/** message 種別: 共有の会話/イベントログ。 */
export type CoAlterSessionMessageKind =
  /** 自由文の会話（人間 or CoAlter） */
  | "chat"
  /** session のイベント（例: 案確定・条件合意。共有テキスト。**構造化 plan state は本文に入れない**） */
  | "system_event";

/**
 * 可視性。**session message は常に shared**（共有の会話/イベントログ）。
 * per-viewer の差分（private 条件・本人向け rationale）は **message ではなく projection** が持つ。
 * この単一値型は「message は共有・per-viewer は別構造」という境界を型で明示するためのもの。
 */
export type CoAlterSessionMessageVisibility = "shared";

/**
 * **projection → message** の参照（id のみ・content を複製しない）。
 * 将来の condition / extracted slot 構造が「この発話が根拠」と message を**引用**する向き。
 * **message → projection の逆向きは持たない**（message body に projection を埋めない）。
 */
export interface CoAlterSessionMessageEvidenceRef {
  readonly messageId: string;
}

/** message のリアクション（共有・同意シグナル・表示のみ。**本文ではない**）。 */
export interface CoAlterSessionMessageReaction {
  readonly emoji: string;
  readonly count: number;
}

/**
 * CoAlterPlanSession の session message（共有会話/イベントログの 1 件）。
 *
 * **body は plain text の共有内容のみ**。以下は **絶対に持たせない**（projection 側の責務）:
 *   private 条件 / per-viewer rationale / 抽出 slot / Plan Intelligence 投影 / viewer 別 payload。
 */
export interface CoAlterSessionMessage {
  readonly id: string;
  /** 所属 session（**thread ではなく session が正本**）。 */
  readonly sessionId: string;
  readonly author: CoAlterSessionMessageAuthor;
  readonly kind: CoAlterSessionMessageKind;
  /** 常に "shared"。per-viewer は projection 側（型で固定）。 */
  readonly visibility: CoAlterSessionMessageVisibility;
  /** 共有される会話/イベント本文（projection を入れない）。 */
  readonly body: string;
  /**
   * 作成時刻。**永続化時は server 由来 ISO 8601**。
   * skeleton/fixture では表示用時刻文字列を暫定的に載せる（永続化は別 GO・本 slice は型のみ）。
   */
  readonly createdAt: string;
  readonly reactions?: readonly CoAlterSessionMessageReaction[];
}

/**
 * 送信前 draft（**型のみ・runtime send なし**）。
 *
 * ★ **author を持たない**。送信主体は **send 時に server session user から stamp** され、
 *   client は sender を主張しない（t1b2 closeout §2.2 / C-1 の self authority 規則）。
 *   id / sessionId / createdAt / author はすべて送信処理（HOLD・将来）が付与する。
 *   draft = ユーザーが打った**内容**のみ。
 */
export interface CoAlterSessionMessageDraft {
  /** ユーザー draft は会話のみ。 */
  readonly kind: "chat";
  readonly body: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Author helpers（pure）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * raw author 文字列（fixture / 旧 chat view の `author`: participant id or "coalter"）→ 構造化 author。
 * "coalter" → system / それ以外 → participant(userId)。
 */
export function toSessionMessageAuthor(rawAuthor: string): CoAlterSessionMessageAuthor {
  return isCoAlterSystemAuthor(rawAuthor)
    ? { kind: "coalter" }
    : { kind: "participant", userId: rawAuthor };
}

/** author が CoAlter system か。 */
export function isCoAlterSessionAuthor(
  author: CoAlterSessionMessageAuthor,
): author is { kind: "coalter" } {
  return author.kind === "coalter";
}

/**
 * **永続 session message の author 妥当性**: system(coalter) か、または **resolved な session
 * participant の userId** であること（anonymous/unresolved や未知 userId を弾く）。
 */
export function isResolvedSessionMessageAuthor(
  author: CoAlterSessionMessageAuthor,
  participants: readonly SessionParticipant[],
): boolean {
  if (author.kind === "coalter") return true;
  return participants.some((p) => p.userId === author.userId);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixture → session message projection（pure・representability の証明用）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** fixture の 1 message → session message（共有 chat・projection を持ち込まない）。 */
export function toSessionMessageFromFixture(
  message: ChatMessageFixture,
  sessionId: string,
): CoAlterSessionMessage {
  return {
    id: message.id,
    sessionId,
    author: toSessionMessageAuthor(message.author),
    kind: "chat",
    visibility: "shared",
    body: message.text,
    // fixture は表示用時刻のみ（ISO は永続化時・別 GO）。捏造の timestamp は作らない。
    createdAt: message.time,
    reactions: message.reaction ? [message.reaction] : undefined,
  };
}

/** fixture session → 共有 session message 列（既存 fixture chat の representability を示す）。 */
export function buildSessionMessagesFromFixture(
  fixture: CoAlterPlanSessionFixture,
): readonly CoAlterSessionMessage[] {
  return fixture.messages.map((m) => toSessionMessageFromFixture(m, fixture.id));
}

/** B-1 予約 author 定数の再公開（session message と participants で同一名前空間を使う）。 */
export { COALTER_SYSTEM_AUTHOR };
