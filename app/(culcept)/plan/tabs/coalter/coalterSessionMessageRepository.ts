/**
 * coalterSessionMessageRepository — /plan CoAlter session message **repository 契約**（pure 型/interface のみ）
 *
 * 正本: docs/coalter-ui-track-closeout-persistence-preflight.md §6-1（CEO 承認 2026-06-12）。
 *
 * 目的（§6-1）: 「/plan は自前の participant/session-rooted session message store を持つ」方針の
 *   **抽象境界**を pure な型/interface として先に固定する。**実 DB / Supabase / migration / route /
 *   fetch / send 実装は含まない**（別 GO）。具象は in-memory harness（tests）のみで満たす。
 *
 * 厳格スコープ（additive・pure・未配線）:
 *   - 永続化なし / Supabase なし / fetch なし / API なし / route・server action なし / send 実装なし。
 *   - DB/pair_state/thread への依存なし（**message 層は thread/pair state を知らない**）。
 *   - membership は **participant 層から注入**（relation/session participant）。message 層が直接
 *     thread/pair を引かない＝レイヤモデル保持。
 *
 * レイヤモデル（CEO invariant・本契約が保持するもの）:
 *   - header participants = relation/session participant 層（`SessionParticipant`・本 repo の外）
 *   - main chat body = session message 層（**本 repo が司るのはここだけ**）
 *   - previous conversation = 分離 thread context 層（`CoAlterChatMessage`・本 repo に入らない）
 *   - Plan Intelligence = 別 projection 層（本 repo に入らない）
 *   - send/persistence/realtime/read receipt/runtime extraction/useCoAlter = HOLD
 *
 * send authority（§3・型で固定）:
 *   - draft は author を持たない（`CoAlterSessionMessageDraft`）。
 *   - append は **server で stamp された author 文脈**（認証済み user id）を要求し、**client は sender
 *     authority を提供できない**（branded `ServerStampedAuthorContext`・mint は server boundary のみ）。
 *   - membership は repository/service 境界で検査する（非参加者の append を弾く）。
 *   - CoAlter/system author は **別経路**（human author を作れない・human が coalter を詐称できない）。
 */

import type {
  CoAlterSessionMessage,
  CoAlterSessionMessageDraft,
  CoAlterSessionMessageKind,
} from "./coalterSessionMessageContract";
import type { SessionParticipant } from "./coalterPlanSessionContract";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Server-stamped author context（client が authority を主張できない branded 型）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

declare const SERVER_AUTH_BRAND: unique symbol;

/**
 * **server boundary でのみ生成される** authenticated author 文脈。
 *
 * client（draft 送信側）はこの型を構築できない（brand で封じる）。実コードでは認証境界
 * （`auth.getUser()` 等）が `stampServerAuthContext` で mint する想定。append の sender authority は
 * **常にここから来る**（draft からは来ない）。
 */
export interface ServerStampedAuthorContext {
  /** 認証済み user の安定 id（= 送信主体。draft が主張する値ではない）。 */
  readonly authenticatedUserId: string;
  /** brand: client 側プレーンオブジェクトでは満たせない（authority の出所を型で固定）。 */
  readonly [SERVER_AUTH_BRAND]: true;
}

/**
 * server boundary が認証済み user id から author 文脈を mint する。
 * **これが authority の唯一の入口**（実装では auth/session 由来の id のみを渡すこと）。
 * 本 slice では in-memory harness（tests）が server boundary を代理する。
 */
export function stampServerAuthContext(
  authenticatedUserId: string,
): ServerStampedAuthorContext {
  // brand は phantom（型のみ）。runtime には authenticatedUserId だけが乗る。
  // この cast が「server boundary だけが authority を mint する」唯一の地点。
  return { authenticatedUserId } as ServerStampedAuthorContext;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Membership 供給（participant 層からの注入・thread/pair 非依存）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * session の membership 供給源。**resolved な `SessionParticipant`** を返す
 * （relation/session participant 層が正本）。session 不在は `null`。
 *
 * message 層はこの関数を通してのみ membership を知る＝**thread/pair state に依存しない**。
 * anonymous/unresolved 参加者は `SessionParticipant` になれないため membership にも入らない。
 */
export type SessionMembershipResolver = (
  sessionId: string,
) => readonly SessionParticipant[] | null;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Append 入出力
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 人間参加者の append 入力。**author は draft でなく authorContext から stamp**。 */
export interface AppendParticipantMessageInput {
  readonly sessionId: string;
  /** ユーザーが打った内容のみ（author を持たない）。 */
  readonly draft: CoAlterSessionMessageDraft;
  /** server stamp された送信主体（client は構築不可）。 */
  readonly authorContext: ServerStampedAuthorContext;
}

/** CoAlter system message の append 入力（**human author を作れない別経路**）。 */
export interface AppendSystemMessageInput {
  readonly sessionId: string;
  readonly kind: CoAlterSessionMessageKind;
  /** 共有テキストのみ（projection を入れない）。 */
  readonly body: string;
}

/** append 失敗理由。 */
export type AppendRejectionReason =
  /** 指定 session が membership 供給源に存在しない。 */
  | "session_not_found"
  /** authenticatedUserId が当該 session の resolved participant でない。 */
  | "not_a_participant"
  /** body が空（共有テキストとして無効）。 */
  | "empty_body";

/** append 結果（成功で stamp 済み message・失敗で理由）。 */
export type AppendResult =
  | { readonly ok: true; readonly message: CoAlterSessionMessage }
  | { readonly ok: false; readonly reason: AppendRejectionReason };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Repository 契約
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * CoAlter session message の repository 抽象。
 *
 * **持たないもの**（型で表現）: threadId・pairStateId・query・persistence 実装・fetch・DB client。
 * 具象（in-memory / 将来の DB-backed）はこの interface を満たす。本 slice の具象は **in-memory
 * harness（tests）のみ**。
 */
export interface CoAlterSessionMessageRepository {
  /**
   * 指定 session の共有 message 列を **挿入順**で返す（その session のものだけ）。
   * 他 session の message は混ざらない。読み取りに副作用なし。
   */
  listSessionMessages(sessionId: string): readonly CoAlterSessionMessage[];

  /**
   * 人間参加者の draft を append。
   *   1. membership（参加者層）を解決。session 不在 → `session_not_found`。
   *   2. body 空 → `empty_body`。
   *   3. **author は `authorContext.authenticatedUserId` から stamp**（draft からではない）。
   *   4. その userId が resolved participant でなければ → `not_a_participant`（reject）。
   *   5. 成功時 `{ kind:"participant", userId }`・visibility "shared"・id/createdAt は stamp。
   * **coalter（system）author をこの経路で生成しない**。
   */
  appendParticipantMessage(input: AppendParticipantMessageInput): AppendResult;

  /**
   * CoAlter system message を append（**human 経路と分離**）。
   * author は常に `{ kind:"coalter" }`・human userId を受け取らない＝human を詐称できない。
   * session 不在 → `session_not_found`、body 空 → `empty_body`。
   */
  appendSystemMessage(input: AppendSystemMessageInput): AppendResult;
}
