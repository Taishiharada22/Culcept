import type { MorningPlan, PlanItem } from "../types";
import { recalculateSchedule } from "../planningEngine";
import { insertTravelItems } from "../travelTimeEngine";

/**
 * W3-PR-10 Phase 3A — client 側 travel 再生成（canonical 対応）
 *
 * MorningPlanCard の reorder / duration-edit / time-edit / place-change ハンドラから
 * 呼ばれる。canonical TransportSegment[] が存在するプランでは Path B の insertTravelItems
 * を再注入せず、travel を一旦落として server 側の次ターン rebuild に委ねる。
 *
 * canonical 判定:
 *   `prevPlan.transportSegments !== undefined`（key 存在ベース、length 不問）
 *   - `transportSegments: []`   → canonical あり（結果 0 本）
 *   - `transportSegments: undefined` → canonical なし（flag OFF / Path B）
 *
 * 設計根拠:
 *   - client は persistedEvents を持たないため segments の再 build 不可
 *   - 既存 segments は reorder / place-change で stale 化するため再 interleave も不安全
 *   - Path B fallback を混ぜると「第二の source of truth」を再注入 → 禁止
 */
export function regenerateTravelForPlan(
  nonTravelItems: PlanItem[],
  prevPlan: MorningPlan,
): PlanItem[] {
  const anchors = {
    departureTime: prevPlan.departureTime,
    arrivalTime: prevPlan.arrivalTime,
  };

  if (prevPlan.transportSegments !== undefined) {
    return recalculateSchedule(nonTravelItems, anchors);
  }

  const existingTravel = prevPlan.items.find((i) => i.kind === "travel");
  const transport =
    existingTravel?.travelTransport ??
    prevPlan.flowContext?.transport ??
    prevPlan.dayConditions?.mainTransport ??
    "car";
  const goOut = prevPlan.flowContext?.goOut ?? nonTravelItems.some((i) => i.location);
  const withTravel = insertTravelItems(nonTravelItems, transport, goOut);
  return recalculateSchedule(withTravel, anchors);
}
