/**
 * L1.2 Slot & Provenance Checker — Comprehension-First v1.3+ Wave 1
 *
 * 設計書: docs/alter-morning-comprehension-first-v1.3plus.md §2.2, §4
 *
 * 責務:
 *   1. LLM が申告した source_type="utterance" を deterministic に検査し、
 *      嘘の申告（hallucinate）を "inferred" に降格する
 *   2. 欠損 slot を missing_semantic_critical に投入する
 *   3. source_span が発話内に正規化一致で実在することを確認する
 *
 * 正規化ルール（CEO 決定: Q-C = 正規化一致）:
 *   - 小文字化（NFKC で半角/全角統一してから）
 *   - 空白・句読点（、。,.!?！？・ー—–-）を全削除
 *   - 比較は substring 一致（source_span が utterance に含まれるか）
 *
 * 設計原則:
 *   - この checker は LLM を呼ばない。純 deterministic。
 *   - 入力 Event を immutable に扱い、新しい Event を返す
 *   - hallucinate を弾くだけでなく、なぜ弾いたかを missing_semantic_critical で表現
 */

import type {
  Event,
  Provenance,
  SemanticCriticalSlot,
} from "./eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 正規化（CEO Q-C: 正規化一致）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PUNCT_WS_RE = /[\s、。,．\.!?！？・ー—–\-「」『』（）()［］\[\]{}〜~]/g;

/**
 * 発話と根拠文字列を比較するための正規化。
 *
 * - NFKC で半角/全角ゆらぎを揃える
 * - 小文字化
 * - 句読点・空白を全削除
 *
 * 例: "朝は、サドヤで、" → "朝はサドヤで"
 *     "サドヤ"         → "サドヤ"
 */
export function normalizeForMatch(s: string): string {
  if (!s) return "";
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(PUNCT_WS_RE, "");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Span 実在検査
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * source_span の全要素が utterance に正規化一致で含まれるか検査する。
 *
 * - source_span が空配列: false（utterance 申告なのに根拠なし＝嘘）
 * - いずれか 1 つでも含まれない: false
 * - 全要素が含まれる: true
 *
 * 境界ケース:
 *   - 空文字の span は無視せず false（「正規化後に空」も嘘扱い）
 *   - utterance が空: 常に false
 */
export function verifySpansInUtterance(
  spans: string[],
  utterance: string,
): boolean {
  if (!utterance) return false;
  if (!spans || spans.length === 0) return false;
  const normUtt = normalizeForMatch(utterance);
  if (!normUtt) return false;
  for (const span of spans) {
    const normSpan = normalizeForMatch(span);
    if (!normSpan) return false;
    if (!normUtt.includes(normSpan)) return false;
  }
  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Provenance 降格
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * source_type="utterance" だが spans が utterance に存在しない場合、
 * "inferred" に降格する。他の source_type はそのまま返す。
 */
export function demoteIfHallucinated(
  prov: Provenance,
  utterance: string,
): Provenance {
  if (prov.source_type !== "utterance") return prov;
  if (verifySpansInUtterance(prov.source_span, utterance)) return prov;
  return {
    source_type: "inferred",
    source_span: [],
    provenance_confidence: "low",
    from_utterance: false,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Slot 欠損判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * when slot が critical に欠損か。
 * startTime も timeHint も null なら欠損。
 */
function isWhenMissing(ev: Event): boolean {
  return ev.when.startTime == null && ev.when.timeHint == null;
}

/**
 * where slot が critical に欠損か。
 * place_ref が null なら欠損（placeType 単独では slot として不足）。
 */
function isWhereMissing(ev: Event): boolean {
  return ev.where.place_ref == null;
}

/**
 * what slot が critical に欠損か。
 * activity が空文字 or null なら欠損。
 */
function isWhatMissing(ev: Event): boolean {
  return !ev.what.activity || ev.what.activity.trim() === "";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 主エントリ: Event のチェックと正規化
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * L1.1 LLM 出力（Event 仮）を検査・正規化して L1.2 確定版 Event を返す。
 *
 * 手順:
 *   1. when/where/what 各 slot の provenance を demoteIfHallucinated で検査
 *      - hallucinate が判明した place_ref は null にクリアする（Bug 1 恒久対処）
 *   2. missing_semantic_critical を再計算（hallucinate 降格の影響を反映）
 *
 * 非破壊: 入力 Event は変更せず、新 Event を返す。
 */
export function checkEvent(ev: Event, utterance: string): Event {
  // when
  const whenProv = demoteIfHallucinated(ev.when.provenance, utterance);
  const when = ev.when.provenance === whenProv
    ? ev.when
    : { ...ev.when, provenance: whenProv };

  // where — hallucinate が判明した place_ref は null にクリア
  const whereProv = demoteIfHallucinated(ev.where.provenance, utterance);
  let where = ev.where;
  if (whereProv !== ev.where.provenance) {
    // utterance 申告だったが spans が実在しなかった場合のみ place_ref をクリア。
    // 他の source_type（baseline/inferred/tool）ではクリアしない。
    const wasUtteranceClaim = ev.where.provenance.source_type === "utterance";
    where = {
      place_ref: wasUtteranceClaim ? null : ev.where.place_ref,
      placeType: wasUtteranceClaim ? null : ev.where.placeType,
      provenance: whereProv,
    };
  }

  // what
  const whatProv = demoteIfHallucinated(ev.what.provenance, utterance);
  const what = ev.what.provenance === whatProv
    ? ev.what
    : { ...ev.what, provenance: whatProv };

  // missing_semantic_critical 再計算
  const newMissing: SemanticCriticalSlot[] = [];
  const draft: Event = { ...ev, when, where, what };
  if (isWhenMissing(draft)) newMissing.push("when");
  if (isWhereMissing(draft)) newMissing.push("where");
  if (isWhatMissing(draft)) newMissing.push("what");

  return {
    ...draft,
    missing_semantic_critical: newMissing,
  };
}

/**
 * ComprehensionResult の全 events を一括検査。
 */
export function checkEvents(events: Event[], utterance: string): Event[] {
  return events.map((ev) => checkEvent(ev, utterance));
}
