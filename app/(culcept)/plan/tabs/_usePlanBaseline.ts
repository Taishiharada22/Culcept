"use client";

/**
 * Plan MapTab 用 client-side baseline coord 解決 hook
 *
 * 設計書: docs/alter-plan-phase2-c-map-tab-mini-design.md
 *
 * CEO 補正 (2026-05-20 第 1 弾): 「予定ができたら必ず pin にする」 哲学整合のため、
 *   resolved anchor の lat/lng がなくても baseline で pin を出す。
 *
 * CEO 補正 (2026-05-20 第 2 弾、本 commit): baseline 優先順位を修正。
 *   旧: home → prefecture (city step skip = 県代表座標に落ちる、Narita ユーザー → Chiba City)
 *   新: home → city → prefecture (city level を中間 priority に)
 *
 * baseline 優先順位 (本 fix 後):
 *   1. homeCoords (user の home として保存された具体 coord、最も precise)
 *   2. municipalityCoords (city level、市区町村中心、CEO 補正で priority 2)
 *   3. PREFECTURE_COORDS (県庁所在地 fallback、最後寄り)
 *   4. null (baseline 未設定 or 未収録)
 *
 * 範囲外:
 *   - GPS / 現在地取得 (Layer 3、未実装、Phase 2-D mini design で扱う予定)
 *   - server-side で baseline 解決 (client で /api/baseline GET 1 回)
 *   - baseline 更新時の live refresh (user は MapTab を re-mount すれば再 fetch)
 */

import { useEffect, useState } from "react";

import { PREFECTURE_COORDS } from "@/lib/shared/location";
import { getMunicipalityCoords } from "@/lib/shared/municipalityCoords";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BaselineCoords {
  lat: number;
  lng: number;
  /**
   * source precision (高い順):
   *   - "home" = user の home として保存された具体 coord (最高 precision)
   *   - "city" = 市区町村中心 (CEO 補正、Narita 等)
   *   - "prefecture" = 県庁所在地 (最後 fallback)
   */
  source: "home" | "city" | "prefecture";
  /** UI 表示用 label (例: "千葉県 成田市" or "千葉県")、null 可 */
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
        //
        // home label は prefecture + city を combine (user 識別用、座標 precision は home)
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

        // (2) CEO 補正: city (市区町村中心) を prefecture より優先
        //
        // 例: prefecture="千葉県" + city="成田市" → MUNICIPALITY_COORDS["成田市"] → 成田市中心 coord
        // (lon→lng normalize、PREFECTURE_COORDS と同様の data shape)
        if (b.city) {
          const mc = getMunicipalityCoords(b.city);
          if (mc) {
            setBaselineCoords({
              lat: mc.lat,
              lng: mc.lon,
              source: "city",
              label: b.prefecture ? `${b.prefecture} ${b.city}` : b.city,
            });
            return;
          }
        }

        // (3) prefecture → PREFECTURE_COORDS fallback (city が未収録 or city なし)
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

        // (4) baseline 未設定 or 未収録 prefecture
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
