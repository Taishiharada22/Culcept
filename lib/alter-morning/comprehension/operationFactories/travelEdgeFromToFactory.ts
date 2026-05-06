/**
 * travelEdgeFromToFactory — OP-3C-1 (CEO 2026-05-06)
 *
 * utterance から「Xから Y へ」「Xを {time}? に? 出て / 出発して / 出発 Y へ」「X 発で / 発の Y へ」
 * 系の travel edge を抽出し、 `add_travel_edge` operation candidate に wrap する pure factory。
 *
 * CEO 規律 — 重要不変条件:
 *   - **segmentOrigin を journeyOrigin に絶対昇格しない** (= PR #75 規律継承)
 *   - **segmentDestination を journeyEnd に絶対昇格しない**
 *   - 「東京駅を 8 時に出て渋谷へ」 で 東京駅 = segmentOrigin (= 移動区間起点)、
 *     **journeyOrigin (= 1 日の起点) ではない**
 *   - 1 日の起点は別 source (= previousDayEnd / priorPlan / registered_home /
 *     currentLocation / explicit day-origin signal) で決まる
 *   - factory は **`add_travel_edge` のみ出力**、 `set_journey_origin` /
 *     `set_journey_end` は絶対に出さない
 *   - 前段移動 (= 自宅 → 東京駅) の補完は OP-6 以降の接続設計で扱う
 *   - segmentDepartureTime を Y event.startTime に詰めない (= factory は events 触らない)
 *
 * 設計 highlights:
 *   1. **Anchor base iteration** (= `text.match` 1 回ではなく全候補走査)
 *      不正な最初の match (= day-origin signal 含む) で止まらず、 後続の valid edge を採用
 *   2. **payload.date 検証廃止** (= dispatcher 責務、 factory は wrap のみ)
 *   3. **time 抽出 = 構文的近傍のみ**:
 *      (a) PATTERN_OUT_TIME match 内 time (= 「Xを 8 時に出て」 の 8 時)
 *      (b) splitTemporalPrefixAndPlace で rawOrigin 内 temporal prefix 由来 time
 *      (c) match 直前 prefix の最後尾 time (= 句読点超えない、 gap 許容 connector のみ)
 *   4. **文節またぎ + day-origin signal で reject**:
 *      - matchedSpan 内に句読点 → reject
 *      - rawDest 内に anchor keyword → 別 anchor で扱う、 skip
 *      - rawDest 内に day-origin signal → 別文脈、 skip
 *   5. **`splitTemporalPrefixAndPlace`**:
 *      - temporal prefix (= 「明日 / 今日 / 8 時 / に / ごろ」 等) strip + time 抽出
 *      - verb phrase (= 「起きて / 食べて / 始めて」 等) strip + **time 無効化**
 *      - helper noun (= 「朝食 / 昼食 / を / が / の」 等) strip + time 無効化
 *      - place は残った文字列
 *   6. **classifyLabel gate**:
 *      - 採用: `public_poi_proper_noun` / `generic_category` / `private_semantic`
 *        (= 「自宅 / ホテル / 会社」 等の private も travel edge では許可)
 *      - reject: `ambiguous_or_demonstrative` (= 「そこ / これ」 等)
 *
 * OP-3C-1 規律 (= 不変条件):
 *   - dispatcher / legacyAdapter / route.ts に **接続しない**
 *   - factory は pure function (= 副作用なし、 input mutate しない)
 *   - `extractOriginAnchorFromUtterance` を呼ばない (= 「Xから」 catch 危険実装)
 *   - `extractStartPointAnchor` を呼ばない (= 6 label でも segment 表現を catch する可能性)
 *   - `extractTimeNormalized` (= utterance 全体 search) を使わない
 *
 * 設計書: docs/alter-morning-operation-pipeline-unification-design.md § 3 / § 4
 */

import {
  classifyLabel,
  type LabelClassification,
} from "../../search/labelClassification";
import type { Provenance } from "../eventSchema";
import type { AddTravelEdgeOperationCandidate } from "../planOperationCandidate";
import { wrapOperation, type OperationEnvelope } from "../operationEnvelope";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public input
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TravelEdgeFromToInput {
  utterance: string;
  sourceTurnIndex?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Anchor + terminal regex
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ANCHOR_KARA = "から";
const ANCHOR_HATSU_DE = "発で";
const ANCHOR_HATSU_NO = "発の";

/**
 * 端末 regex の min 長は **1** (= 「家」「うち」 等の private_semantic 1 char を許容)。
 * 1 char public POI (= 「東」 等の incomplete) は main loop の
 * classification-aware length check で reject。
 */
const PATTERN_FROM_TERMINAL = /^([^、。「」『』\n！？!?]{1,40}?)(?:[へに]|まで)/;
const PATTERN_HATSU_TERMINAL = /^([^、。「」『』\n！？!?]{1,40}?)[へに]/;

/**
 * `Xを{time}?に?{出て|出発して|出発}Y[へに]` 統合 regex (CEO 修正 3、 OP-3C-1):
 *   - m[1] = X (= rawOrigin、 ただし anchor keyword 跨ぎは findXStart で trim)
 *   - m[2] = optional time (= 「8 時」「8 時 30 分」)
 *   - m[3] = Y (= rawDest)
 *
 * X / Y min 長 = 1 (= private_semantic 「家」 等を許容)。 ただし lazy match なので
 * 「を」 直前まで extend、 anchor keyword 跨ぎは findXStart で trim。
 */
const PATTERN_OUT_TIME =
  /([^、。「」『』\n！？!?]{1,40}?)を(?:(\d{1,2}\s*時(?:\s*\d{1,2}\s*分)?)\s*に?)?(?:出て|出発して|出発)([^、。「」『』\n！？!?]{1,40}?)[へに]/g;

const ALL_ANCHOR_KEYWORDS: ReadonlyArray<string> = [
  ANCHOR_KARA,
  "を出て",
  "を出発して",
  "を出発",
  ANCHOR_HATSU_DE,
  ANCHOR_HATSU_NO,
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Day-origin signal keywords (= matchedSpan / rawDest 内に含まれたら reject)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * day-origin signal keyword list。
 *
 * **「今日」 は含めない** (= GPT 修正 2、 「今日」 は temporal prefix で
 * splitTemporalPrefixAndPlace で strip される)。
 */
const DAY_ORIGIN_SIGNAL_KEYWORDS: ReadonlyArray<string> = [
  "一日",
  "1日",
  "1 日",
  "始める",
  "始めて",
  "始まる",
  "起点",
  "始点",
  "出発地",
  "スタート",
  "集合",
];

function containsDayOriginSignal(text: string): boolean {
  for (const kw of DAY_ORIGIN_SIGNAL_KEYWORDS) {
    if (text.includes(kw)) return true;
  }
  return false;
}

/**
 * raw 文字列内に anchor keyword (= から / 発で / 発の / を出て / を出発して /
 * を出発) が含まれるか判定。 含まれる場合は別 anchor で扱われる別文脈なので
 * 当該 candidate を skip する。
 *
 * findXStart で原則上 rawOrigin からは anchor keyword が取り除かれるため、
 * 主に rawDest の終端 lazy match に対する防衛的 check となる。
 */
function containsAnchorKeyword(text: string): boolean {
  for (const kw of ALL_ANCHOR_KEYWORDS) {
    if (text.includes(kw)) return true;
  }
  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// splitTemporalPrefixAndPlace (= temporal prefix + verb phrase 除去 + time 抽出)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TIME_RE = /^(\d{1,2})\s*時(?:\s*(\d{1,2})\s*分)?/;
const CONNECTOR_RE = /^(に|ごろ|頃|くらい|ぐらい)/;
const WS_RE = /^[\s　、]+/;

const OTHER_TEMPORAL_REGEX_LIST: ReadonlyArray<RegExp> = [
  /^明日/,
  /^今日/,
  /^明後日/,
  /^一昨日/,
  /^昨日/,
  /^来週/,
  /^今週/,
  /^来月/,
  /^今月/,
  /^来年/,
  /^今年/,
  /^朝/,
  /^昼/,
  /^夜/,
  /^夕方/,
  /^午前/,
  /^午後/,
];

const VERB_PHRASE_REGEX_LIST: ReadonlyArray<RegExp> = [
  /^起き(て|た|る|ます)/,
  /^食べ(て|た|る|ます)/,
  /^会(って|った|う|います)/,
  /^行(って|った|く|きます|きました)/,
  /^戻(って|った|る|ります)/,
  /^着(いて|いた|く|きます)/,
  /^乗(って|った|る|ります)/,
  /^降(りて|りた|りる|ります)/,
  /^飲(んで|んだ|む|みます)/,
  /^始(めて|めた|める|まる|まって)/,
  /^した/,
  /^して/,
  /^しました/,
];

const HELPER_NOUN_REGEX_LIST: ReadonlyArray<RegExp> = [
  /^朝食/,
  /^昼食/,
  /^夕食/,
  /^食事/,
  /^を/,
  /^が/,
  /^の/,
];

function formatTime(hour: number, minute: number): string | null {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * raw 文字列から temporal prefix と verb phrase を strip し、 残った文字列を
 * place として返す。 strip 中に有効な time が見つかれば extractedTime に保持。
 *
 * verb phrase / helper noun を検出すると **time を無効化**(= 動作後の time が後勝ち)。
 */
function splitTemporalPrefixAndPlace(raw: string): {
  place: string;
  departureTime: string | null;
} {
  const text = raw.normalize("NFKC").trim();
  let remaining = text;
  let extractedTime: string | null = null;

  let stripped = true;
  while (stripped && remaining.length > 0) {
    stripped = false;

    // 空白 / 句読点
    const ws = remaining.match(WS_RE);
    if (ws) {
      remaining = remaining.slice(ws[0].length);
      stripped = true;
      continue;
    }

    // time pattern (= 後勝ち)
    const tm = remaining.match(TIME_RE);
    if (tm) {
      const hour = parseInt(tm[1], 10);
      const minute = tm[2] ? parseInt(tm[2], 10) : 0;
      const formatted = formatTime(hour, minute);
      if (formatted) {
        extractedTime = formatted;
      }
      remaining = remaining.slice(tm[0].length);
      stripped = true;
      continue;
    }

    // connectors (= に / ごろ / 頃 / くらい / ぐらい)
    const cm = remaining.match(CONNECTOR_RE);
    if (cm) {
      remaining = remaining.slice(cm[0].length);
      stripped = true;
      continue;
    }

    // helper nouns (= 「朝食 / 昼食 / 食事 / を / が / の」) を OTHER_TEMPORAL より
    // **先に** check (= 「朝食」 を `/^朝/` より優先 match させるため)
    let helperMatched = false;
    for (const re of HELPER_NOUN_REGEX_LIST) {
      const m = remaining.match(re);
      if (m) {
        extractedTime = null;
        remaining = remaining.slice(m[0].length);
        stripped = true;
        helperMatched = true;
        break;
      }
    }
    if (helperMatched) continue;

    // verb phrases → time 無効化 + strip 継続
    let verbMatched = false;
    for (const re of VERB_PHRASE_REGEX_LIST) {
      const m = remaining.match(re);
      if (m) {
        extractedTime = null;
        remaining = remaining.slice(m[0].length);
        stripped = true;
        verbMatched = true;
        break;
      }
    }
    if (verbMatched) continue;

    // other temporal prefixes (= 「明日 / 今日 / 朝 / 夜」 等)
    let tempMatched = false;
    for (const re of OTHER_TEMPORAL_REGEX_LIST) {
      const m = remaining.match(re);
      if (m) {
        remaining = remaining.slice(m[0].length);
        stripped = true;
        tempMatched = true;
        break;
      }
    }
    if (tempMatched) continue;
  }

  return {
    place: remaining.trim(),
    departureTime: extractedTime,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extractTimeFromMatchPrefix (= match 直前 prefix で time、 句読点超えない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ALLOWED_GAP_KEYWORDS: ReadonlyArray<string> = ["に", "ごろ", "頃", "くらい", "ぐらい"];

function isAllowedConnector(gap: string): boolean {
  const cleaned = gap.normalize("NFKC").replace(/[\s　]/g, "");
  if (cleaned === "") return true;
  let rest = cleaned;
  while (rest.length > 0) {
    const kw = ALLOWED_GAP_KEYWORDS.find((k) => rest.startsWith(k));
    if (!kw) return false;
    rest = rest.slice(kw.length);
  }
  return true;
}

const TIME_PATTERN_GLOBAL = /(\d{1,2})\s*時(?:\s*(\d{1,2})\s*分)?/g;

function extractTimeFromMatchPrefix(
  text: string,
  matchIndex: number,
): string | null {
  const prefix = text.slice(0, matchIndex);
  // 直前句読点 / 改行で区切る
  const lastDelim = Math.max(
    prefix.lastIndexOf("、"),
    prefix.lastIndexOf("。"),
    prefix.lastIndexOf("\n"),
  );
  const nearPrefix = lastDelim >= 0 ? prefix.slice(lastDelim + 1) : prefix;
  if (!nearPrefix) return null;

  // 最後尾 time
  let lastMatch: RegExpExecArray | null = null;
  TIME_PATTERN_GLOBAL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TIME_PATTERN_GLOBAL.exec(nearPrefix)) !== null) {
    const hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    if (formatTime(hour, minute)) {
      lastMatch = m;
    }
  }
  if (!lastMatch) return null;

  const timeEnd = lastMatch.index + lastMatch[0].length;
  const gap = nearPrefix.slice(timeEnd);
  if (!isAllowedConnector(gap)) return null;

  const hour = parseInt(lastMatch[1], 10);
  const minute = lastMatch[2] ? parseInt(lastMatch[2], 10) : 0;
  return formatTime(hour, minute);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Anchor base iteration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface EdgeCandidate {
  matchedSpan: string;
  matchIndex: number;
  rawOrigin: string;
  rawDest: string;
  embeddedDepartureTime: string | null;
}

const DELIMITER_RE = /[、。「」『』\n！？!?]/;

/**
 * anchor 直前の X (= rawOrigin) が始まる位置を返す。
 *
 * 規律 (CEO 2026-05-06):
 *   - 直前 delimiter (= 句読点 / 改行 / 括弧) で stop
 *   - **どの anchor keyword (= ALL_ANCHOR_KEYWORDS) でも stop**
 *     (= 「東京駅から渋谷を出て新宿へ」 の 「を出て」 anchor で X = 「渋谷」)
 *   - 1 つ前の anchor が終わる位置から再開
 *
 * これにより:
 *   - findByAnchor("から") の rawOrigin が 「を出て」 / 「発で」 等を跨がない
 *   - findByOutTimePattern の rawOrigin が 「から」 / 「発で」 を跨がない
 */
function findXStart(text: string, anchorIdx: number): number {
  const prefix = text.slice(0, anchorIdx);
  let xStart = 0;

  // 直前 delimiter (= 句読点 / 改行 / 括弧)
  for (let i = prefix.length - 1; i >= 0; i--) {
    if (DELIMITER_RE.test(prefix[i])) {
      xStart = Math.max(xStart, i + 1);
      break;
    }
  }

  // 任意 anchor keyword の直前終端 (= 別 anchor を跨がない)
  for (const kw of ALL_ANCHOR_KEYWORDS) {
    const lastIdx = prefix.lastIndexOf(kw);
    if (lastIdx !== -1) {
      xStart = Math.max(xStart, lastIdx + kw.length);
    }
  }

  return xStart;
}

function findByAnchor(
  text: string,
  anchorKeyword: string,
  terminalRegex: RegExp,
): EdgeCandidate[] {
  const all: EdgeCandidate[] = [];
  let pos = 0;

  while (pos < text.length) {
    const anchorIdx = text.indexOf(anchorKeyword, pos);
    if (anchorIdx === -1) break;

    const xStart = findXStart(text, anchorIdx);
    const rawOrigin = text.slice(xStart, anchorIdx);

    // length min = 1 (= 「家から…」 等の 1 char private label を許容、
    // 1 char public POI は main loop の classification-aware length check で reject)
    if (rawOrigin.length < 1) {
      pos = anchorIdx + anchorKeyword.length;
      continue;
    }

    const after = text.slice(anchorIdx + anchorKeyword.length);
    const yMatch = after.match(terminalRegex);
    if (!yMatch) {
      pos = anchorIdx + anchorKeyword.length;
      continue;
    }
    const rawDest = yMatch[1];

    const matchedSpan = text.slice(
      xStart,
      anchorIdx + anchorKeyword.length + yMatch[0].length,
    );

    all.push({
      matchedSpan,
      matchIndex: xStart,
      rawOrigin,
      rawDest,
      embeddedDepartureTime: null,
    });

    pos = anchorIdx + anchorKeyword.length;
  }

  return all;
}

function findByOutTimePattern(text: string): EdgeCandidate[] {
  const all: EdgeCandidate[] = [];

  // PATTERN_OUT_TIME は global flag 付き → matchAll で iteration
  // ただし lastIndex の挙動を考慮するため新 regex を作成 (= 関数 call ごとに reset)
  const re = new RegExp(PATTERN_OUT_TIME.source, PATTERN_OUT_TIME.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index === undefined) continue;

    // X が anchor keyword 跨ぎ (= 「東京駅から渋谷を出て新宿へ」 の m[1] =
    // 「東京駅から渋谷」) の場合、 findXStart で 「を」 直前の正しい X を再計算。
    const oIdx = m.index + m[1].length;
    const xStart = findXStart(text, oIdx);
    const rawOrigin = text.slice(xStart, oIdx);

    if (rawOrigin.length < 1) {
      if (re.lastIndex === m.index) {
        re.lastIndex = m.index + 1;
      }
      continue;
    }

    let outTime: string | null = null;
    if (m[2]) {
      const tm = m[2].match(/^(\d{1,2})\s*時(?:\s*(\d{1,2})\s*分)?/);
      if (tm) {
        const hour = parseInt(tm[1], 10);
        const minute = tm[2] ? parseInt(tm[2], 10) : 0;
        outTime = formatTime(hour, minute);
      }
    }

    const matchEnd = m.index + m[0].length;
    const matchedSpan = text.slice(xStart, matchEnd);

    all.push({
      matchedSpan,
      matchIndex: xStart,
      rawOrigin,
      rawDest: m[3],
      embeddedDepartureTime: outTime,
    });

    // 無限 loop 防止
    if (re.lastIndex === m.index) {
      re.lastIndex = m.index + 1;
    }
  }

  return all;
}

function findAllEdgeCandidates(text: string): EdgeCandidate[] {
  const all: EdgeCandidate[] = [];
  all.push(...findByAnchor(text, ANCHOR_KARA, PATTERN_FROM_TERMINAL));
  all.push(...findByOutTimePattern(text));
  all.push(...findByAnchor(text, ANCHOR_HATSU_DE, PATTERN_HATSU_TERMINAL));
  all.push(...findByAnchor(text, ANCHOR_HATSU_NO, PATTERN_HATSU_TERMINAL));
  all.sort((a, b) => a.matchIndex - b.matchIndex);
  return all;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// classifyLabel gate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * travel edge factory で採用可能な分類:
 *   - public_poi_proper_noun (= 「東京駅」 等の固有名)
 *   - generic_category (= 「ホテル / カフェ」 等の category)
 *   - private_semantic (= 「自宅 / 会社 / 友達の家」 等の私的 anchor)
 *
 * reject:
 *   - ambiguous_or_demonstrative (= 「そこ / これ」 等の文脈依存)
 *
 * GPT 規律 (CEO 2026-05-06): private_semantic も travel edge では許可。
 *   「自宅から渋谷へ / ホテルから東京駅へ / 会社から空港へ」 は segment-level の
 *   travel として正当。 ただし segmentOrigin を **journeyOrigin に昇格しない**
 *   規律は別途 invariant test で固定。
 */
function isAcceptableTravelEdgeClassification(cls: LabelClassification): boolean {
  return (
    cls === "public_poi_proper_noun" ||
    cls === "generic_category" ||
    cls === "private_semantic"
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main entry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * utterance から travel edge を抽出して `add_travel_edge` candidate に wrap する。
 *
 * 動作:
 *   1. NFKC 正規化
 *   2. 全 anchor (= から / を{time}?に?{出て|出発して|出発} / 発で / 発の) で
 *      candidate を取得 (= findXStart で anchor 跨ぎを排除済み)
 *   3. matchIndex 順 sort
 *   4. iteration で valid なものを順次 check:
 *      a. matchedSpan 句読点 → skip
 *      b. rawOrigin 内に anchor keyword → skip (= defense)
 *      c. rawDest 内に anchor keyword → skip
 *      d. rawDest 内に day-origin signal → skip
 *      e. splitTemporalPrefixAndPlace で X / Y を normalize
 *      f. X / Y 空 / X === Y → skip
 *      g. classifyLabel gate (= ambiguous reject)
 *      h. classification-aware length:
 *         - public_poi_proper_noun: 2+ chars
 *         - generic_category / private_semantic: 1+ chars (= 「家」 OK)
 *      i. departureTime 優先順:
 *         - embeddedDepartureTime (= PATTERN_OUT_TIME 内 time)
 *         - timeFromX (= rawOrigin 内 splitTemporalPrefixAndPlace)
 *         - extractTimeFromMatchPrefix (= match 直前 prefix、 句読点超えない)
 *      j. 採用 → 1 envelope return (= max 1 edge per utterance)
 *   5. 全 candidate が invalid → 空配列
 *
 * 不変条件 (= test で固定):
 *   - 出力 type は **必ず "add_travel_edge"** (= "set_journey_origin" /
 *     "set_journey_end" を絶対に出さない)
 *   - segmentOrigin を journeyOrigin に昇格しない (= payload.kind が存在しない)
 */
export function travelEdgeFromToFactory(
  input: TravelEdgeFromToInput,
): OperationEnvelope<AddTravelEdgeOperationCandidate>[] {
  if (!input.utterance) return [];
  const text = input.utterance.normalize("NFKC");

  const candidates = findAllEdgeCandidates(text);

  for (const cand of candidates) {
    // a. matchedSpan 句読点 (= 文節またぎ) → skip
    if (/[、。\n]/.test(cand.matchedSpan)) continue;

    // b. rawOrigin 内に anchor keyword → skip (= findXStart で原則排除済みの defense)
    if (containsAnchorKeyword(cand.rawOrigin)) continue;

    // c. rawDest 内に anchor keyword (= 別 anchor で扱われる) → skip
    if (containsAnchorKeyword(cand.rawDest)) continue;

    // d. rawDest 内に day-origin signal → 別文脈、 skip
    if (containsDayOriginSignal(cand.rawDest)) continue;

    // e. rawOrigin / rawDest split
    const { place: x, departureTime: timeFromX } =
      splitTemporalPrefixAndPlace(cand.rawOrigin);
    const { place: y } = splitTemporalPrefixAndPlace(cand.rawDest);

    // f. length / equality (= 空 / 同一 reject)
    if (x.length === 0 || y.length === 0) continue;
    if (x === y) continue;

    // g. classifyLabel gate (= ambiguous / demonstrative reject)
    const xCls = classifyLabel(x);
    const yCls = classifyLabel(y);
    if (!isAcceptableTravelEdgeClassification(xCls)) continue;
    if (!isAcceptableTravelEdgeClassification(yCls)) continue;

    // h. classification-aware length check (CEO 2026-05-06):
    //    - public_poi_proper_noun: 2+ chars (= 「東」「京」 等の incomplete を reject)
    //    - generic_category / private_semantic: 1+ chars (= 「家」「うち」 OK)
    if (xCls === "public_poi_proper_noun" && x.length < 2) continue;
    if (yCls === "public_poi_proper_noun" && y.length < 2) continue;

    // i. departureTime 優先順位
    let departureTime = cand.embeddedDepartureTime ?? timeFromX;
    if (!departureTime) {
      departureTime = extractTimeFromMatchPrefix(text, cand.matchIndex);
    }

    // h. envelope 生成 (= 最初の valid を採用、 max 1 edge per utterance)
    const provenance: Provenance = {
      source_type: "utterance",
      source_span: [cand.matchedSpan],
      provenance_confidence: "high",
      from_utterance: true,
    };

    const baseTrace = {
      ruleId: "travelEdgeFromTo",
      matchedSpan: cand.matchedSpan,
    };
    const trace =
      input.sourceTurnIndex !== undefined
        ? { ...baseTrace, sourceTurnIndex: input.sourceTurnIndex }
        : baseTrace;

    return [
      wrapOperation(
        {
          type: "add_travel_edge",
          payload: {
            segmentOrigin: { label: x, classification: xCls },
            segmentDestination: { label: y, classification: yCls },
            ...(departureTime ? { segmentDepartureTime: departureTime } : {}),
            matchedSpan: cand.matchedSpan,
          },
        },
        {
          source: "regex_deterministic",
          priority: 600,
          confidence: "high",
          provenance,
          trace,
        },
      ),
    ];
  }

  return [];
}
