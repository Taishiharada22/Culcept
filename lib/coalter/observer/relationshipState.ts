/**
 * CoAlter Always-On Observer — Relationship State Container (Phase A-1)
 *
 * 正本: docs/coalter-always-on-observer-design.md §3 Layer 3, §4 Phase A-1
 *       docs/coalter-aoo-phase-a0-mode-state-audit.md §1.10, §2.4 (CEO 補正)
 *
 * 役割:
 *   関係状態を保持する **self-contained in-memory state container**。
 *
 * **重要表現 (CEO/GPT 補正 2026-05-16)**:
 *   本 module を "pure module" と呼ばない。module-level Map を持つため stateful。
 *   正しい表現:
 *     - self-contained in-memory state container
 *     - process-local
 *     - ephemeral
 *     - runtime-unwired (Phase A-1 段階ではどこからも呼ばれない)
 *     - no external side effects (LLM / fetch / DB / console / storage 一切なし)
 *     - not production source of truth (production の正本は別途設計)
 *
 * 設計原則:
 *   1. raw `pairStateId` は internal key only。external snapshot に出さない。
 *   2. external 出力は必ず `getRedactedRelationshipStateSnapshot()` 経由。
 *   3. raw text / utterance / userId / pairId / threadId / email / URL を保持しない。
 *   4. LLM call 0 (rule-based のみ)。
 *   5. Date.now / Math.random に依存しない。timestamp は caller-provided observedAt。
 *   6. deterministic test 可能。
 *   7. defensive copy (read/write 両方で内部状態を caller から保護)。
 *   8. process-local + ephemeral (Vercel cold start で reset される前提)。
 *
 * Process isolation 注意:
 *   - Vercel serverless では process 毎に container instance が独立。
 *   - 同一 pair の観測が異なる process に着地すると state は分散する。
 *   - 本 container は **debug / observation 用途**。production の正本ではない。
 */

import {
  type InternalPairStateKey,
  type InternalRelationshipState,
  type RedactedRelationshipStateSnapshot,
  type ReasonCode,
  type RelationshipStatePatch,
  RELATIONSHIP_STATE_SCHEMA_VERSION,
} from "./relationshipStateTypes";
import { redactInternalState } from "./relationshipStateRedaction";

// ─────────────────────────────────────────────
// Configuration (caller-tunable via setter for tests)
// ─────────────────────────────────────────────

/** Default cap for reasonCodes array per state. FIFO drop oldest. */
const DEFAULT_REASON_CODE_CAP = 50;

let reasonCodeCap: number = DEFAULT_REASON_CODE_CAP;

// ─────────────────────────────────────────────
// Module-level state store
// ─────────────────────────────────────────────

/**
 * Self-contained in-memory state store。process-local、ephemeral。
 *
 * Vercel cold start で reset される前提。production の正本ではない。
 */
const stateStore: Map<InternalPairStateKey, InternalRelationshipState> =
  new Map<InternalPairStateKey, InternalRelationshipState>();

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/**
 * Defensive copy of internal state。caller mutation で内部状態を壊さないため、
 * read/write 両方で使用。
 */
function cloneState(
  state: InternalRelationshipState,
): InternalRelationshipState {
  return {
    schemaVersion: state.schemaVersion,
    internalKey: state.internalKey,
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

/** Initial state for a new key. observation 未記録、全 field unknown。 */
function initialStateFor(
  key: InternalPairStateKey,
): InternalRelationshipState {
  return {
    schemaVersion: RELATIONSHIP_STATE_SCHEMA_VERSION,
    internalKey: key,
    stateVersion: 0,
    observationCount: 0,
    lastObservationAt: null,
    observerActivationState: "unknown",
    modeContext: "unknown",
    conversationPhase: "unknown",
    alignmentBucket: "unknown",
    ruptureFlag: false,
    uncertaintyBucket: "unknown",
    silenceBudgetBucket: "unknown",
    reasonCodes: ["state_initialized"],
  };
}

/** Validate internal key string. */
function validateKey(key: unknown, fn: string): asserts key is string {
  if (typeof key !== "string" || key.length === 0) {
    throw new Error(`${fn}: key must be a non-empty string`);
  }
}

// ─────────────────────────────────────────────
// Public API — Internal access (use only within this codebase, not for external output)
// ─────────────────────────────────────────────

/**
 * Internal state snapshot を取得 (defensive copy)。
 *
 * **本関数の返り値を外部 API response / UI / log / diagnostics に渡さないこと**。
 * external 用途は `getRedactedRelationshipStateSnapshot()` を使う。
 *
 * @returns 内部状態の defensive copy (caller mutation で store は影響なし)。
 *          key 未登録なら null。
 */
export function getRelationshipStateSnapshotInternal(
  key: InternalPairStateKey,
): InternalRelationshipState | null {
  validateKey(key, "getRelationshipStateSnapshotInternal");
  const stored = stateStore.get(key);
  if (!stored) return null;
  return cloneState(stored);
}

/**
 * State を update する。key 未登録なら初期状態を作成してから patch を適用。
 *
 * 制約:
 *   - patch.observedAt は caller-provided (container 内で Date.now しない)
 *   - patch.recordingObservation=true の時のみ observationCount/lastObservationAt 更新
 *   - patch.newReasonCodes は append (FIFO drop oldest if exceeding cap)
 *
 * @returns 更新後の internal state の defensive copy。
 */
export function updateRelationshipState(
  key: InternalPairStateKey,
  patch: RelationshipStatePatch,
): InternalRelationshipState {
  validateKey(key, "updateRelationshipState");
  const existing = stateStore.get(key) ?? initialStateFor(key);

  let nextObservationCount = existing.observationCount;
  let nextLastObservationAt = existing.lastObservationAt;

  if (patch.recordingObservation === true) {
    nextObservationCount = existing.observationCount + 1;
    if (
      typeof patch.observedAt === "string" &&
      patch.observedAt.length > 0
    ) {
      nextLastObservationAt = patch.observedAt;
    }
  }

  // append reason codes, FIFO drop oldest if exceeding cap
  const mergedReasonCodes: ReasonCode[] = [
    ...existing.reasonCodes,
    ...(patch.newReasonCodes ?? []),
  ];
  if (mergedReasonCodes.length > reasonCodeCap) {
    mergedReasonCodes.splice(0, mergedReasonCodes.length - reasonCodeCap);
  }

  const updated: InternalRelationshipState = {
    schemaVersion: existing.schemaVersion,
    internalKey: existing.internalKey,
    stateVersion: existing.stateVersion + 1,
    observationCount: nextObservationCount,
    lastObservationAt: nextLastObservationAt,
    observerActivationState:
      patch.observerActivationState ?? existing.observerActivationState,
    modeContext: patch.modeContext ?? existing.modeContext,
    conversationPhase:
      patch.conversationPhase ?? existing.conversationPhase,
    alignmentBucket: patch.alignmentBucket ?? existing.alignmentBucket,
    ruptureFlag: patch.ruptureFlag ?? existing.ruptureFlag,
    uncertaintyBucket:
      patch.uncertaintyBucket ?? existing.uncertaintyBucket,
    silenceBudgetBucket:
      patch.silenceBudgetBucket ?? existing.silenceBudgetBucket,
    reasonCodes: mergedReasonCodes,
  };

  stateStore.set(key, updated);
  return cloneState(updated);
}

// ─────────────────────────────────────────────
// Public API — External-safe (use for diagnostics / retrieval / UI)
// ─────────────────────────────────────────────

/**
 * External-safe snapshot を取得 (redacted, PII firewall 通過後)。
 *
 * raw pairStateId は含まれず、`redactedRelationshipKey` (sha256 派生) が代わりに含まれる。
 *
 * A4 retrieval / diagnostics / UI で出してよい。
 *
 * @param key  internal pairStateId
 * @param salt redacted key 生成用 salt (caller-provided)
 * @returns external-safe snapshot。key 未登録なら null。
 */
export function getRedactedRelationshipStateSnapshot(
  key: InternalPairStateKey,
  salt: string,
): RedactedRelationshipStateSnapshot | null {
  const internal = getRelationshipStateSnapshotInternal(key);
  if (!internal) return null;
  return redactInternalState(internal, salt);
}

// ─────────────────────────────────────────────
// Public API — Container management
// ─────────────────────────────────────────────

/**
 * 特定 key の state を削除する。
 *
 * 用途: ペアの CoAlter 無効化時、または observer pipeline 再起動時。
 */
export function resetRelationshipState(key: InternalPairStateKey): void {
  validateKey(key, "resetRelationshipState");
  stateStore.delete(key);
}

// ─────────────────────────────────────────────
// Test-only helpers
// ─────────────────────────────────────────────

/**
 * 全 state を削除する。**tests only**。
 *
 * 副作用として reasonCodeCap も default にリセット。
 */
export function clearAllRelationshipStatesForTests(): void {
  stateStore.clear();
  reasonCodeCap = DEFAULT_REASON_CODE_CAP;
}

/**
 * reasonCodeCap を設定する。**tests only**。
 *
 * @param cap 正の有限数 (1 以上推奨)。
 */
export function setReasonCodeCapForTests(cap: number): void {
  if (
    typeof cap !== "number" ||
    cap <= 0 ||
    !Number.isFinite(cap) ||
    !Number.isInteger(cap)
  ) {
    throw new Error(
      "setReasonCodeCapForTests: cap must be a positive integer",
    );
  }
  reasonCodeCap = cap;
}

/**
 * 現在の reasonCodeCap を取得する。**tests only**。
 */
export function getReasonCodeCapForTests(): number {
  return reasonCodeCap;
}

/**
 * Store size を取得する。**tests only / debug only**。
 */
export function getStoreSizeForTests(): number {
  return stateStore.size;
}
