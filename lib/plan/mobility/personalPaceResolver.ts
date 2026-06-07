/**
 * lib/plan/mobility/personalPaceResolver.ts — A1-6a: store → personal pace ratio の glue（pure）
 *
 * ★目的: localStorage の MovementEvent（手動ログ / 将来 GPS）を A1-4 の PaceObservation に平坦化し、
 *   PersonalPaceRatio を構築する。Day Rehearsal の resolver（A1-5 adapter へ渡す）の供給源。
 *
 * ★安全境界:
 *   - store は既に gate（opt-in・sensitive）を通った derived event のみ → ここで raw GPS は扱わない。
 *   - mode tag が無い古い event は集約に入れない（混線回避）。
 *   - 観測が少なければ A1-4 が not_enough_signal/unknown を返す（personal pace 扱いしない）。
 *   - pure / Date 不使用 / DB・network 不使用。
 */
import type { MovementEventStore } from "@/lib/plan/mobility/movementEventStore";
import {
  buildPersonalPaceRatios,
  findPersonalPaceRatio,
  type PaceObservation,
  type PersonalPaceRatioConfig,
  type PersonalPaceRatioResult,
} from "@/lib/plan/mobility/personalPaceRatio";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

/** store の MovementEvent 群を PaceObservation[] に平坦化（mode tag 無しは除外）。 */
export function movementEventStoreToPaceObservations(store: MovementEventStore): PaceObservation[] {
  const observations: PaceObservation[] = [];
  for (const legs of Object.values(store.byDay)) {
    for (const [legKey, ev] of Object.entries(legs)) {
      if (ev.mode === undefined) continue; // 集約単位（mode）が無い → スキップ
      observations.push({
        legKey,
        odKey: ev.odKey,
        mode: ev.mode,
        estimateMin: ev.estimateMin ?? null,
        actualDurationMin: ev.actualDurationMin,
        confidence: ev.confidence,
        // sensitive は store gate で既に除外済（防御は personalPaceRatio 側にもある）
      });
    }
  }
  return observations;
}

/** store から直接 PersonalPaceRatio を構築（pure）。 */
export function buildPersonalPaceRatiosFromStore(
  store: MovementEventStore,
  config?: PersonalPaceRatioConfig,
): PersonalPaceRatioResult[] {
  return buildPersonalPaceRatios(movementEventStoreToPaceObservations(store), config);
}

/**
 * 特定 leg（odKey/legKey, mode）の ready な pace を引く（A1-5 resolver 用の薄い wrapper）。
 * ready 以外（not_enough_signal/unknown）や不一致は null（adapter 側で fallback＝既存挙動）。
 */
export function resolvePersonalPaceForLeg(
  ratios: readonly PersonalPaceRatioResult[],
  query: { odKey?: string; legKey?: string; mode: RouteTransportMode },
): PersonalPaceRatioResult | null {
  const hit = findPersonalPaceRatio(ratios, query);
  return hit && hit.status === "ready" ? hit : null;
}
