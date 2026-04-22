/**
 * Taxonomy — 発話分類辞書 + classify 関数（stub）
 *
 * 位置づけ:
 *   implementation-detail §2 の辞書を **const export のみ** で landing。
 *   実装（classifyUtterance）は commit 15 で本実装予定。commit 13 の時点では
 *   型シグネチャを固め、辞書は文字列配列として凍結する。
 *
 * 設計書:
 *   - docs/alter-morning-strict-confirmation-design.md §3.9 (decision table)
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §2 (辞書)
 *
 * 辞書の更新規則（§12 残懸案 #1, #2）:
 *   - chainBrandDict: 20 語固定。拡張は別 PR（ローカライゼーション対応）。
 *   - categoryDict: 一般カテゴリ語。拡張基準は「活動類型」のみ、具体店舗・chain を入れない。
 *   - anchorDict: 地名ルート語。suffix で「駅前 / 周辺 / 近く」を補う。
 *   - undecidedDict: 「決めてない」系、narrowStep を進めない文字列。
 *
 * classify 関数シグネチャ（実装は commit 15）:
 *   classifyUtterance(rawSpan: string) => NormalizedCapture
 */

import type {
  CaptureSubKind,
  NormalizedCapture,
} from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 辞書 — Phase 0 固定版（更新は要 CEO 承認）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * chainBrand — 大手チェーンブランド。
 * 表記揺れは複数 token で登録する（「スタバ」「スターバックス」両方）。
 *
 * [凍結 2026-04-22] 20 語。拡張は別 PR。
 */
export const CHAIN_BRAND_DICT: readonly string[] = [
  // カフェ系
  "スタバ",
  "スターバックス",
  "ドトール",
  "タリーズ",
  "Tully's",
  "コメダ",
  "サンマルク",
  "エクセルシオール",
  // ファストフード
  "マック",
  "マクド",
  "マクドナルド",
  "ケンタ",
  "ケンタッキー",
  "モス",
  "モスバーガー",
  "吉野家",
  "すき家",
  "松屋",
  // コンビニ
  "セブン",
  "セブンイレブン",
] as const;

/**
 * category — 一般カテゴリ語。活動ジャンル or 施設ジャンル。
 * chain を入れない（chain は CHAIN_BRAND_DICT へ）。
 */
export const CATEGORY_DICT: readonly string[] = [
  // 飲食
  "カフェ",
  "喫茶店",
  "レストラン",
  "居酒屋",
  "バー",
  "ラーメン",
  "寿司",
  "ランチ",
  "ディナー",
  // 買い物
  "スーパー",
  "コンビニ",
  "ドラッグストア",
  "本屋",
  "書店",
  // 生活
  "病院",
  "歯医者",
  "美容院",
  "銀行",
  "郵便局",
  // レジャー
  "映画館",
  "公園",
  "ジム",
  "カラオケ",
] as const;

/**
 * anchor — 地名ルート語。市区町村名 / 駅名 / ランドマーク。
 * Phase 0 は CEO 居住圏（甲府周辺）を中心にシードする。
 * suffix（駅前 / 周辺 / 近く）は ANCHOR_SUFFIXES で補完。
 */
export const ANCHOR_ROOT_DICT: readonly string[] = [
  // 甲府圏（CEO testing context）
  "甲府",
  "甲府駅",
  "昭和",
  "竜王",
  "石和",
  "富士",
  "山中湖",
  // 東京圏（広域）
  "東京",
  "新宿",
  "渋谷",
  "池袋",
  "品川",
  "銀座",
  "丸の内",
  // 関西圏
  "大阪",
  "梅田",
  "難波",
  "京都",
  "神戸",
] as const;

/**
 * anchor の suffix 表現。anchor root と組み合わせて使う。
 * 例: 「甲府駅前」 = "甲府" + "駅前"
 */
export const ANCHOR_SUFFIXES: readonly string[] = [
  "駅前",
  "周辺",
  "近く",
  "付近",
  "の方",
  "エリア",
] as const;

/**
 * undecided — 「決めてない」系。narrowStep を進めず、undecided subKind に分類。
 *
 * 拡張規則:
 *   - 「意思決定の放棄」または「明示的な未定宣言」のみ
 *   - 一般的な否定語（「嫌」「違う」）は regressed 判定側の責務。ここには入れない
 */
export const UNDECIDED_DICT: readonly string[] = [
  "決めてない",
  "きめてない",
  "決まってない",
  "きまってない",
  "未定",
  "まだ",
  "まだ決めてない",
  "どこでもいい",
  "どこでも",
  "なんでもいい",
  "何でもいい",
  "任せる",
  "お任せ",
  "任せます",
  "おすすめで",
  "おすすめ",
  "特にない",
  "特になし",
  "わかんない",
  "わからない",
  "分からない",
] as const;

/**
 * baseline — 自宅 / オフィス等、baseline 参照で即同定できる固有名。
 * PR-9 の places search を経由せず Layer 1 resolver で解決される。
 *
 * 除外方針（2026-04-22 commit 15 調整）:
 *   - 1-char の「家」は「吉野家」「松屋の本家」等の false positive が多発するため除外
 *   - 「家」単体の意図表現は「自宅」「うち」「我が家」でカバー
 */
export const BASELINE_REF_DICT: readonly string[] = [
  "自宅",
  "うち",
  "我が家",
  "実家",
  "オフィス",
  "会社",
  "職場",
  "学校",
] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 内部 util — script 判定 + word boundary（substring 誤判定防止）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Katakana 範囲（U+30A0-U+30FF、長音符 U+30FC 含む）。
 * 判定は 1 文字単位。サロゲートペア katakana は現辞書に存在しないため未対応で可。
 */
function isKatakana(c: string): boolean {
  return /[\u30A0-\u30FF]/.test(c);
}

/** Hiragana 範囲（U+3040-U+309F） */
function isHiragana(c: string): boolean {
  return /[\u3040-\u309F]/.test(c);
}

/** 記号・句読点・空白（strict boundary 用） */
function isDelimiter(c: string): boolean {
  return /[\s、。・，．！？!?]/.test(c);
}

/**
 * Word-boundary 判定（chain / category / anchor 用・緩め）。
 *
 * rationale:
 *   katakana 語 + katakana 字 = 複合語化の可能性が高い（「マック」+「ス」→「マックス」）。
 *   この 1 パターンだけ block すれば、CEO specified substring 誤判定系は防げる。
 *   kanji+kanji は分離語境界もあるため block しない（「甲府方面」の「甲府」は通す）。
 */
function hasLooseBoundary(text: string, endIdx: number, matched: string): boolean {
  if (endIdx >= text.length) return true;
  const nextChar = text[endIdx]!;
  const lastChar = matched[matched.length - 1]!;
  if (isKatakana(lastChar) && isKatakana(nextChar)) return false;
  return true;
}

/**
 * Word-boundary 判定（baseline 用・厳しめ）。
 *
 * rationale:
 *   baseline 語（「実家」「学校」「会社」）は短く、kanji 同士の複合語 false positive が
 *   多発しやすい（「実家族」「学校生活」「会社員」）。マッチ直後は
 *   end-of-string / hiragana / delimiter の 3 択に限定する。
 */
function hasStrictBoundary(text: string, endIdx: number): boolean {
  if (endIdx >= text.length) return true;
  const nextChar = text[endIdx]!;
  return isHiragana(nextChar) || isDelimiter(nextChar);
}

/**
 * 辞書中から leftmost-longest match を 1 件返す。
 *
 * - longest-first: 辞書を長さ降順にソートし、同一位置で最長 token を優先
 *   （例: 「セブンイレブン」>「セブン」、「スターバックス」>「スタバ」）
 * - leftmost: 先頭位置から順に走査し、境界条件を満たす最初の match を返す
 * - boundary: boundaryCheck callback で各 dict 種別の境界ルールを差し替え
 */
function findLeftmostLongest(
  text: string,
  dict: readonly string[],
  boundaryCheck: (text: string, endIdx: number, matched: string) => boolean,
): { matched: string; startIdx: number; endIdx: number } | null {
  const sorted = [...dict].sort((a, b) => b.length - a.length);
  for (let i = 0; i < text.length; i++) {
    for (const word of sorted) {
      if (word.length === 0) continue;
      if (text.startsWith(word, i)) {
        const endIdx = i + word.length;
        if (boundaryCheck(text, endIdx, word)) {
          return { matched: word, startIdx: i, endIdx };
        }
      }
    }
  }
  return null;
}

/**
 * anchor 抽出: root + optional suffix。
 *
 * 例:
 *   「甲府駅周辺」= root "甲府駅" + suffix "周辺"    → "甲府駅周辺"
 *   「甲府駅前」  = root "甲府"   + suffix "駅前"    → "甲府駅前"  (※)
 *   「甲府駅」    = root "甲府駅" + suffix 無        → "甲府駅"
 *   「甲府の方」  = root "甲府"   + suffix "の方"    → "甲府の方"
 *   「甲府」      = root "甲府"   + suffix 無        → "甲府"
 *   「東京駅前」  = root "東京"   + suffix "駅前"    → "東京駅前"
 *
 * ※ 同一左端位置に複数 root 候補がある場合、longest-root-first を貪欲的に選ぶと
 *    「甲府駅 + 前」で suffix "駅前" が付かず anchor が短く終わる。
 *    → leftmost 位置で全 root 候補を試し、(root + optional suffix) の長さが
 *      最大になる組み合わせを選ぶ（local-maximum strategy）。
 */
function extractAnchor(text: string): { anchor: string; endIdx: number } | null {
  const sortedRoots = [...ANCHOR_ROOT_DICT].sort((a, b) => b.length - a.length);
  const sortedSuffixes = [...ANCHOR_SUFFIXES].sort((a, b) => b.length - a.length);

  // Step 1: leftmost 位置を特定（どの root でもよい）
  let leftmostPos = -1;
  for (let i = 0; i < text.length && leftmostPos === -1; i++) {
    for (const root of sortedRoots) {
      if (
        text.startsWith(root, i) &&
        hasLooseBoundary(text, i + root.length, root)
      ) {
        leftmostPos = i;
        break;
      }
    }
  }
  if (leftmostPos === -1) return null;

  // Step 2: その位置で全 root 候補を試し、suffix 付き total length が最大の組を選ぶ
  let bestAnchor: string | null = null;
  let bestEnd = -1;
  for (const root of sortedRoots) {
    if (!text.startsWith(root, leftmostPos)) continue;
    const rootEnd = leftmostPos + root.length;
    if (!hasLooseBoundary(text, rootEnd, root)) continue;

    let anchor = root;
    let end = rootEnd;
    for (const suffix of sortedSuffixes) {
      if (text.startsWith(suffix, rootEnd)) {
        anchor = root + suffix;
        end = rootEnd + suffix.length;
        break;
      }
    }

    if (bestAnchor === null || anchor.length > bestAnchor.length) {
      bestAnchor = anchor;
      bestEnd = end;
    }
  }

  return bestAnchor !== null
    ? { anchor: bestAnchor, endIdx: bestEnd }
    : null;
}

/**
 * 比較マーカー検出。「X みたいな Y」= 目的は Y、X は参照（target ではない）。
 *
 * 対象マーカー:
 *   - みたい / みたいな   … 最も強い比較マーカー
 *   - のよう / のような   … 書き言葉寄り
 *   - っぽい               … 口語
 *
 * 意図的に除外:
 *   - 「系」「風」: ラーメン系 / 和風 等、category 自体の修飾に使われる場合も多く両義的
 *
 * CEO specified: 「スタバみたいなカフェ」→ chain=null, category="カフェ"。
 */
const COMPARISON_MARKERS: readonly string[] = [
  "みたいな",
  "みたい",
  "のような",
  "のよう",
  "っぽい",
] as const;

function hasComparisonMarker(text: string): boolean {
  return COMPARISON_MARKERS.some((m) => text.includes(m));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// classifyUtterance — 発話 → NormalizedCapture（本実装 / commit 15）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 発話を NormalizedCapture に分類する pure 関数。
 *
 * CEO 方針（2026-04-22 commit 15 条件）:
 *   1. pure: LLM / DB / web / I/O 無し、辞書参照のみ
 *   2. 未知語を proper_noun に寄せない: 辞書根拠が無ければ exact_proper_noun にしない
 *      → 本実装では `proper_noun_specific` を一切返さない。
 *         固有名（「サドヤ」「Tully's 甲府昭和店」等）の同定は L1 Comprehension 層が
 *         provenance (source_type="utterance" + 辞書非 match) から行う。
 *   3. 複合入力を複合のまま返す: 「甲府のスタバ」= anchor+chain、
 *      「甲府駅周辺のカフェ」= anchor+category。潰さない。
 *   4. decision order:
 *        undecided → baseline → chain±anchor → category±anchor → anchor_alone → other
 *      ただし proper_noun は dict 根拠が無いため本関数から発行されない（上記 2）。
 *   5. unit tests が重要分岐を網羅すること
 *   6. 分類のみ: readyForHandoff / search readiness は reducer / draft builder の責務
 *
 * chain ↔ category 相互排他:
 *   input に両方が現れた場合、chain が specificity 上 winner（detail §1.4）。
 *   ただし「X みたいな Y」の比較表現では Y (category) が target で、X (chain) は参照。
 *   → hasComparisonMarker(text) が真のとき category を勝たせ chain を null 化。
 *
 * generic_placeholder:
 *   「ランチ」等の時間域兼用語は本関数より上流（rulePreParse）で time_hint に吸収される
 *   想定。上流で吸収されなかった場合、本関数では category_alone として扱う（categoryDict
 *   に存在するため）。明示的に generic_placeholder を返すことはしない。
 */
export function classifyUtterance(rawSpan: string): NormalizedCapture {
  const text = rawSpan.trim();

  // Step 0: 空文字は other（rawSpan は生片として残す）
  if (text.length === 0) {
    return {
      subKind: "other",
      extractedAnchor: null,
      extractedCategory: null,
      extractedChain: null,
      rawSpan,
    };
  }

  // Step 1: UNDECIDED_DICT（意思決定放棄の意図を最優先で捕捉）
  //   「カフェ決めてない」のように category と共起しても undecided が勝つ。
  const undecidedMatch = findLeftmostLongest(
    text,
    UNDECIDED_DICT,
    hasLooseBoundary,
  );
  if (undecidedMatch) {
    return {
      subKind: "undecided",
      extractedAnchor: null,
      extractedCategory: null,
      extractedChain: null,
      rawSpan,
    };
  }

  // Step 2: BASELINE_REF_DICT（自宅 / 学校 / 会社 等、PR-9 非経由の自己参照語）
  //   strict boundary で「実家族」「学校生活」等の複合語 false positive を防ぐ。
  //   baseline は anchor 併記があっても baseline 優先（「甲府の実家」= baseline）。
  const baselineMatch = findLeftmostLongest(
    text,
    BASELINE_REF_DICT,
    (t, end) => hasStrictBoundary(t, end),
  );
  if (baselineMatch) {
    return {
      subKind: "baseline",
      extractedAnchor: null,
      extractedCategory: null,
      extractedChain: null,
      rawSpan,
    };
  }

  // Step 3: anchor / chain / category を並列スキャン
  const anchorResult = extractAnchor(text);
  const anchor = anchorResult ? anchorResult.anchor : null;
  const chainMatch = findLeftmostLongest(text, CHAIN_BRAND_DICT, hasLooseBoundary);
  const categoryMatch = findLeftmostLongest(text, CATEGORY_DICT, hasLooseBoundary);

  let chain: string | null = chainMatch ? chainMatch.matched : null;
  let category: string | null = categoryMatch ? categoryMatch.matched : null;

  // Step 4: 比較マーカー処理（「スタバみたいなカフェ」= category が target、chain は参照）
  if (chain !== null && category !== null && hasComparisonMarker(text)) {
    chain = null; // category を勝たせる
  }

  // Step 5: chain ↔ category 相互排他（detail §1.4、chain が specificity で勝つ）
  //   subKind と extracted fields の整合のため classify 段階で category を落とす。
  //   reducer も同等の排他を実装しているが、NormalizedCapture 自体を self-consistent に保つ。
  if (chain !== null && category !== null) {
    category = null;
  }

  // Step 6: subKind 決定 — decision order の「提案どおり」部分
  if (chain !== null) {
    return anchor !== null
      ? {
          subKind: "chain_with_anchor",
          extractedAnchor: anchor,
          extractedCategory: null,
          extractedChain: chain,
          rawSpan,
        }
      : {
          subKind: "chain_alone",
          extractedAnchor: null,
          extractedCategory: null,
          extractedChain: chain,
          rawSpan,
        };
  }

  if (category !== null) {
    return anchor !== null
      ? {
          subKind: "category_with_anchor",
          extractedAnchor: anchor,
          extractedCategory: category,
          extractedChain: null,
          rawSpan,
        }
      : {
          subKind: "category_alone",
          extractedAnchor: null,
          extractedCategory: category,
          extractedChain: null,
          rawSpan,
        };
  }

  if (anchor !== null) {
    return {
      subKind: "anchor_alone",
      extractedAnchor: anchor,
      extractedCategory: null,
      extractedChain: null,
      rawSpan,
    };
  }

  // Step 7: どれにも match しない → other（CEO 条件 2: proper_noun に寄せない）
  return {
    subKind: "other",
    extractedAnchor: null,
    extractedCategory: null,
    extractedChain: null,
    rawSpan,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// subKind → narrowStep 「粒度ヒント」参照表（reducer 非依存、legacy reference）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * subKind ごとの「情報量の目安」を示す参照表。
 *
 * ⚠ commit 18 以降、reducer は本表を直接は参照しない。
 *   narrowStep は累積 searchQueryDraft の (anchor / chain / category) 有無から
 *   直接 derive される（§1.2 table 準拠、`deriveNarrowStepFromDraft` in reducer.ts）。
 *   これは §11.1 T3 の multi-turn lift
 *   （anchor_alone→chain_alone の 2 ターン合成で 1→2 lift）を成立させるため。
 *
 * 本表は以下の用途で残している:
 *   1. 設計書 §1.2 の subKind 粒度感を文書として追跡する（読む人の mental model）
 *   2. 将来的に classify 層が signal を出す際の目安として参照
 *   3. taxonomy 単体テストで「10 subKind 全カバー」の機械検証
 *
 * 読み方: 「focus.slot='where' かつ subKind='chain_with_anchor' なら粒度感は 2 相当」
 * proper_noun / baseline は粒度 3（terminal）。
 */
export const NARROW_STEP_BY_SUBKIND: Readonly<
  Record<CaptureSubKind, 0 | 1 | 2 | 3>
> = {
  proper_noun_specific: 3, // 即 confirm、where slot 確定
  chain_with_anchor: 2, // search_handoff_blocking 直行
  category_with_anchor: 2, // search_handoff_blocking 直行
  chain_alone: 1, // anchor 追加聴取
  category_alone: 1, // anchor 追加聴取
  anchor_alone: 1, // chain/category 追加聴取
  baseline: 3, // Layer 1 resolver 経由で確定
  undecided: 0, // narrowStep 不進
  generic_placeholder: 0,
  other: 0,
} as const;
