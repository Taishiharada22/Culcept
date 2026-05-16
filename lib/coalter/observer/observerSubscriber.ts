/**
 * CoAlter Always-On Observer — Subscriber Library (Phase A-2b)
 *
 * 正本:
 *   - docs/coalter-aoo-a2b-implementation-preflight.md (PR #157)
 *   - CEO/GPT 補正 2026-05-16:
 *       補正1: matchedPattern 厳格化 (signalRedaction.ts で bucket 化)
 *       補正2: salt 設計 (env salt 不使用、session-local ephemeral / caller-provided test)
 *
 * 役割:
 *   Presence signal bus subscribe handler の **library only** 提供。
 *   実際の `subscribePresenceSignal(...)` 呼出 (wiring) は **A-2c で実装**、
 *   本 A-2b 段階では runtime-unwired (どこからも呼ばれない)。
 *
 * **重要**: 本 module は library export 関数群のみ。subscribe call の actual
 * invocation は A-2c の client wiring で行う。本 A-2b は runtime-unwired。
 *
 * CRITICAL 設計原則:
 *   1. observer は **passive subscriber** (signal を mutate / consume / block しない)
 *   2. raw `lastMessageId` / `matchedPattern` を保持・出力しない (redaction 必須)
 *   3. listener throw を **二重 try/catch** で握りつぶす (presence layer 不可侵)
 *   4. LLM / fetch / DB / storage / console / telemetry / Sentry 一切なし
 *   5. Date.now / Math.random に依存しない (session salt は caller-provided か globalThis.crypto.getRandomValues)
 *   6. session-local ephemeral salt で session 終了時に salt 自動消滅
 *   7. raw lastMessageId は state / snapshot / output に絶対出さない
 *
 * 並走原則:
 *   - presence layer (productionSignalBus.ts 等) は touch しない (本 module は subscribe 関数を呼ぶだけ)
 *   - observer state は client process-local (server-side A4 retrieval とは別軸)
 *   - presence layer の動作は 1 bit も変えない
 */

import type { PresenceSignal } from "../presence/types";
import {
  redactSignal,
  type RedactedPresenceSignal,
} from "./signalRedaction";
import { updateRelationshipState } from "./relationshipState";
import type { InternalPairStateKey } from "./relationshipStateTypes";

// ─────────────────────────────────────────────
// Ephemeral salt generation (browser + node 両対応、A-2c crypto fix)
// ─────────────────────────────────────────────

/**
 * Session-local ephemeral salt を生成する。
 *
 * 実装 (CEO/GPT 補正 2026-05-16 遵守):
 *   - `globalThis.crypto.getRandomValues()` を使う (Web 標準 API、Node 19+ global、
 *     全 modern browser サポート)
 *   - `node:crypto.randomBytes` は使わない (client bundle 不可)
 *   - `Math.random` fallback は**禁止** (cryptographic 強度確保のため)
 *   - crypto unavailable → **throw** (fail-closed、caller の try/catch で握りつぶす)
 *
 * 出力: 32 random bytes → base64url 文字列 (43 chars)
 */
function generateEphemeralSalt(): string {
  if (
    typeof globalThis.crypto === "undefined" ||
    typeof globalThis.crypto.getRandomValues !== "function"
  ) {
    // fail-closed: cryptographic random unavailable → observer subscribe must skip
    // Math.random fallback は CEO/GPT 補正で禁止
    throw new Error(
      "generateEphemeralSalt: globalThis.crypto.getRandomValues unavailable, observer subscribe must skip",
    );
  }
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  // base64url encode (btoa は Node 16+ / browser 共通 global、Buffer は使わない)
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ─────────────────────────────────────────────
// Session (salt management + state binding)
// ─────────────────────────────────────────────

/**
 * Observer session opaque token。caller は内容を直接触らない (salt private)。
 *
 * Session lifetime:
 *   - createObserverSession() で作成
 *   - subscribe handle と一緒に保持
 *   - unsubscribe 時に session 破棄 (salt 自動消滅、closure による automatic GC)
 *
 * **session 内 salt は外部から読めない** (closure ベース、accessor 提供なし)。
 * 唯一の用途は redactSignal() への internal pass-through。
 */
export interface ObserverSession {
  /** internal: redactSignal に渡す salt (closure 内に保持、external accessor なし) */
  readonly _internalSalt: string;
  /** internal: state container 紐づけ用の pairStateId (caller が指定) */
  readonly _internalKey: InternalPairStateKey;
}

/**
 * Observer session を作成。
 *
 * @param options.pairStateId  紐づけ対象の internal pair state key
 * @param options.testSalt     test 用の deterministic salt (省略時は ephemeral salt 生成)
 *
 * @returns ObserverSession (caller は handle として保持、handler に渡す)
 *
 * Salt 設計 (CEO/GPT 補正2 遵守):
 *   - testSalt 指定: そのまま使う (deterministic test)
 *   - testSalt 未指定: globalThis.crypto.getRandomValues で **session-local ephemeral salt** を生成 (A-2c crypto fix)
 *   - salt は session lifetime のみ保持、外部から取得不可
 *   - process / browser session 終了で自動消滅
 *   - **env salt は使わない** (A-2b scope 外、env 操作なし)
 */
export function createObserverSession(options: {
  pairStateId: InternalPairStateKey;
  testSalt?: string;
}): ObserverSession {
  if (typeof options.pairStateId !== "string" || options.pairStateId.length === 0) {
    throw new Error(
      "createObserverSession: pairStateId must be a non-empty string",
    );
  }
  const salt =
    typeof options.testSalt === "string" && options.testSalt.length > 0
      ? options.testSalt
      : generateEphemeralSalt();
  return {
    _internalSalt: salt,
    _internalKey: options.pairStateId,
  };
}

// ─────────────────────────────────────────────
// Signal handler (presence bus → observer state container)
// ─────────────────────────────────────────────

/**
 * Presence signal bus から流入した signal を handle する。
 *
 * 処理:
 *   1. signal を redact (lastMessageId hash 化、matchedPattern bucket 化)
 *   2. relationship state container を update (signal 種別から reason code を導出)
 *   3. throw を **二重 try/catch** で握りつぶし、presence layer に伝播させない
 *
 * **本関数は library export だが、A-2b では呼ばれない** (runtime-unwired)。
 * A-2c で client wiring が `subscribePresenceSignal(makeHandler(session))` を呼ぶ。
 *
 * @param signal  presence bus からの raw PresenceSignal
 * @param session createObserverSession() で作成した session
 *
 * 副作用:
 *   - relationship state container の update (in-memory)
 *   - その他副作用なし (console / fetch / DB / storage 等は一切なし)
 */
export function handlePresenceSignal(
  signal: PresenceSignal,
  session: ObserverSession,
): void {
  try {
    const redacted = redactSignal(signal, session._internalSalt);
    // signal kind から reason code を導出 (raw text 一切使わない)
    const reasonCode = deriveReasonCodeFromSignal(redacted);
    updateRelationshipState(session._internalKey, {
      newReasonCodes: reasonCode ? [reasonCode] : [],
    });
  } catch {
    // 二重防御: redact / update の failure を握りつぶす
    // presence layer / bus への throw 伝播を絶対に防ぐ
    // log / console / telemetry 出さない (PII 流出回避 + 不可侵原則)
  }
}

/**
 * Redacted signal から reason code を導出。
 *
 * - kind == "critical" → matchedPatternCategory で分岐:
 *     safety_concern / rupture_signal → "rupture_detected"
 *     unknown_category / null → "observation_recorded" (fallback)
 * - kind == "mode_promotion" → "mode_signal_received"
 * - kind == "explicit" / "implicit" / "manual_restart" → "observation_recorded"
 *
 * raw text は一切使わない (redacted signal の固定 enum 値のみ参照)。
 *
 * @returns reason code (`ReasonCode` の値) または null
 */
function deriveReasonCodeFromSignal(
  redacted: RedactedPresenceSignal,
):
  | "rupture_detected"
  | "mode_signal_received"
  | "observation_recorded"
  | null {
  switch (redacted.kind) {
    case "critical":
      if (
        redacted.matchedPatternCategory === "safety_concern" ||
        redacted.matchedPatternCategory === "rupture_signal"
      ) {
        return "rupture_detected";
      }
      return "observation_recorded";
    case "mode_promotion":
      return "mode_signal_received";
    case "explicit":
    case "implicit":
    case "manual_restart":
      return "observation_recorded";
    default:
      // Defensive: 未知 kind は drop (state を汚さない)
      return null;
  }
}

// ─────────────────────────────────────────────
// Handler factory (A-2c 用、本 A-2b では呼ばれない)
// ─────────────────────────────────────────────

/**
 * Session を closure に閉じ込めた listener を返す。
 *
 * **本関数は A-2c の client wiring が `subscribePresenceSignal(makeHandler(session))`
 * で使う想定**。A-2b 段階では runtime-unwired (caller なし)。
 *
 * 用途:
 *   ```typescript
 *   // A-2c で実装される (本 A-2b では実行されない)
 *   const session = createObserverSession({ pairStateId: "..." });
 *   const unsubscribe = subscribePresenceSignal(makeSignalHandler(session));
 *   // cleanup 時: unsubscribe()
 *   ```
 *
 * @param session createObserverSession() で作成した session
 * @returns presence bus に渡す listener 関数 (signature: (signal: PresenceSignal) => void)
 */
export function makeSignalHandler(
  session: ObserverSession,
): (signal: PresenceSignal) => void {
  return (signal: PresenceSignal) => {
    handlePresenceSignal(signal, session);
  };
}
