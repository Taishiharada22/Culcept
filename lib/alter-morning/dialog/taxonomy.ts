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
 */
export const UNDECIDED_DICT: readonly string[] = [
  "決めてない",
  "きめてない",
  "決まってない",
  "きまってない",
  "まだ",
  "まだ決めてない",
  "どこでもいい",
  "どこでも",
  "任せる",
  "お任せ",
  "任せます",
  "わかんない",
  "わからない",
  "分からない",
] as const;

/**
 * baseline — 自宅 / オフィス等、baseline 参照で即同定できる固有名。
 * PR-9 の places search を経由せず Layer 1 resolver で解決される。
 */
export const BASELINE_REF_DICT: readonly string[] = [
  "自宅",
  "家",
  "うち",
  "我が家",
  "実家",
  "オフィス",
  "会社",
  "職場",
  "学校",
] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// classifyUtterance — 発話 → NormalizedCapture（stub）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 発話を NormalizedCapture に分類する。
 *
 * commit 13 時点: stub（throw）。commit 15 で本実装。
 * 本実装時の規則は implementation-detail §2.3 decision order:
 *
 *   1. UNDECIDED_DICT match → subKind="undecided"
 *   2. BASELINE_REF_DICT match → subKind="baseline"
 *   3. proper noun 検出（L1 provenance.source_type="utterance" + 辞書非 match）
 *      → subKind="proper_noun_specific"
 *   4. chain match:
 *      - chain + anchor → "chain_with_anchor"
 *      - chain only     → "chain_alone"
 *   5. category match:
 *      - category + anchor → "category_with_anchor"
 *      - category only     → "category_alone"
 *   6. anchor match only → "anchor_alone"
 *   7. どれにも match しない → "other"
 *
 * generic_placeholder（「ランチ」等の時間域兼用語）は rulePreParse が time_hint に
 * 吸収済みのはずで、残った場合のみここに到達する想定。
 */
export function classifyUtterance(_rawSpan: string): NormalizedCapture {
  throw new Error(
    "[DialogState v2] classifyUtterance is reserved. " +
      "Implementation lands in commit 15 (PR-8 rev 3). " +
      "Do not call while DIALOG_STATE_V2=false.",
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// subKind → narrowStep 遷移ヒント（reducer が使う参照表）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * reducer が narrowStep を決めるときの参照。
 * detail §1.2 表を const map にしたもの。
 *
 * 読み方: 「focus.slot='where' かつ subKind='chain_with_anchor' なら narrowStep=2 に直接進む」
 * proper_noun / baseline は narrowStep=3 (terminal) に飛ばして slot 確定へ。
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
