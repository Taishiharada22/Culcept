"use client";

/**
 * Stage 4 B-3.2 — useMemoryItems hook
 *
 * 正本: layout plan v0.3 §7.7 / UI spec §8.3
 *
 * threadId 経由で /api/coalter/memory/list を fetch し、items / pairId / viewer を
 * 返す client-side hook。Realtime subscribe は本 hook 範疇外 (B-3.4 で別 gate)。
 *
 * 設計方針 (CEO 確定 2026-04-30):
 *   - 初期 fetch のみ (Realtime はまだ入れない)
 *   - API 404/403/500 時に UI を壊さない (空配列 fallback、error string 設定)
 *   - threadId が null/undefined で early return (空 state)
 *   - cancelled flag で race condition 防止 (threadId 切替時)
 *
 * 不変原則:
 *   - "use client" directive (useState / useEffect 利用)
 *   - fetch failure で例外を上位に投げない (catch 内で空 fallback)
 *   - DB schema 検証は API 側 RLS + 本 hook の isValidMemoryItem で defense in depth
 */

import { useEffect, useState } from "react";

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
}

/**
 * empty array の constant reference (re-render 抑制、stable identity)。
 */
const EMPTY: ReadonlyArray<MemoryItem> = Object.freeze([]);

/**
 * useMemoryItems hook 本体。threadId 単独 dependency で fetch 制御。
 *
 * threadId が変わったら再 fetch、cancelled flag で stale response を破棄。
 */
export function useMemoryItems(
  threadId: string | null | undefined,
): UseMemoryItemsResult {
  const [items, setItems] = useState<ReadonlyArray<MemoryItem>>(EMPTY);
  const [pairId, setPairId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<MemoryItemsViewer>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!threadId) {
      // threadId 不明 → 空 state、fetch しない
      setItems(EMPTY);
      setPairId(null);
      setViewer(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const fetchData = async () => {
      try {
        const url = `/api/coalter/memory/list?threadId=${encodeURIComponent(threadId)}`;
        const response = await fetch(url, { credentials: "include" });
        if (cancelled) return;

        if (!response.ok) {
          // 401 / 403 / 404 / 500 → 空 fallback (UI 壊さない、CEO 指示)
          setError(`fetch_failed_${response.status}`);
          setItems(EMPTY);
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
          setPairId(null);
          setViewer(null);
          setIsLoading(false);
          return;
        }

        // server side で filter 済だが defense in depth で client side でも検証
        const validItems = data.items.filter(isValidMemoryItem);

        setItems(validItems);
        setPairId(data.pairId);
        setViewer(data.viewer);
        setError(data.degraded === true ? "degraded" : null);
        setIsLoading(false);
      } catch {
        if (cancelled) return;
        // network error 等 → 空 fallback
        setError("network_error");
        setItems(EMPTY);
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

  return { items, pairId, viewer, isLoading, error };
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

/**
 * MemoryItem schema 検証 (defense in depth、API/RLS で gate 済だが client 側でも)。
 */
function isValidMemoryItem(item: unknown): item is MemoryItem {
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
