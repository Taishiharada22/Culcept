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

import type {
  PresenceSignal,
  SignalKind,
  SignalStrength,
} from "../presence/types";
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
 *
 * **export 理由 (A-2e canary 2026-05-17)**:
 *   `hooks/useObserverSubscription.ts` の debug global expose も同じ
 *   session-local ephemeral salt 設計を使うため (CEO/GPT 補正で hardcoded salt
 *   禁止)。debug-gated caller のみ。
 */
export function generateEphemeralSalt(): string {
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
// A-2e canary: Redacted debug counters (PII-free observation metrics)
// ─────────────────────────────────────────────

/**
 * Skip reason enum for handlePresenceSignal flow tracking.
 *
 * 全 enum 値、raw text / raw IDs 含まない、PII firewall 安全。
 */
export type HandlerSkipReason =
  | "none"
  | "redact_failed"
  | "state_update_failed"
  | "unknown_kind_dropped";

/**
 * Observer debug counters (redacted)。
 *
 * 用途: A-2e canary で `getDebugCounters()` 経由で観測。signal が handler に届いて
 * いるか、どこで止まっているかを切り分ける。
 *
 * **絶対に raw text / raw IDs を含まない**:
 *   - kind / strength / matchedPatternCategory / reasonCode は固定 enum (PII でない)
 *   - lastObservedAt は signal.detectedAt の epoch ms (PII でない)
 *   - 全 counter は integer
 */
export interface ObserverDebugCounters {
  /** handler が呼ばれた累計 (presence bus → observer 到達の証明) */
  readonly signalReceivedCount: number;
  /** redactSignal で throw した累計 */
  readonly redactFailureCount: number;
  /** updateRelationshipState 成功累計 (stateStore 更新の証明) */
  readonly stateUpdateSuccessCount: number;
  /** updateRelationshipState 失敗累計 */
  readonly stateUpdateFailureCount: number;
  /** 直近受信 signal の kind (固定 enum) */
  readonly lastSignalKind: SignalKind | null;
  /** 直近受信 signal の strength (固定 enum) */
  readonly lastSignalStrength: SignalStrength | null;
  /** 直近 redact 後の matchedPatternCategory (固定 enum) */
  readonly lastMatchedPatternCategory:
    | "safety_concern"
    | "rupture_signal"
    | "unknown_category"
    | null;
  /** 直近 append した reason code (固定 enum) */
  readonly lastReasonCode:
    | "rupture_detected"
    | "mode_signal_received"
    | "observation_recorded"
    | null;
  /** 直近 signal の detectedAt (epoch ms、PII でない) */
  readonly lastObservedAt: number | null;
  /** 直近 handler 処理の skip 理由 (none = 正常完了) */
  readonly lastSkipReason: HandlerSkipReason | null;
}

const debugCounters: {
  signalReceivedCount: number;
  redactFailureCount: number;
  stateUpdateSuccessCount: number;
  stateUpdateFailureCount: number;
  lastSignalKind: SignalKind | null;
  lastSignalStrength: SignalStrength | null;
  lastMatchedPatternCategory:
    | "safety_concern"
    | "rupture_signal"
    | "unknown_category"
    | null;
  lastReasonCode:
    | "rupture_detected"
    | "mode_signal_received"
    | "observation_recorded"
    | null;
  lastObservedAt: number | null;
  lastSkipReason: HandlerSkipReason | null;
} = {
  signalReceivedCount: 0,
  redactFailureCount: 0,
  stateUpdateSuccessCount: 0,
  stateUpdateFailureCount: 0,
  lastSignalKind: null,
  lastSignalStrength: null,
  lastMatchedPatternCategory: null,
  lastReasonCode: null,
  lastObservedAt: null,
  lastSkipReason: null,
};

/**
 * Observer debug counters の defensive copy を返す。
 *
 * 用途: A-2e canary debug global expose 経由で CEO 観測。
 * 出力は **redacted only** (raw text / raw IDs 含まない、固定 enum + integer のみ)。
 */
export function getObserverDebugCountersForDebug(): ObserverDebugCounters {
  return {
    signalReceivedCount: debugCounters.signalReceivedCount,
    redactFailureCount: debugCounters.redactFailureCount,
    stateUpdateSuccessCount: debugCounters.stateUpdateSuccessCount,
    stateUpdateFailureCount: debugCounters.stateUpdateFailureCount,
    lastSignalKind: debugCounters.lastSignalKind,
    lastSignalStrength: debugCounters.lastSignalStrength,
    lastMatchedPatternCategory: debugCounters.lastMatchedPatternCategory,
    lastReasonCode: debugCounters.lastReasonCode,
    lastObservedAt: debugCounters.lastObservedAt,
    lastSkipReason: debugCounters.lastSkipReason,
  };
}

/**
 * Debug counters をリセットする。**tests only**。
 */
export function __resetObserverDebugCountersForTests(): void {
  debugCounters.signalReceivedCount = 0;
  debugCounters.redactFailureCount = 0;
  debugCounters.stateUpdateSuccessCount = 0;
  debugCounters.stateUpdateFailureCount = 0;
  debugCounters.lastSignalKind = null;
  debugCounters.lastSignalStrength = null;
  debugCounters.lastMatchedPatternCategory = null;
  debugCounters.lastReasonCode = null;
  debugCounters.lastObservedAt = null;
  debugCounters.lastSkipReason = null;
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
 * A-2e canary: 各 phase で `debugCounters` を increment (redacted only)。
 *
 * @param signal  presence bus からの raw PresenceSignal
 * @param session createObserverSession() で作成した session
 *
 * 副作用:
 *   - relationship state container の update (in-memory)
 *   - debugCounters の update (in-memory、redacted)
 *   - その他副作用なし (console / fetch / DB / storage 等は一切なし)
 */
export function handlePresenceSignal(
  signal: PresenceSignal,
  session: ObserverSession,
): void {
  // A-2e canary: handler 到達の証明 (presence bus → observer)
  debugCounters.signalReceivedCount += 1;
  if (signal && typeof signal === "object") {
    if (typeof signal.kind === "string") {
      debugCounters.lastSignalKind = signal.kind as SignalKind;
    }
    if (typeof signal.strength === "string") {
      debugCounters.lastSignalStrength = signal.strength as SignalStrength;
    }
    if (typeof signal.detectedAt === "number") {
      debugCounters.lastObservedAt = signal.detectedAt;
    }
  }

  let redacted: RedactedPresenceSignal;
  try {
    redacted = redactSignal(signal, session._internalSalt);
    debugCounters.lastMatchedPatternCategory = redacted.matchedPatternCategory;
  } catch {
    // redact 失敗 (malformed signal / salt 不正 等)
    debugCounters.redactFailureCount += 1;
    debugCounters.lastSkipReason = "redact_failed";
    return;
  }

  // signal kind から reason code を導出 (raw text 一切使わない)
  const reasonCode = deriveReasonCodeFromSignal(redacted);
  if (reasonCode === null) {
    debugCounters.lastSkipReason = "unknown_kind_dropped";
    return;
  }

  // A-2e canary v2.2 (2026-05-17 修正): observationCount を増やすには
  // `recordingObservation: true` + `observedAt` (caller-provided ISO timestamp) を
  // 渡す必要がある (relationshipState.ts:193-200 logic)。
  // 旧実装は newReasonCodes だけだったため reasonCodes は append されたが
  // observationCount が永遠に 0 のままだった (CEO 観測 2026-05-17 で発見)。
  //
  // signal.detectedAt は number (epoch ms or ISO 8601)。state container は ISO 文字列
  // を期待するため new Date(...).toISOString() に変換。
  // detectedAt が不正値の場合は ISO 変換失敗の可能性 → try/catch で握りつぶし、
  // observationCount のみ skip (state container 全体は壊さない)。
  let observedAtIso: string | undefined;
  if (
    typeof signal.detectedAt === "number" &&
    Number.isFinite(signal.detectedAt)
  ) {
    try {
      observedAtIso = new Date(signal.detectedAt).toISOString();
    } catch {
      // ISO 変換失敗 (e.g., out-of-range) → observedAt 未指定で fallback
      observedAtIso = undefined;
    }
  }

  try {
    updateRelationshipState(session._internalKey, {
      recordingObservation: true,
      observedAt: observedAtIso,
      newReasonCodes: [reasonCode],
    });
    debugCounters.stateUpdateSuccessCount += 1;
    debugCounters.lastReasonCode = reasonCode;
    debugCounters.lastSkipReason = "none";
  } catch {
    debugCounters.stateUpdateFailureCount += 1;
    debugCounters.lastSkipReason = "state_update_failed";
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
