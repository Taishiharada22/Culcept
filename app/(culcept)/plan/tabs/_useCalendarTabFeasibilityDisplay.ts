"use client";

/**
 * Phase 3-M-3d CalendarTab selected day Feasibility Display hook
 *
 * 役割:
 *   既存 CalendarTab の `selectedDayResolutions` を読み、 buildDayGraph → L-3c overlay
 *   → M-3a feasibility pipeline を独立計算し、 `Map<transitionIndex, FeasibilityDisplayView>`
 *   を返す pure-on-client hook。
 *
 *   caller (= CalendarTab) は本 hook の出力を
 *   `DayGraphTimeline.feasibilityDisplayByTransitionIndex` にそのまま渡す。
 *
 * 思想 (= M-3c-ui MapTab pattern を CalendarTab に展開):
 *   - **selected day のみ** (= month grid 全件には絶対に出さない)
 *   - 新規 fetch / endpoint 呼出なし (= 既存 `_usePlanGeocode` 結果を読むだけ)
 *   - pipeline async (= L-3c overlay は async pure、 useEffect + state で安定 render)
 *   - **既存 movement hook と独立** (= L-4c-pure 結果が overlay を露出しないため parallel 計算)
 *
 * 危険境界遵守 (= 絶対に触れない):
 *   - month / grid 全件展開 (= scope outside)
 *   - PlanClient core state 化 (= CalendarTab local state)
 *   - 新規 geocode endpoint 呼出
 *   - localStorage / Arrival Risk Memory / runtime telemetry
 *   - DB / env / package / dependency 変更
 *   - amber / orange / red 色 / icon / badge / warning box
 *   - 「不足 N 分」 の常時表示 (= caller の expansion state でのみ render)
 *
 * 参照:
 *   - docs/alter-plan-phase3-m-3d-readiness-audit.md
 *   - lib/plan/feasibility/feasibilityDisplayPipeline.ts (= M-3a)
 *   - app/(culcept)/plan/tabs/_useMapTabFeasibilityDisplay.ts (= 1 day pattern source)
 *   - app/(culcept)/plan/tabs/_useCalendarMovementDisplay.ts (= L-4d-b1 parallel)
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

const EMPTY_DISPLAY_MAP: ReadonlyMap<number, FeasibilityDisplayView> = new Map();

/**
 * CalendarTab selected day feasibility display hook (= M-3d)。
 *
 * Pipeline:
 *   selectedDayResolutions
 *     → buildCoordsByAnchorIdFromGeocodeResults (= L-4c-mapbridge)
 *     → buildDayGraph (= K phase sync pure)
 *     → resolveMovementSegmentOverlay (= L-3c async pure)
 *     → runFeasibilityDisplayPipeline (= M-3a sync pure: M-1 + M-2a + M-2b)
 *     → Map<number, FeasibilityDisplayView>
 *
 * 副作用:
 *   - async pipeline 呼出を useEffect で実行
 *   - state 保持で render 安定
 *   - no fetch / no localStorage / no telemetry sink
 *   - input mutation 0 (= 全ステップ pure)
 *
 * 引数:
 *   - anchors: selectedDay 用の expand 済 anchors
 *   - date: "YYYY-MM-DD" (= selectedDate)
 *   - resolutions: usePlanGeocode 結果 (= selectedDay 用)
 *
 * 戻り値:
 *   - transitionIndex → FeasibilityDisplayView の map
 *   - pipeline 解決前 / エラー時は空 Map (= 「詳細」 hint も補助行も DOM に出ない)
 *
 * 注: hidden 時の DOM 不在は DayGraphTimeline 側 (= M-3c-ui で確立) の責任。 本 hook は data のみ返す。
 *     month / grid 全件展開は構造的に不可能 (= 本 hook は selectedDate 1 day のみ計算)。
 */
export function useCalendarTabFeasibilityDisplay(
  anchors: ReadonlyArray<ExternalAnchor>,
  date: string,
  resolutions: ReadonlyMap<string, AnchorResolution | null>,
): ReadonlyMap<number, FeasibilityDisplayView> {
  // (1) bridge (= sync pure、 useMemo で再計算最小化)
  const coords = useMemo(
    () => buildCoordsByAnchorIdFromGeocodeResults(resolutions),
    [resolutions],
  );

  // (2) providers (= stable instance、 MapTab hook と同セット)
  const providers = useMemo<ReadonlyArray<TransportResolutionProvider>>(
    () => [
      createManualUserProvider(),
      createHeuristicDistanceProvider(),
      createUnresolvedProvider("no_provider_available"),
    ],
    [],
  );

  // (3) pipeline 結果 state
  const [displayMap, setDisplayMap] = useState<ReadonlyMap<number, FeasibilityDisplayView>>(
    EMPTY_DISPLAY_MAP,
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // K phase 同期 build
        const { graph } = buildDayGraph({ anchors, date });

        // L-3c async overlay (= sensitive sanitize 込み、 PII safe)
        const overlay = await resolveMovementSegmentOverlay({
          graph,
          coordsByAnchorId: coords,
          cascadeOptions: { providers },
        });

        if (cancelled) return;

        // M-3a pipeline (= M-1 + M-2a + M-2b assertion)
        const pipelineResult = runFeasibilityDisplayPipeline({
          graph,
          overlayResult: overlay,
        });

        // Map<string, view> → Map<number, view> (= DayGraphTimeline 側 lookup)
        const indexed = new Map<number, FeasibilityDisplayView>();
        for (const view of pipelineResult.feasibilityDisplay.feasibilityDisplayByTransitionKey.values()) {
          indexed.set(view.transitionIndex, view);
        }

        if (cancelled) return;
        setDisplayMap(indexed);
      } catch {
        if (cancelled) return;
        // fail-safe: 空 map (= 「詳細」 hint 0 / 補助行 0)
        setDisplayMap(EMPTY_DISPLAY_MAP);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [anchors, date, coords, providers]);

  return displayMap;
}
