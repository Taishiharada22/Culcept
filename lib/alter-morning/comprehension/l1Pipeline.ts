/**
 * L1 Pipeline — Comprehension-First v1.3+ Wave 1
 *
 * 設計書: docs/alter-morning-comprehension-first-v1.3plus.md §1 (L1 Comprehension)
 *
 * 責務:
 *   L1.1 (Structured Outputs 生 JSON) → L1.2 (Slot & Provenance Checker)
 *   を連結する純関数パイプライン。
 *
 *   入力: LLM が返した JSON（L1_COMPREHENSION_SCHEMA に沿った形）
 *   出力: ComprehensionResult（event_id 採番済み・provenance 検査済み・
 *         missing_semantic_critical 再計算済み）
 *
 * 本モジュールは LLM を直接呼ばない。呼び出し側が structured output で得た
 * JSON を受け取り、後段の planning 層に渡せる形に整える。
 */

import {
  type ComprehensionResult,
  type Event,
  generateEventId,
} from "./eventSchema";
import { checkEvent } from "./provenanceChecker";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM 生 JSON → Event（event_id 採番 + checker 通過）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * LLM が返した event JSON に event_id を採番して Event 型にする。
 * event_id は L1 内で安定的（Turn をまたぐ安定性は呼び出し側が担保）。
 */
type RawEvent = Omit<Event, "event_id">;

export function attachEventId(raw: RawEvent): Event {
  // W3-PR-9 Commit 5a-1: LLM は coordinates を生成しないため、境界で null に正規化する。
  // raw.where.coordinates が undefined の場合（JSON schema 不在）に null を埋める。
  return {
    event_id: generateEventId(),
    ...raw,
    where: {
      ...raw.where,
      coordinates: raw.where.coordinates ?? null,
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L1 Pipeline 本体
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface L1PipelineInput {
  /** L1.1 LLM 出力（event_id はまだ採番されていない） */
  raw: {
    targetDate: string;
    events: RawEvent[];
    startPoint: ComprehensionResult["startPoint"];
    departureTime: ComprehensionResult["departureTime"];
    goOut: boolean | null;
  };
  /** ユーザ発話（L1.2 Slot & Provenance Checker 用） */
  utterance: string;
  /**
   * W3-PR-7 Commit 2: answerBinder 経路で使う event 上書き。
   *
   * 指定された場合、`raw.events` を無視して **この events をそのまま採用**
   * する（LLM 再 comprehension / event_id 再採番をスキップ）。
   *
   * 用途:
   *   bindAnswerToSlot で slot を書き込んだ後、LLM に再解釈させずに
   *   同じ event graph を planner に流すため。
   *
   * 契約:
   *   - events は既に event_id を持つ（attachEventId 不要）
   *   - checker には回さない（bind 時に missing_semantic_critical 再計算済み）
   *   - raw.events は無視される（targetDate/startPoint/departureTime/goOut は利用）
   */
  priorEvents?: Event[];
}

/**
 * L1.1 → L1.2 パイプライン。
 *
 * 手順:
 *   1. 各 raw event に event_id 採番
 *   2. checkEvent で provenance を検査・降格、missing_semantic_critical 再計算
 *
 * 副作用: generateEventId がモジュールグローバル counter を消費する点のみ。
 *         テストでは resetEventCounter でリセット可能。
 *
 * 特例 (priorEvents):
 *   answerBinder 経路では priorEvents をそのまま events として採用する。
 *   LLM 再 comprehension / checker 再実行を skip する（bind 時に
 *   missing_semantic_critical は再計算済み）。
 */
export function runL1Pipeline(input: L1PipelineInput): ComprehensionResult {
  const { raw, utterance, priorEvents } = input;

  const events: Event[] =
    priorEvents !== undefined
      ? priorEvents
      : raw.events.map((re) => {
          const withId = attachEventId(re);
          return checkEvent(withId, utterance);
        });

  return {
    events,
    targetDate: raw.targetDate,
    startPoint: raw.startPoint,
    departureTime: raw.departureTime,
    goOut: raw.goOut,
  };
}
