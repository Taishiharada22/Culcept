/**
 * CoAlter Always-On Observer — Subscription React Hook (Phase A-2c)
 *
 * 正本:
 *   - docs/coalter-aoo-a2b-implementation-preflight.md §8.2 (PR #157)
 *   - lib/coalter/observer/observerSubscriber.ts (A-2b, PR #158)
 *   - lib/coalter/observer/observerSubscriberGate.ts (A-2b)
 *
 * 役割:
 *   既存 presence layer `productionSignalBus` への passive subscribe を
 *   React lifecycle に乗せる client-side hook。
 *
 * 不可侵境界 (PR #154 / #156 / #157 で確定):
 *   - `productionSignalBus.ts` は touch しない (subscribe/unsubscribe API のみ呼ぶ)
 *   - presence layer 30+ files 不変
 *   - app/components/chat/ 17 files 不変
 *   - Production env 触らない
 *
 * CRITICAL 設計:
 *   1. flag OFF / pairStateId null → subscribe しない (no-op)
 *   2. React 18 Strict Mode の double-invoke (mount → cleanup → mount) で
 *      subscription leak しない
 *   3. HMR (Hot Module Replacement) で重複 subscribe しない
 *      → module-level registry で既存 unsubscribe を解除してから新規 subscribe
 *   4. unmount 時に必ず unsubscribe
 *   5. observer handler throw が UI を壊さない (handler 内で二重 try/catch、A-2b 実装)
 *   6. signal を mutate / consume / block しない (A-2b で保証)
 *   7. raw text / PII を保持・出力しない (A-2b の signalRedaction で保証)
 *
 * Test 戦略:
 *   - tests/unit/hooks/useObserverSubscription.test.tsx で:
 *     - flag OFF → subscribe 呼ばれない
 *     - flag ON + pairStateId → subscribe 呼ばれる
 *     - pairStateId null → subscribe 呼ばれない
 *     - unmount → unsubscribe 呼ばれる
 *     - strict mode double-invoke → leak しない
 *     - HMR / remount 相当 → duplicate subscribe しない
 */

"use client";

import { useEffect } from "react";
import {
  createObserverSession,
  generateEphemeralSalt,
  getObserverDebugCountersForDebug,
  makeSignalHandler,
  type ObserverDebugCounters,
} from "@/lib/coalter/observer/observerSubscriber";
import { isPresenceObserverEnabled } from "@/lib/coalter/observer/observerSubscriberGate";
import {
  getRedactedRelationshipStateSnapshot,
  iterateRedactedSnapshotsForDebug,
} from "@/lib/coalter/observer/relationshipState";
import type { RedactedRelationshipStateSnapshot } from "@/lib/coalter/observer/relationshipStateTypes";
import { COALTER_FLAGS } from "@/lib/coalter/flags";
import { subscribePresenceSignal } from "@/lib/coalter/presence/productionSignalBus";

/**
 * Module-level subscription registry。
 *
 * HMR / 異なる component instance での **重複 subscribe を防ぐ** ためのガード。
 * key = pairStateId、value = 現在登録されている unsubscribe 関数。
 *
 * React Strict Mode (mount → cleanup → mount) の場合、cleanup で registry から
 * 自分の unsubscribe を呼んで delete、次の mount で再登録する形になり、
 * 最終状態は 1 subscription/pairStateId に収束する。
 */
const subscriptionRegistry: Map<string, () => void> = new Map<
  string,
  () => void
>();

// ─────────────────────────────────────────────
// A-2e canary: Debug global expose state (closure, never externally accessible)
// ─────────────────────────────────────────────

/** Debug session salt (closure 内のみ、external 不可、destroyDebugGlobal で破棄)。 */
let debugSessionSalt: string | null = null;
/** 現在 mount 中の ObserverHost に紐づく pairStateId (closure 内、external 不可)。 */
let currentActivePairStateIdForDebug: string | null = null;
/** Debug global install timestamp (expire 検査用)。 */
let debugInstalledAt: number | null = null;

/** Debug global 自動 expire 時間 (15 min、CEO/GPT 補正)。 */
const DEBUG_EXPIRE_MS = 15 * 60 * 1000;

/** Debug global の globalThis key (外部公開可能、ただし内容は redacted only)。 */
const DEBUG_GLOBAL_KEY = "__AOO_DEBUG_STATE__";

/**
 * Debug global を破棄する (manual selfDestroy / 自動 expire / cleanup から呼ばれる)。
 *
 * 全 closure variable をクリアし、globalThis から delete する。
 */
function destroyDebugGlobal(): void {
  if (typeof globalThis !== "undefined") {
    delete (globalThis as Record<string, unknown>)[DEBUG_GLOBAL_KEY];
  }
  debugSessionSalt = null;
  currentActivePairStateIdForDebug = null;
  debugInstalledAt = null;
}

/**
 * Debug global を install する (env-gated)。
 *
 * **設計 (CEO/GPT 補正 2026-05-17 全面反映)**:
 *   - `presenceObserverDebugExposeEnabled` flag ON 時のみ install
 *   - NODE_ENV gate なし (Preview build = production build なので NODE_ENV gate は
 *     canary を無効化する、GPT 補正で削除)
 *   - session-local ephemeral salt 使用 (hardcoded salt は使わない)
 *   - 15 min 後自動 expire (各 accessor 呼出時に check)
 *   - selfDestroy() で manual cleanup 可能
 *   - raw pairStateId は closure 内のみ、external 不可
 *   - 露出 API: getRegistrySize / getCurrentRedactedSnapshot / getAllRedactedSnapshots / selfDestroy / meta
 *   - 禁止 API: getRedactedStateForPair(pairStateId) — CEO に raw pairStateId 入力させない
 */
function installDebugGlobalIfEnabled(pairStateId: string): void {
  if (typeof globalThis === "undefined") return;
  if (!COALTER_FLAGS.presenceObserverDebugExposeEnabled) return;

  // Session-local ephemeral salt: install ごとに 1 回生成
  // (HMR / 再 mount で同 salt 再利用すると redactedKey が一致するため subscribe 切替で
  // 必ず新規生成)
  let saltGenerationFailed = false;
  if (debugSessionSalt === null) {
    try {
      debugSessionSalt = generateEphemeralSalt();
    } catch {
      // crypto unavailable → debug install skip (fail-closed)
      saltGenerationFailed = true;
    }
  }
  if (saltGenerationFailed || debugSessionSalt === null) return;

  const installedAt = Date.now();
  const expiresAt = installedAt + DEBUG_EXPIRE_MS;

  debugInstalledAt = installedAt;
  currentActivePairStateIdForDebug = pairStateId;

  const checkExpire = (): void => {
    if (debugInstalledAt === null) {
      throw new Error(`${DEBUG_GLOBAL_KEY} already destroyed`);
    }
    if (Date.now() > debugInstalledAt + DEBUG_EXPIRE_MS) {
      destroyDebugGlobal();
      throw new Error(`${DEBUG_GLOBAL_KEY} expired (15 min)`);
    }
  };

  (globalThis as Record<string, unknown>)[DEBUG_GLOBAL_KEY] = {
    meta: {
      installedAt,
      expiresAt,
      version: "a2e-canary-v2",
    },
    getRegistrySize: (): number => {
      checkExpire();
      return subscriptionRegistry.size;
    },
    getCurrentRedactedSnapshot: (): RedactedRelationshipStateSnapshot | null => {
      checkExpire();
      if (currentActivePairStateIdForDebug === null) return null;
      if (debugSessionSalt === null) return null;
      return getRedactedRelationshipStateSnapshot(
        currentActivePairStateIdForDebug,
        debugSessionSalt,
      );
    },
    getAllRedactedSnapshots: (): RedactedRelationshipStateSnapshot[] => {
      checkExpire();
      if (debugSessionSalt === null) return [];
      return iterateRedactedSnapshotsForDebug(debugSessionSalt);
    },
    /**
     * A-2e canary v2.1 (2026-05-17 追加):
     * handler 到達 / redact / state update の各 phase の redacted counter を返す。
     * 用途: stateStore 空の原因切り分け (signal が届いていない / handler skip /
     * redact 失敗 / state_update 失敗 のどれか)。
     * raw text / raw IDs は一切含まない (固定 enum + integer のみ)。
     */
    getDebugCounters: (): ObserverDebugCounters => {
      checkExpire();
      return getObserverDebugCountersForDebug();
    },
    selfDestroy: (): void => {
      destroyDebugGlobal();
    },
  };
}

/**
 * Debug global の cleanup tracking (subscribe cleanup と連動)。
 *
 * cleanup された pairStateId が `currentActivePairStateIdForDebug` と一致するなら、
 * debug global も破棄する (active session 消滅 → debug 不要)。
 *
 * **設計判断**: subscribe cleanup で debug global を消す方が safe。subscribe が
 * 動いていないのに debug global が残ると、CEO が誤って空の snapshot を見続ける。
 */
function maybeDestroyDebugGlobalOnCleanup(pairStateId: string): void {
  if (currentActivePairStateIdForDebug === pairStateId) {
    destroyDebugGlobal();
  }
}

/**
 * Effect callback の **pure 抽出版**。React 非依存、テスト可能。
 *
 * 本関数は `useEffect(() => _runObserverSubscriptionEffect(pairStateId))` 相当の
 * 動作をする。test 環境では `useEffect` を経由せず本関数を直接呼んで verify する
 * (test 環境が node-only で React Testing Library 未導入のため)。
 *
 * 動作:
 *   1. pairStateId が null / "" → null cleanup を返す (skip)
 *   2. `isPresenceObserverEnabled()` flag check (default false / unset → skip)
 *   3. HMR guard: 既存 entry を解除してから新規 subscribe
 *   4. session 作成 → `subscribePresenceSignal(handler)` で bus subscribe
 *   5. unsubscribe を registry に保存
 *   6. cleanup 関数を返す: registry から自分の unsubscribe を取り出し実行
 *
 * @returns cleanup function (useEffect 互換)、または null (skip 時)
 */
export function _runObserverSubscriptionEffect(
  pairStateId: string | null,
): (() => void) | null {
  if (pairStateId === null || pairStateId === "") return null;
  if (!isPresenceObserverEnabled()) return null;

  // HMR / 重複 mount guard: 既存 subscription 解除
  const existingUnsubscribe = subscriptionRegistry.get(pairStateId);
  if (existingUnsubscribe) {
    try {
      existingUnsubscribe();
    } catch {
      // 既存 unsubscribe の失敗は握りつぶす (presence bus の不可侵境界遵守)
    }
    subscriptionRegistry.delete(pairStateId);
  }

  // Session 作成 + bus subscribe
  let unsubscribe: (() => void) | null = null;
  try {
    const session = createObserverSession({ pairStateId });
    const handler = makeSignalHandler(session);
    unsubscribe = subscribePresenceSignal(handler);
    subscriptionRegistry.set(pairStateId, unsubscribe);
  } catch {
    // session 作成 / subscribe 失敗は握りつぶす (presence layer に影響させない)
    return null;
  }

  // A-2e canary: Debug global install (flag-gated、subscribe 成功時のみ)
  try {
    installDebugGlobalIfEnabled(pairStateId);
  } catch {
    // debug install 失敗は握りつぶす (observer 本体には影響させない)
  }

  return () => {
    // Cleanup: registry から自分の unsubscribe を取り出し実行
    // strict mode double-invoke でも leak しないよう registry の現状と比較
    const currentUnsubscribe = subscriptionRegistry.get(pairStateId);
    if (currentUnsubscribe === unsubscribe && unsubscribe !== null) {
      try {
        unsubscribe();
      } catch {
        // unsubscribe 失敗は握りつぶす
      }
      subscriptionRegistry.delete(pairStateId);
    } else if (unsubscribe !== null) {
      // registry が別の subscription に置き換わっている (HMR 等) → 自分だけ unsubscribe
      try {
        unsubscribe();
      } catch {
        // unsubscribe 失敗は握りつぶす
      }
    }

    // A-2e canary: cleanup された pairStateId が current active なら debug global も破棄
    try {
      maybeDestroyDebugGlobalOnCleanup(pairStateId);
    } catch {
      // debug cleanup 失敗は握りつぶす
    }
  };
}

/**
 * Presence signal bus への subscribe を React lifecycle に乗せる hook。
 *
 * 実体は `_runObserverSubscriptionEffect()` を `useEffect` に渡すだけの薄い wrapper。
 *
 * 動作 / 副作用 / 戻り値の詳細は `_runObserverSubscriptionEffect()` JSDoc 参照。
 */
export function useObserverSubscription(pairStateId: string | null): void {
  useEffect(() => {
    const cleanup = _runObserverSubscriptionEffect(pairStateId);
    return () => {
      if (cleanup !== null) cleanup();
    };
  }, [pairStateId]);
}

// ─────────────────────────────────────────────
// Test-only helpers (production logic では使わない)
// ─────────────────────────────────────────────

/**
 * Subscription registry の現在サイズを取得する。**tests only**。
 *
 * leak detection (strict mode / HMR / unmount test) に使う。
 */
export function __getSubscriptionRegistrySizeForTests(): number {
  return subscriptionRegistry.size;
}

/**
 * Subscription registry をクリアする。**tests only**。
 *
 * 各 test の beforeEach / afterEach で reset。
 *
 * Note: 既存 subscription を unsubscribe してから clear する。
 */
export function __clearSubscriptionRegistryForTests(): void {
  for (const unsubscribe of subscriptionRegistry.values()) {
    try {
      unsubscribe();
    } catch {
      // ignore cleanup errors in test reset
    }
  }
  subscriptionRegistry.clear();
}

/**
 * Debug global / debug closure state を強制クリアする。**tests only**。
 *
 * 各 test の beforeEach / afterEach で reset (debug session salt / current pair /
 * installed timestamp / globalThis.__AOO_DEBUG_STATE__ を全クリア)。
 */
export function __clearDebugGlobalForTests(): void {
  destroyDebugGlobal();
}

/**
 * Debug global の現在 install 状態を取得する。**tests only**。
 *
 * @returns true if `globalThis.__AOO_DEBUG_STATE__` が install 済
 */
export function __isDebugGlobalInstalledForTests(): boolean {
  if (typeof globalThis === "undefined") return false;
  return DEBUG_GLOBAL_KEY in (globalThis as Record<string, unknown>);
}
