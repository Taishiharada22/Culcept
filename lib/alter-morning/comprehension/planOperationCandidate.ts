/**
 * PlanOperationCandidate — OP-2 (CEO 2026-05-05)
 *
 * 新 5 種 operation の型定義。 既存 `PlanOperation` (= append / modify /
 * answer / noop、 PR-50 で確立) とは **完全独立した union**。
 *
 * 設計思想:
 *   OP-2 は「未接続の器」 段階。 LLM operation pipeline の将来形で必要となる
 *   5 種の意図単位を **隔離して定義**する。 OP-2 では runtime に流れない。
 *
 * day-level / segment-level 分離 (= PR #75 規律継承):
 *   - `journeyOrigin` (= 1 日の起点) と `segmentOrigin` (= 移動区間の起点) は **完全分離**
 *   - `journeyEnd` (= 1 日の終点) と `segmentDestination` も分離
 *   - 「X から Y へ」 だけでは journeyOrigin を埋めない (= unknown のまま)
 *
 * OP-2 規律:
 *   - 既存 `PlanOperation` union 不変
 *   - dispatcher / legacyAdapter / route.ts に **接続しない**
 *   - LLM prompt 不変 (= active runtime 影響ゼロ)
 *   - active `L1_COMPREHENSION_SCHEMA` 不変
 *
 * 設計書:
 *   docs/alter-morning-operation-pipeline-unification-design.md
 */

import type { JourneyAnchorState } from "../journey/anchorState";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5 種 operation candidate 型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * `set_target_date` — plan.date の確定。
 *
 * payload.date:
 *   - "today" / "tomorrow" / "day_after_tomorrow" の relative form
 *   - "YYYY-MM-DD" の absolute form
 *
 * source:
 *   - llm_explicit (= comprehension.targetDate、 utterance 由来)
 *   - regex_deterministic (= extractTargetDate、 「明日」「今日」 等の deterministic match)
 *   - caller_request (= UI/route が **明示的に targetDate を指定** した場合のみ)
 *   - system_default (= 上記 3 source 全 unknown 時のみ生成、 payload.date は actualToday から解決)
 *
 * 重要規律:
 *   `actualToday` / `currentDate` は operation source ではなく
 *   date resolution context。 priority 表に出さない。
 */
export interface SetTargetDateOperationCandidate {
  type: "set_target_date";
  payload: { date: string };
}

/**
 * `add_travel_edge` — 移動 segment の追加。
 *
 * 「X から Y へ」「X を出て Y へ」「X 発で Y へ」 等の移動表現。
 *
 * payload:
 *   - segmentOrigin: 移動区間の起点 (= **1 日の起点ではない**)
 *   - segmentDestination: 移動区間の終点 (= **1 日の終点ではない**)
 *   - segmentDepartureTime: "HH:MM" 形式
 *   - matchedSpan: 元 utterance の span (= 「東京駅から渋谷へ」)
 *
 * source:
 *   - llm_explicit (= LLM segments[]、 utterance 由来)
 *   - regex_deterministic (= fromToTravel 等)
 *
 * 重要規律 (= PR #75 不変条件):
 *   - segmentOrigin を journeyOrigin に **絶対昇格しない**
 *   - segmentDepartureTime を Y event.startTime に **絶対詰めない**
 */
export interface AddTravelEdgeOperationCandidate {
  type: "add_travel_edge";
  payload: {
    segmentOrigin: { label: string; classification: string };
    segmentDestination: { label: string; classification: string };
    segmentDepartureTime?: string;
    segmentArrivalTime?: string;
    transport?: string;
    matchedSpan?: string;
  };
}

/**
 * `set_journey_origin` — 1 日の起点の確定。
 *
 * payload は既存 `JourneyAnchorState` (= PR B-1 確立、 3 kind discriminated union):
 *   - known_exact: label + lat + lng + source
 *   - known_label_only: label + source のみ
 *   - unknown: reason のみ
 *
 * 出す条件:
 *   - LLM journeyOrigin.kind === "explicit_day_origin" (= 「自宅から始まる」 等の明示 signal)
 *   - UI action (= candidate picker tap / clarify answer)
 *   - regex deterministic (= origin anchor 等)
 *   - history (= prior plan の user_override 継承)
 *   - location service (= currentLat-Lng / registered_home、 last resort)
 *
 * 出さない条件:
 *   - 「X から Y へ」 のみの segment 表現 (= LLM は journeyOrigin.kind === "unknown" を出す、
 *     `set_journey_origin` operation は生成されない)
 */
export interface SetJourneyOriginOperationCandidate {
  type: "set_journey_origin";
  payload: JourneyAnchorState;
}

/**
 * `set_journey_end` — 1 日の終点の確定。
 *
 * 出す条件:
 *   - LLM journeyEnd.kind === "explicit_day_end" (= 「家に帰る」 等の明示 signal)
 *   - UI action / regex / history / location
 *
 * 出さない条件:
 *   - 「X から Y へ」 のみの segment 表現 (= journeyEnd 未指定)
 */
export interface SetJourneyEndOperationCandidate {
  type: "set_journey_end";
  payload: JourneyAnchorState;
}

/**
 * `resolve_place_candidate` — UI driven 候補選択。
 *
 * payload:
 *   - slot: "origin" | "end" | "where" (= origin/end は **day-level 専用**)
 *   - label: user 選択の確定 label
 *   - coords: 座標 (= grounder で解決済の場合)
 *   - placeId: external place id (= Google Places 等)
 *
 * source:
 *   - ui_action のみ (= user 確定行為、 priority 1000)
 *
 * 規律:
 *   slot=origin/end は day-level。 slot=where は event-level。
 *   slot=origin の resolve_place_candidate は journeyOrigin に書き込み、
 *   slot=where は events[i].where に書き込む (= field 配置で役割を区別)。
 */
export interface ResolvePlaceCandidateOperationCandidate {
  type: "resolve_place_candidate";
  payload: {
    slot: "origin" | "end" | "where";
    label: string;
    coords?: { lat: number; lng: number };
    placeId?: string;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Union (= 既存 PlanOperation と完全独立)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 5 種 operation candidate の union。
 *
 * 既存 `PlanOperation` (= append / modify / answer / noop) とは **別 union**。
 * import 経路で混在しない。 dispatcher / legacyAdapter には **接続しない**。
 */
export type PlanOperationCandidate =
  | SetTargetDateOperationCandidate
  | AddTravelEdgeOperationCandidate
  | SetJourneyOriginOperationCandidate
  | SetJourneyEndOperationCandidate
  | ResolvePlaceCandidateOperationCandidate;

/**
 * `PlanOperationCandidate["type"]` の string literal union。
 * = "set_target_date" | "add_travel_edge" | "set_journey_origin"
 *   | "set_journey_end" | "resolve_place_candidate"
 */
export type PlanOperationCandidateType = PlanOperationCandidate["type"];
