"use client";

/**
 * Stage 3 L3-c — In-memory Mock SyncAdapter
 *
 * 正本: layout plan v0.3 §6.3 / runtime contract §2 全体
 *
 * SyncAdapter interface (L2-f) を満たす in-memory mock 実装。
 * preview 内で 2 client (A/B) が同一 SharedState を共有する模擬を提供する。
 *
 * 媒体実装本体 (Supabase Realtime / WebSocket / polling) は L4-e で CEO 審議。
 * 本 mock は preview 完結、本番経路は触らない。
 *
 * 構造:
 *   - MockSyncHub: pairId 単位の in-memory hub (SharedState + listeners)
 *   - useMockSyncAdapter: hub を wrap した SyncAdapter を返す hook
 *   - 遅延シミュレーション: server 処理時間 (latencyMs) を mock
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AckResult,
  BroadcastEvent,
  BroadcastListener,
  ClientOperation,
  SyncAdapter,
} from "@/lib/coalter/presence/syncAdapter";
import type { SharedState } from "@/lib/coalter/presence/sharedState";
import { initialSharedState } from "@/lib/coalter/presence/sharedState";

// ─────────────────────────────────────────────
// MockSyncHub: in-memory pair hub
// ─────────────────────────────────────────────

/**
 * pair 単位の in-memory hub。
 *
 * シングルトン的に管理 (preview 起動中は全 client が同じ pair に対して同じ hub を共有)。
 */
interface MockSyncHubInstance {
  pairId: string;
  state: SharedState;
  listeners: Set<BroadcastListener>;
  serverClock: number;
}

const HUB_REGISTRY = new Map<string, MockSyncHubInstance>();

function getHub(pairId: string): MockSyncHubInstance {
  let hub = HUB_REGISTRY.get(pairId);
  if (!hub) {
    hub = {
      pairId,
      state: initialSharedState(),
      listeners: new Set(),
      serverClock: 0,
    };
    HUB_REGISTRY.set(pairId, hub);
  }
  return hub;
}

/**
 * test / preview reset 用 (グローバル hub クリア)。
 */
export function __resetMockSyncHubs(): void {
  HUB_REGISTRY.clear();
}

// ─────────────────────────────────────────────
// 操作 → SharedState patch 変換
// ─────────────────────────────────────────────

function applyOperation(
  state: SharedState,
  operation: ClientOperation,
  serverTimestamp: number,
): SharedState {
  const payload = operation.payload;
  switch (payload.kind) {
    case "free_text_send":
      return {
        ...state,
        speechCard: {
          variant: "A",
          body: payload.text,
          spokeAt: serverTimestamp,
        },
        serverTimestamp,
      };
    case "chip_tap":
      return {
        ...state,
        lastChipTap: {
          chipKind: payload.chipKind,
          chipLabel: payload.chipLabel,
          tapBy: operation.user,
          tappedAt: serverTimestamp,
        },
        serverTimestamp,
      };
    case "mode_switch":
      return {
        ...state,
        mode: payload.target,
        serverTimestamp,
      };
    case "button_tap":
      // button_tap はそのまま op として記録、state 自体は変えない (UI 側で判断)
      return { ...state, serverTimestamp };
    case "memory_visibility_change":
      // memory store の更新は別 channel 経路で行う想定、本 mock は serverTimestamp のみ進める
      return { ...state, serverTimestamp };
    case "handoff_to_main_chat":
      return {
        ...state,
        handoffStatus: {
          handoffBy: operation.user,
          sourceId: payload.sourceId,
          transferredAt: serverTimestamp,
        },
        serverTimestamp,
      };
    case "rejection":
      // rejection は client 側 reducer に閉じる (rejectionReducer)、SharedState は serverTimestamp のみ
      return { ...state, serverTimestamp };
  }
}

// ─────────────────────────────────────────────
// 関数 API (React 非依存、test から直接使う)
// ─────────────────────────────────────────────

export interface CreateMockSyncAdapterOptions {
  pairId: string;
  latencyMs?: number;
}

/**
 * SyncAdapter を直接生成 (React 非依存)。
 *
 * 主に test 用。preview 内では useMockSyncAdapter (hook) 経由で使う。
 */
export function createMockSyncAdapter({
  pairId,
  latencyMs = 0,
}: CreateMockSyncAdapterOptions): SyncAdapter {
  return {
    async broadcast(operation: ClientOperation): Promise<AckResult> {
      const hub = getHub(operation.pairId ?? pairId);
      if (latencyMs > 0) {
        await new Promise((r) => setTimeout(r, latencyMs));
      }
      hub.serverClock++;
      const serverTimestamp = hub.serverClock;
      hub.state = applyOperation(hub.state, operation, serverTimestamp);
      const event: BroadcastEvent = {
        pairId: hub.pairId,
        patch: hub.state,
        origin: operation.user,
        serverTimestamp,
      };
      for (const l of hub.listeners) l(event);
      return { accepted: true, serverTimestamp };
    },
    subscribe(subPairId: string, listener: BroadcastListener): () => void {
      const hub = getHub(subPairId);
      hub.listeners.add(listener);
      return () => {
        hub.listeners.delete(listener);
      };
    },
    async fetchSnapshot(subPairId: string): Promise<SharedState> {
      const hub = getHub(subPairId);
      if (latencyMs > 0) {
        await new Promise((r) => setTimeout(r, latencyMs));
      }
      return hub.state;
    },
  };
}

// ─────────────────────────────────────────────
// useMockSyncAdapter
// ─────────────────────────────────────────────

export interface UseMockSyncAdapterOptions {
  pairId: string;
  /** server 処理シミュレート遅延 (ms)。default 0 */
  latencyMs?: number;
}

export interface MockSyncAdapterResult {
  adapter: SyncAdapter;
  /** 現 hub state (read-only snapshot) */
  hubState: SharedState;
  /** server clock (debug 用) */
  serverClock: number;
}

export function useMockSyncAdapter({
  pairId,
  latencyMs = 0,
}: UseMockSyncAdapterOptions): MockSyncAdapterResult {
  const hubRef = useRef(getHub(pairId));
  const [hubState, setHubState] = useState<SharedState>(hubRef.current.state);
  const [serverClock, setServerClock] = useState<number>(
    hubRef.current.serverClock,
  );

  // Internal listener: hub 更新を React state に反映
  useEffect(() => {
    const hub = hubRef.current;
    const internalListener: BroadcastListener = (event) => {
      setHubState(hub.state);
      setServerClock(hub.serverClock);
    };
    hub.listeners.add(internalListener);
    return () => {
      hub.listeners.delete(internalListener);
    };
  }, []);

  const broadcast = useCallback(
    async (operation: ClientOperation): Promise<AckResult> => {
      const hub = hubRef.current;
      if (latencyMs > 0) {
        await new Promise((r) => setTimeout(r, latencyMs));
      }
      hub.serverClock++;
      const serverTimestamp = hub.serverClock;
      hub.state = applyOperation(hub.state, operation, serverTimestamp);
      const event: BroadcastEvent = {
        pairId,
        patch: hub.state,
        origin: operation.user,
        serverTimestamp,
      };
      // 全 listener に broadcast
      for (const l of hub.listeners) l(event);
      return {
        accepted: true,
        serverTimestamp,
      };
    },
    [pairId, latencyMs],
  );

  const subscribe = useCallback(
    (subPairId: string, listener: BroadcastListener): (() => void) => {
      const hub = getHub(subPairId);
      hub.listeners.add(listener);
      return () => {
        hub.listeners.delete(listener);
      };
    },
    [],
  );

  const fetchSnapshot = useCallback(
    async (subPairId: string): Promise<SharedState> => {
      const hub = getHub(subPairId);
      if (latencyMs > 0) {
        await new Promise((r) => setTimeout(r, latencyMs));
      }
      return hub.state;
    },
    [latencyMs],
  );

  const adapter: SyncAdapter = useMemo(
    () => ({ broadcast, subscribe, fetchSnapshot }),
    [broadcast, subscribe, fetchSnapshot],
  );

  return { adapter, hubState, serverClock };
}
