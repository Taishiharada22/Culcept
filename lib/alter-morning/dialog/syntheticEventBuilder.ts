/**
 * syntheticEventBuilder — V1 (planStateV2.segments) → V2 (ComprehensionEvent[])
 * の bridge を成立させるための synthetic event ビルダー。
 *
 * 背景（W3-PR-13 M5 fix の続報、PR `fix/alter-morning-place-search-candidate-ui`）:
 *   CEO 観測（2026-04-25 aneurasync 1c6ef878）で、Place Search v2 経路下では
 *   `morningProtocol` が `planStateV2.segments[]` を populate するが
 *   `persistedEvents = null` を返すケースがあることが判明。
 *
 *   route.ts L2129 の TURN_CAPTURED dispatch は `firstEventId = events[0]?.event_id`
 *   を経由するため persistedEvents が空だと `targetEventId = null` で skip される。
 *   その結果 dialog state machine が driven されず、
 *   `placesHandoffOrchestrator` も skip_gate=status_not_handoff で発火せず、
 *   `PlaceCandidatePicker` も mount されず、ユーザーが候補から選べない。
 *
 *   本 builder は planStateV2.segments から ComprehensionEvent[] を直接合成し、
 *   既存の dispatch path に注入する。これにより:
 *     - dialogReducer は既存のまま動く（synthetic capture builder 不要）
 *     - selection callback は既存のまま動く（segment.id を event_id に流用）
 *     - hard gate は placeType="chain_brand" 等 → whereSharpness="vague"
 *       → hasBlockingUnresolvedSlots → decidePhase="clarifying" の chain で成立
 *
 * 設計原則（pure function、CEO 方針 2026-04-25 承認）:
 *   1. event_id = segment.id を流用。ID resolver layer は作らない。
 *   2. classifyUtterance に渡す capture は呼び出し側 (advanceDialogState) が
 *      classifyUtterance(message) で生成する責務。本 builder では capture を作らない。
 *   3. placeAsk 対象の segment は missing_semantic_critical=["where"] を立てる
 *      （bookkeeping。実際の blocking は placeType を経由した whereSharpness で成立）
 *   4. resolved 座標は保持する（M5 map 描画で使うため）。座標があるからといって
 *      hard gate を緩めるわけではない（gate は placeType / missing_semantic で見る）。
 *   5. PR-7 経路（comprehension が events を返す）と並走しない。injection は
 *      呼び出し側で `persistedEvents.length === 0` を gate にして決める。
 *
 * 設計書: 本ファイル (このコメント自身が一次資料)
 */

import type {
  Event as ComprehensionEvent,
  Provenance,
} from "../comprehension/eventSchema";
import { utteranceProvenance } from "../comprehension/eventSchema";
import type { PlanState, PlanSegment } from "../planState";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * placeAsk:seg_X:original_text 形式の missingField から segment id 集合を抽出する。
 * placeConfirm: は対象外（confidence=medium 用、Phase 1 では candidate UI 不要）。
 */
function extractPlaceAskSegmentIds(missingFields: readonly string[]): Set<string> {
  const ids = new Set<string>();
  for (const field of missingFields) {
    if (!field.startsWith("placeAsk:")) continue;
    // "placeAsk:seg_1:渋谷のスタバ" → ["placeAsk", "seg_1", "渋谷のスタバ"]
    const parts = field.split(":");
    if (parts.length < 2) continue;
    const segId = parts[1];
    if (segId) ids.add(segId);
  }
  return ids;
}

/**
 * segment が valid な lat/lng を持っているか判定。
 * resolutionConfidence が low でも resolvedLat/Lng がある場合は coordinates を保持する
 * （map 描画 / segment 表示で必要。hard gate は placeType 側で別に成立する）。
 */
function hasResolvedCoords(segment: PlanSegment): boolean {
  return (
    typeof segment.resolvedLat === "number" &&
    typeof segment.resolvedLng === "number" &&
    Number.isFinite(segment.resolvedLat) &&
    Number.isFinite(segment.resolvedLng)
  );
}

/**
 * provenance.confidence を resolutionConfidence から derive する。
 * tentative segment では provenance も "low" で渡すことで、
 * 下流が tentative 由来のデータと認識できるようにする。
 */
function provenanceConfidenceFromSegment(
  segment: PlanSegment,
): Provenance["provenance_confidence"] {
  switch (segment.resolutionConfidence) {
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
    case "unresolved":
      return "low";
    default:
      return "medium";
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Per-segment builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1 件の PlanSegment から ComprehensionEvent を合成する。
 *
 * @param segment 元 segment（planStateV2.segments[i]）
 * @param hasPlaceAsk この segment が missingFields に placeAsk として登録されているか。
 *                    true: missing_semantic_critical=["where"] を立て、certainty="tentative"
 *                    false: missing_semantic_critical=[]、certainty="asserted"
 *
 * 重要な保証:
 *   - event_id === segment.id（ID resolver 不要、CEO 指示）
 *   - turn_mode="create"（modify ではないので target_ref/change_scope は null）
 *   - placeType は upstream segment の値を保持（chain_brand などが残る → whereSharpness=vague → blocking）
 *   - resolved 座標は保持（M5 map 描画 / 既存 UI の整合性）
 */
export function buildSyntheticEventFromSegment(
  segment: PlanSegment,
  hasPlaceAsk: boolean,
): ComprehensionEvent {
  const provConf = provenanceConfidenceFromSegment(segment);
  const placeRefSpan = segment.place ? [segment.place] : [];
  const activitySpan = segment.activity ? [segment.activity] : [];

  return {
    event_id: segment.id,
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: segment.startTime ?? null,
      timeHint: null,
      provenance: utteranceProvenance(
        segment.startTime ? [segment.startTime] : [],
        "high",
      ),
    },
    where: {
      place_ref: segment.place ?? null,
      placeType: segment.placeType ?? null,
      coordinates: hasResolvedCoords(segment)
        ? { lat: segment.resolvedLat!, lng: segment.resolvedLng! }
        : null,
      provenance: utteranceProvenance(placeRefSpan, provConf),
    },
    what: {
      activity: segment.activity ?? "",
      activityCanonical: segment.activityCanonical ?? segment.activity ?? "",
      provenance: utteranceProvenance(activitySpan, "high"),
    },
    who: [],
    transport: null,
    certainty: hasPlaceAsk ? "tentative" : "asserted",
    missing_semantic_critical: hasPlaceAsk ? ["where"] : [],
    missing_solver_blockers: [],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Plan-level builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * planStateV2 全体から synthetic events 配列を構築する。
 *
 * 動作:
 *   - planStateV2.missingFields から placeAsk:seg_X を抽出 → 対象 segment 集合を作る
 *   - planStateV2.segments[*] を全件 event 化する（plan の他 segment は consistency
 *     のため残す。dialog dispatch 対象は呼び出し側が events[0] 経由で選ぶ）
 *   - 対象 segment は hasPlaceAsk=true で blocking、それ以外は false
 *
 * @returns segments の order に従った ComprehensionEvent[]
 *          segments が空配列なら空配列。
 */
export function buildSyntheticEventsFromPlanState(
  planState: PlanState | null | undefined,
): ComprehensionEvent[] {
  if (!planState || !planState.segments || planState.segments.length === 0) {
    return [];
  }

  const placeAskIds = extractPlaceAskSegmentIds(planState.missingFields ?? []);

  return planState.segments.map((segment) =>
    buildSyntheticEventFromSegment(segment, placeAskIds.has(segment.id)),
  );
}
