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
  makeSignalHandler,
} from "@/lib/coalter/observer/observerSubscriber";
import { isPresenceObserverEnabled } from "@/lib/coalter/observer/observerSubscriberGate";
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
