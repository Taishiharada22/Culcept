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
      coordinates: wasUtteranceClaim ? null : ev.where.coordinates,
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// targetDate evidence 専用正規化
//
// 既存 normalizeForMatch との分離理由:
//   - normalizeForMatch は span が utterance に実在するか比較するため、
//     句読点 / 空白を削除する (= 表記揺れ吸収)
//   - 本関数は span 内で boundary check (= 句読点 / 空白 / 助詞を境界として認識)
//     を機能させるため、 句読点 / 空白を **保持**する
//   - 同じ関数を流用すると衝突するため、 専用 helper を分離
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function normalizeForTargetDateEvidence(span: string): string {
  if (!span) return "";
  // NFKC: 全角半角統一 (= 全角数字 / 全角句読点 / 全角空白の半角化)
  // toLowerCase: alphabet のみ影響
  // trim: 前後空白削除 (= 内部の空白 / 句読点は保持)
  return span.normalize("NFKC").toLowerCase().trim();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// targetDate evidence boundary check
//
// 相対日付 token (= 「明日」 / 「今日」 等) の trailing 文字を検査して、
// 「明日香」 「今日子」 等の固有名詞内 substring 誤爆を防ぐ。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PUNCT_BOUNDARY_REGEX = /^[\sのはがをにでへとや、。,.!?]/;

const ALLOWED_TRAILING_KANJI: ReadonlySet<string> = new Set([
  "中", "朝", "昼", "夜", "晩", "夕", "頃",
]);

const ALLOWED_TRAILING_WORDS: ReadonlyArray<string> = [
  "まで", "から", "以降", "以前", "以内",
];

function hasAllowedBoundary(text: string, afterIdx: number): boolean {
  const after = text.substring(afterIdx);
  if (after.length === 0) return true;
  if (PUNCT_BOUNDARY_REGEX.test(after)) return true;
  if (ALLOWED_TRAILING_KANJI.has(after[0])) return true;
  for (const suffix of ALLOWED_TRAILING_WORDS) {
    if (after.startsWith(suffix)) return true;
  }
  return false;
}

const TIER3_TOKENS_RELATIVE_DAY: ReadonlyArray<string> = [
  "明後日", "一昨日", "明日", "本日", "今日", "昨日",
];

const TIER3_TOKENS_RELATIVE_WEEK: ReadonlyArray<string> = [
  "再来週", "来週", "今週", "先週",
];

const TIER3_TOKENS_RELATIVE_MONTH: ReadonlyArray<string> = [
  "来月", "今月", "先月",
];

function findTier3MatchWithBoundary(
  norm: string,
  tokens: ReadonlyArray<string>,
): boolean {
  for (const token of tokens) {
    let idx = 0;
    while ((idx = norm.indexOf(token, idx)) !== -1) {
      if (hasAllowedBoundary(norm, idx + token.length)) return true;
      idx += token.length;
    }
  }
  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// public: isTargetDateEvidenceToken
//
// span が targetDate の根拠 token として妥当かを deterministic 判定。
// 「明日」 「来週の月曜」 等を accept、 「明日香」 「祝日」 等を reject。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function isTargetDateEvidenceToken(span: string): boolean {
  if (!span) return false;
  const norm = normalizeForTargetDateEvidence(span);
  if (!norm) return false;

  // Tier 1: 絶対日付 / 数値相対 (= 数字含む、 boundary check 不要)
  if (/\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?/.test(norm)) return true;
  if (/\d{1,2}[/月]\d{1,2}日?/.test(norm)) return true;
  if (/\d+(日|週間|ヶ月|か月|月)(後|前)/.test(norm)) return true;

  // Tier 2: 月内 / 年内 / 週末固定 (= partial match OK、 固有名詞汚染リスク低)
  if (/(今週末|来週末|先週末|週末)/.test(norm)) return true;
  if (/(月末|月初め|月初|年末|年始)/.test(norm)) return true;

  // Tier 3: 相対日付 token (= boundary check 必要)
  if (findTier3MatchWithBoundary(norm, TIER3_TOKENS_RELATIVE_DAY)) return true;
  if (findTier3MatchWithBoundary(norm, TIER3_TOKENS_RELATIVE_WEEK)) return true;
  if (findTier3MatchWithBoundary(norm, TIER3_TOKENS_RELATIVE_MONTH)) return true;

  // 曜日 (= [月火水木金土日]曜(日)? + boundary check)
  const dayOfWeekRe = /([月火水木金土日])曜(日)?/g;
  let m: RegExpExecArray | null;
  while ((m = dayOfWeekRe.exec(norm)) !== null) {
    if (hasAllowedBoundary(norm, m.index + m[0].length)) return true;
  }

  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// public: checkTargetDateProvenance
//
// targetDate の根拠 provenance を deterministic に検証する。
//
// 規律:
//   - utterance 申告で span 不在 / 非日付 token → undefined (= null 化、 inferred 降格しない)
//   - inferred は全件 undefined (= -b strict mode、 default today inferred 汚染防止)
//   - baseline / tool はそのまま return (= factory で空配列、 観測値に乗らない)
//   - targetDate undefined / null / empty / blank は undefined
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CheckTargetDateProvenanceInput {
  targetDate: string | null | undefined;
  provenance: Provenance | null | undefined;
  utterance: string;
}

export function checkTargetDateProvenance(
  input: CheckTargetDateProvenanceInput,
): Provenance | undefined {
  const { targetDate, provenance, utterance } = input;

  // targetDate guard (= undefined / null / empty / blank)
  if (!targetDate?.trim() || !provenance) {
    return undefined;
  }

  // baseline / tool はそのまま (= factory で空配列、 観測値に乗らない)
  if (provenance.source_type === "baseline" || provenance.source_type === "tool") {
    return provenance;
  }

  // inferred は全件 undefined (= -b strict mode)
  if (provenance.source_type === "inferred") {
    return undefined;
  }

  // utterance 申告は厳格検証
  // (a) source_span 実在検査 (= 既存 verifySpansInUtterance、 normalizeForMatch 流用)
  if (!verifySpansInUtterance(provenance.source_span, utterance)) {
    return undefined;
  }
  // (b) lexicon check (= 1 つでも日付 token あり、 normalizeForTargetDateEvidence で boundary)
  const hasDateToken = provenance.source_span.some(isTargetDateEvidenceToken);
  if (!hasDateToken) {
    return undefined;
  }

  return provenance;
}
