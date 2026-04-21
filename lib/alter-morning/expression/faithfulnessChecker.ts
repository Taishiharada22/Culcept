/**
 * L3.2 Faithfulness Checker — Comprehension-First v1.3+ Wave 2
 *
 * 設計書: docs/alter-morning-comprehension-first-wave2-design.md §4
 *
 * 責務:
 *   Narration 本文 vs plan graph の差分を検出し、「plan にない時刻・場所が
 *   narration に出現していないか」を deterministic に検査する。
 *
 * 設計原則:
 *   - 純関数。LLM 呼び出しなし
 *   - Narration を plan graph に従属させる（CEO 補足: Wave 2 で一番大事なのはこれ）
 *   - 誤検出は retry で吸収する方針（Q-3=A）
 *   - 違反を列挙して L3 pipeline に渡す。fallback 判断は pipeline 側
 */

import type { ComprehensionResult, Event } from "../comprehension/eventSchema";
import type { TimeLine } from "../planning/timeSolver";
import type { GroundedPlace } from "../planning/placeGrounder";
import { normalizeForMatch } from "../comprehension/provenanceChecker";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type FaithfulnessViolationType =
  | "event_not_covered"        // plan にある event_id が narration に出ない
  | "extra_time_in_text"       // plan の startTime 以外の時刻が narration に出る
  | "extra_place_in_text"      // plan の place 以外の proper noun が narration に出る
  | "missing_tentative_hedge"; // tentative event が narration で断定調に語られる

export interface FaithfulnessViolation {
  type: FaithfulnessViolationType;
  /** 関連 event_id（該当があれば） */
  event_id?: string;
  /** 違反した具体値（時刻文字列 / proper noun 等） */
  offender?: string;
  /** 人間向けメッセージ */
  message: string;
}

export interface FaithfulnessCheckInput {
  narration_text: string;
  covered_event_ids: string[];
  comprehension: ComprehensionResult;
  timeline: TimeLine;
  grounded: GroundedPlace[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 時刻抽出（narration から）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * narration text から時刻表現を抽出し HH:mm 正規化する。
 * 検出形式: HH:mm / HH時mm分 / HH時半 / HH時
 */
const NARRATION_TIME_PATTERNS: Array<{ re: RegExp; toHHmm: (m: RegExpExecArray) => string | null }> = [
  {
    re: /(\d{1,2}):(\d{2})/g,
    toHHmm: (m) => normHHmm(Number(m[1]), Number(m[2])),
  },
  {
    re: /(\d{1,2})時(\d{1,2})分/g,
    toHHmm: (m) => normHHmm(Number(m[1]), Number(m[2])),
  },
  {
    re: /(\d{1,2})時半/g,
    toHHmm: (m) => normHHmm(Number(m[1]), 30),
  },
  {
    re: /(\d{1,2})時(?!半|\d|分)/g,
    toHHmm: (m) => normHHmm(Number(m[1]), 0),
  },
];

function normHHmm(hh: number, mm: number): string | null {
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function extractTimesFromNarration(text: string): string[] {
  if (!text) return [];
  const normalized = text.normalize("NFKC");
  const found = new Set<string>();
  const claimed: Array<{ start: number; end: number }> = [];

  function overlaps(s: number, e: number): boolean {
    return claimed.some((c) => !(e <= c.start || s >= c.end));
  }

  for (const { re, toHHmm } of NARRATION_TIME_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(normalized)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const val = toHHmm(m);
      if (val) {
        found.add(val);
        claimed.push({ start, end });
      }
    }
  }

  return Array.from(found).sort();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Proper noun 抽出（narration から）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * narration text から proper noun 候補を抽出する。
 * Q-3=A 決定（厳しめ、誤検出は retry 吸収）:
 *   - カタカナ 2+ 文字の連続（「サドヤ」「マック」「コーヒー」等すべて）
 *   - 漢字 2+ 文字連続のうち一般動詞語尾を含まないもの（「自宅」「会社」等）
 *     ただし活動系漢字語（「昼食」「朝食」「仕事」「会議」「散歩」）は除外
 *
 * 注: 「コーヒー」「ランチ」等も proper noun 候補に含むため、
 *     plan 側で activity canonical に含まれる語は別途許容する必要がある（caller 側で組み立てる）。
 */
const KATAKANA_PROPER_RE = /[\u30A0-\u30FF\u30FD\u30FE]{2,}/g;

// 除外する一般語（活動系・時間系・関係語）
const EXCLUDED_COMMON_NOUNS = new Set<string>([
  "コーヒー",
  "ランチ",
  "ディナー",
  "ブランチ",
  "モーニング",
  "カフェ",
  "レストラン",
  "ショッピング",
  "ミーティング",
  "ワーク",
  "リラックス",
  "ランニング",
  "ウォーキング",
  "サイクリング",
  "ヨガ",
]);

export function extractProperNounsFromNarration(text: string): string[] {
  if (!text) return [];
  const normalized = text.normalize("NFKC");
  const found = new Set<string>();

  KATAKANA_PROPER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = KATAKANA_PROPER_RE.exec(normalized)) !== null) {
    if (EXCLUDED_COMMON_NOUNS.has(m[0])) continue;
    found.add(m[0]);
  }

  return Array.from(found).sort();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tentative hedge 検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const HEDGE_WORDS = [
  "あたり",
  "かも",
  "かもしれ",
  "予定",
  "あたりで",
  "あたりに",
  "ぐらい",
  "くらい",
  "ごろ",
  "頃",
  "たぶん",
  "多分",
  "あたりかな",
];

/**
 * narration text 全体に hedge 語が 1 件以上含まれるか。
 *
 * Wave 2 では「tentative event が narration に登場する場合、text 全体の
 * どこかに hedge 語があれば OK」とする。per-event の位置検出は Wave 3 以降。
 */
export function hasHedgeSomewhere(text: string): boolean {
  if (!text) return false;
  const normalized = text.normalize("NFKC");
  return HEDGE_WORDS.some((w) => normalized.includes(w));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Allowed 集合構築
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildAllowedTimes(timeline: TimeLine): Set<string> {
  const s = new Set<string>();
  for (const e of timeline.entries) {
    if (e.startTime) s.add(e.startTime);
    if (e.endTime) s.add(e.endTime);
  }
  return s;
}

function buildAllowedProperNouns(
  events: Event[],
  grounded: GroundedPlace[],
): Set<string> {
  const s = new Set<string>();
  for (const ev of events) {
    if (ev.where.place_ref) s.add(ev.where.place_ref);
    // activity canonical が proper noun っぽく見える可能性に備えて入れておく
    if (ev.what.activityCanonical) s.add(ev.what.activityCanonical);
    if (ev.what.activity) s.add(ev.what.activity);
    // who
    for (const w of ev.who) s.add(w);
  }
  for (const g of grounded) {
    for (const c of g.candidates) {
      s.add(c.resolvedName);
      if (c.matchedAlias) s.add(c.matchedAlias);
    }
    if (g.place_ref) s.add(g.place_ref);
  }
  return s;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Checker 本体
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function checkFaithfulness(
  input: FaithfulnessCheckInput,
): FaithfulnessViolation[] {
  const violations: FaithfulnessViolation[] = [];
  const { narration_text, covered_event_ids, comprehension, timeline, grounded } = input;

  // 1. event_not_covered
  const planEventIds = new Set(comprehension.events.map((e) => e.event_id));
  const coveredSet = new Set(covered_event_ids);
  for (const id of planEventIds) {
    if (!coveredSet.has(id)) {
      violations.push({
        type: "event_not_covered",
        event_id: id,
        message: `plan 内の event ${id} が narration に含まれていません`,
      });
    }
  }

  // 2. extra_time_in_text
  const allowedTimes = buildAllowedTimes(timeline);
  const narrationTimes = extractTimesFromNarration(narration_text);
  for (const t of narrationTimes) {
    if (!allowedTimes.has(t)) {
      violations.push({
        type: "extra_time_in_text",
        offender: t,
        message: `narration に plan 外の時刻 "${t}" が含まれています`,
      });
    }
  }

  // 3. extra_place_in_text
  const allowedNounsRaw = buildAllowedProperNouns(comprehension.events, grounded);
  const allowedNormalized = new Set(
    Array.from(allowedNounsRaw).map((s) => normalizeForMatch(s)),
  );
  const narrationNouns = extractProperNounsFromNarration(narration_text);
  for (const n of narrationNouns) {
    const normN = normalizeForMatch(n);
    // allowed の正規化形のいずれかに部分一致すれば OK
    let ok = allowedNormalized.has(normN);
    if (!ok) {
      for (const a of allowedNormalized) {
        if (a && (a.includes(normN) || normN.includes(a))) {
          ok = true;
          break;
        }
      }
    }
    if (!ok) {
      violations.push({
        type: "extra_place_in_text",
        offender: n,
        message: `narration に plan 外の固有名 "${n}" が含まれています`,
      });
    }
  }

  // 4. missing_tentative_hedge
  const hasTentative = comprehension.events.some((e) => e.certainty === "tentative");
  if (hasTentative && !hasHedgeSomewhere(narration_text)) {
    violations.push({
      type: "missing_tentative_hedge",
      message:
        "tentative な event が含まれるが narration に hedge 語（あたり/かも/予定 等）がありません",
    });
  }

  return violations;
}
