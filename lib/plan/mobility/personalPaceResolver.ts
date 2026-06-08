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
import type { EventNode } from "@/lib/plan/dayGraph/dayGraphTypes";
import { normalizeLocationText } from "@/lib/plan/mobility/mobilityObservationStore";
import { DEFAULT_PACE_READINESS_CONFIG } from "@/lib/plan/mobility/paceActivationReadiness";

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

/**
 * rehearsal の transition(stepIndex) → ready pace を引く resolver を組む（pure・A1-5 反映 / A1-8 shadow 共用）。
 * join: legKey=anchorId ペア（selectedModeStore と同源）/ odKey=正規化 location ペア（cross-day 蓄積）。
 * mode 未選択 / 不一致 / not-ready は null（adapter は fallback＝既存挙動）。
 * ★A1-10 per-group activation gating: activationReadyOnly=true のとき **ready_for_activation(n≥minForActivation)** の
 *   group だけ pace を返す（ready_for_shadow=A1-4 ready の 3-7 は null＝反映しない）。観測と実反映の閾値を分離。
 */
export function buildRehearsalPaceResolver(input: {
  readonly events: readonly EventNode[];
  readonly anchorById: ReadonlyMap<string, { readonly locationText?: string | null }>;
  readonly selectedModes: Readonly<Record<string, RouteTransportMode>>;
  readonly ratios: readonly PersonalPaceRatioResult[];
  /** ★A1-10: true なら ready_for_activation(n≥minForActivation) の group のみ反映（実 activation 用）。 */
  readonly activationReadyOnly?: boolean;
  /** activationReadyOnly 時の閾値（既定 DEFAULT_PACE_READINESS_CONFIG.minForActivation=8）。 */
  readonly minForActivation?: number;
}): (stepIndex: number) => PersonalPaceRatioResult | null {
  const minForActivation = input.minForActivation ?? DEFAULT_PACE_READINESS_CONFIG.minForActivation;
  return (stepIndex: number) => {
    const from = input.events[stepIndex];
    const to = input.events[stepIndex + 1];
    if (!from || !to) return null;
    const legKey = `${from.anchorId}__${to.anchorId}`;
    const mode = input.selectedModes[legKey];
    if (!mode) return null;
    const oNorm = normalizeLocationText(input.anchorById.get(from.anchorId)?.locationText ?? null);
    const dNorm = normalizeLocationText(input.anchorById.get(to.anchorId)?.locationText ?? null);
    const odKey = oNorm && dNorm ? `${oNorm}__${dNorm}` : undefined;
    const hit = resolvePersonalPaceForLeg(input.ratios, { odKey, legKey, mode });
    if (!hit) return null;
    // ★A1-10: 実 activation は ready_for_activation の od×mode だけ（ready_for_shadow は反映しない）。
    if (input.activationReadyOnly && (hit.n ?? 0) < minForActivation) return null;
    return hit;
  };
}
