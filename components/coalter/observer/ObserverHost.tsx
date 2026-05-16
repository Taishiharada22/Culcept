// A-2d canary trigger (2026-05-17): minor comment to bypass vercel.json
// ignoreCommand (Smart Skip would block empty / .md-only commits).
// All-Preview-scope flag NEXT_PUBLIC_COALTER_PRESENCE_OBSERVER=true requires
// a real build to inline the value via webpack DefinePlugin.
// Branch is short-lived (canary trigger only); CEO observation after deploy.
/**
 * CoAlter Always-On Observer — Host Component (Phase A-2c)
 *
 * 正本:
 *   - docs/coalter-aoo-a2b-implementation-preflight.md §8.2 (PR #157)
 *   - hooks/useObserverSubscription.ts (A-2c)
 *
 * 役割:
 *   `useObserverSubscription` を mount するだけの **null-render wrapper component**。
 *
 *   ChatClient.tsx に最小差分 (`<ObserverHost pairStateId={coalter.pairStateId} />` 1 箇所 +
 *   import 1 行) で mount するため、UI 影響ゼロで observer subscription を起動する。
 *
 * 不可侵境界 (PR #154 / #156 / #157):
 *   - `app/components/chat/UpperLayerMount.tsx` / `ModeSwitcher.tsx` 等は touch しない
 *   - `productionSignalBus.ts` / `presence layer 30+ files` 触らない
 *   - Production env 触らない
 *
 * UI 不変原則:
 *   - `return null` で UI 表示なし
 *   - 既存 layout / behavior に影響しない
 *   - `<ObserverHost />` を ChatClient 内のどこに置いても visual 影響なし
 */

"use client";

import { useObserverSubscription } from "@/hooks/useObserverSubscription";

interface ObserverHostProps {
  /** observer subscription を bind する pair state id。null なら subscribe しない。 */
  pairStateId: string | null;
}

/**
 * Observer Host — null render wrapper for `useObserverSubscription`。
 *
 * 用途:
 *   ```tsx
 *   import { ObserverHost } from "@/components/coalter/observer/ObserverHost";
 *   // ChatClient 内 JSX:
 *   <ObserverHost pairStateId={coalter.pairStateId} />
 *   ```
 *
 * Phase A-2c 段階では:
 *   - flag `NEXT_PUBLIC_COALTER_PRESENCE_OBSERVER` OFF (default) → 何もしない
 *   - flag ON (Preview 限定、CEO 操作) → presence bus に subscribe
 *
 * Phase B+ で UI 表示を追加する設計には**しない**。本 component は永続的に `return null`。
 * (UI 表示は別 component で別途設計、本 component の責務は subscription lifecycle のみ)
 */
export function ObserverHost({ pairStateId }: ObserverHostProps) {
  useObserverSubscription(pairStateId);
  return null;
}
