/**
 * CoAlter Always-On Observer — Relationship State Redaction (Phase A-1)
 *
 * 正本: docs/coalter-always-on-observer-design.md §3 Layer 3, §6 Safety/Privacy
 *       docs/coalter-aoo-phase-a0-mode-state-audit.md §1.10, §3.5 (CEO 補正)
 *
 * 役割:
 *   Internal relationship state → external-safe snapshot 変換。
 *   PII firewall (forbidden field 監査 list) を提供。
 *   raw pairStateId を sha256 派生 key に変換。
 *
 * CRITICAL 設計原則:
 *   - 出力は read-only (caller 側 mutation で内部状態が壊れない)
 *   - 確定的 (同一 input + 同一 salt → 同一 output)
 *   - LLM call / fetch / DB / console 一切なし
 *   - Date.now / Math.random 一切なし
 *   - PII fields は型と runtime audit list の二重 firewall
 *
 * 既存 A2 buffer (lib/coalter/understanding/redactedDiagnosticsBuffer.ts) の
 * PII_FORBIDDEN_FIELD_NAMES と整合する monitoring list を保持。
 */

import { createHash } from "node:crypto";
import {
  type InternalPairStateKey,
  type InternalRelationshipState,
  type RedactedRelationshipKey,
  type RedactedRelationshipStateSnapshot,
} from "./relationshipStateTypes";

// ─────────────────────────────────────────────
// PII firewall — forbidden field audit list
// ─────────────────────────────────────────────

/**
 * 関係状態 snapshot の external payload に**絶対含めてはならない** field 名の audit list。
 *
 * 用途:
 *   1. 型レベル firewall の監査補助 (TS 型 + 本 list で二重防御)
 *   2. `containsForbiddenFields()` で runtime 検出可能
 *
 * 大文字・小文字・snake_case の variant を網羅する。
 *
 * A2 buffer の `PII_FORBIDDEN_FIELD_NAMES` と整合する。新規 PII field を観測したら
 * 本 list と A2 list の両方を更新する。
 */
export const PII_FORBIDDEN_FIELD_NAMES = [
  // user identity
  "userId",
  "userid",
  "user_id",
  "userIds",
  "user_ids",
  // pair identity
  "pairId",
  "pairid",
  "pair_id",
  "pairStateId",
  "pair_state_id",
  "pairstateid",
  // thread / session
  "threadId",
  "threadid",
  "thread_id",
  "sessionId",
  "session_id",
  // message identifier (Phase A-2b 追加 — presence signal meta.lastMessageId 由来、
  // tracking identifier として raw 保持禁止、hash 化して redactedMessageKey を使う)
  "messageId",
  "messageid",
  "message_id",
  "lastMessageId",
  "lastmessageid",
  "last_message_id",
  // contact / network
  "email",
  "Email",
  "phoneNumber",
  "phone_number",
  "url",
  "URL",
  "Url",
  // message / text
  "message",
  "Message",
  "utterance",
  "Utterance",
  "text",
  "rawText",
  "raw_text",
  "freeText",
  "free_text",
  "body",
  "content",
  "note",
  "notes",
  "comment",
  "comments",
  // credentials / secrets
  "token",
  "Token",
  "apiKey",
  "api_key",
  "apikey",
  "secret",
  "Secret",
  "password",
  "Password",
] as const;

export type ForbiddenFieldName = (typeof PII_FORBIDDEN_FIELD_NAMES)[number];

// ─────────────────────────────────────────────
// Key redaction
// ─────────────────────────────────────────────

/**
 * Internal pair state key (= raw pairStateId) を salt 付き sha256 で hash し、
 * external-safe な `redactedRelationshipKey` を生成する。
 *
 * 特性:
 *   - 確定的 (同一 internalKey + 同一 salt → 同一 output)
 *   - reverse 不可 (sha256)
 *   - salt が異なれば key も異なる (cross-environment correlation 防止)
 *   - base64url 出力 (URL safe)
 *
 * 制約:
 *   - internalKey が空文字 → throw
 *   - salt が空文字 → throw
 *
 * 入力 string の length leak を避けるため、固定長 hash 出力 (sha256 = 256bit) のみ返す。
 */
export function computeRedactedRelationshipKey(
  internalKey: InternalPairStateKey,
  salt: string,
): RedactedRelationshipKey {
  if (typeof internalKey !== "string" || internalKey.length === 0) {
    throw new Error(
      "computeRedactedRelationshipKey: internalKey must be a non-empty string",
    );
  }
  if (typeof salt !== "string" || salt.length === 0) {
    throw new Error(
      "computeRedactedRelationshipKey: salt must be a non-empty string",
    );
  }
  const hash = createHash("sha256");
  hash.update(salt, "utf8");
  hash.update(":", "utf8");
  hash.update(internalKey, "utf8");
  return hash.digest("base64url");
}

// ─────────────────────────────────────────────
// State redaction
// ─────────────────────────────────────────────

/**
 * Internal relationship state を external-safe snapshot に変換する。
 *
 * 変換規則:
 *   - `internalKey` を `redactedRelationshipKey` に置換
 *   - その他の field は bucket 化済み (alignmentBucket / uncertaintyBucket /
 *     silenceBudgetBucket) なので raw 数値は漏れない
 *   - reasonCodes は defensive copy (caller mutation で内部状態が壊れない)
 *
 * 出力は型レベルで `RedactedRelationshipStateSnapshot` を保証。
 *
 * 副作用なし。caller 側で internal state を再利用可能。
 */
export function redactInternalState(
  state: InternalRelationshipState,
  salt: string,
): RedactedRelationshipStateSnapshot {
  return {
    schemaVersion: state.schemaVersion,
    redactedRelationshipKey: computeRedactedRelationshipKey(
      state.internalKey,
      salt,
    ),
    stateVersion: state.stateVersion,
    observationCount: state.observationCount,
    lastObservationAt: state.lastObservationAt,
    observerActivationState: state.observerActivationState,
    modeContext: state.modeContext,
    conversationPhase: state.conversationPhase,
    alignmentBucket: state.alignmentBucket,
    ruptureFlag: state.ruptureFlag,
    uncertaintyBucket: state.uncertaintyBucket,
    silenceBudgetBucket: state.silenceBudgetBucket,
    reasonCodes: [...state.reasonCodes],
  };
}

// ─────────────────────────────────────────────
// Runtime audit helper
// ─────────────────────────────────────────────

/**
 * 任意 object に対して PII forbidden field の存在を audit する。
 *
 * 用途:
 *   - 単体 test で snapshot に禁止 field が含まれていないことを確認
 *   - 将来の runtime monitoring (debug 用、本 module 外)
 *
 * 副作用なし。input object を mutate しない。
 *
 * 返り値: 検出された forbidden field 名の配列 (空なら clean)。
 */
export function containsForbiddenFields(
  obj: Record<string, unknown>,
): ForbiddenFieldName[] {
  const found: ForbiddenFieldName[] = [];
  for (const name of PII_FORBIDDEN_FIELD_NAMES) {
    if (Object.prototype.hasOwnProperty.call(obj, name)) {
      found.push(name);
    }
  }
  return found;
}
