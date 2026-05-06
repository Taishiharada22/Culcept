/**
 * explicitDayOriginFactory — OP-3C-2 (CEO 2026-05-06)
 *
 * utterance から **明示的 day-origin signal** だけを抽出し、
 * `set_journey_origin` operation candidate に wrap する pure factory。
 *
 * 採用 pattern (= signal keyword 必須):
 *   A: 「Xから(?:1日|一日)?(?:を)?始(?:める|まる|めて)」
 *   B: 「Xを(?:1日の|一日の)?(?:起点|始点|出発地)」
 *   C: 「X(?:から)?スタート」
 *
 * 採用しない pattern (= signal keyword 不在 / 別 factory 責務):
 *   - travel edge (= 「Xから Y へ」 / 「Xを出て Y へ」 / 「X発で Y へ」 系) → OP-3C-1 責務
 *   - 集合 (= 「X集合」 / 「Xで集合」 / 「Xに集合」) → 集合場所 ≠ 1日の起点、 将来 factory で扱う
 *   - 非場所 noun + スタート (= 「作業スタート」 / 「会議スタート」) → 活動 ≠ 場所
 *   - ambiguous (= 「そこから始める」 / 「ここを起点」) → classifyLabel で reject
 *
 * 責務分離 (CEO 2026-05-06):
 *   **同一 matched span では責務を分ける**。 同一 utterance 全体では travel edge と
 *   explicit day-origin が **両方出てもよい**。
 *
 *   例: 「自宅から始めて 8 時東京駅から渋谷へ」
 *     - explicitDayOriginFactory (本 factory): set_journey_origin = 自宅
 *     - travelEdgeFromToFactory (OP-3C-1):    add_travel_edge = 東京駅 → 渋谷, 08:00
 *
 *   両 factory が独立 emit、 dispatcher は別 field で reduce。
 *
 *   ただし本 factory は **`add_travel_edge` を絶対に出さない** (= invariant test 固定)。
 *
 * CEO 規律 — 重要不変条件:
 *   - **`set_journey_origin` のみ**出力 (= add_travel_edge / set_journey_end は絶対不出)
 *   - `payload.kind` は既存 `JourneyAnchorState.kind` 3 値のみ (= known_exact /
 *     known_label_only / unknown)。 「explicit_user_signal」 等の新値を作らない。
 *   - `payload.source` は既存 `AnchorSource` enum 9 値のみ。 「user_declared」 を採用
 *     (= deterministic detector 由来、 USER_EXPLICIT_SOURCES 強権を継承)
 *   - `payload.coords` / `lat` / `lng` は出さない (= grounding は別 layer)
 *   - runtime 接続なし (= dispatcher / legacyAdapter / route.ts に import されない)
 *   - active L1_COMPREHENSION_SCHEMA 不変
 *   - PR #75 系 module 参照なし
 *
 * 設計 (= シンプル化、 OP-3C-1 mirror しない):
 *   1. NFKC 正規化
 *   2. 句読点 (= 、。\n) で segment 分割
 *   3. 各 segment に 3 pattern を順に試行
 *   4. match → X 抽出 → anchor 跨ぎ trim → 前置詞 strip → 非場所 noun reject →
 *      classifyLabel gate → classification-aware length → 採用
 *   5. 最初の valid を 1 envelope で return (= max 1 day-origin per utterance)
 *
 * priority:
 *   - 950 (= UI 1000 の下、 historyPriorPlan 900 の上)
 *   - 「user の当 turn 明示意思表示」 は historyPriorPlan より強い、 UI 確定より弱い
 *
 * 設計書: docs/alter-morning-operation-pipeline-unification-design.md § 3 / § 4
 */

import {
  classifyLabel,
  type LabelClassification,
} from "../../search/labelClassification";
import type { Provenance } from "../eventSchema";
import type { SetJourneyOriginOperationCandidate } from "../planOperationCandidate";
import { wrapOperation, type OperationEnvelope } from "../operationEnvelope";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public input
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ExplicitDayOriginInput {
  utterance: string;
  sourceTurnIndex?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Day-origin pattern set (= 3 群)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DayOriginPattern {
  /** trace.ruleId に suffix として埋め込む識別子 */
  name: string;
  /** segment に対し `^...` で match する pattern。 m[1] = X (= rawOrigin) */
  regex: RegExp;
}

/**
 * 3 pattern。 segment 先頭から lazy match (= `^...{1,40}?...`)。
 *
 * verb 活用は 3 形 (める / まる / めて) のみ。 「めよう / めましょう / めた」 等は
 * plan 文脈で稀少のため不採用 (= シンプル優先)。
 */
const DAY_ORIGIN_PATTERNS: ReadonlyArray<DayOriginPattern> = [
  // Pattern A: Xから(?:1日|一日)?(?:を)?始(める|まる|めて)
  //   - 自宅から始める / 自宅から一日を始める / 明日は自宅から始める
  {
    name: "kara_hajime",
    regex: /^([^、。\n]{1,40}?)から(?:1日|一日)?(?:を)?始(?:める|まる|めて)/,
  },
  // Pattern B: Xを(?:1日の|一日の)?(?:起点|始点|出発地)
  //   - 東京駅を起点にする / 東京駅を1日の起点 / ホテルを始点 / 東京駅を出発地
  {
    name: "wo_kiten",
    regex: /^([^、。\n]{1,40}?)を(?:1日の|一日の)?(?:起点|始点|出発地)/,
  },
  // Pattern C: X(?:から)?スタート
  //   - 家スタート / 自宅からスタート / 朝は家スタート / 東京駅スタート
  {
    name: "start",
    regex: /^([^、。\n]{1,40}?)(?:から)?スタート/,
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Anchor 跨ぎ trim (= OP-3C-1 の ALL_ANCHOR_KEYWORDS 相当を duplicate)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * X に含まれる travel anchor keyword の最後尾以降を採用する trim 関数。
 *
 * 例:
 *   「東京駅から渋谷を起点にする」 → Pattern B が m[1] = 「東京駅から渋谷」 を返す。
 *   trim 後: 「渋谷」 (= 「から」 の後だけ採用)。
 *
 * 規律:
 *   - OP-3C-1 の `ALL_ANCHOR_KEYWORDS` と同一 list を duplicate (= 不変原則遵守)。
 *   - 将来 OP-3C 系 helper 共通化時に refactor (= 別 PR)。
 */
const ANCHOR_KEYWORDS: ReadonlyArray<string> = [
  "から",
  "を出て",
  "を出発して",
  "を出発",
  "発で",
  "発の",
];

function trimAcrossAnchor(x: string): string {
  let trimmed = x;
  for (const kw of ANCHOR_KEYWORDS) {
    const idx = trimmed.lastIndexOf(kw);
    if (idx !== -1) {
      trimmed = trimmed.slice(idx + kw.length);
    }
  }
  return trimmed;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Temporal prefix + particle strip (= OP-3C-1 splitTemporalPrefixAndPlace の縮約版)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * temporal prefix (= 明日 / 今日 / 朝 / 夜 等)。
 * day-origin 文脈では time / verb / 食事 noun は出ないため OP-3C-1 より小さい。
 */
const TEMPORAL_RE_LIST: ReadonlyArray<RegExp> = [
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

/**
 * particle prefix (= は / も / を / が / の)。
 * 「明日はホテル」 → 「明日」 strip → 「はホテル」 → 「は」 strip → 「ホテル」。
 * 「朝は家」 → 「朝」 strip → 「は家」 → 「は」 strip → 「家」。
 *
 * CEO 2026-05-06 必須: `は` を strip する。
 * 拡張: `も` (例: 「明日も家から始める」) も同類で strip。
 */
const PARTICLE_RE_LIST: ReadonlyArray<RegExp> = [
  /^は/,
  /^も/,
  /^を/,
  /^が/,
  /^の/,
];

const WS_RE = /^[\s　]+/;

function stripPrefix(raw: string): string {
  let s = raw.normalize("NFKC").trim();
  let stripped = true;
  while (stripped && s.length > 0) {
    stripped = false;

    // 空白
    const ws = s.match(WS_RE);
    if (ws) {
      s = s.slice(ws[0].length);
      stripped = true;
      continue;
    }

    // temporal prefix (= 明日 / 朝 等)
    let tempMatched = false;
    for (const re of TEMPORAL_RE_LIST) {
      const m = s.match(re);
      if (m) {
        s = s.slice(m[0].length);
        stripped = true;
        tempMatched = true;
        break;
      }
    }
    if (tempMatched) continue;

    // particle prefix (= は / も / を / が / の)
    let particleMatched = false;
    for (const re of PARTICLE_RE_LIST) {
      const m = s.match(re);
      if (m) {
        s = s.slice(m[0].length);
        stripped = true;
        particleMatched = true;
        break;
      }
    }
    if (particleMatched) continue;
  }
  return s;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 非場所 noun blacklist (CEO 2026-05-06 修正 2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * `Xスタート` (Pattern C) で誤って活動・概念名詞を採用しないための blacklist。
 *
 * 問題: classifyLabel は default で `public_poi_proper_noun` に fallback するため、
 *       「作業」「会議」 等の活動 noun も length ≥ 2 で採用されてしまう。
 *
 * 解決: 明示的に活動・概念 noun を reject する小さな list (= CEO 必須 3 + 一般化)。
 *
 * 規律:
 *   - 完全網羅は不可能 (= 言語表現は無限)。 list は CEO 指定 + 同類のみ。
 *   - 拡張は将来必要 case が出た時に最小追加。
 *   - blacklist 経由でも test で固定 (= classification gate に依存しない保証)。
 */
const NON_PLACE_NOUNS: ReadonlySet<string> = new Set([
  // CEO 2026-05-06 必須 3
  "作業",
  "プロジェクト",
  "会議",
  // 同類 (= 活動・業務系)
  "仕事",
  "勉強",
  "練習",
  "業務",
  "活動",
  "イベント",
  "ミーティング",
  "撮影",
  "タスク",
  "授業",
  "レッスン",
]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// classifyLabel gate (= OP-3C-1 と同じ規律)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * day-origin factory で採用可能な分類:
 *   - public_poi_proper_noun (= 「東京駅」 等の固有名)
 *   - generic_category (= 「ホテル」 等の category)
 *   - private_semantic (= 「自宅」「家」「会社」 等の私的 anchor)
 *
 * reject:
 *   - ambiguous_or_demonstrative (= 「そこ」「ここ」 等の文脈依存)
 */
function isAcceptableDayOriginClassification(
  cls: LabelClassification,
): boolean {
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
 * utterance から explicit day-origin signal を抽出して `set_journey_origin`
 * candidate に wrap する。
 *
 * 動作:
 *   1. NFKC 正規化
 *   2. 句読点 (= 、。\n) で segment 分割
 *   3. 各 segment に 3 pattern (A/B/C) を順試行
 *   4. match → X 抽出 (m[1])
 *      a. trimAcrossAnchor (= 「から/発で/発の/を出て/を出発して/を出発」 跨ぎ trim)
 *      b. stripPrefix (= temporal + particle 除去)
 *      c. 空 → skip
 *      d. NON_PLACE_NOUNS blacklist → skip (= 「作業」「会議」 等を reject)
 *      e. classifyLabel gate (= ambiguous reject)
 *      f. classification-aware length:
 *         - public_poi_proper_noun: length ≥ 2
 *         - generic_category / private_semantic: length ≥ 1
 *      g. 採用 → 1 envelope return (= max 1 day-origin per utterance)
 *   5. 全 segment / pattern が invalid → 空配列
 *
 * 不変条件 (= test で固定):
 *   - 出力 type は **必ず "set_journey_origin"** (= add_travel_edge を絶対不出)
 *   - payload.kind は JourneyAnchorState.kind 既存 3 値のみ
 *   - payload.source は AnchorSource enum 既存 9 値のみ (= user_declared 採用)
 *   - payload に coords / lat / lng / segmentOrigin / segmentDestination 不在
 */
export function explicitDayOriginFactory(
  input: ExplicitDayOriginInput,
): OperationEnvelope<SetJourneyOriginOperationCandidate>[] {
  if (!input.utterance) return [];
  const text = input.utterance.normalize("NFKC");
  const segments = text.split(/[、。\n]/);

  for (const segment of segments) {
    if (!segment) continue;

    for (const { name, regex } of DAY_ORIGIN_PATTERNS) {
      const m = segment.match(regex);
      if (!m) continue;

      // a. anchor 跨ぎ trim
      const xRaw = trimAcrossAnchor(m[1]);

      // b. prefix strip (= temporal + particle)
      const x = stripPrefix(xRaw);

      // c. 空 reject
      if (x.length === 0) continue;

      // d. 非場所 noun blacklist (CEO 修正 2)
      if (NON_PLACE_NOUNS.has(x)) continue;

      // e. classifyLabel gate (= ambiguous reject)
      const cls = classifyLabel(x);
      if (!isAcceptableDayOriginClassification(cls)) continue;

      // f. classification-aware length
      if (cls === "public_poi_proper_noun" && x.length < 2) continue;
      // generic_category / private_semantic は length ≥ 1 (= 「家」「うち」 OK)

      // g. envelope 生成
      const matchedSpan = m[0];

      const provenance: Provenance = {
        source_type: "utterance",
        source_span: [matchedSpan],
        provenance_confidence: "high",
        from_utterance: true,
      };

      const baseTrace = {
        ruleId: `explicitDayOrigin.${name}`,
        matchedSpan,
      };
      const trace =
        input.sourceTurnIndex !== undefined
          ? { ...baseTrace, sourceTurnIndex: input.sourceTurnIndex }
          : baseTrace;

      return [
        wrapOperation(
          {
            type: "set_journey_origin",
            payload: {
              kind: "known_label_only",
              label: x,
              source: "user_declared",
            },
          },
          {
            source: "regex_deterministic",
            priority: 950,
            confidence: "high",
            provenance,
            trace,
          },
        ),
      ];
    }
  }

  return [];
}
