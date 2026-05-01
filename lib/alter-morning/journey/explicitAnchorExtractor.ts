/**
 * explicitAnchorExtractor — Layer 1 user explicit text detector (PR B-2b)
 *
 * CEO/GPT 2026-05-02 PR B-2b 規律:
 *   発話から origin / end の deterministic 抽出を行い、JourneyAnchorState に
 *   bind する。LLM hint 経路は維持し、deterministic 経路を追加するだけ。
 *
 * Goal:
 *   「自宅から」「ホテルから」 → journeyOrigin (source="user_declared")
 *   「自宅に帰る」「ホテルに泊まる」 → journeyEnd (source="user_explicit_endpoint")
 *
 * Scope (PR B-2b 限定):
 *   - 6 ラベル制限 (自宅 / 実家 / ホテル / 会社 / オフィス / 家)
 *   - origin: 既存 extractExplicitStartPoints を活用 (「{ラベル}から」 / 「{ラベル}を出る」)
 *   - end: 新規実装 (「{ラベル}(に|へ)(泊まる|行く|帰る|戻る|向かう)」 + 「帰宅する」 +
 *     「{ラベル}まで{移動動詞}」)
 *
 * Scope 外 (PR B-3 以降):
 *   - 固有名 (「○○ホテル」 「友達の名前」)
 *   - System A grounding (coordinate lookup)
 *   - LLM 経路の補強
 *
 * Negative tests 必須 (GPT 規律):
 *   - 「ホテルでランチ」 (event where、`で` で始まる)
 *   - 「会社で打ち合わせ」 (同上)
 *   - 「自宅で作業」 (同上)
 *   - 「家で休む」 (同上)
 *   - 「会社に届ける」 (non-movement verb)
 *   - 「自宅にメール送る」 (non-movement verb)
 *   - 「ホテルまであと10分」 (距離質問、{label}まで 単独)
 *   - 「会社までどれくらい？」 (時間質問)
 *   - 「家までの道」 (経路質問)
 */

import type { JourneyAnchorState } from "./anchorState";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6 ラベル制限 (CEO/GPT 規律: 固有名は PR B-3 で扱う)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 既存 START_POINT_LABELS (rulePreParse.ts:163) と同じラベル + 正規化規則を維持。
// origin / end で同じラベル集合を共有することで対称性を保つ。
//
// 順序注意: 長い pattern を先に配置し、短い substring を抑制する。
//   - "実家" を "家" より先に処理 (= "実家" で先に match して "家" の自宅誤検出を防ぐ)
//   - "オフィス" を "会社" より先に配置

interface AnchorLabelEntry {
  /** utterance 内の検出文字列 */
  pattern: string;
  /** 正規化後ラベル (UI 表示用) */
  normalized: string;
}

const ANCHOR_LABELS: ReadonlyArray<AnchorLabelEntry> = [
  { pattern: "オフィス", normalized: "会社" },
  { pattern: "ホテル", normalized: "ホテル" },
  { pattern: "自宅", normalized: "自宅" },
  { pattern: "実家", normalized: "実家" },
  { pattern: "会社", normalized: "会社" },
  { pattern: "家", normalized: "自宅" },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extractStartPointAnchor (origin Layer 1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 既存 extractExplicitStartPoints (rulePreParse.ts:177) のパターン:
//   - "{ラベル}から" (FROM_SUFFIX_RE)
//   - "{ラベル}を(出|出発|でる|出よう|でよう|でます|出ます)" (DEPART_VERB_RE)
//
// 戻り値:
//   - JourneyAnchorState (kind="known_label_only", source="user_declared")
//     coords は持たない (PR B-3 で grounding と一緒に追加検討)
//   - null: 検出なし
//
// 不変条件:
//   - 6 ラベルのみ (固有名は LLM 経路に委ねる)
//   - 助詞・動詞パターン必須 (「ホテルでランチ」 等の event where は拾わない)
//   - 複数 anchor がある場合は最初のもの優先 (左から右に scan)

const ORIGIN_FROM_SUFFIX_RE = /^から/;
const ORIGIN_DEPART_VERB_RE = /^を(出|出発|でる|でます|出ます|出よう|でよう)/;

export function extractStartPointAnchor(
  utterance: string,
): JourneyAnchorState | null {
  if (!utterance) return null;
  const normalized = utterance.normalize("NFKC");

  let bestMatch: {
    label: string;
    index: number;
    matchLen: number;
  } | null = null;

  for (const { pattern, normalized: label } of ANCHOR_LABELS) {
    let searchStart = 0;
    while (true) {
      const idx = normalized.indexOf(pattern, searchStart);
      if (idx === -1) break;
      const after = normalized.slice(idx + pattern.length);

      const fromMatch = ORIGIN_FROM_SUFFIX_RE.exec(after);
      const departMatch = ORIGIN_DEPART_VERB_RE.exec(after);

      let matchLen = 0;
      let matched = false;

      if (fromMatch) {
        matchLen = pattern.length + fromMatch[0].length;
        matched = true;
      } else if (departMatch) {
        matchLen = pattern.length + departMatch[0].length;
        matched = true;
      }

      if (matched) {
        // 最も左の match を採用 (複数 anchor 対応)
        if (bestMatch === null || idx < bestMatch.index) {
          bestMatch = { label, index: idx, matchLen };
        }
        // この pattern は match した、次の searchStart は match の後ろ
        searchStart = idx + matchLen;
      } else {
        searchStart = idx + 1;
      }
    }
  }

  if (bestMatch === null) return null;
  return {
    kind: "known_label_only",
    label: bestMatch.label,
    source: "user_declared",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extractEndpointAnchor (end Layer 1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 検出パターン (CEO/GPT 規律: movement verb のみ、「{label}まで」 単独は除外):
//   - "{ラベル}(に|へ)(泊まる|行く|帰る|戻る|向かう)"
//   - "{ラベル}まで(行く|戻る|帰る|向かう)" (移動動詞付きのみ)
//   - "帰宅する" → 自宅 (label 不要、固定ラベル)
//
// 戻り値:
//   - JourneyAnchorState (kind="known_label_only", source="user_explicit_endpoint")
//   - null: 検出なし
//
// 不変条件:
//   - 6 ラベルのみ
//   - movement verb 必須 (「{label}に届ける」「{label}にメール」 等は拾わない)
//   - 「{label}まで」 単独 (動詞なし) は拾わない (距離 / 時間 / 経路質問の誤爆防止)

const END_TO_VERB_RE = /^(に|へ)(泊まる|行く|帰る|戻る|向かう)/;
const END_UNTIL_VERB_RE = /^まで(行く|戻る|帰る|向かう)/;
const RETURN_HOME_RE = /帰宅する/;

export function extractEndpointAnchor(
  utterance: string,
): JourneyAnchorState | null {
  if (!utterance) return null;
  const normalized = utterance.normalize("NFKC");

  let bestMatch: {
    label: string;
    index: number;
    matchLen: number;
  } | null = null;

  // パターン 1: 「帰宅する」 → 自宅 (固定ラベル)
  const returnMatch = RETURN_HOME_RE.exec(normalized);
  if (returnMatch && returnMatch.index !== undefined) {
    bestMatch = {
      label: "自宅",
      index: returnMatch.index,
      matchLen: returnMatch[0].length,
    };
  }

  // パターン 2: 「{ラベル}(に|へ){移動動詞}」 / 「{ラベル}まで{移動動詞}」
  for (const { pattern, normalized: label } of ANCHOR_LABELS) {
    let searchStart = 0;
    while (true) {
      const idx = normalized.indexOf(pattern, searchStart);
      if (idx === -1) break;
      const after = normalized.slice(idx + pattern.length);

      const toVerbMatch = END_TO_VERB_RE.exec(after);
      const untilVerbMatch = END_UNTIL_VERB_RE.exec(after);

      let matchLen = 0;
      let matched = false;

      if (toVerbMatch) {
        matchLen = pattern.length + toVerbMatch[0].length;
        matched = true;
      } else if (untilVerbMatch) {
        matchLen = pattern.length + untilVerbMatch[0].length;
        matched = true;
      }

      if (matched) {
        if (bestMatch === null || idx < bestMatch.index) {
          bestMatch = { label, index: idx, matchLen };
        }
        searchStart = idx + matchLen;
      } else {
        searchStart = idx + 1;
      }
    }
  }

  if (bestMatch === null) return null;
  return {
    kind: "known_label_only",
    label: bestMatch.label,
    source: "user_explicit_endpoint",
  };
}
