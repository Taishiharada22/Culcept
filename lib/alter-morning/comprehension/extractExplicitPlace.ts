/**
 * extractExplicitPlace — PR A Commit 3 (CEO/GPT 2026-05-02)
 *
 * Goal:
 *   utterance から「時刻 span 終端 + 活動 span 開始」 の間にある
 *   場所候補を**厳格に**抽出する。
 *
 * 不変条件 (CEO/GPT 厳密化、雑な残り文字列抽出は禁止):
 *   1. 時刻 span の終端 index ≤ 活動 span の開始 index (順序保証)
 *   2. 時刻 span 終端から活動 span 開始までの substring (mid section) を切り出す
 *   3. 先頭の「に / から」 を除去 (時刻後の助詞)
 *   4. 末尾の「で」 を除去 (活動前の助詞)
 *   5. trim
 *   6. 残り長さが 1-15 文字
 *   7. 句読点・特殊文字 (「、」 「。」 「！」 「？」 「,」 「.」) を含まない
 *   8. negative dictionary (変更/相談/判断/かな/しよう/にして/いいかな/思う/かもしれない) と不一致
 *
 * 戻り値:
 *   - 場所文字列 (1-15 文字、negative dict 排除済み)
 *   - null: 不適格 (空、長すぎる、負の文字、negative dict hit)
 *
 * scope:
 *   - 時刻 span と活動 span の存在が前提 (caller が両方確認後に呼ぶ)
 *   - 場所辞書 lookup はしない (LLM 経路 / placeResolver の責務)
 *   - 1-15 文字の anchor (新宿 / 渋谷 / 新宿駅) を許可するシンプル設計
 */

import type { ExtractedSpan } from "./rulePreParse";

// negative dictionary: 場所候補に紛れ込んだら拾わない単語群
//   - 修正/判断系: 「変更」 「相談」 「かな」 「しよう」 「にして」 等
//   - 人名 marker: 「さん」 「様」 「くん」 「ちゃん」
//     (例: 「12時に新宿で武藤さんとランチ」 で mid="新宿で武藤さんと" を拾わない)
const NEGATIVE_DICT = [
  "変更",
  "相談",
  "判断",
  "かな",
  "しよう",
  "にして",
  "いいかな",
  "思う",
  "かもしれない",
  "どうしよう",
  // 人名 marker (CEO/GPT 2026-05-02 場所候補絞り込み)
  "さん",
  "様",
  "くん",
  "ちゃん",
];

// 特殊文字 (句読点等)
const SPECIAL_CHARS_RE = /[、。！？,.!?]/;

interface ActivitySpanLike {
  span: string;
  index: number;
}

export function extractExplicitPlace(
  utterance: string,
  timeSpan: ExtractedSpan<string>,
  activitySpan: ActivitySpanLike,
): string | null {
  // 1. 順序保証: 時刻 span の終端 index ≤ 活動 span の開始 index
  const timeEnd = timeSpan.index + timeSpan.span.length;
  if (timeEnd > activitySpan.index) {
    return null; // 順序不正 (活動が時刻より前)
  }

  // 2. mid section を切り出し
  let mid = utterance.slice(timeEnd, activitySpan.index);

  // 3. 先頭の「に / から」 除去
  mid = mid.replace(/^(から|に)/, "");

  // 4. 末尾の「で」 除去
  mid = mid.replace(/で$/, "");

  // 5. trim (whitespace)
  mid = mid.trim();

  // 6. 残り長さ 1-15 文字
  if (mid.length < 1 || mid.length > 15) {
    return null;
  }

  // 7. 句読点・特殊文字を含まない
  if (SPECIAL_CHARS_RE.test(mid)) {
    return null;
  }

  // 8. negative dictionary と不一致
  for (const neg of NEGATIVE_DICT) {
    if (mid.includes(neg)) {
      return null;
    }
  }

  return mid;
}
