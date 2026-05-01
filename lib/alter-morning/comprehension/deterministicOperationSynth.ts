/**
 * Deterministic Operation Synthesizer — PR-50 Commit 7+8 (CEO 2026-04-30)
 *
 * Goal:
 *   LLM 出力に依存せず、**utterance pattern が明確な発話** を deterministic に
 *   PlanOperation に変換する synth 層。さらに、LLM が出した operations を
 *   inspect & transform する Layer 2 も提供する (Commit 8)。
 *
 * 設計原則 (CEO 確定 2026-04-30):
 *   - **deterministic pattern hit > LLM 出力**:
 *       「9時を10時に変更」「電車」「徒歩」「車」 等の意味が一意な発話は
 *       LLM の判断に任せず、コード側で modify operation を生成する。
 *       LLM が同じ turn で append 等を出していても **deterministic を優先**
 *       (LLM の append duplicate を排除する)。
 *
 *   - **LLM operations の inspect & transform** (Commit 8):
 *       deterministic pattern が hit しなかった turn でも、LLM が出した
 *       operations の中に「prior と when/where/what 完全一致 + transport だけ
 *       異なる append」 が混じっていたら、modify (patch.transport) に **変換**
 *       する。reject + fallback ではなく transform にすることで、events[]
 *       fallback で同じ duplicate が再発する事故を防ぐ (CEO 指示 2026-04-30)。
 *
 *   - **責務分離**:
 *       synth = 意味の補正 / 変換
 *       validation = 構造の検証
 *       dispatch = 適用
 *       本ファイルは synth 層のみ。validation / dispatch には触らない。
 *
 * Commit 7 (本ファイル初版): utterance pattern → deterministic operations
 * Commit 8 (本 commit):      LLM operations inspector (Layer 2)
 *
 * scope (CEO 限定 2026-04-30):
 *   - 時刻変更 (「N時を M時に変更」「N時にして」 等)
 *   - transport-only (「電車」「徒歩」「車」 等の単独発話)
 *   - LLM bad append (transport-only duplicate) → modify transform
 *
 * scope 外 (将来 PR):
 *   - 場所変更 (「サドヤから新宿に」)
 *   - 削除 / キャンセル (「ランチをキャンセル」)
 */

import type { Event } from "./eventSchema";
import { utteranceProvenance } from "./eventSchema";
import type { PlanOperation, AppendOperation } from "./planOperation";
import type { PendingClarify } from "../types";
import { parseTransportExact } from "./answerBinder";
// PR A (CEO/GPT 2026-05-02) imports for detectAppendPattern:
import { extractExplicitTimes } from "./rulePreParse";
import { extendTimeWithModifier } from "./extendTimeWithModifier";
import { extractExplicitPlace } from "./extractExplicitPlace";
import { findActivitySpanInUtterance } from "../activityVocabulary";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 公開 API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SynthesisContext {
  utterance: string;
  priorEvents: Event[];
  /** LLM が parsePlanOperations 後に出した operations (空 OK) */
  llmOperations: PlanOperation[];
  /**
   * 当 turn 開始時の pendingClarify (PR-50 Commit 4 で追加、PR A で利用)。
   * detectAppendPattern が defensive check に使う。
   */
  priorPendingClarify?: PendingClarify | null;
  /**
   * deterministic append fallback (PR A) を許可するか。
   *
   * GPT/CEO 2026-05-02 安全側設計:
   *   未指定 / false → append fallback 不発 (default false、誤爆防止)
   *   true  → caller が active slot answer 文脈でないことを確認した上で許可
   *
   * caller (morningPipeline / legacyAdapter) は以下 5 条件すべて clear のとき
   * true を渡すことが期待される:
   *   - priorPendingClarify == null
   *   - dialogState.focus が active slot answer 状態でない
   *     (where focus narrowStep<3、または where 以外の slot focus narrowStep=0)
   *   - dialogState.activePresentation == null
   *   - conversationStatus が search_candidates_presented でない
   *   - conversationStatus が search_handoff_blocking でない
   */
  allowDeterministicAppend?: boolean;
}

export type SynthesisSource =
  | "llm"
  | "llm_transformed"
  | "deterministic"
  | "deterministic_overrides_llm"
  | "deterministic_append" // PR A NEW: append 単独 (LLM 空)
  | "deterministic_append_overrides_llm" // PR A NEW: append hit 時 LLM 破棄
  | "none";

export interface SynthesisResult {
  /** 確定された最終 operations (validation 直前のもの) */
  operations: PlanOperation[];
  /** どこから来たか (trace 用) */
  synthesisSource: SynthesisSource;
}

/**
 * synth 層メイン entry。
 *
 * 優先順位 (PR A 後):
 *   1. utterance pattern hit (deterministic modify: time-change / transport-only)
 *      → LLM ops を上書きして採用
 *   2. NEW PR A: deterministic append (allowDeterministicAppend === true 時のみ)
 *      → LLM ops を上書きして採用、二重発火防止
 *   3. LLM operations 非空 → inspect & transform して採用
 *   4. operations なし (none)
 */
export function synthesizeOperations(ctx: SynthesisContext): SynthesisResult {
  // Layer 1: utterance pattern detector (deterministic modify)
  const detPatterns = detectDeterministicPatterns(ctx.utterance, ctx.priorEvents);
  if (detPatterns.length > 0) {
    return {
      operations: detPatterns,
      synthesisSource:
        ctx.llmOperations.length > 0
          ? "deterministic_overrides_llm"
          : "deterministic",
    };
  }

  // Layer 2 (NEW PR A): deterministic append fallback
  //   allowDeterministicAppend === true 厳密 check で誤爆防止 (default false)
  //   detectAppendPattern が hit したら LLM operations は破棄 (二重発火防止)
  if (ctx.allowDeterministicAppend === true) {
    const detAppend = detectAppendPattern(
      ctx.utterance,
      ctx.priorEvents,
      ctx.priorPendingClarify ?? null,
    );
    if (detAppend) {
      return {
        operations: [detAppend],
        synthesisSource:
          ctx.llmOperations.length > 0
            ? "deterministic_append_overrides_llm"
            : "deterministic_append",
      };
    }
  }

  // Layer 3: LLM operations inspector
  //   deterministic pattern hit しなかった turn でも、LLM が出した operations を
  //   inspect して transport-only duplicate append → modify に変換する。
  if (ctx.llmOperations.length > 0) {
    const inspected = inspectAndTransformLlmOperations(
      ctx.llmOperations,
      ctx.priorEvents,
    );
    return {
      operations: inspected.operations,
      synthesisSource: inspected.transformed ? "llm_transformed" : "llm",
    };
  }

  // 何も無い
  return { operations: [], synthesisSource: "none" };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 1: utterance pattern detector (Commit 7)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * utterance + priorEvents から deterministic operations を生成する。
 *
 * 検出する pattern:
 *   1. 時刻変更: 「N時を M時に変更」「N:MM を M:MM に」 等の明示的な置換
 *   2. transport-only: utterance 全体が transport token (+ 軽微な助詞) のみ
 *
 * priorEvents が空の場合は空配列を返す (modify 対象がない)。
 */
export function detectDeterministicPatterns(
  utterance: string,
  priorEvents: Event[],
): PlanOperation[] {
  if (priorEvents.length === 0) return [];

  const out: PlanOperation[] = [];

  // 1. 時刻変更 pattern
  const timeChange = detectTimeChange(utterance);
  if (timeChange) {
    out.push({
      type: "modify",
      // targetRef は「N時の予定」 形式。resolveTargetRef + single_event_fallback
      // で解決される。
      targetRef: `${timeChange.fromLabel}の予定`,
      patch: {
        when: {
          startTime: timeChange.toTime,
          endTime: null,
          timeHint: null,
        },
      },
    });
  }

  // 2. transport-only pattern
  const transport = detectTransportOnly(utterance);
  if (transport) {
    out.push({
      type: "modify",
      // targetRef「今日の予定」 は固有 keyword ではないので resolveTargetRef は
      // 失敗する見込み。priorEvents.length === 1 なら single_event_fallback で
      // 解決、複数なら全 prior に対して transport を一斉 patch する想定だが、
      // applyModifyPatchFromOperation は単一 event を返すため、複数 prior に対する
      // 一斉適用は別 PR の課題。Commit 7 段階では single_event_fallback を期待。
      targetRef: "今日の予定",
      patch: { transport },
    });
  }

  return out;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pattern: 時刻変更
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TimeChangeMatch {
  /** prior 解決用ラベル (例: "9時") */
  fromLabel: string;
  /** patch 値 (HH:mm) */
  toTime: string;
}

/**
 * 時刻変更 pattern を utterance から抽出。
 *
 * 認識する形式 (明示的なもののみ):
 *   - 「N時を M時に変更」「N時を M時に」 「N時を M時にして」 「N時を M時にずらす」
 *   - 「N:MM を M:MM に」
 *   - 「N時 → M時」「N:MM → M:MM」
 *
 * 認識しない (false positive 防止):
 *   - 「N時から M時まで」 (期間表現)
 *   - 「N時の予定」 (参照のみ)
 *   - 「M時にして」 単独 (from が不明)
 */
function detectTimeChange(utterance: string): TimeChangeMatch | null {
  const u = utterance.normalize("NFKC").trim();
  if (!u) return null;

  // パターン 1: "N時(から|を) M時(に|まで).*(変更|変える|ずらす|して|にする)"
  //   ただし "から〜まで" は期間表現として除外するため別 regex で先に弾く
  if (/(\d{1,2})時(から|〜)(\d{1,2})時(まで)/.test(u)) {
    return null; // 期間表現
  }

  // hour-only: 「9時を10時に」
  const hourMatch = u.match(
    /(\d{1,2})時を(\d{1,2})時(に|へ)(?:変更|変える|ずらす|して|にする|に変更)?/,
  );
  if (hourMatch) {
    const fromHour = parseInt(hourMatch[1], 10);
    const toHour = parseInt(hourMatch[2], 10);
    if (isValidHour(fromHour) && isValidHour(toHour)) {
      return {
        fromLabel: `${fromHour}時`,
        toTime: formatHHmm(toHour, 0),
      };
    }
  }

  // hh:mm: 「9:00 を 10:00 に」
  const hhmmMatch = u.match(
    /(\d{1,2}):(\d{2})を(\d{1,2}):(\d{2})(に|へ)(?:変更|変える|ずらす|して|にする)?/,
  );
  if (hhmmMatch) {
    const fromH = parseInt(hhmmMatch[1], 10);
    const fromM = parseInt(hhmmMatch[2], 10);
    const toH = parseInt(hhmmMatch[3], 10);
    const toM = parseInt(hhmmMatch[4], 10);
    if (
      isValidHour(fromH) &&
      isValidMinute(fromM) &&
      isValidHour(toH) &&
      isValidMinute(toM)
    ) {
      return {
        fromLabel: formatHHmm(fromH, fromM),
        toTime: formatHHmm(toH, toM),
      };
    }
  }

  // 矢印 hour-only: 「9時 → 10時」
  const arrowHourMatch = u.match(/(\d{1,2})時\s*[→⇒]\s*(\d{1,2})時/);
  if (arrowHourMatch) {
    const fromHour = parseInt(arrowHourMatch[1], 10);
    const toHour = parseInt(arrowHourMatch[2], 10);
    if (isValidHour(fromHour) && isValidHour(toHour)) {
      return {
        fromLabel: `${fromHour}時`,
        toTime: formatHHmm(toHour, 0),
      };
    }
  }

  return null;
}

function isValidHour(h: number): boolean {
  return Number.isInteger(h) && h >= 0 && h <= 23;
}

function isValidMinute(m: number): boolean {
  return Number.isInteger(m) && m >= 0 && m <= 59;
}

function formatHHmm(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pattern: transport-only
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * utterance 全体が transport token (+ 軽微な助詞 / 句読点) のみかを判定。
 *
 * 認識する例 (CEO 限定 scope 2026-04-30):
 *   - 「電車」「徒歩」「車」「バス」「自転車」「タクシー」 単独
 *   - 「電車に変更」 (transport + 変更宣言)
 *   - 「徒歩で」 (助詞付き、ただし他の語を含まない)
 *
 * 認識しない (false positive 防止):
 *   - 「電車で行く」 (動詞含む)
 *   - 「9時に電車」 (時刻含む)
 *   - 「電車と徒歩」 (複数 transport)
 *
 * 判定ロジック:
 *   1. utterance を NFKC 正規化 + trim
 *   2. 句読点 / 「に変更」「で」 等の軽微な助詞 / 修飾語を除去して core を抽出
 *   3. core が transport vocabulary に **完全一致** (parseTransportExact) する
 *      ことを確認 (contains-based の parseTransport は false positive)
 *
 * 戻り値: transport vocabulary 正規化後の値 (parseTransportExact の戻り値)。
 */
function detectTransportOnly(utterance: string): string | null {
  const u = utterance.normalize("NFKC").trim();
  if (!u) return null;

  // 句読点 / 助詞 / 「に変更」 等の軽微な修飾語を除去して core token を取り出す
  const core = u
    .replace(/[。.！!？?、,\s]+/g, "")
    .replace(/に変更$/, "")
    .replace(/に変える$/, "")
    .replace(/にする$/, "")
    .replace(/に$/, "")
    .replace(/で$/, "");
  if (!core) return null;

  // 完全一致 check: core 全体が transport vocabulary に等しい
  return parseTransportExact(core);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 2: LLM operations inspector (Commit 8)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * inspectAndTransformLlmOperations の戻り値。
 *
 * - operations: 変換後の operations (元配列と同じ長さ、変換 / 非変換が混ざる)
 * - transformed: 1 つでも transform が発生したら true (trace synthesisSource 用)
 */
interface InspectResult {
  operations: PlanOperation[];
  transformed: boolean;
}

/**
 * LLM operations を順に inspect して、必要なら transform する (Commit 8)。
 *
 * 現状の transform ルール (1 種、Commit 8 scope):
 *   - **append かつ eventDraft.transport が non-null
 *     かつ prior に「when.startTime / where.place_ref / what.activity 全部一致」
 *     する event がある + 当該 prior の transport が異なる**
 *     → modify { targetRef, patch.transport } に変換
 *
 *   理由 (CEO 観測 2026-04-30 / Preview turn 3):
 *     LLM が「電車」 を「event_1 の完全コピー + transport=電車」 で append output
 *     するケースが実機で発生。これを reject + fallback すると events[] 経路で
 *     同じ duplicate が再発するため、append → modify に **変換** する
 *     (CEO 指示: reject + fallback だけは NG / transform するべき)。
 *
 *   targetRef 構築:
 *     - eventDraft.when.startTime が "HH:MM" → 「N時の予定」 (時刻 prefix)
 *     - 取れない場合 → samePlan.event_id (resolveTargetRef に直接渡せる)
 *
 * 変換しない (passthrough):
 *   - prior と一致しない append (新規予定として正常)
 *   - eventDraft.transport が null (transport patch 意図でない)
 *   - prior と一致 + transport も同じ (= 完全 duplicate、別系統の問題)
 *   - modify / answer / noop (transform 対象外)
 *
 * @internal exported for unit tests
 */
export function inspectAndTransformLlmOperations(
  llmOperations: PlanOperation[],
  priorEvents: Event[],
): InspectResult {
  const out: PlanOperation[] = [];
  let transformed = false;
  for (const op of llmOperations) {
    if (op.type !== "append") {
      out.push(op);
      continue;
    }
    if (op.eventDraft.transport == null) {
      out.push(op);
      continue;
    }
    // 一致する prior を探す (when.startTime / where.place_ref / what.activity 全部一致)
    const samePlan = priorEvents.find(
      (p) =>
        p.when.startTime === op.eventDraft.when.startTime &&
        p.where.place_ref === op.eventDraft.where.place_ref &&
        p.what.activity === op.eventDraft.what.activity,
    );
    if (!samePlan) {
      // 新規予定として正常 (prior に該当なし)
      out.push(op);
      continue;
    }
    if (samePlan.transport === op.eventDraft.transport) {
      // 完全 duplicate (transport も同じ)。本層では変換しない (別系統の問題)
      out.push(op);
      continue;
    }
    // transport-only duplicate append → modify に変換
    const targetTime = op.eventDraft.when.startTime;
    const targetRef = targetTime
      ? `${parseInt(targetTime.split(":")[0], 10)}時の予定`
      : samePlan.event_id;
    out.push({
      type: "modify",
      targetRef,
      patch: { transport: op.eventDraft.transport },
    });
    transformed = true;
  }
  return { operations: out, transformed };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 3 (NEW PR A): deterministic append fallback (CEO/GPT 2026-05-02)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Goal:
//   LLM が events / operations を空返ししても、「明示時刻 + 明示場所 + 明示活動」 が
//   揃った発話 (例: 「12時に新宿でランチ」) は append operation を deterministic に
//   生成して event 化する。5W1H event creation の安定性を確保する。
//
// 不変条件 (全 AND、CEO/GPT 厳密化):
//   1. priorEvents.length >= 1 (1 件目は LLM 経路)
//   2. priorPendingClarify === null (defensive、Branch A bind 経路と排他)
//   3. detectTimeChange が null (時刻変更経路と排他)
//   4. detectTransportOnly が null (transport-only 経路と排他)
//   5. 修正キーワード排除 (変更/にして/ずらす/→/かな/しよう/にする)
//   6. extractExplicitTimes が単一 (複数時刻は LLM 委任、PR A scope 外)
//   7. findActivitySpanInUtterance が hit (活動 span 取得で位置 index 必要)
//   8. extractExplicitPlace が hit (時刻 span 後 + 活動語直前 + 助詞接続 + negative dict)
//
// 戻り値:
//   - AppendOperation: 全 8 条件 clear、event_id は dispatch で fresh 発番される
//   - null: 1 つでも condition 不成立
//
// scope (PR A 限定):
//   - 単一の time-place-activity 追加予定のみ
//   - 「明日」 prefix の targetDate 解決は別経路 (LLM)
//   - 複数予定入力は LLM 委任

const APPEND_MODIFY_KEYWORDS_RE = /変更|にして|ずらす|→|⇒|にする/;

export function detectAppendPattern(
  utterance: string,
  priorEvents: Event[],
  priorPendingClarify: PendingClarify | null,
): AppendOperation | null {
  // 1. priorEvents 必要 (1 件目は LLM 経路)
  if (priorEvents.length === 0) return null;

  // 2. defensive: pendingClarify があれば抑制 (Branch A bind が先)
  if (priorPendingClarify !== null) return null;

  // 3. time-change (modify) と排他
  if (detectTimeChange(utterance) !== null) return null;

  // 4. transport-only (modify) と排他
  if (detectTransportOnly(utterance) !== null) return null;

  // 5. 修正キーワード排除
  if (APPEND_MODIFY_KEYWORDS_RE.test(utterance)) return null;

  // 6. 単一時刻のみ (複数時刻は LLM 委任、PR A scope 外)
  const baseTimes = extractExplicitTimes(utterance);
  if (baseTimes.length !== 1) return null;

  // 6b. 「午後 / 夜 / 晩」 prefix 補正
  const adjustedTimes = extendTimeWithModifier(utterance, baseTimes);
  const startTime = adjustedTimes[0].value;
  const timeSpan = baseTimes[0]; // index は元 utterance 内の位置

  // 7. 活動 span 取得 (位置 index 必要)
  const activitySpan = findActivitySpanInUtterance(utterance);
  if (!activitySpan) return null;

  // 8. 場所抽出 (時刻 span 後 + 活動 span 直前 + 助詞接続 + negative dict)
  const placeRef = extractExplicitPlace(utterance, timeSpan, activitySpan);
  if (!placeRef) return null;

  // 全 condition clear → AppendOperation を生成
  return {
    type: "append",
    eventDraft: {
      turn_mode: "append",
      when: {
        startTime,
        timeHint: null,
        provenance: utteranceProvenance([timeSpan.span], "high"),
      },
      where: {
        place_ref: placeRef,
        placeType: "generic_place", // anchor 名 (新宿/渋谷) は generic_place、後段で grounder が処理
        provenance: utteranceProvenance([placeRef], "high"),
      },
      what: {
        activity: activitySpan.entry.canonical,
        activityCanonical: activitySpan.entry.canonical,
        provenance: utteranceProvenance([activitySpan.span], "high"),
      },
      who: [],
      transport: null,
      certainty: "asserted",
    },
  };
}
