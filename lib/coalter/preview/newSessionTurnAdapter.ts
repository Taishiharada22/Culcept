/**
 * C4 — New session message → ConversationTurn[] pure adapter（**pure・DB なし・保存なし**）
 *
 * 設計正本: docs/coalter-brain-newsession-bridge-migration-gap-design.md（§4）
 *
 * 役割: New 系 `plan_coalter_session_messages`（participant-rooted・shared body）を、Legacy 脳の
 *   pure 解析（`analyzeConversation`）が受ける `ConversationTurn[]` へ写す。
 *
 * 厳守:
 *   - **pure・決定論**（I/O / DB / fetch / Date.now なし）。元配列を mutate しない。
 *   - **conversation turn = chat のみ**（`system_event` は会話ターンでないため除外）。
 *   - app 層型を import しない（lib→app 依存回避）。**構造的最小型**で受ける（実 CoAlterSessionMessage は構造互換）。
 *   - participant の userId を senderId に・coalter は安定 system sender に写す（raw projection は持ち込まない）。
 */

import type { ConversationTurn } from "../types";

/** 解析対象の安定 system sender（DB author とは別・解析の attribution 用ラベル）。 */
export const COALTER_TURN_SENDER = "coalter" as const;

/** New session message の **構造的最小型**（実 `CoAlterSessionMessage` が構造互換で渡せる）。 */
export interface NewSessionMessageLike {
  readonly id: string;
  readonly author: { readonly kind: "participant"; readonly userId: string } | { readonly kind: "coalter" };
  readonly kind: "chat" | "system_event";
  readonly body: string;
  readonly createdAt: string;
}

/**
 * New session messages → ConversationTurn[]（chat のみ・順序保持・pure）。
 *   senderId = participant→userId / coalter→`COALTER_TURN_SENDER`。
 */
export function mapNewSessionMessagesToTurns(messages: readonly NewSessionMessageLike[]): ConversationTurn[] {
  if (!Array.isArray(messages)) return [];
  const turns: ConversationTurn[] = [];
  for (const m of messages) {
    if (!m || m.kind !== "chat" || typeof m.body !== "string") continue; // chat のみ・不正は skip
    turns.push({
      id: m.id,
      senderId: m.author.kind === "participant" ? m.author.userId : COALTER_TURN_SENDER,
      body: m.body,
      createdAt: m.createdAt,
    });
  }
  return turns;
}

/** turns から distinct な participant senderId を順序保持で抽出（coalter sender は除外）。 */
export function distinctParticipantSenders(turns: readonly ConversationTurn[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of turns) {
    if (t.senderId === COALTER_TURN_SENDER) continue;
    if (!seen.has(t.senderId)) {
      seen.add(t.senderId);
      out.push(t.senderId);
    }
  }
  return out;
}
