/**
 * CoAlter Always-On Observer — Signal Redaction (Phase A-2b)
 *
 * 正本:
 *   - docs/coalter-aoo-a2-presence-signal-bus-audit.md (PR #156)
 *   - docs/coalter-aoo-a2b-implementation-preflight.md (PR #157)
 *   - CEO/GPT 補正 2026-05-16:
 *       補正1: matchedPattern 厳格化 (raw 禁止、bucket 化)
 *       補正2: salt 設計 (env salt 使わない、session-local ephemeral / caller-provided)
 *
 * 役割:
 *   PresenceSignal → RedactedPresenceSignal 変換。
 *   PII firewall (lastMessageId hash 化 + matchedPattern bucket 化)。
 *   pure function (副作用なし、deterministic with fixed salt)。
 *
 * CRITICAL 設計原則:
 *   - raw `lastMessageId` を一切保持・出力しない (hash 化のみ)
 *   - raw `matchedPattern` を一切保持・出力しない (bucket 化のみ)
 *   - hash 値を console / log に出さない
 *   - LLM call / fetch / DB / storage / console 一切なし
 *   - Date.now / Math.random に依存しない (caller-provided salt で deterministic)
 *
 * 並走原則:
 *   - presence layer の signal 構造は変えない (PresenceSignal は immutable)
 *   - observer は signal を mutate せず、redacted copy を返す
 *   - 既存 publisher / subscriber に影響なし
 */

import { createHash } from "node:crypto";
import type {
  PresenceSignal,
  SignalKind,
  SignalStrength,
} from "../presence/types";

// ─────────────────────────────────────────────
// Schema version
// ─────────────────────────────────────────────

/** Signal redaction schema version。後方互換管理用。 */
export const SIGNAL_REDACTION_SCHEMA_VERSION = 1 as const;

export type SignalRedactionSchemaVersion =
  typeof SIGNAL_REDACTION_SCHEMA_VERSION;

// ─────────────────────────────────────────────
// Redacted key
// ─────────────────────────────────────────────

/** External-safe message key。raw lastMessageId は含まない。sha256 派生 base64url。 */
export type RedactedMessageKey = string;

// ─────────────────────────────────────────────
// MatchedPattern bucket (CEO/GPT 補正1反映、raw 禁止)
// ─────────────────────────────────────────────

/**
 * Critical signal の matchedPattern を bucket 化した category。
 *
 * 実体 (origin/main 時点 read-only audit):
 *   - "safety:self-harm" → safety_concern
 *   - "rupture:hostility" → rupture_signal
 *   - "rupture:limit" → rupture_signal
 *
 * raw 値 (string) は保持しない (CEO/GPT 補正1: raw matchedPattern preserve 禁止)。
 * 将来 CRITICAL_PATTERNS が拡張されても drop しないよう unknown_category を用意。
 */
export type MatchedPatternCategory =
  | "safety_concern"
  | "rupture_signal"
  | "unknown_category"
  | null;

/**
 * Raw matchedPattern を bucket category に変換。
 *
 * - "safety:*" prefix → safety_concern
 * - "rupture:*" prefix → rupture_signal
 * - その他 / 空 / undefined → unknown_category (将来追加分の drop 防止) or null
 *
 * raw 値は返さない (privacy)。caller は returned category のみを使う。
 */
export function bucketizeMatchedPattern(
  raw: string | undefined | null,
): MatchedPatternCategory {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (raw.startsWith("safety:")) return "safety_concern";
  if (raw.startsWith("rupture:")) return "rupture_signal";
  return "unknown_category";
}

// ─────────────────────────────────────────────
// Hash (lastMessageId → RedactedMessageKey)
// ─────────────────────────────────────────────

/**
 * lastMessageId を salt 付き sha256 で hash し、external-safe な
 * RedactedMessageKey を生成する。
 *
 * 特性:
 *   - 確定的 (同一 messageId + 同一 salt → 同一 output)
 *   - reverse 不可 (sha256)
 *   - salt が異なれば key も異なる (cross-environment correlation 防止)
 *   - base64url 出力 (URL safe)
 *   - separator `:message:` で `redactedRelationshipKey` (`:` separator) と区別
 *
 * 制約:
 *   - messageId が空文字 → throw
 *   - salt が空文字 → throw
 *
 * 用途:
 *   - signal chain reconstruction (同一 message からの critical → implicit 連鎖の相関分析)
 *   - external snapshot で safe に出せる identifier
 */
export function computeRedactedMessageKey(
  messageId: string,
  salt: string,
): RedactedMessageKey {
  if (typeof messageId !== "string" || messageId.length === 0) {
    throw new Error(
      "computeRedactedMessageKey: messageId must be a non-empty string",
    );
  }
  if (typeof salt !== "string" || salt.length === 0) {
    throw new Error("computeRedactedMessageKey: salt must be a non-empty string");
  }
  const hash = createHash("sha256");
  hash.update(salt, "utf8");
  hash.update(":message:", "utf8");
  hash.update(messageId, "utf8");
  return hash.digest("base64url");
}

// ─────────────────────────────────────────────
// Redacted signal shape
// ─────────────────────────────────────────────

/**
 * Redacted PresenceSignal。external snapshot / observer state container で
 * 使用する safe な形式。
 *
 * 含む field:
 *   - kind: SignalKind (固定 enum、PII でない)
 *   - strength: SignalStrength (固定 enum、PII でない)
 *   - detectedAt: number (epoch / timestamp、PII でない)
 *   - redactedMessageKey: hash 化済 message key (null = meta なし or messageId なし)
 *   - matchedPatternCategory: bucket 化された pattern category (raw 含まず)
 *
 * 含まない field (CEO/GPT 補正で明示):
 *   - raw lastMessageId
 *   - raw matchedPattern
 *   - raw user text / utterance / message body
 *   - any other meta field (将来追加分は明示的に whitelist する設計)
 */
export interface RedactedPresenceSignal {
  readonly schemaVersion: SignalRedactionSchemaVersion;
  readonly kind: SignalKind;
  readonly strength: SignalStrength;
  readonly detectedAt: number;
  readonly redactedMessageKey: RedactedMessageKey | null;
  readonly matchedPatternCategory: MatchedPatternCategory;
}

// ─────────────────────────────────────────────
// Redaction (PresenceSignal → RedactedPresenceSignal)
// ─────────────────────────────────────────────

/**
 * PresenceSignal を RedactedPresenceSignal に変換。
 *
 * 変換規則:
 *   - kind / strength / detectedAt は preserve (PII でない)
 *   - meta.lastMessageId → computeRedactedMessageKey で hash 化
 *   - meta.matchedPattern → bucketizeMatchedPattern で category 化
 *   - その他 meta field は **すべて drop** (whitelist 方式、未知 field の漏洩防止)
 *
 * 副作用なし。input signal は mutate しない。
 *
 * 制約:
 *   - salt が空文字 → throw (deterministic test 用)
 *
 * @param signal raw PresenceSignal (presence layer から fan-out された signal)
 * @param salt   redacted key 生成用 salt (session-local ephemeral or caller-provided test salt)
 */
export function redactSignal(
  signal: PresenceSignal,
  salt: string,
): RedactedPresenceSignal {
  if (typeof salt !== "string" || salt.length === 0) {
    throw new Error("redactSignal: salt must be a non-empty string");
  }
  // raw signal の type を最低限 validate (defensive)
  if (!signal || typeof signal !== "object") {
    throw new Error("redactSignal: signal must be an object");
  }
  if (typeof signal.kind !== "string" || typeof signal.strength !== "string") {
    throw new Error("redactSignal: signal must have kind and strength fields");
  }
  if (typeof signal.detectedAt !== "number") {
    throw new Error("redactSignal: signal must have detectedAt as number");
  }

  // meta は緩い型 (Record<string, unknown>)。known field のみ抽出、他は drop。
  const meta = signal.meta;
  let redactedMessageKey: RedactedMessageKey | null = null;
  let matchedPatternCategory: MatchedPatternCategory = null;

  if (meta && typeof meta === "object") {
    // lastMessageId (raw) → redactedMessageKey (hash)
    const rawLastMessageId = meta["lastMessageId"];
    if (typeof rawLastMessageId === "string" && rawLastMessageId.length > 0) {
      redactedMessageKey = computeRedactedMessageKey(rawLastMessageId, salt);
    }
    // matchedPattern (raw) → matchedPatternCategory (bucket)
    const rawMatchedPattern = meta["matchedPattern"];
    matchedPatternCategory = bucketizeMatchedPattern(
      typeof rawMatchedPattern === "string" ? rawMatchedPattern : null,
    );
  }

  return {
    schemaVersion: SIGNAL_REDACTION_SCHEMA_VERSION,
    kind: signal.kind,
    strength: signal.strength,
    detectedAt: signal.detectedAt,
    redactedMessageKey,
    matchedPatternCategory,
  };
}
