"use client";

/**
 * Stage 4 B-3.2 → B-3.4.b — useMemoryItems hook
 *
 * 正本: layout plan v0.3 §7.7 / UI spec §8.3
 *
 * threadId 経由で /api/coalter/memory/list を fetch し、items / pairId / viewer を
 * 返す client-side hook。
 *
 * Phase 履歴:
 *   - B-3.2 (2026-04-30): initial fetch のみ (Realtime なし)
 *   - B-3.4.b (2026-04-30): Supabase Realtime subscribe を追加 (channel
 *     `coalter_memory:${pairId}`、postgres_changes filter `pair_id=eq.${pairId}`、
 *     throttle 250ms、computeNext / shouldDisplay の 3 層 defense in depth)
 *
 * 設計方針 (CEO 確定 2026-04-30):
 *   - 250ms throttle で連続 events を 1 setItems に bundle
 *   - throttle 中の連続 event は pendingRef を base に compute (取りこぼし防止、
 *     CEO 修正条件 1)
 *   - shouldDisplay で viewer visibility / internal_only / expired を gate
 *     (CEO 修正条件 2、defense in depth)
 *   - publication 未追加環境で CHANNEL_ERROR / TIMED_OUT を受けても UI 壊れない
 *     (initial fetch 経路 + setRealtimeError fallback で保証、CEO Gate C)
 *
 * security boundary (3 層):
 *   1. RLS (主防御): SELECT policy で pair member + 片側可視性 enforce、Realtime
 *      broadcast は subscriber session の RLS を評価
 *   2. filter (server-side、performance): `pair_id=eq.${pairId}` で別 pair の
 *      event を server-side で短絡
 *   3. client shouldDisplay (UI-level、副防御): visibility / expires / viewer
 *      scope を client 側でも check (本 hook 内)
 *
 * 不変原則:
 *   - "use client" directive (useState / useEffect / useRef 利用)
 *   - fetch / subscribe failure で例外を上位に投げない (catch 内で空 fallback)
 *   - DB schema 検証は API 側 RLS + 本 hook の isValidMemoryItem で defense in depth
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import { supabaseBrowser } from "@/lib/supabase/client";
import type { MemoryItem } from "@/lib/coalter/presence/memoryTypes";

export type MemoryItemsViewer = "user_a" | "user_b" | null;

export interface UseMemoryItemsResult {
  /** 取得済 memory items (空 array なら未取得 / fallback / 内容ゼロ) */
  items: ReadonlyArray<MemoryItem>;
  /** pair_id (確定不能なら null) */
  pairId: string | null;
  /** 自分の role (確定不能なら null = 表示しない判断材料) */
  viewer: MemoryItemsViewer;
  isLoading: boolean;
  /** error string (`fetch_failed_<status>` / `network_error` / `degraded` / null) */
  error: string | null;
  /** Realtime channel error string (`channel_channel_error` / `channel_timed_out` / null) */
  realtimeError: string | null;
}

/**
 * empty array の constant reference (re-render 抑制、stable identity)。
 */
const EMPTY: ReadonlyArray<MemoryItem> = Object.freeze([]);

/**
 * Realtime throttle window (CEO 確定 2026-04-30、250ms)。
 *
 * 即時性より安定性優先 (100ms = 過敏、500ms = 体感遅、250ms = balance)。
 */
export const REALTIME_THROTTLE_MS = 250;

/**
 * MemoryItem schema 検証 (defense in depth、API/RLS で gate 済だが client 側でも)。
 *
 * 本関数は initial fetch + realtime event 両方で使う pure function。test 容易性
 * のため export する。
 */
export function isValidMemoryItem(item: unknown): item is MemoryItem {
  if (item == null || typeof item !== "object") return false;
  const i = item as Record<string, unknown>;
  if (typeof i.id !== "string") return false;
  if (typeof i.content !== "string") return false;
  if (
    !["explicit_shared", "inferred", "transient_summary"].includes(
      i.origin as string,
    )
  ) {
    return false;
  }
  if (!["high", "medium", "low"].includes(i.certainty as string)) return false;
  if (
    !["both_visible", "user_a_only", "user_b_only", "internal_only"].includes(
      i.visibility as string,
    )
  ) {
    return false;
  }
  if (!["normal", "daily", "travel"].includes(i.modeContext as string)) {
    return false;
  }
  if (typeof i.createdAt !== "number") return false;
  if (typeof i.updatedAt !== "number") return false;
  if (i.expiresAt !== undefined && typeof i.expiresAt !== "number") {
    return false;
  }
  return true;
}

/**
 * 表示判定 (3 層防御の client side、CEO 修正条件 2 / 2026-04-30)。
 *
 * 純関数、test 容易性のため export。
 *
 * 不可侵原則:
 *   - viewer="user_a" + visibility="user_b_only" → false (片側可視性、user_a に user_b 専用は見せない)
 *   - viewer="user_b" + visibility="user_a_only" → false (同上)
 *   - visibility="internal_only" → 常に false (どの viewer でも UI に出さない)
 *   - expires_at <= now → false (transient_summary 自動消滅)
 *   - both_visible / same-side scope → true
 */
export function shouldDisplay(
  item: MemoryItem,
  viewer: "user_a" | "user_b",
  now: number = Date.now(),
): boolean {
  // expired (transient_summary 自動消滅)
  if (item.expiresAt !== undefined && item.expiresAt <= now) return false;

  // visibility 軸
  switch (item.visibility) {
    case "internal_only":
      return false;
    case "both_visible":
      return true;
    case "user_a_only":
      return viewer === "user_a";
    case "user_b_only":
      return viewer === "user_b";
    default:
      // 未知 visibility → defensive false
      return false;
  }
}

/**
 * DB row → MemoryItem 変換 (Realtime payload からの mapping、API route と同 logic)。
 *
 * Realtime postgres_changes payload は DB column 名 (snake_case) で来るため、
 * camelCase + epoch ms に変換する。test 容易性のため export。
 */
export function mapRealtimeRow(row: Record<string, unknown>): MemoryItem | null {
  if (typeof row.id !== "string") return null;
  if (typeof row.content !== "string") return null;
  const created = typeof row.created_at === "string"
    ? new Date(row.created_at).getTime()
    : NaN;
  const updated = typeof row.updated_at === "string"
    ? new Date(row.updated_at).getTime()
    : NaN;
  if (Number.isNaN(created) || Number.isNaN(updated)) return null;
  const expires = typeof row.expires_at === "string"
    ? new Date(row.expires_at).getTime()
    : undefined;
  const candidate = {
    id: row.id,
    content: row.content,
    origin: row.origin,
    certainty: row.certainty,
    visibility: row.visibility,
    modeContext: row.mode_context,
    createdAt: created,
    updatedAt: updated,
    expiresAt: expires,
  };
  if (!isValidMemoryItem(candidate)) return null;
  return candidate;
}

/**
 * 次 items state を pure function で計算 (CEO 修正条件 1、test 容易性のため export)。
 *
 * INSERT / UPDATE / DELETE event 種別ごとに base items に対する変更を返す。
 * shouldDisplay で UI scope を gate (defense in depth)。
 *
 * 重要: throttle 中の連続 event は pendingRef.current ?? itemsRef.current を base
 * にする (取りこぼし防止)。本関数は base + payload を受け取るのみ、ref 解決は
 * 呼び出し側の責務。
 */
export function computeNext(
  base: ReadonlyArray<MemoryItem>,
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  viewer: "user_a" | "user_b",
  now: number = Date.now(),
): MemoryItem[] {
  const eventType = payload.eventType;

  if (eventType === "INSERT") {
    const next = mapRealtimeRow(payload.new);
    if (next === null || !shouldDisplay(next, viewer, now)) return [...base];
    // newest first (created_at DESC sort と整合)
    // 同 id があれば置換 (race condition 防止)
    const filtered = base.filter((it) => it.id !== next.id);
    return [next, ...filtered];
  }

  if (eventType === "UPDATE") {
    const updated = mapRealtimeRow(payload.new);
    if (updated === null) return [...base];
    if (!shouldDisplay(updated, viewer, now)) {
      // visibility 変更で見えなくなった (例: both_visible → internal_only) → filter out
      return base.filter((it) => it.id !== updated.id);
    }
    // id match で replace、なければ append (subscribe 取りこぼし時の整合性)
    const exists = base.some((it) => it.id === updated.id);
    if (exists) {
      return base.map((it) => (it.id === updated.id ? updated : it));
    }
    return [updated, ...base];
  }

  if (eventType === "DELETE") {
    const oldRow = payload.old as Record<string, unknown> | null;
    if (oldRow === null || typeof oldRow.id !== "string") return [...base];
    const deletedId = oldRow.id;
    return base.filter((it) => it.id !== deletedId);
  }

  // 未知 eventType → no change
  return [...base];
}

/**
 * useMemoryItems hook 本体 (B-3.4.b で Realtime 拡張)。
 *
 * threadId 単独 dependency で initial fetch、pairId 確定後に Realtime subscribe。
 */
export function useMemoryItems(
  threadId: string | null | undefined,
): UseMemoryItemsResult {
  const [items, setItems] = useState<ReadonlyArray<MemoryItem>>(EMPTY);
  const [pairId, setPairId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<MemoryItemsViewer>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);

  /**
   * Realtime throttle 用 refs:
   *   - itemsRef: 現在の items (async setState を経由せず realtime handler から参照)
   *   - pendingRef: throttle 中の next items (取りこぼし防止のため後続 event の base)
   *   - timerRef: setTimeout の handle (unmount で clearTimeout)
   *   - viewerRef: realtime handler 内で最新 viewer を参照
   */
  const itemsRef = useRef<MemoryItem[]>([]);
  const pendingRef = useRef<MemoryItem[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewerRef = useRef<MemoryItemsViewer>(null);

  // viewer ref を最新化 (realtime handler が closure 内で stale viewer を読まないように)
  useEffect(() => {
    viewerRef.current = viewer;
  }, [viewer]);

  /**
   * throttle flush: pendingRef を setItems に反映、itemsRef も同期。
   */
  const flushThrottled = useCallback(() => {
    if (pendingRef.current !== null) {
      const next = pendingRef.current;
      setItems(next);
      itemsRef.current = next;
      pendingRef.current = null;
    }
    timerRef.current = null;
  }, []);

  /**
   * scheduleUpdate: pendingRef に上書き保存 + 250ms タイマー設定。
   *
   * 既に timer 中なら追加 setTimeout しない (covering write のみ)。
   */
  const scheduleUpdate = useCallback(
    (next: MemoryItem[]) => {
      pendingRef.current = next;
      if (timerRef.current === null) {
        timerRef.current = setTimeout(flushThrottled, REALTIME_THROTTLE_MS);
      }
    },
    [flushThrottled],
  );

  // ─────────────────────────────────────────────
  // Initial fetch (B-3.2 維持)
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!threadId) {
      // threadId 不明 → 空 state、fetch しない
      setItems(EMPTY);
      itemsRef.current = [];
      setPairId(null);
      setViewer(null);
      setIsLoading(false);
      setError(null);
      setRealtimeError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setRealtimeError(null);

    const fetchData = async () => {
      try {
        const url = `/api/coalter/memory/list?threadId=${encodeURIComponent(threadId)}`;
        const response = await fetch(url, { credentials: "include" });
        if (cancelled) return;

        if (!response.ok) {
          // 401 / 403 / 404 / 500 → 空 fallback (UI 壊さない、CEO 指示)
          setError(`fetch_failed_${response.status}`);
          setItems(EMPTY);
          itemsRef.current = [];
          setPairId(null);
          setViewer(null);
          setIsLoading(false);
          return;
        }

        const data = (await response.json()) as unknown;
        if (cancelled) return;

        if (!isResponseShape(data)) {
          setError("invalid_response_shape");
          setItems(EMPTY);
          itemsRef.current = [];
          setPairId(null);
          setViewer(null);
          setIsLoading(false);
          return;
        }

        // server side で filter 済だが defense in depth で client side でも検証
        const validItems = data.items.filter(isValidMemoryItem);

        setItems(validItems);
        itemsRef.current = validItems.slice();
        setPairId(data.pairId);
        setViewer(data.viewer);
        setError(data.degraded === true ? "degraded" : null);
        setIsLoading(false);
      } catch {
        if (cancelled) return;
        // network error 等 → 空 fallback
        setError("network_error");
        setItems(EMPTY);
        itemsRef.current = [];
        setPairId(null);
        setViewer(null);
        setIsLoading(false);
      }
    };

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, [threadId]);

  // ─────────────────────────────────────────────
  // Realtime subscribe (B-3.4.b、pairId 確定後)
  // ─────────────────────────────────────────────
  useEffect(() => {
    // pairId 不明 = initial fetch 未完 / 失敗 → subscribe しない
    if (!pairId) return;

    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`coalter_memory:${pairId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "coalter_memory_items",
          filter: `pair_id=eq.${pairId}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const currentViewer = viewerRef.current;
          if (currentViewer === null) return; // viewer 未確定 → drop

          // CEO 修正条件 1 (2026-04-30): throttle 中は pendingRef を base、
          // なければ itemsRef.current を base
          const base = pendingRef.current ?? itemsRef.current;
          const next = computeNext(base, payload, currentViewer);
          scheduleUpdate(next);
        },
      )
      .subscribe((status: string) => {
        // 接続状態の error fallback (publication 未追加環境含む、CEO Gate C)
        if (status === "CHANNEL_ERROR") {
          setRealtimeError("channel_channel_error");
        } else if (status === "TIMED_OUT") {
          setRealtimeError("channel_timed_out");
        } else if (status === "SUBSCRIBED") {
          setRealtimeError(null);
        }
        // CLOSED は unmount 経路、何もしない
      });

    return () => {
      // throttle pending を捨てる (memory leak / stale flush 防止)
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingRef.current = null;
      // channel cleanup
      void supabase.removeChannel(channel);
    };
  }, [pairId, scheduleUpdate]);

  return { items, pairId, viewer, isLoading, error, realtimeError };
}

/**
 * API response shape の type guard (defense in depth)。
 */
interface ApiResponseShape {
  pairId: string;
  viewer: "user_a" | "user_b";
  items: ReadonlyArray<unknown>;
  degraded?: boolean;
}

function isResponseShape(data: unknown): data is ApiResponseShape {
  if (data == null || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (typeof d.pairId !== "string") return false;
  if (d.viewer !== "user_a" && d.viewer !== "user_b") return false;
  if (!Array.isArray(d.items)) return false;
  return true;
}
