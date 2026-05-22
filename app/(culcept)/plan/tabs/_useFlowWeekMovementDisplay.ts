"use client";

/**
 * Phase 3-L-4d-b2 FlowTab 7 day 全件 movement display hook
 *
 * 役割:
 *   FlowTab の 7 day timeline 全件に対して移動時間表示を提供する。
 *   `usePlanGeocode` で取得した week 全体の resolutions を bridge → coords に変換し、
 *   各 day について `runMovementDisplayPipeline` を並列実行、
 *   `Map<isoDate, Map<transitionIndex, MovementDisplayView>>` を返す。
 *
 * 思想 (= L-4d-b1 から発展):
 *   - 各 day で個別 `usePlanGeocode` を回すと fetch が重複する
 *     (= week 全体で 7 batch fetch + 同 anchor 重複 fetch)
 *   - 本 hook は parent FlowTab で **1 つの `usePlanGeocode`** で受け取った
 *     resolutions を共通 coords map に変換し、 各 day pipeline で同 coords を再利用
 *   - 結果: 1 batch fetch + 7 並列 pipeline = privacy / rate limit / performance 全て安全
 *
 * 危険境界遵守:
 *   - PlanClient core に geocode state を上げない (= FlowTab 内完結)
 *   - 新規 fetch / endpoint なし (= 既存 _usePlanGeocode 経由のみ)
 *   - localStorage / runtime telemetry sink 0
 *   - Arrival Risk Memory 0
 *
 * L-4d-b1 との関係:
 *   - L-4d-b1 では `useMapTabMovementDisplay` を today only で呼んだ
 *   - L-4d-b2 では本 hook が today を含む 7 day 全件をカバー
 *   - `useMapTabMovementDisplay` は MapTab / CalendarTab selected day で引き続き利用
 *     (= 名前は MapTab 固有だが logic 汎用、 1 day 用として継続)
 *
 * 参照:
 *   - docs/alter-plan-phase3-l-4d-b-readiness-audit.md §8.2 (= L-4d-b2 scope)
 *   - lib/plan/transport/movementDisplayPipeline.ts (= 各 day pipeline)
 *   - lib/plan/transport/mapTabCoordsBridge.ts (= bridge)
 *   - app/(culcept)/plan/tabs/_useMapTabMovementDisplay.ts (= 1 day 用、 L-4d 由来)
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

const EMPTY_DAY_MAP: ReadonlyMap<
  string,
  ReadonlyMap<number, MovementDisplayView>
> = new Map();
const EMPTY_DAY_DISPLAY: ReadonlyMap<number, MovementDisplayView> = new Map();

/**
 * FlowTab 7 day 全件 movement display hook (= L-4d-b2)。
 *
 * Step:
 *   (1) resolutions → bridge → coords (= week 全体共通の 1 map)
 *   (2) providers (= stable instance、 useMemo で再生成防止)
 *   (3) 各 day について `runMovementDisplayPipeline` を **Promise.all で並列実行**
 *   (4) 各 day result の displaysByTransitionKey を `Map<transitionIndex, MovementDisplayView>` に変換
 *   (5) `Map<isoDate, ...>` で集約
 *
 * 副作用:
 *   - useEffect + cancelled flag で stale 防御
 *   - 1 day の pipeline 失敗は EMPTY_DAY_DISPLAY で fail-safe (= 他 day に影響しない)
 *   - 全体 catch でも EMPTY_DAY_MAP で fail-safe
 *
 * 引数:
 *   - dayAnchorsMap: FlowTab の既存 state (= Map<iso, anchors>、 7 day)
 *   - resolutions: visible week anchors の dedup 後を `usePlanGeocode` に渡した結果
 *
 * 戻り値:
 *   - Map<isoDate, Map<transitionIndex, MovementDisplayView>>
 *   - 各 day timeline は `result.get(iso)` で lookup、 該当 day の DayGraphTimeline に渡せる
 *   - pipeline 解決前は EMPTY_DAY_MAP (= 全 day で K view fallback 「→ 移動」)
 */
export function useFlowWeekMovementDisplay(
  dayAnchorsMap: ReadonlyMap<string, ReadonlyArray<ExternalAnchor>>,
  resolutions: ReadonlyMap<string, AnchorResolution | null>,
): ReadonlyMap<string, ReadonlyMap<number, MovementDisplayView>> {
  // (1) bridge (= sync pure、 PII 最小化)
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

  // (3) state: byDay の map
  const [byDay, setByDay] = useState<
    ReadonlyMap<string, ReadonlyMap<number, MovementDisplayView>>
  >(EMPTY_DAY_MAP);

  useEffect(() => {
    let cancelled = false;
    const entries = Array.from(dayAnchorsMap.entries());

    // (4) 各 day pipeline 並列実行 (= per-day isolation、 1 day 失敗が他に伝搬しない)
    Promise.all(
      entries.map(async ([iso, anchors]) => {
        try {
          const result = await runMovementDisplayPipeline({
            anchors,
            date: iso,
            coordsByAnchorId: coords,
            providers,
          });
          // (5) displaysByTransitionKey → Map<transitionIndex, MovementDisplayView>
          const indexed = new Map<number, MovementDisplayView>();
          for (const view of result.display.displaysByTransitionKey.values()) {
            indexed.set(view.transitionIndex, view);
          }
          return [iso, indexed] as const;
        } catch {
          // per-day fail-safe: 該当 day は EMPTY (= K view fallback で「→ 移動」 表示)
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
        // 全体 fail-safe: 空 map (= 全 day で K view fallback)
        setByDay(EMPTY_DAY_MAP);
      });

    return () => {
      cancelled = true;
    };
  }, [dayAnchorsMap, coords, providers]);

  return byDay;
}
