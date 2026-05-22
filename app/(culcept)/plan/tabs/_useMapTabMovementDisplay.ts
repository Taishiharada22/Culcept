"use client";

/**
 * Phase 3-L-4d MapTab-only UI 接続 — Movement Display hook
 *
 * 役割:
 *   既存 MapTab の `_usePlanGeocode.resolutions` を受け取り、
 *   bridge → L-4c-pure pipeline を通して `Map<transitionIndex, MovementDisplayView>` を返す。
 *
 *   caller (= MapTab) は本 hook の出力を `DayGraphTimeline.movementDisplayByTransitionIndex` に
 *   そのまま渡せる (= K view label を「移動 約 N 分」 等に override される)。
 *
 * 思想:
 *   - **MapTab-only** (= CalendarTab / FlowTab は本 hook を呼ばない、 K view fallback 維持)
 *   - 新規 fetch / endpoint 呼出なし (= 既存 `_usePlanGeocode` の結果を読むだけ)
 *   - pipeline は async (= useEffect + state 保持で安定 render)
 *
 * 危険境界遵守 (= 絶対に触れない):
 *   - 新規 geocode endpoint 呼出
 *   - localStorage / Arrival Risk Memory
 *   - runtime telemetry sink
 *   - DB / env / package / dependency 変更
 *
 * 参照:
 *   - docs/alter-plan-phase3-l-4-readiness-audit.md
 *   - docs/alter-plan-phase3-l-4c-bridge-readiness-audit.md
 *   - docs/alter-plan-phase3-l-4c-mapbridge-readiness-audit.md
 *   - lib/plan/transport/mapTabCoordsBridge.ts
 *   - lib/plan/transport/movementDisplayPipeline.ts
 */

import { useEffect, useMemo, useState } from "react";

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { createHeuristicDistanceProvider } from "@/lib/plan/transport/heuristicDistanceProvider";
import { createManualUserProvider } from "@/lib/plan/transport/manualUserProvider";
import { createUnresolvedProvider } from "@/lib/plan/transport/unresolvedProvider";
import { buildCoordsByAnchorIdFromGeocodeResults } from "@/lib/plan/transport/mapTabCoordsBridge";
import type { MovementDisplayView } from "@/lib/plan/transport/movementDisplayFormatter";
import { runMovementDisplayPipeline } from "@/lib/plan/transport/movementDisplayPipeline";
import type { TransportResolutionProvider } from "@/lib/plan/transport/transportTypes";

import type { AnchorResolution } from "./_usePlanGeocode";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EMPTY_DISPLAY_MAP: ReadonlyMap<number, MovementDisplayView> = new Map();

/**
 * MapTab-only movement display hook (= L-4d)。
 *
 * Pipeline:
 *   usePlanGeocode.resolutions
 *     → buildCoordsByAnchorIdFromGeocodeResults (= L-4c-mapbridge)
 *     → runMovementDisplayPipeline (= L-4c-pure: build → overlay → format → contract)
 *     → Map<number, MovementDisplayView>
 *
 * 副作用:
 *   - async pipeline 呼出を useEffect で実行
 *   - state 保持で render 安定
 *   - no fetch / no localStorage / no telemetry sink
 *
 * 引数:
 *   - anchors: 1 日分の expand 済 anchors (= caller の dayAnchors)
 *   - date: "YYYY-MM-DD"
 *   - resolutions: `usePlanGeocode.resolutions` をそのまま渡す
 *
 * 戻り値:
 *   - transitionIndex → MovementDisplayView の map (= DayGraphTimeline.movementDisplayByTransitionIndex にそのまま渡せる)
 *   - pipeline が解決前 / エラー時は空 Map (= K view fallback で「→ 移動」 表示)
 */
export function useMapTabMovementDisplay(
  anchors: ReadonlyArray<ExternalAnchor>,
  date: string,
  resolutions: ReadonlyMap<string, AnchorResolution | null>,
): ReadonlyMap<number, MovementDisplayView> {
  // (1) bridge (= sync pure)
  const coords = useMemo(
    () => buildCoordsByAnchorIdFromGeocodeResults(resolutions),
    [resolutions],
  );

  // (2) providers (= stable instance、 再生成しない)
  const providers = useMemo<ReadonlyArray<TransportResolutionProvider>>(
    () => [
      createManualUserProvider(),
      createHeuristicDistanceProvider(),
      createUnresolvedProvider("no_provider_available"),
    ],
    [],
  );

  // (3) pipeline 結果 state
  const [displayMap, setDisplayMap] = useState<ReadonlyMap<number, MovementDisplayView>>(
    EMPTY_DISPLAY_MAP,
  );

  useEffect(() => {
    let cancelled = false;

    runMovementDisplayPipeline({
      anchors,
      date,
      coordsByAnchorId: coords,
      providers,
    })
      .then((result) => {
        if (cancelled) return;
        const indexed = new Map<number, MovementDisplayView>();
        for (const view of result.display.displaysByTransitionKey.values()) {
          indexed.set(view.transitionIndex, view);
        }
        setDisplayMap(indexed);
      })
      .catch(() => {
        if (cancelled) return;
        // fail-safe: 空 map (= K view fallback で「→ 移動」 表示維持)
        setDisplayMap(EMPTY_DISPLAY_MAP);
      });

    return () => {
      cancelled = true;
    };
  }, [anchors, date, coords, providers]);

  return displayMap;
}
