/**
 * Home Swipe Modal Lock — Pane 内 Modal 開時の swipe gesture disable mechanism
 *
 * 役割:
 *   Home 横スワイプ (HomeSwipeContainer) と、各 pane 内で開く Modal
 *   (AddAnchorModal / EditAnchorModal / AnchorDetailModal / SourceListModal 等) の
 *   gesture 衝突を防ぐための薄い共有 state。
 *
 * 設計書: docs/alter-plan-home-swipe-full-plan-pane-mini-design.md §9 (CEO 補正 #3)
 *
 * 動機:
 *   PR #214 で各 pane を CSS containing block 化したことで、modal の
 *   `position: fixed` は pane 内に閉じ込められる。これで modal が viewport を
 *   覆うこと自体は OK だが、modal 開時に horizontal swipe が起きると pane と
 *   一緒に modal も流れて UX が壊れる (modal を閉じる前に pane 切替)。
 *
 *   GPT 補正 (2026-05-20、CEO 経由): "modal 開時の swipe disable を Phase 1
 *   に入れる" を採択。本 module は modal 開示状態を global state として共有し、
 *   HomeSwipeContainer が gate するための minimal facade。
 *
 * 不変原則:
 *   - module-level state (counter + listener set)、React 外でも参照可能
 *   - useSyncExternalStore で React に safe に integration
 *   - register/release は対称 (cleanup function でリリース、idempotent)
 *   - SSR は常に false (modal は client-only state)
 *   - No 副作用: 単一純粋 counter、無限ループ / 非対称 risk なし
 *
 * 使用例 (Modal 側):
 *
 *   import { useEffect } from "react";
 *   import { registerHomeSwipeModalOpen } from "@/lib/home-swipe-modal-lock";
 *
 *   useEffect(() => {
 *     if (!isOpen) return;
 *     return registerHomeSwipeModalOpen();
 *   }, [isOpen]);
 *
 * 使用例 (HomeSwipeContainer 側):
 *
 *   const isModalOpen = useHomeSwipeModalLock();
 *   <motion.div drag={containerWidth > 0 && !isModalOpen ? "x" : false} ... />
 */

"use client";

import { useSyncExternalStore } from "react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Module-level state
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let openCount = 0;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Modal が open する時に call。返り値 (cleanup function) を unmount / close 時に呼ぶ。
 *
 * 通常 useEffect の cleanup として直接 return:
 *
 *   useEffect(() => {
 *     if (!isOpen) return;
 *     return registerHomeSwipeModalOpen();
 *   }, [isOpen]);
 *
 * - register 1 回 + release 1 回 = counter 不変、idempotent
 * - release を 2 回以上 call しても counter は減らない (released フラグで guard)
 */
export function registerHomeSwipeModalOpen(): () => void {
  openCount += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openCount -= 1;
    notify();
  };
}

/**
 * 現在 modal が 1 つ以上 open しているかを React state として subscribe する hook。
 * HomeSwipeContainer が呼んで、true なら horizontal drag を disable する。
 *
 * - useSyncExternalStore で React の concurrent rendering / SSR と整合
 * - SSR (server snapshot) は常に false (modal は client-only)
 */
export function useHomeSwipeModalLock(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internals (test 用 export)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): boolean {
  return openCount > 0;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * test only: counter を強制 reset (test 後 cleanup 用)。
 * production code から call してはいけない。
 */
export function __resetHomeSwipeModalLockForTest(): void {
  openCount = 0;
  listeners.clear();
}

/**
 * test only: 現在 openCount を直接読む (assertion 用)。
 */
export function __getHomeSwipeModalOpenCountForTest(): number {
  return openCount;
}
