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

// negative pattern (CEO/GPT 2026-05-02 PR A Commit 7):
//   mid section に下記 keyword が含まれたら null を返す。
//   有益情報 (who / duration / transport) を持つ複合発話を deterministic で拾わず、
//   LLM 経路に委ねる (5W1H 等値ではないため deterministic_append 不発が安全)。
//
//   - "と"      : 人名連結 (「高橋と」「友達と」 — さん marker なしの人名)
//   - "時間/分/秒" : 明示 duration (「30分だけ」「2時間」)
//   - transport keyword: 移動手段 (「電車で新宿に行って」 で mid="電車で新宿に行って")
//
//   pattern が hit する utterance は LLM の who / duration / transport 推定が
//   deterministic より豊富になり得るため、deterministic_append を不発させる。
const NEGATIVE_PATTERNS_RE =
  /と|時間|分|秒|電車|徒歩|自転車|車|バス|タクシー|地下鉄|JR|Uber/i;

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

  // 9. negative pattern (PR A Commit 7): who / duration / transport keyword 排除
  //    LLM が拾う方が情報が豊かなケースは deterministic で拾わない。
  if (NEGATIVE_PATTERNS_RE.test(mid)) {
    return null;
  }

  return mid;
}
