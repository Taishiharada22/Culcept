/**
 * Candidate Intent Classifier — W3 P1 (where 汚染を止める入口ガード)
 *
 * 位置づけ:
 *   conversationStatus=search_candidates_presented または activePresentation が
 *   存在する状態で、user 発話を where slot に直接 bind する前の入口分類。
 *
 *   実機 trace (CEO 2026-05-01) で以下が確定:
 *     - 「電車」 → where.place_ref="電車" (transport intent が where に汚染)
 *     - 「9時を10時に変更」 → where.place_ref="9時を10時に変更" (modify が where に汚染)
 *     - 「ない」 → where.place_ref="ない" (reject が where に汚染)
 *
 *   answerBinder は pendingClarify が指す slot に rule-based で直接書き込むため、
 *   intent 区別がない。本分類器が gate として候補状態中の発話を 7 種に分類し、
 *   where_refinement 以外は answerBinder を skip させる。
 *
 * CEO 修正条件 (2026-05-01) 完全準拠:
 *   1. P1 の目的は「where 汚染を止める」ことに限定。candidate UI 表示や候補選択完成は P2 以降。
 *   2. 既存 taxonomy / modifyRouter / 既知パターンを再利用する **薄い wrapper**。
 *      分類器を重複実装しすぎない。
 *   3. as any 禁止、明示的制御変数で実装。
 *
 * 副作用ゼロ:
 *   - LLM / DB / I/O / Date.now を呼ばない (pure 関数)
 *   - 入力を mutate しない
 *   - 戻り値は新規生成
 */

import { classifyUtterance } from "../dialog/taxonomy";
import type { CaptureSubKind } from "../dialog/types";
import type { NormalizedPlaceCandidate } from "../search/normalizedPlace";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 候補状態中の user 発話の意図分類。
 *
 *   - candidate_select:   候補から 1 つ選ぶ意図 (順序 / 候補名 displayName 部分一致)
 *   - candidate_reject:   候補を拒否 ("ない", "候補じゃない", "違う" 等)
 *   - where_refinement:   場所名を狭める意図 (anchor / chain / category / proper_noun)
 *                         → answerBinder に流す唯一の case
 *   - transport:          移動手段の指定 ("電車", "車", "徒歩" 等)
 *   - modify:             既存予定の変更 ("9時を10時に変更" 等の時刻 / 構造変更)
 *   - append:             新規予定追加 ("この後", "12 時から…" 等)
 *   - noop_other:         分類不能 (Branch B fallback or semantic_miss 扱い)
 */
export type CandidateIntent =
  | "candidate_select"
  | "candidate_reject"
  | "where_refinement"
  | "transport"
  | "modify"
  | "append"
  | "noop_other";

export interface CandidateIntentResult {
  intent: CandidateIntent;
  confidence: "high" | "medium" | "low";
  /** 判定理由 (trace / 構造化ログ用) */
  reason: string;
  /** マッチした utterance 内の片 (trace 用) */
  matchedSpan: string | null;
}

export interface CandidateIntentContext {
  /** 現 turn 提示中の候補集合 (空配列も可) */
  candidates: ReadonlyArray<NormalizedPlaceCandidate>;
  /** activePresentation が存在するか (= 候補提示直後 turn の判定補助) */
  activePresentationExists: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Transport 語彙 (薄い rule-based、過去 commit に専用 parser がないため最小実装)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 単独 transport keyword (utterance がこれと一致 / 末尾「で」「です」付き) */
const TRANSPORT_KEYWORDS_BASE: ReadonlyArray<string> = [
  "電車",
  "車",
  "徒歩",
  "歩き",
  "タクシー",
  "バス",
  "自転車",
  "バイク",
  "地下鉄",
  "新幹線",
];

/**
 * Transport 単純判定 (薄い、false positive を避けるため厳密一致のみ).
 *   「電車」「電車で」「電車で行く」「電車です」までを transport 扱い。
 *   「電車に乗って…」のような長文は noop_other に落とす (LLM Branch B に判断委譲).
 */
function classifyTransport(utterance: string): CandidateIntentResult | null {
  for (const kw of TRANSPORT_KEYWORDS_BASE) {
    if (utterance === kw) {
      return {
        intent: "transport",
        confidence: "high",
        reason: `transport_keyword_exact:${kw}`,
        matchedSpan: kw,
      };
    }
    if (
      utterance === `${kw}で` ||
      utterance === `${kw}です` ||
      utterance === `${kw}で行く` ||
      utterance === `${kw}にする` ||
      utterance === `${kw}に変更`
    ) {
      return {
        intent: "transport",
        confidence: "high",
        reason: `transport_keyword_suffix:${kw}`,
        matchedSpan: kw,
      };
    }
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Modify pattern (時刻 / 構造変更 — modifyRouter の TIME_BUCKET_KEYWORDS を補完)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 時刻変更 / キャンセル / 削除を検出。
 *   「9時を10時に変更」「9時から10時にして」「キャンセル」「やめる」
 *   false positive を避けるため、「○時を○時に」「変更」等の構造一致のみ。
 */
const MODIFY_PATTERNS: ReadonlyArray<RegExp> = [
  /^\d{1,2}時(?:\d{1,2}分)?を\d{1,2}時(?:\d{1,2}分)?に(?:変更|して|に)?$/, // 9時を10時に変更
  /^\d{1,2}時(?:\d{1,2}分)?から\d{1,2}時(?:\d{1,2}分)?に(?:変更|して|に)?$/, // 9時から10時に
  /(変更|キャンセル|やめる?|取り消し?|削除)$/, // 末尾が変更系動詞 (やめ/やめる、取り消し/取り消)
];

function classifyModify(utterance: string): CandidateIntentResult | null {
  for (const pat of MODIFY_PATTERNS) {
    if (pat.test(utterance)) {
      return {
        intent: "modify",
        confidence: "high",
        reason: `modify_pattern:${pat.source}`,
        matchedSpan: utterance,
      };
    }
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Append pattern (新規予定追加)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 新規予定の append を検出。
 *   「この後、12 時から…」「次に…」「それから…」
 *   時刻 + 場所/活動構文も append とする (12 時に新宿でランチ).
 *   false positive を避けるため、文頭 marker か 時刻 + 場所/活動の組み合わせを要求。
 */
const APPEND_PATTERNS: ReadonlyArray<RegExp> = [
  /^(この後|次に|それから|あと|後で|あとで)/,
  /^\d{1,2}時(?:\d{1,2}分)?(?:から|に).+(?:で|の|と).+/, // 12 時から…で…
];

function classifyAppend(utterance: string): CandidateIntentResult | null {
  for (const pat of APPEND_PATTERNS) {
    if (pat.test(utterance)) {
      return {
        intent: "append",
        confidence: "high",
        reason: `append_pattern:${pat.source}`,
        matchedSpan: utterance,
      };
    }
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Candidate reject pattern
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 候補の拒否を検出。
 *   「ない」「なし」「候補じゃない」「これじゃない」「違う」
 *   「行きたくない」のような長文 reject は LLM Branch B 委譲 (noop_other).
 */
const REJECT_PATTERNS: ReadonlyArray<RegExp> = [
  /^ない$/,
  /^なし$/,
  /^違う$/,
  /^候補(?:じゃない|ない|の話じゃない|じゃなくて)/,
  /^(?:これ|それ|どれ)?(?:じゃない|でもない)$/,
  /^別$/,
];

function classifyReject(utterance: string): CandidateIntentResult | null {
  for (const pat of REJECT_PATTERNS) {
    if (pat.test(utterance)) {
      return {
        intent: "candidate_reject",
        confidence: "high",
        reason: `reject_pattern:${pat.source}`,
        matchedSpan: utterance,
      };
    }
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Candidate select (順序 + 候補 displayName 部分一致)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 順序表現 (modifyRouter ORDINAL_KEYWORDS と整合) */
const ORDINAL_SELECT_PATTERNS: ReadonlyArray<RegExp> = [
  /^(?:\d+|最初|最後|ラスト|1つ目|一つ目|2つ目|二つ目|3つ目|三つ目)$/,
  /^\d+番目$/,
  /^(?:1|2|3|4|5)$/,
];

function classifySelect(
  utterance: string,
  context: CandidateIntentContext,
): CandidateIntentResult | null {
  // 順序表現
  for (const pat of ORDINAL_SELECT_PATTERNS) {
    if (pat.test(utterance)) {
      return {
        intent: "candidate_select",
        confidence: "high",
        reason: `ordinal_select:${pat.source}`,
        matchedSpan: utterance,
      };
    }
  }
  // 候補 displayName 部分一致 (3 文字以上、false positive 抑止)
  if (utterance.length >= 3) {
    for (const cand of context.candidates) {
      if (cand.displayName.includes(utterance)) {
        return {
          intent: "candidate_select",
          confidence: "medium",
          reason: `displayName_match:${cand.placeId}`,
          matchedSpan: utterance,
        };
      }
    }
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// where_refinement (既存 taxonomy.classifyUtterance を再利用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** taxonomy subKind のうち where slot 答えとして適切なもの */
const WHERE_SUB_KINDS: ReadonlySet<CaptureSubKind> = new Set<CaptureSubKind>([
  "proper_noun_specific",
  "chain_with_anchor",
  "chain_alone",
  "category_with_anchor",
  "category_alone",
  "anchor_alone",
  "baseline",
]);

function classifyWhereRefinement(
  utterance: string,
): CandidateIntentResult | null {
  const taxonomy = classifyUtterance(utterance);
  if (WHERE_SUB_KINDS.has(taxonomy.subKind)) {
    return {
      intent: "where_refinement",
      confidence:
        taxonomy.subKind === "proper_noun_specific" ? "high" : "medium",
      reason: `taxonomy:${taxonomy.subKind}`,
      matchedSpan: taxonomy.rawSpan,
    };
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// エントリポイント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 候補状態中の user 発話を 7 intent に分類する pure 関数。
 *
 * 判定優先順位 (false positive を避けるため、より特異な intent を先に判定):
 *   1. transport          (単独 keyword 完全一致 / 末尾「で」)
 *   2. modify             (時刻変更 / キャンセル系の構造一致)
 *   3. append             (文頭 marker / 時刻 + 場所構文)
 *   4. candidate_reject   (「ない」「違う」等の拒否語)
 *   5. candidate_select   (順序表現 / 候補 displayName 部分一致)
 *   6. where_refinement   (taxonomy で地名 / anchor / chain / category)
 *   7. noop_other         (上記いずれにも該当しない、Branch B fallback)
 *
 * @param utterance 生の user 発話
 * @param context   現 turn の候補状態
 * @returns intent 分類結果
 */
export function classifyCandidateUtterance(
  utterance: string,
  context: CandidateIntentContext,
): CandidateIntentResult {
  const trimmed = utterance.trim();
  if (trimmed.length === 0) {
    return {
      intent: "noop_other",
      confidence: "low",
      reason: "empty_utterance",
      matchedSpan: null,
    };
  }

  // 順序通り判定
  return (
    classifyTransport(trimmed) ??
    classifyModify(trimmed) ??
    classifyAppend(trimmed) ??
    classifyReject(trimmed) ??
    classifySelect(trimmed, context) ??
    classifyWhereRefinement(trimmed) ?? {
      intent: "noop_other",
      confidence: "low",
      reason: "no_pattern_matched",
      matchedSpan: null,
    }
  );
}
