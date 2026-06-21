/**
 * originAnchorExtractor — 汎用 origin extraction layer (CEO/GPT 2026-05-03)
 *
 * 目的:
 *   「XからYへ」 等の発話から、X (= 出発地) を deterministic に
 *   `JourneyAnchorState` として抽出する layer。
 *
 * 既存 `extractStartPointAnchor` (explicitAnchorExtractor.ts) との関係:
 *   - 既存: 6 ラベル制限 (= 自宅 / 実家 / ホテル / 会社 / オフィス / 家)
 *   - 本関数: 上記以外の **固有名 (= 駅名 / 空港 / 商業施設 / 英数字混在)** をカバー
 *   - call site (legacyAdapter.ts): `extractStartPointAnchor(...) ?? extractOriginAnchorFromUtterance(...)`
 *     既存 6 ラベルが先取り → 漏れた case のみ本関数が拾う
 *
 * 設計方針 (CEO 2026-05-03 確定):
 *   - 4 構文サポート:
 *     1. XからY (= 「東京駅から渋谷へ」)
 *     2. Xから出発してY (= 「東京駅から出発して」)
 *     3. Xを出てY (= 「東京駅を出て」)
 *     4. X発でY (= 「東京駅発で」)
 *   - 文字種は 漢字 / ひらがな / カタカナ / 英数字 / 中黒 / 長音 / 内部空白 すべて許容
 *     (例: 「Shibuya Stream」「ANA InterContinental Tokyo」「さいたまスーパーアリーナ」)
 *   - 抽出後の label は `classifyLabel` に通し、`public_poi_proper_noun` のみ採用
 *   - generic / private / ambiguous は既存規律 (= grounding しない) に委ねる
 *
 * 誤爆防止:
 *   - temporal prefix を strip (= 「明日 8 時東京駅」 → 「東京駅」)
 *   - 短すぎる (< 2 chars) は reject (= 「だ」「わ」 等)
 *   - 「これから」「明日から」「8 時から」 等は temporal strip + classifyLabel で reject
 *
 * 不変条件:
 *   - 入力 mutate しない (= pure)
 *   - 副作用なし (= caller が dispatch / log 制御)
 *   - null 返却で既存 fallback chain (= homeAnchor 等) に流す
 */

import type { JourneyAnchorState } from "./anchorState";
import { classifyLabel } from "../search/labelClassification";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Day-origin signal patterns (= CEO/GPT 2026-05-03 PR #75 C 案)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * CEO/GPT 2026-05-03 PR #75 C 案 訂正:
 *
 * 旧 (PR #73): bare 「Xから」 を catch して journeyOrigin に extract
 *   → 「明日8時東京駅から渋谷へ」 で「東京駅」 が **過剰に journeyOrigin 昇格**
 *   → CEO 規律違反 (= 「XからY」 だけでは journeyOrigin に固定しない)
 *
 * 新 (本 PR): 明示 day-origin signal のみ catch:
 *   - 「Xから一日を始める」「Xから1日を始める」「Xから今日を始める」
 *   - 「Xからスタート」
 *   - 「Xを出発地にして」「Xを起点に」「Xを始点に」
 *   - 「X集合で...そのまま」 (= 集合 + 直接移動)
 *
 * これらが catch された X だけを journeyOrigin に extract する。
 * 単純 「XからY」 は travel edge (= fromToTravelEdgeReconciler) で扱う。
 *
 * 構文 (= regex 3 種):
 *   1. 「Xから(一日|1日|今日|スタート|始)」
 *   2. 「Xを(出発地|起点|始点)に」
 *   3. 「X集合で.{0,10}(そのまま|直接|連れて)」
 */
const DAY_ORIGIN_PATTERN_FROM_START =
  /(?:^|[、。「『\n])([^、。「」『』\n！？!?]{2,40}?)から(?:一日|1日|今日|スタート|始)/;
const DAY_ORIGIN_PATTERN_AS_START =
  /(?:^|[、。「『\n])([^、。「」『』\n！？!?]{2,40}?)を(?:出発地|起点|始点)に/;
const DAY_ORIGIN_PATTERN_GATHER_DIRECT =
  /(?:^|[、。「『\n])([^、。「」『』\n！？!?]{2,40}?)集合で.{0,10}(?:そのまま|直接|連れて)/;

const ORIGIN_PATTERNS: ReadonlyArray<RegExp> = [
  DAY_ORIGIN_PATTERN_FROM_START,
  DAY_ORIGIN_PATTERN_AS_START,
  DAY_ORIGIN_PATTERN_GATHER_DIRECT,
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Temporal prefix strip
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 抽出 label の **先頭** にある時間表現を反復 strip する。
 *
 * 例:
 *   「明日 8 時東京駅」 → 「明日」 strip → 「 8 時東京駅」 → space strip →
 *   「8 時東京駅」 → 「8 時」 strip → 「東京駅」
 *
 * strip 対象 (= 反復):
 *   - 日付語: 明日 / 今日 / 明後日 / 一昨日 / 昨日
 *   - 時間帯: 朝 / 昼 / 夜 / 夕方 / 午前 / 午後
 *   - 週/月/年: 来週 / 今週 / 来月 / 今月 / 来年 / 今年
 *   - 時刻: \d{1,2}\s*時(\s*\d{1,2}\s*分)?
 *   - 分: \d{1,2}\s*分
 *   - 日: \d{1,2}\s*日
 *   - 空白: 半角 / 全角
 */
const TEMPORAL_PREFIX_RE_LIST: ReadonlyArray<RegExp> = [
  // 日付語
  /^明日/,
  /^今日/,
  /^明後日/,
  /^一昨日/,
  /^昨日/,
  // 週/月/年
  /^来週/,
  /^今週/,
  /^来月/,
  /^今月/,
  /^来年/,
  /^今年/,
  // 時間帯
  /^朝/,
  /^昼/,
  /^夜/,
  /^夕方/,
  /^午前/,
  /^午後/,
  // 時刻
  /^\d{1,2}\s*時(?:\s*\d{1,2}\s*分)?/,
  /^\d{1,2}\s*分/,
  /^\d{1,2}\s*日/,
  // 指示語/discourse marker (= labelClassification AMBIGUOUS 補完)
  // 「これから渋谷へ」 → catch 「これ」 → ここで strip → empty → reject
  /^これ/,
  /^それ/,
  /^あれ/,
  /^どれ/,
  /^どこ/,
  /^だれ/,
  /^誰/,
  // 空白
  /^[\s　、]/,
];

/**
 * label の先頭から temporal prefix / 空白を反復 strip。
 * 残った文字列を返す (= NFKC 正規化済み)。
 */
export function stripTemporalPrefix(s: string): string {
  let result = s.normalize("NFKC");
  let stripped = true;
  while (stripped && result.length > 0) {
    stripped = false;
    for (const re of TEMPORAL_PREFIX_RE_LIST) {
      const m = result.match(re);
      if (m) {
        result = result.slice(m[0].length);
        stripped = true;
        break;
      }
    }
  }
  return result.trim();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Extract
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 発話から origin label を抽出 (pure)。
 *
 * 処理順序:
 *   1. NFKC 正規化
 *   2. 4 構文の regex で X 候補を catch (= 最初の match 採用)
 *   3. X の temporal prefix を strip (= 「明日 8 時東京駅」 → 「東京駅」)
 *   4. trim 後 length < 2 → reject
 *   5. classifyLabel で `public_poi_proper_noun` のみ採用 (= generic / private / ambiguous は reject)
 *   6. 全条件 OK → `JourneyAnchorState (kind=known_label_only, source=user_declared)`
 *
 * @param utterance ユーザー発話
 * @returns 抽出された JourneyAnchorState (= 採用条件全て満たす場合) / null
 */
export function extractOriginAnchorFromUtterance(
  utterance: string,
): JourneyAnchorState | null {
  if (!utterance) return null;
  const text = utterance.normalize("NFKC");

  for (const re of ORIGIN_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const candidate = m[1];
    const stripped = stripTemporalPrefix(candidate);
    if (stripped.length < 2) continue; // 短すぎ (= 「だ」「わ」 等)
    const cls = classifyLabel(stripped);
    if (cls !== "public_poi_proper_noun") continue; // gate
    return {
      kind: "known_label_only",
      label: stripped,
      source: "user_declared",
    };
  }
  return null;
}
