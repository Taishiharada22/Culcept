/**
 * fromToTravelEdgeReconciler — CEO/GPT 2026-05-03 PR #75
 *
 * 「明日8時東京駅から渋谷へ」 等の発話で、 LLM comprehension が
 *   - event_1 = 渋谷 + 08:00 + 移動 (= 誤、 8時 は東京駅出発時刻)
 *   - event_2 = 東京駅 + missing + 出発 (= 誤、 segmentOrigin で event ではない)
 * という 2 event に分解してしまう問題を post-process で repair する。
 *
 * 責務:
 *   1. extractFromToTravelEdge: 「XからY」 構文を deterministic regex で抽出
 *      → TravelEdge { segmentOrigin, segmentDestination, segmentDepartureTime }
 *   2. reconcileEventsWithTravelEdge: events から travel 由来の誤生成を削除
 *      操作 A: X event (= segmentOrigin と一致 + 内容 inferred) 削除
 *      操作 B: Y event (= segmentDestination と一致 + 内容 inferred + startTime
 *             == departureTime) 削除 (= TravelEdge.segmentDestination に統合)
 *      操作 C: Y event を残す (= activity 明示 OR startTime 異なる)
 *
 * 重要 (= CEO 規律):
 *   - segmentOrigin を journeyOrigin に **即昇格させない** (= 別 hierarchy で決定)
 *   - segmentDepartureTime を Y event.startTime に **絶対詰めない** (= TravelEdge にのみ保持)
 *   - 入力 events を mutate しない (= pure)
 *   - 副作用なし (= caller が dialog state 修正)
 *
 * 不変条件 (= test で固定):
 *   - edge null → events / deletedEventIds 完全 pass-through (= byte-diff zero)
 *   - 削除済 event_ids を返す (= caller が pendingClarify / focus 修正)
 */

import type { Event } from "./eventSchema";
import type { TravelEdge } from "../types";
import type { LabelClassification } from "../search/labelClassification";
import { classifyLabel } from "../search/labelClassification";
import { stripTemporalPrefix } from "../journey/originAnchorExtractor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Origin patterns (= 4 構文、 CEO 仕様)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 4 構文 regex:
 *   1. XからY{[へに]|まで} (= 「東京駅から渋谷へ」「東京駅から渋谷に」「東京駅から渋谷まで」)
 *   2. Xを{出て|出発して}Y[へに] (= 「東京駅を出て渋谷へ」)
 *   3. X発{で|の}Y[へに] (= 「東京駅発で渋谷へ」)
 *
 * 文字 set: 句読点 / 改行 / 括弧 / 全感嘆符 のみ delimiter
 *   → 内部 space 許容 (= 「Shibuya Stream」「ANA InterContinental Tokyo」 catch)
 * 長さ: 2-40 chars (= lazy match)
 */
const PATTERN_FROM_TO =
  /([^、。「」『』\n！？!?]{2,40}?)から([^、。「」『』\n！？!?]{2,40}?)(?:[へに]|まで)/;
const PATTERN_OUT_TO =
  /([^、。「」『』\n！？!?]{2,40}?)を(?:出て|出発して)([^、。「」『』\n！？!?]{2,40}?)[へに]/;
const PATTERN_HATSU_TO =
  /([^、。「」『』\n！？!?]{2,40}?)発(?:で|の)([^、。「」『』\n！？!?]{2,40}?)[へに]/;

const ORIGIN_DEST_PATTERNS: ReadonlyArray<RegExp> = [
  PATTERN_FROM_TO,
  PATTERN_OUT_TO,
  PATTERN_HATSU_TO,
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Time extraction (= utterance 全体から「\d+時(\d+分)?」 抽出)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TIME_PATTERN = /(\d{1,2})\s*時(?:\s*(\d{1,2})\s*分)?/;

/**
 * utterance から時刻を抽出して "HH:MM" に正規化。
 * 「8時」 → "08:00"、 「14時 30分」 → "14:30"。 不検出は null。
 */
function extractTimeNormalized(utterance: string): string | null {
  const m = utterance.normalize("NFKC").match(TIME_PATTERN);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extractFromToTravelEdge
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 採用可能な classification (= CEO 規律: public POI または generic、 private/ambiguous は reject)。
 */
function isAcceptableClassification(cls: LabelClassification): boolean {
  return cls === "public_poi_proper_noun" || cls === "generic_category";
}

/**
 * 発話から「XからY」 系の travel edge を抽出 (pure)。
 * @param utterance ユーザー発話
 * @param sourceTurnIndex 抽出 turn (= optional、 trace 用)
 * @returns TravelEdge (= 採用条件全て満たす場合) / null
 */
export function extractFromToTravelEdge(
  utterance: string,
  sourceTurnIndex?: number,
): TravelEdge | null {
  if (!utterance) return null;
  const text = utterance.normalize("NFKC");

  for (const re of ORIGIN_DEST_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const originRaw = m[1];
    const destRaw = m[2];
    const origin = stripTemporalPrefix(originRaw);
    const destination = stripTemporalPrefix(destRaw);
    if (origin.length < 2 || destination.length < 2) continue;
    if (origin === destination) continue; // 同一 label は無視
    const originCls = classifyLabel(origin);
    const destCls = classifyLabel(destination);
    if (!isAcceptableClassification(originCls)) continue;
    if (!isAcceptableClassification(destCls)) continue;
    const time = extractTimeNormalized(text);
    return {
      segmentOrigin: { label: origin, classification: originCls },
      segmentDestination: { label: destination, classification: destCls },
      ...(time ? { segmentDepartureTime: time } : {}),
      matchedSpan: m[0],
      ...(sourceTurnIndex !== undefined ? { sourceTurnIndex } : {}),
    };
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// reconcileEventsWithTravelEdge
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Y event 削除判定の inferred activity 範囲。 これらは LLM が補完した「予定」「移動」
 * 「出発」 等で、 user 意図ではなく travel 由来の誤生成。
 */
const INFERRED_TRAVEL_ACTIVITIES = new Set<string>([
  "",
  "予定",
  "移動",
  "出発",
  "出発予定",
  "到着",
  "目的地",
]);

/**
 * activity が「inferred low」 (= LLM が補完した低信頼度) と判定。
 */
function isInferredLowActivity(event: Event): boolean {
  const activity = event.what?.activity ?? "";
  if (INFERRED_TRAVEL_ACTIVITIES.has(activity)) return true;
  const provenance = event.what?.provenance;
  if (!provenance) return true;
  if (provenance.source_type === "inferred") return true;
  if (provenance.provenance_confidence === "low") return true;
  return false;
}

export interface ReconcileResult {
  /** 修正後 events (= 削除された event を除外) */
  events: Event[];
  /** 削除された event_ids (= caller が pendingClarify / focus 修正に使用) */
  deletedEventIds: string[];
}

/**
 * LLM 出力 events を edge に基づき reconcile (pure)。
 *
 * 操作:
 *   A. X event 削除 (= where==segmentOrigin && when missing && activity inferred)
 *   B. Y event 削除 (= where==segmentDestination && activity inferred &&
 *                     startTime == segmentDepartureTime)
 *   C. Y event 残す (= activity 明示 OR startTime 異なる)
 *
 * @param events LLM 出力 events (= mutate しない)
 * @param edge extractFromToTravelEdge 結果 (= null なら pass-through)
 * @returns 修正後 events + 削除された event_ids
 */
export function reconcileEventsWithTravelEdge(
  events: ReadonlyArray<Event>,
  edge: TravelEdge | null,
): ReconcileResult {
  if (!edge) {
    return { events: [...events], deletedEventIds: [] };
  }

  const deletedEventIds: string[] = [];
  const kept: Event[] = [];

  for (const event of events) {
    const where = event.where?.place_ref?.trim() ?? "";
    const startTime = event.when?.startTime ?? null;

    // 操作 A: X event 削除 (= segmentOrigin 一致 + when missing + activity inferred)
    const isXDuplicate =
      where === edge.segmentOrigin.label &&
      startTime === null &&
      isInferredLowActivity(event);
    if (isXDuplicate) {
      deletedEventIds.push(event.event_id);
      continue;
    }

    // 操作 B: Y event 削除 (= segmentDestination 一致 + activity inferred +
    //   startTime == segmentDepartureTime)
    const isYTravelOnly =
      where === edge.segmentDestination.label &&
      isInferredLowActivity(event) &&
      edge.segmentDepartureTime != null &&
      startTime === edge.segmentDepartureTime;
    if (isYTravelOnly) {
      deletedEventIds.push(event.event_id);
      continue;
    }

    // 操作 C: それ以外は残す
    kept.push(event);
  }

  return { events: kept, deletedEventIds };
}
