/**
 * explicitDayEndFactory — OP-3C-3 (CEO 2026-05-06)
 *
 * utterance から **明示的 day-end signal** だけを抽出し、 `set_journey_end`
 * operation candidate に wrap する pure factory。
 *
 * 採用 pattern (= signal keyword 必須):
 *   A: 「(最後|最終(?:的)?|夜)(?:に|は|には)? + Xに/へ + (帰る|戻る|着く)」
 *   C: 「Xで/に + 泊まる」 (= 直後がメタ語の場合は reject)
 *   B: 「(終点|最後|終わり|最終地点)は? + X」 (= segment 末尾までを X)
 *
 * pattern 試行順: **A → C → B** (= verb 系を先に、 noun 系を最後に試す)
 *
 * 採用しない pattern:
 *   - travel edge (= 「Xから Y へ」/「Xを出て Y へ」/「X発で Y へ」) → OP-3C-1 責務
 *   - day-origin (= 「Xから始める」/「Xスタート」/「Xを起点」) → OP-3C-2 責務
 *   - 集合 (= 「X集合」) → 集合場所 ≠ day-end、 将来 factory で扱う
 *   - activity / event (= 「ホテルで打ち合わせ」/「カフェで仕事」) → 別 factory
 *   - intermediate (= 「途中で東京駅に寄る」) → 「寄る」 は対象外
 *   - 帰る/戻る/着く 単独 (= prefix なし) (= intermediate との分離保証)
 *   - 泊まる メタ発話 (= 「泊まる予定」/「泊まる相談」/「泊まる場所」 等)
 *
 * 責務分離 (CEO 2026-05-06):
 *   **同一 matched span では責務を分ける**。 同一 utterance 全体では travel edge /
 *   day-origin / day-end が **最大 3 emit 共存可**。
 *
 *   例: 「自宅から始めて、 渋谷で会議、 夜はホテルで泊まる」
 *     - OP-3C-2 (day-origin): set_journey_origin = 自宅
 *     - OP-3C-1 (travel edge): (= 該当なし)
 *     - 本 factory (day-end): set_journey_end = ホテル
 *
 *   各 factory が独立 emit、 dispatcher は別 field で reduce。
 *   ただし本 factory は **`add_travel_edge` / `set_journey_origin` を絶対に出さない**
 *   (= invariant test 固定)。
 *
 * CEO 規律 — 重要不変条件:
 *   - **`set_journey_end` のみ**出力 (= add_travel_edge / set_journey_origin は絶対不出)
 *   - `payload.kind` は既存 `JourneyAnchorState.kind` 3 値のみ
 *   - `payload.source` = `"user_explicit_endpoint"` (= 既存 AnchorSource enum、
 *     `USER_EXPLICIT_SOURCES` 強権継承、 `user_declared` (origin 専用) と対称)
 *   - `payload.coords` / `lat` / `lng` 不在 (= grounding は別 layer)
 *   - runtime 接続なし
 *   - active L1_COMPREHENSION_SCHEMA 不変
 *   - PR #75 系 module 参照なし
 *   - anchorState.ts 不変 (= 既存 enum のみ使用)
 *
 * priority 950:
 *   OP-3C-2 と完全 symmetric (= origin / end 双子設計、 同 epistemic 強度)。
 *   UI 確定 (1000) より弱く、 historyPriorPlan (900) より強い。
 *
 * 設計書: docs/alter-morning-operation-pipeline-unification-design.md § 3 / § 4
 */

import {
  classifyLabel,
  type LabelClassification,
} from "../../search/labelClassification";
import type { Provenance } from "../eventSchema";
import type { SetJourneyEndOperationCandidate } from "../planOperationCandidate";
import { wrapOperation, type OperationEnvelope } from "../operationEnvelope";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public input
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ExplicitDayEndInput {
  utterance: string;
  sourceTurnIndex?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Day-end pattern set (= 3 群)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DayEndPattern {
  /** trace.ruleId に suffix として埋め込む識別子 */
  name: string;
  /** segment に対し `^...` で match する pattern。 m[1] = X (= rawDest) */
  regex: RegExp;
}

/**
 * 3 pattern。 segment 先頭から lazy match (= `^...{1,40}?...`)。
 *
 * 試行順: A → C → B (= verb 系優先、 noun 系 fallback)
 *
 * Pattern A (= 帰る系): **prefix 必須** (= 最後/最終/夜)。
 *   「自宅に帰る」 単独は受けない (= intermediate との分離)。
 *
 * Pattern C (= 泊まる系): prefix 不要 (= 泊まる 自体が強 signal)。
 *   ただし negative lookahead で メタ発話 (= 予定/相談/場所/候補/予約) を reject。
 *
 * Pattern B (= noun-statement 系): A/C 不一致時の fallback。
 *   X は segment 末尾 ($) まで lazy capture。
 */
const DAY_END_PATTERNS: ReadonlyArray<DayEndPattern> = [
  // Pattern A: (最後|最終(?:的)?|夜)(?:に|は|には)? + Xに/へ + (帰る|戻る|着く)
  //   - 最後は自宅に帰る / 最終的にはホテルに戻る / 夜は自宅に帰る
  {
    name: "saigo_kaeru",
    regex:
      /^(?:最後|最終(?:的)?|夜)(?:に|は|には)?([^、。\n]{1,40}?)(?:に|へ)(?:帰る|戻る|着く)/,
  },
  // Pattern C: Xで/に + 泊まる + (?!予定|相談|場所|候補|予約)
  //   - ホテルで泊まる / ホテルに泊まる
  //   reject:
  //   - ホテルに泊まる予定を確認する (= 予定 メタ発話)
  //   - ホテルで泊まる相談をする (= 相談 メタ発話)
  //   - 家で泊まる場所を探す (= 場所 メタ発話)
  {
    name: "tomaru",
    regex:
      /^([^、。\n]{1,40}?)(?:で|に)泊まる(?!予定|相談|場所|候補|予約)/,
  },
  // Pattern B: (終点|最後|終わり|最終地点)(?:は|に)? + X (= segment 末尾)
  //   - 終点は家 / 最後は東京駅 / 終わりは自宅 / 最終地点はホテル
  {
    name: "shuten_wa",
    regex: /^(?:終点|最後|終わり|最終地点)(?:は|に)?([^、。\n]+?)$/,
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Anchor 跨ぎ trim (= OP-3C-1 の ALL_ANCHOR_KEYWORDS 相当を duplicate)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * X に含まれる travel anchor keyword の最後尾以降を採用する trim 関数。
 *
 * 例:
 *   「最後は東京駅から自宅に帰る」 → Pattern A m[1] = 「東京駅から自宅」 → trim → 「自宅」
 *
 * OP-3C-1 / OP-3C-2 の同等 helper を duplicate。 将来 OP-3C 系 helper 共通化時
 * (= 別 PR) で refactor。
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
// Prefix strip (= temporal + END_ANCHOR + particle)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * temporal prefix (= 明日 / 今日 / 朝 / 夜 等)。
 * day-end 文脈では time / verb / 食事 noun は出ないため小さい。
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
 * **CEO 修正点 3 (2026-05-06)**: end-anchor noun-prefix を strip 対象に追加。
 *
 * Pattern C 等で X が 「最後はホテル」「終点はホテル」 のように prefix 込みで
 * lazy capture される場合、 stripPrefix で end-anchor を剥がす必要がある。
 *
 * 例:
 *   「最後はホテルで泊まる」 → Pattern C X = 「最後はホテル」
 *   stripPrefix:
 *     END_ANCHOR_PREFIX /^最後/ → strip → 「はホテル」
 *     PARTICLE /^は/ → strip → 「ホテル」 ✓
 */
const END_ANCHOR_PREFIX_RE_LIST: ReadonlyArray<RegExp> = [
  /^最後/,
  /^最終地点/, // 「最終」 より長いため先 (= 「最終地点」 を「最終」 で strip しないため)
  /^最終的/,
  /^最終/,
  /^終点/,
  /^終わり/,
];

/**
 * particle prefix (= は / も / を / が / の / に)。
 * OP-3C-2 + 「に」 拡張 (= 「最終的には」 → 「最終的」 strip 後の 「には」 を更に剥がす)。
 */
const PARTICLE_RE_LIST: ReadonlyArray<RegExp> = [
  /^は/,
  /^も/,
  /^を/,
  /^が/,
  /^の/,
  /^に/, // 「最終的にはホテル」 → 「最終的」 strip 後 「にはホテル」 → 「に」 strip → 「はホテル」 → 「は」 strip
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

    // END_ANCHOR_PREFIX (= 最後 / 最終 / 終点 等) (CEO 修正点 3)
    let endAnchorMatched = false;
    for (const re of END_ANCHOR_PREFIX_RE_LIST) {
      const m = s.match(re);
      if (m) {
        s = s.slice(m[0].length);
        stripped = true;
        endAnchorMatched = true;
        break;
      }
    }
    if (endAnchorMatched) continue;

    // particle (= は / も / を / が / の)
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
// 非場所 noun blacklist (= OP-3C-2 と共通の活動・概念 noun)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Pattern C (= 泊まる) で誤って活動・概念名詞を採用しないための blacklist。
 *
 * 例:
 *   「会議で泊まる」 (semantic 怪しいが) → 会議 ∈ NON_PLACE_NOUNS → reject
 *
 * OP-3C-2 と同 list を duplicate。
 */
const NON_PLACE_NOUNS: ReadonlySet<string> = new Set([
  "作業",
  "プロジェクト",
  "会議",
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
// classifyLabel gate (= OP-3C-1 / OP-3C-2 と同じ規律)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function isAcceptableDayEndClassification(cls: LabelClassification): boolean {
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
 * utterance から explicit day-end signal を抽出して `set_journey_end` candidate に
 * wrap する。
 *
 * 動作:
 *   1. NFKC 正規化
 *   2. 句読点 (= 、。\n) で segment 分割
 *   3. 各 segment に 3 pattern (A → C → B) を順試行
 *   4. match → X 抽出 (m[1])
 *      a. trimAcrossAnchor (= 「から/発で/発の/を出て/を出発して/を出発」 跨ぎ trim)
 *      b. stripPrefix (= temporal + END_ANCHOR + particle 除去)
 *      c. 空 → skip
 *      d. NON_PLACE_NOUNS blacklist → skip
 *      e. classifyLabel gate (= ambiguous reject)
 *      f. classification-aware length:
 *         - public_poi_proper_noun: length ≥ 2
 *         - generic_category / private_semantic: length ≥ 1
 *      g. 採用 → 1 envelope return (= max 1 day-end per utterance)
 *   5. 全 segment / pattern が invalid → 空配列
 *
 * 不変条件 (= test で固定):
 *   - 出力 type は **必ず "set_journey_end"**
 *   - `add_travel_edge` / `set_journey_origin` を絶対に出さない
 *   - payload.kind は JourneyAnchorState.kind 既存 3 値のみ
 *   - payload.source は AnchorSource enum 既存 9 値のみ (= user_explicit_endpoint 採用)
 *   - payload に coords / lat / lng / segmentOrigin / segmentDestination 不在
 */
export function explicitDayEndFactory(
  input: ExplicitDayEndInput,
): OperationEnvelope<SetJourneyEndOperationCandidate>[] {
  if (!input.utterance) return [];
  const text = input.utterance.normalize("NFKC");
  const segments = text.split(/[、。\n]/);

  for (const segment of segments) {
    if (!segment) continue;

    for (const { name, regex } of DAY_END_PATTERNS) {
      const m = segment.match(regex);
      if (!m) continue;

      // Pattern B 特殊規律: X 末尾が verb phrase (= に/へ + 帰る/戻る/着く) の場合は
      // skip (= Pattern A が ambiguous reject した残骸を Pattern B が拾わない保証)。
      // 例: 「最後はそこに帰る」 → Pattern A reject (ambiguous 「そこ」)、 Pattern B が
      //     X=「そこに帰る」 を拾う回避。
      if (name === "shuten_wa" && /(?:に|へ)(?:帰る|戻る|着く)$/.test(m[1])) {
        continue;
      }

      // a. anchor 跨ぎ trim
      const xRaw = trimAcrossAnchor(m[1]);

      // b. prefix strip (= temporal + END_ANCHOR + particle)
      const x = stripPrefix(xRaw);

      // c. 空 reject
      if (x.length === 0) continue;

      // d. 非場所 noun blacklist
      if (NON_PLACE_NOUNS.has(x)) continue;

      // e. classifyLabel gate (= ambiguous reject)
      const cls = classifyLabel(x);
      if (!isAcceptableDayEndClassification(cls)) continue;

      // f. classification-aware length
      if (cls === "public_poi_proper_noun" && x.length < 2) continue;

      // g. envelope 生成
      const matchedSpan = m[0];

      const provenance: Provenance = {
        source_type: "utterance",
        source_span: [matchedSpan],
        provenance_confidence: "high",
        from_utterance: true,
      };

      const baseTrace = {
        ruleId: `explicitDayEnd.${name}`,
        matchedSpan,
      };
      const trace =
        input.sourceTurnIndex !== undefined
          ? { ...baseTrace, sourceTurnIndex: input.sourceTurnIndex }
          : baseTrace;

      return [
        wrapOperation(
          {
            type: "set_journey_end",
            payload: {
              kind: "known_label_only",
              label: x,
              source: "user_explicit_endpoint",
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
