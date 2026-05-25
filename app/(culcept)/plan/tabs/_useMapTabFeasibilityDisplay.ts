"use client";

/**
 * Phase 3-M-3c-ui MapTab-only UI 接続 — Feasibility Display hook
 *
 * 役割:
 *   既存 MapTab の `_usePlanGeocode.resolutions` を読み、 buildDayGraph → L-3c overlay
 *   → M-3a feasibility pipeline を独立計算し、 `Map<transitionIndex, FeasibilityDisplayView>`
 *   を返す pure-on-client hook。
 *
 *   caller (= MapTab) は本 hook の出力を
 *   `DayGraphTimeline.feasibilityDisplayByTransitionIndex` にそのまま渡せる
 *   (= user が「詳細」 を tap した時に「余白 N 分」 / 「不足 N 分」 補助行が現れる)。
 *
 * 思想:
 *   - **MapTab-only** (= CalendarTab / FlowTab は本 hook を呼ばない、 disclosure 機能無効)
 *   - 新規 fetch / endpoint 呼出なし (= 既存 `_usePlanGeocode` の結果を読むだけ)
 *   - pipeline は async (= overlay async pure、 useEffect + state 保持で安定 render)
 *   - **既存 movement hook と独立** (= L-4c-pure の result が overlay を露出していないため
 *     parallel 計算、 計算は軽量、 React useMemo で再計算最小化)
 *
 * 危険境界遵守 (= 絶対に触れない):
 *   - 新規 geocode endpoint 呼出
 *   - localStorage / Arrival Risk Memory
 *   - runtime telemetry sink
 *   - DB / env / package / dependency 変更
 *   - 警告文言 / amber / orange / red / icon
 *   - 「不足 N 分」 の常時表示 (= caller の expansion state でのみ render)
 *
 * 参照:
 *   - docs/alter-plan-phase3-m-3c-ui-readiness-audit.md
 *   - lib/plan/feasibility/feasibilityDisplayPipeline.ts (= M-3a)
 *   - lib/plan/transport/movementSegmentOverlay.ts (= L-3c)
 *   - app/(culcept)/plan/tabs/_useMapTabMovementDisplay.ts (= L-4d、 parallel pattern)
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
 * MapTab-only feasibility display hook (= M-3c-ui)。
 *
 * Pipeline:
 *   usePlanGeocode.resolutions
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
 *   - anchors: 1 日分の expand 済 anchors (= caller の dayAnchors)
 *   - date: "YYYY-MM-DD"
 *   - resolutions: `usePlanGeocode.resolutions` をそのまま渡す
 *
 * 戻り値:
 *   - transitionIndex → FeasibilityDisplayView の map
 *     (= DayGraphTimeline.feasibilityDisplayByTransitionIndex に渡せる)
 *   - pipeline が解決前 / エラー時は空 Map (= 「詳細」 hint も補助行も DOM に出ない)
 *   - not_applicable transitions は M-2a で map から除外済 (= 既に sensitive / unresolved 対策)
 *
 * 注: hidden 時の DOM 不在は DayGraphTimeline 側の責任。 本 hook は
 *     「データを返す」 役割のみ。 「画面に出すか出さないか」 は caller (= 状態層 + 表示層) で制御。
 */
export function useMapTabFeasibilityDisplay(
  anchors: ReadonlyArray<ExternalAnchor>,
  date: string,
  resolutions: ReadonlyMap<string, AnchorResolution | null>,
): ReadonlyMap<number, FeasibilityDisplayView> {
  // (1) bridge (= sync pure、 既存 L-4c-mapbridge と同 helper、 再計算最小化)
  const coords = useMemo(
    () => buildCoordsByAnchorIdFromGeocodeResults(resolutions),
    [resolutions],
  );

  // (2) providers (= 既存 movement hook と同セット、 stable instance)
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
        // K phase 同期 build (= movement hook と独立計算、 cost 低)
        const { graph } = buildDayGraph({ anchors, date });

        // L-3c async overlay (= sensitive sanitize 込み、 既に PII safe)
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

        // Map<string, view> → Map<number, view> (= DayGraphTimeline 側の lookup 用)
        const indexed = new Map<number, FeasibilityDisplayView>();
        for (const view of pipelineResult.feasibilityDisplay.feasibilityDisplayByTransitionKey.values()) {
          indexed.set(view.transitionIndex, view);
        }

        if (cancelled) return;
        setDisplayMap(indexed);
      } catch {
        if (cancelled) return;
        // fail-safe: 空 map (= caller の DayGraphTimeline 側で「詳細」 hint も補助行も出さない)
        setDisplayMap(EMPTY_DISPLAY_MAP);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [anchors, date, coords, providers]);

  return displayMap;
}
