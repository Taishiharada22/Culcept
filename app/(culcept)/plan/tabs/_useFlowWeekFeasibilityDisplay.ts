"use client";

/**
 * Phase 3-M-3d FlowTab 7 day 全件 Feasibility Display hook
 *
 * 役割:
 *   FlowTab の 7 day timeline 全件に対して feasibility 表示を提供する。
 *   `usePlanGeocode` で取得した week 全体の resolutions を bridge → coords に変換し、
 *   各 day について buildDayGraph + L-3c overlay + M-3a feasibility pipeline を並列実行、
 *   `Map<isoDate, Map<transitionIndex, FeasibilityDisplayView>>` を返す。
 *
 * 思想 (= M-3c-ui MapTab pattern を FlowTab 7 day に lift):
 *   - **visible 7 days only** (= 月全件 / past months / future months には絶対に出さない)
 *   - 1 batch resolve (= per-day 重複 fetch 0、 既存 useFlowWeekMovementDisplay pattern と整合)
 *   - per-day isolation (= 1 day 失敗が他に伝搬しない、 Promise.all + per-day catch)
 *   - **既存 movement hook と独立** (= L-4c-pure 結果が overlay を露出しないため parallel 計算)
 *
 * 危険境界遵守 (= 絶対に触れない):
 *   - 月全件 / 別 week 展開 (= scope outside)
 *   - PlanClient core に geocode state を上げる (= FlowTab 内完結)
 *   - 新規 fetch / endpoint なし
 *   - localStorage / Arrival Risk Memory / runtime telemetry
 *   - amber / orange / red 色 / icon / badge / warning box
 *   - 「不足 N 分」 の常時表示
 *
 * 参照:
 *   - docs/alter-plan-phase3-m-3d-readiness-audit.md
 *   - lib/plan/feasibility/feasibilityDisplayPipeline.ts (= M-3a)
 *   - app/(culcept)/plan/tabs/_useFlowWeekMovementDisplay.ts (= L-4d-b2 parallel pattern)
 *   - app/(culcept)/plan/tabs/_useMapTabFeasibilityDisplay.ts (= 1 day pattern source)
 */

import { useEffect, useMemo, useState } from "react";

import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { runFeasibilityDisplayPipeline } from "@/lib/plan/feasibility/feasibilityDisplayPipeline";
import type { FeasibilityDisplayView } from "@/lib/plan/feasibility/feasibilityDisplayFormatter";
import { buildCoordsByAnchorIdFromGeocodeResults } from "@/lib/plan/transport/mapTabCoordsBridge";
import { resolveMovementSegmentOverlay } from "@/lib/plan/transport/movementSegmentOverlay";
import { createHeuristicDistanceProvider } from "@/lib/plan/transport/heuristicDistanceProvider";
import { createManualUserProvider } from "@/lib/plan/transport/manualUserProvider";
import { createUnresolvedProvider } from "@/lib/plan/transport/unresolvedProvider";
import type { TransportResolutionProvider } from "@/lib/plan/transport/transportTypes";

import type { AnchorResolution } from "./_usePlanGeocode";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EMPTY_DAY_MAP: ReadonlyMap<
  string,
  ReadonlyMap<number, FeasibilityDisplayView>
> = new Map();
const EMPTY_DAY_DISPLAY: ReadonlyMap<number, FeasibilityDisplayView> = new Map();

/**
 * FlowTab 7 day 全件 feasibility display hook (= M-3d)。
 *
 * Step:
 *   (1) resolutions → bridge → coords (= week 全体共通 1 map)
 *   (2) providers (= stable instance、 useMemo で再生成防止)
 *   (3) 各 day について buildDayGraph + overlay + feasibility pipeline を **Promise.all 並列実行**
 *   (4) 各 day result の feasibilityDisplayByTransitionKey を `Map<transitionIndex, FeasibilityDisplayView>` に変換
 *   (5) `Map<isoDate, ...>` で集約
 *
 * 副作用:
 *   - useEffect + cancelled flag で stale 防御
 *   - 1 day の pipeline 失敗は EMPTY_DAY_DISPLAY で fail-safe (= 他 day に影響なし)
 *   - 全体 catch でも EMPTY_DAY_MAP で fail-safe
 *
 * 引数:
 *   - dayAnchorsMap: FlowTab の既存 state (= Map<iso, anchors>、 7 day)
 *   - resolutions: visible week anchors の dedup 後を `usePlanGeocode` に渡した結果
 *
 * 戻り値:
 *   - Map<isoDate, Map<transitionIndex, FeasibilityDisplayView>>
 *   - 各 day timeline は `result.get(iso)` で lookup、 該当 day の DayGraphTimeline に渡せる
 *   - pipeline 解決前は EMPTY_DAY_MAP (= 全 day で disclosure UI 無効)
 *
 * 注: hidden 時の DOM 不在は DayGraphTimeline 側 (= M-3c-ui) の責任。 本 hook は data のみ。
 *     month 全件 / 別 week は構造的に不可能 (= 本 hook は visible 7 days のみ計算)。
 */
export function useFlowWeekFeasibilityDisplay(
  dayAnchorsMap: ReadonlyMap<string, ReadonlyArray<ExternalAnchor>>,
  resolutions: ReadonlyMap<string, AnchorResolution | null>,
): ReadonlyMap<string, ReadonlyMap<number, FeasibilityDisplayView>> {
  // (1) bridge (= sync pure、 PII 最小化)
  const coords = useMemo(
    () => buildCoordsByAnchorIdFromGeocodeResults(resolutions),
    [resolutions],
  );

  // (2) providers (= stable instance)
  const providers = useMemo<ReadonlyArray<TransportResolutionProvider>>(
    () => [
      createManualUserProvider(),
      createHeuristicDistanceProvider(),
      createUnresolvedProvider("no_provider_available"),
    ],
    [],
  );

  // (3) state: byDay の map
  const [byDay, setByDay] = useState<
    ReadonlyMap<string, ReadonlyMap<number, FeasibilityDisplayView>>
  >(EMPTY_DAY_MAP);

  useEffect(() => {
    let cancelled = false;
    const entries = Array.from(dayAnchorsMap.entries());

    // (4) 各 day pipeline 並列実行 (= per-day isolation)
    Promise.all(
      entries.map(async ([iso, anchors]) => {
        try {
          // K phase 同期 build
          const { graph } = buildDayGraph({ anchors, date: iso });
          // L-3c async overlay
          const overlay = await resolveMovementSegmentOverlay({
            graph,
            coordsByAnchorId: coords,
            cascadeOptions: { providers },
          });
          // M-3a feasibility pipeline
          const pipelineResult = runFeasibilityDisplayPipeline({
            graph,
            overlayResult: overlay,
          });
          // (5) feasibilityDisplayByTransitionKey → Map<transitionIndex, FeasibilityDisplayView>
          const indexed = new Map<number, FeasibilityDisplayView>();
          for (const view of pipelineResult.feasibilityDisplay.feasibilityDisplayByTransitionKey.values()) {
            indexed.set(view.transitionIndex, view);
          }
          return [iso, indexed] as const;
        } catch {
          // per-day fail-safe: 該当 day は EMPTY (= disclosure UI 無効)
          return [iso, EMPTY_DAY_DISPLAY] as const;
        }
      }),
    )
      .then((tuples) => {
        if (cancelled) return;
        setByDay(new Map(tuples));
      })
      .catch(() => {
        if (cancelled) return;
        // 全体 fail-safe
        setByDay(EMPTY_DAY_MAP);
      });

    return () => {
      cancelled = true;
    };
  }, [dayAnchorsMap, coords, providers]);

  return byDay;
}
