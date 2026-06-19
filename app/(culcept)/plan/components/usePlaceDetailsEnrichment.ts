"use client";

/**
 * app/(culcept)/plan/components/usePlaceDetailsEnrichment.ts
 *   — Candidate Lens / Phase 4-d: enrichment の client 取得 hook（lazy・session memo・no persist）
 *
 * ★規律:
 *   - **②detail を開いた時 / ③compare に入った時だけ `ensure(placeId)`**（呼び側が handler で呼ぶ）。browse/pager では呼ばない。
 *   - **session memo（Map・ref）で重複排除**＝同一 placeId は再 fetch しない（②→③ も 1 回）。in-flight は loading で占有。
 *   - **client は Google を直叩きしない**。自前 endpoint `/api/plan/places/details` を POST するだけ。
 *   - **no persistent cache**: localStorage/DB に書かない。タブを閉じれば memo は消滅。
 *   - flag OFF（UI/fetch）では `ensure` no-op・`resolutionFor` は全 fallback ＝ 既存 UI 完全不変。
 */
import { useCallback, useRef, useState } from "react";
import {
  createEnrichmentMemo,
  resolveEnrichment,
  shouldFetchEnrichment,
  loadingEnrichment,
  errorEnrichment,
  skippedEnrichment,
  isPlaceDetailsUiEnabled,
  isPlaceDetailsFetchEnabled,
  type EnrichmentResolution,
  type PlaceDetailsEnrichment,
  type EnrichmentSessionMemo,
} from "@/lib/plan/candidateLens/placeDetailsEnrichment";

export interface UsePlaceDetailsEnrichment {
  /** ②detail / ③compare 入場時に対象 placeId を取得（lazy・memo dedup・flag OFF で no-op）。 */
  readonly ensure: (placeId: string | null | undefined) => void;
  /** placeId の表示意図（UI flag OFF や未取得なら全 fallback ＝ abstract/未確認）。 */
  readonly resolutionFor: (placeId: string | null | undefined) => EnrichmentResolution;
}

const FALLBACK = resolveEnrichment(null);

export function usePlaceDetailsEnrichment(): UsePlaceDetailsEnrichment {
  const memoRef = useRef<EnrichmentSessionMemo>(createEnrichmentMemo());
  const [, tick] = useState(0);
  const rerender = useCallback(() => tick((x) => x + 1), []);

  const ensure = useCallback(
    (placeId: string | null | undefined) => {
      const active = isPlaceDetailsUiEnabled() && isPlaceDetailsFetchEnabled();
      const memo = memoRef.current;
      if (!shouldFetchEnrichment(placeId, memo.has(placeId as string), active)) return;
      const id = placeId as string;
      memo.set(id, loadingEnrichment(id)); // ★in-flight 占有で重複 fetch を防ぐ
      void (async () => {
        let result: PlaceDetailsEnrichment;
        try {
          const res = await fetch("/api/plan/places/details", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ placeId: id }),
          });
          if (!res.ok) {
            result = errorEnrichment(id, "http", `status_${res.status}`);
          } else {
            const json = (await res.json()) as { ok?: boolean; data?: PlaceDetailsEnrichment };
            result = json?.data ?? skippedEnrichment(id);
          }
        } catch {
          result = errorEnrichment(id, "unavailable", "client_fetch_failed");
        }
        memo.set(id, result);
        rerender();
      })();
    },
    [rerender],
  );

  const resolutionFor = useCallback((placeId: string | null | undefined): EnrichmentResolution => {
    if (!isPlaceDetailsUiEnabled() || !placeId) return FALLBACK;
    return resolveEnrichment(memoRef.current.get(placeId) ?? null);
  }, []);

  return { ensure, resolutionFor };
}
