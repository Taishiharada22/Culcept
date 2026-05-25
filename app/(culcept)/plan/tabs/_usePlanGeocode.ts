"use client";

/**
 * Plan MapTab 用 client-side batch geocode hook (Phase 2-C v3 §5.4 + §5.9)
 *
 * 設計書: docs/alter-plan-phase2-c-map-tab-mini-design.md
 *
 * 役割:
 *   - 表示対象 anchor の locationText を server endpoint (`/api/plan/anchors/geocode`) に
 *     1 round-trip で送信、{ anchorId → resolution | null } の Map を返す
 *   - lazy resolve: caller (MapTab) が visible window 内の anchor のみ渡す前提
 *   - optimistic UI: loading=true で render、結果到着次第更新
 *   - fail-open: network error / endpoint 500 / 空配列 → 全 anchor を null として返す (semantic fallback に回せる)
 *   - sensitive / unresolvable / not-owned anchor は server 側で null + reason 付き返却
 *   - dedupe / cache / rate limit は server 側で実施 (client は意識しない)
 *
 * 不変原則:
 *   - localStorage / sessionStorage / IndexedDB に書き込まない (privacy: in-memory のみ)
 *   - anchor.title / notes / sensitiveCategory を server に送らない (server endpoint 自体が validation)
 *   - cleanup: cancelled flag で stale fetch の race condition 防御
 */

import { useEffect, useMemo, useState } from "react";

import type { ExternalAnchor } from "@/lib/plan/external-anchor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AnchorResolution {
  lat: number;
  lng: number;
  confidence: string;
  resolvedName: string;
}

export interface UsePlanGeocodeResult {
  /** anchor.id → 解決結果 (null = unresolved、semantic fallback に回す) */
  resolutions: Map<string, AnchorResolution | null>;
  /** server fetch in flight */
  loading: boolean;
  /** server 側で GOOGLE_MAPS_API_KEY が未設定 (= 全 anchor が unresolved_api_unavailable) */
  apiAvailable: boolean;
}

interface GeocodeResultEntry {
  anchorId: string;
  resolution: AnchorResolution | null;
  reason: string;
}

interface GeocodeApiResponse {
  ok: boolean;
  data?: {
    results: GeocodeResultEntry[];
    apiAvailable: boolean;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 渡された anchor 群を batch resolve する hook。
 *
 * @param visibleAnchors caller が lazy filter した anchor 配列 (典型: windowDays 内 occurrence あり)
 * @returns 解決結果 + loading state + apiAvailable
 *
 * 使用例:
 *   const visible = useMemo(() => allAnchors.filter(a => hasOccurrenceInWindow(a, today, end)), [allAnchors, today, end]);
 *   const { resolutions, loading, apiAvailable } = usePlanGeocode(visible);
 *   // optimistic: CategoryGrid / UnresolvedAnchorsSection は即 render、Map は loading=false で populate
 */
export function usePlanGeocode(
  visibleAnchors: ExternalAnchor[],
): UsePlanGeocodeResult {
  const [resolutions, setResolutions] = useState<
    Map<string, AnchorResolution | null>
  >(() => new Map());
  const [loading, setLoading] = useState<boolean>(false);
  const [apiAvailable, setApiAvailable] = useState<boolean>(true);

  // anchor の id 集合を dep として識別 (anchors 配列の reference は毎 render 変わる可能性)
  // anchors の locationText が変わると同 id でも別 fetch するため、locationText も dep に含む
  const fetchKey = useMemo(() => {
    return visibleAnchors
      .map((a) => `${a.id}:${(a.locationText ?? "").trim()}`)
      .sort()
      .join("|");
  }, [visibleAnchors]);

  useEffect(() => {
    let cancelled = false;

    // anchor が 0 件 → 空 Map で即 set
    if (visibleAnchors.length === 0) {
      setResolutions(new Map());
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    // anchor with locationText のみ server に送信 (locationText 空は server で unresolved_empty 扱いになるが、
    // client 側で先に filter することで余計な server request を減らす)
    const items = visibleAnchors
      .filter((a) => a.locationText && a.locationText.trim().length > 0)
      .map((a) => ({
        anchorId: a.id,
        locationText: a.locationText!.trim(),
      }));

    if (items.length === 0) {
      // 全 anchor が locationText なし → fetch 不要、全 null
      const m = new Map<string, AnchorResolution | null>();
      for (const a of visibleAnchors) m.set(a.id, null);
      setResolutions(m);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);

    fetch("/api/plan/anchors/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
      .then((r) => r.json() as Promise<GeocodeApiResponse>)
      .then((res) => {
        if (cancelled) return;
        const m = new Map<string, AnchorResolution | null>();
        // 先に全 anchor を null で初期化 (locationText なし anchor 用)
        for (const a of visibleAnchors) m.set(a.id, null);
        if (res.ok && res.data) {
          for (const r of res.data.results) {
            m.set(r.anchorId, r.resolution);
          }
          setApiAvailable(res.data.apiAvailable);
        }
        setResolutions(m);
      })
      .catch(() => {
        if (cancelled) return;
        // fail-open: network error / 401 / 429 などはすべて全 anchor null で続行
        const m = new Map<string, AnchorResolution | null>();
        for (const a of visibleAnchors) m.set(a.id, null);
        setResolutions(m);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // fetchKey が同じなら refetch しない。visibleAnchors の reference が変わっても OK。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  return { resolutions, loading, apiAvailable };
}
