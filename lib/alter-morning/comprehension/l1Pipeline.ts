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
  type Provenance,
  generateEventId,
} from "./eventSchema";
import type { PlanOperation } from "./planOperation";
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
    /** targetDate の根拠情報。未取得の場合は undefined。 */
    targetDateProvenance?: Provenance;
    events: RawEvent[];
    /**
     * PR-50 Commit 3 (CEO 2026-04-30):
     *   LLM が出力した「今 turn の意図単位 (operations)」。
     *   schema (structuredSchema.ts L1_COMPREHENSION_SCHEMA) で required。
     *
     *   parsing:
     *     - llmComprehensionProvider の validateRawShape が OPERATION_SCHEMA 形
     *       (全 field を null/値で含む) を `PlanOperation` discriminated union に
     *       narrow して格納する。parse 失敗 element は drop。
     *
     *   contract:
     *     - 空配列 [] は許容 (LLM が operations を出さない / 自信なし → events[] fallback)
     *     - stub provider (test) は明示的に [] を渡す
     *
     *   後段 wiring (morningPipeline):
     *     - validatePlanOperations で context (priorEvents / priorPendingClarify) と
     *       照合して allAccepted を判定
     *     - allAccepted=true + length>0 → operations 経路
     *     - それ以外 → events[] fallback (legacy 経路、warn log)
     */
    operations: PlanOperation[];
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
 *   3. coalesceFragmentedEvents で LLM の過剰分割を防御的に統合（CEO 2026-04-28 fix）
 *
 * 副作用: generateEventId がモジュールグローバル counter を消費する点のみ。
 *         テストでは resetEventCounter でリセット可能。
 *
 * 特例 (priorEvents):
 *   answerBinder 経路では priorEvents をそのまま events として採用する。
 *   LLM 再 comprehension / checker 再実行を skip する（bind 時に
 *   missing_semantic_critical は再計算済み）。
 *   coalesce も skip（既に確定した event graph を破壊しないため）。
 */
export function runL1Pipeline(input: L1PipelineInput): ComprehensionResult {
  const { raw, utterance, priorEvents } = input;

  const events: Event[] =
    priorEvents !== undefined
      ? priorEvents
      : coalesceFragmentedEvents(
          raw.events.map((re) => {
            const withId = attachEventId(re);
            return checkEvent(withId, utterance);
          }),
        );

  // PR-50 Commit 3: operations を ComprehensionResult に伝搬する。
  //   ここで validation はしない (priorEvents / priorPendingClarify を持たない pure 層)。
  //   morningPipeline.runMorningPipeline で validatePlanOperations を呼び、
  //   acceptedOperations / fallbackToEvents / operationRejections を後付けで埋める。
  return {
    events,
    targetDate: raw.targetDate,
    startPoint: raw.startPoint,
    departureTime: raw.departureTime,
    goOut: raw.goOut,
    operations: raw.operations,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L1.3 — Fragmented Event Coalescer (CEO 2026-04-28 防御層)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CEO 2026-04-28 観測:
//   入力: "9時に渋谷のスタバ" (fresh 1st turn)
//   LLM 出力 (誤): [
//     { when: 09:00, where: スタバ/chain_brand,    what: コーヒー },
//     { when: null,  where: 渋谷/generic_place,    what: 移動 },
//   ]
//   結果: 2 events plan card + clarify "渋谷は何時頃？" + place candidates 出ない
//
//   期待: [{ when: 09:00, where: 渋谷のスタバ/chain_brand, what: コーヒー }]
//        → whereSharpness=vague (chain) → place candidates picker 表示
//        → user が TSUTAYA 等を選択 → selection endpoint
//
// なぜ LLM が分割するか:
//   "[Region]の[Place]" を「Region に立ち寄って Place」と誤解釈する。
//   temperature=0.1 でも prompt が「[Region]の[Place] は単一 where」と
//   明示していないため発火しうる。SYSTEM_PROMPT 強化で抑制を試みるが、
//   LLM 非決定性は残るため deterministic post-processor を併設する。
//
// 検出条件 (全て満たす):
//   - events.length === 2
//   - 片方は startTime あり、もう片方は startTime も timeHint も無い
//   - 時間あり event: where.placeType === "chain_brand"
//   - 時間無し event: where.placeType === "generic_place"
//   - place_ref が両方 non-empty
//
// Action:
//   - 時間あり event の where.place_ref を「region の chain」に置換
//   - placeType=chain_brand 維持 (places search が region anchor 込みで動く)
//   - 時間無し event を drop
//   - missing_semantic_critical を再計算
//
// 安全性:
//   - 2 events ぴったり以外は touch しない（multi-event plan を破壊しない）
//   - placeType の組合せが厳密（chain + generic）— 「9時にスタバ、10時に渋谷」
//     のような正当 2 events は両方 startTime あるため検出されない
//   - "9時にスタバ、その後渋谷" のような意図的な後続 event は両方 chain や
//     両方 generic で組まないため検出されない（false-positive 低い）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { WhereSlot } from "./eventSchema";

function hasNoTime(when: Event["when"]): boolean {
  return when.startTime == null && when.timeHint == null;
}

function hasTime(when: Event["when"]): boolean {
  return when.startTime != null || when.timeHint != null;
}

export function coalesceFragmentedEvents(events: Event[]): Event[] {
  if (events.length !== 2) return events;

  const [a, b] = events;

  // どちらが時間あり / 時間無しか同定
  let timed: Event;
  let untimed: Event;
  if (hasTime(a.when) && hasNoTime(b.when)) {
    timed = a;
    untimed = b;
  } else if (hasTime(b.when) && hasNoTime(a.when)) {
    timed = b;
    untimed = a;
  } else {
    return events; // 両方時間あり or 両方時間無し → 該当外
  }

  // chain_brand + generic_place の組合せのみ対象
  if (timed.where.placeType !== "chain_brand") return events;
  if (untimed.where.placeType !== "generic_place") return events;

  const chainPlace = timed.where.place_ref;
  const regionPlace = untimed.where.place_ref;
  if (!chainPlace || !regionPlace) return events;
  if (chainPlace.trim() === "" || regionPlace.trim() === "") return events;

  // 既に compound（"渋谷のスタバ" 等）になっていたら touch しない
  if (chainPlace.includes(regionPlace)) return events;

  // 「region の chain」に統合
  const composed = `${regionPlace}の${chainPlace}`;
  const mergedWhere: WhereSlot = {
    ...timed.where,
    place_ref: composed,
    // placeType は chain_brand 維持 — places search に region anchor 込みで投げる
  };

  // missing_semantic_critical 再計算（where が埋まったので "where" を除去）
  const nextMissing = (timed.missing_semantic_critical ?? []).filter(
    (k) => k !== "where",
  );

  const merged: Event = {
    ...timed,
    where: mergedWhere,
    missing_semantic_critical: nextMissing,
  };

  return [merged];
}
