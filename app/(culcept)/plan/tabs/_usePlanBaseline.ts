"use client";

/**
 * Plan MapTab 用 client-side baseline coord 解決 hook
 *
 * 設計書: docs/alter-plan-phase2-c-map-tab-mini-design.md
 * CEO 補正 (2026-05-20): 「予定ができたら必ず pin にする」 哲学整合のため、
 *   resolved anchor の lat/lng がなくても baseline で pin を出す。
 *   baseline 優先順位:
 *     1. homeCoords (user の home として保存された coord)
 *     2. prefecture → PREFECTURE_COORDS (県庁所在地 fallback)
 *     3. null (baseline 未設定 or 未収録 prefecture)
 *
 * 範囲外:
 *   - GPS / 現在地取得 (Layer 3、未実装、別 wave)
 *   - server-side で baseline 解決 (client で /api/baseline GET 1 回)
 *   - baseline 更新時の live refresh (user は MapTab を re-mount すれば再 fetch)
 */

import { useEffect, useState } from "react";

import { PREFECTURE_COORDS } from "@/lib/shared/location";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BaselineCoords {
  lat: number;
  lng: number;
  /** "home" = user の home として保存された具体 coord、"prefecture" = 県庁所在地 fallback */
  source: "home" | "prefecture";
  /** UI 表示用 label (例: "東京都 渋谷区" or "東京都")、null 可 */
  label: string | null;
}

export interface UsePlanBaselineResult {
  baselineCoords: BaselineCoords | null;
  loading: boolean;
}

interface BaselineApiResponse {
  ok: boolean;
  baseline?: {
    prefecture: string | null;
    city: string | null;
    homeCoords: { lat: number; lng: number } | null;
    coordsStatus?: "resolved" | "fallback" | "unresolved";
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * `/api/baseline` GET から user の baseline coord を解決する。
 *
 * 注: PREFECTURE_COORDS は `{ lat, lon }` 形式 (lng ではなく lon)。本 hook で
 * `lon` → `lng` に normalize して返す。
 */
export function usePlanBaseline(): UsePlanBaselineResult {
  const [baselineCoords, setBaselineCoords] = useState<BaselineCoords | null>(
    null,
  );
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch("/api/baseline")
      .then((r) => r.json() as Promise<BaselineApiResponse>)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok || !res.baseline) {
          setBaselineCoords(null);
          return;
        }
        const b = res.baseline;

        // (1) homeCoords (具体 coord) を最優先
        if (
          b.homeCoords &&
          typeof b.homeCoords.lat === "number" &&
          typeof b.homeCoords.lng === "number"
        ) {
          setBaselineCoords({
            lat: b.homeCoords.lat,
            lng: b.homeCoords.lng,
            source: "home",
            label: b.prefecture
              ? `${b.prefecture}${b.city ? " " + b.city : ""}`
              : null,
          });
          return;
        }

        // (2) prefecture → PREFECTURE_COORDS fallback (lon→lng normalize)
        if (b.prefecture) {
          const pc = PREFECTURE_COORDS[b.prefecture];
          if (pc) {
            setBaselineCoords({
              lat: pc.lat,
              lng: pc.lon,
              source: "prefecture",
              label: b.prefecture,
            });
            return;
          }
        }

        // (3) baseline 未設定 or 未収録 prefecture
        setBaselineCoords(null);
      })
      .catch(() => {
        if (cancelled) return;
        // fail-open: baseline 取得失敗は null として扱う (Tokyo default fallback に流れる)
        setBaselineCoords(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { baselineCoords, loading };
}
