/**
 * Session B — Alter Tab 表示語彙（UI 専用・ロジックなし）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.2（帯語凍結）/ §3.3（周辺カード語彙例）
 * 規律:
 *  - band → 帯語の変換は表示層の責務（visual-contract §4: band は「テキスト表示用（帯語に変換して出す）」）
 *  - 見立て・予測への数値（% / 点数 / 確率）は一切出さない
 *  - N-3 禁止語（おすすめ/これをした方がいい/最適/推奨/改善/警告/危険/注意/リスク）不使用
 *  - 赤色警告なし（heart はローズ系 = 契約色。red-* は不使用）
 */

import type { Band } from "@/lib/plan/dayState/dayStateTypes";

/** 余力方向の帯語（visual-contract §3.2 で凍結: very_low 帯の語も確定済み） */
export const BAND_LABEL: Record<Band, string> = {
  very_low: "ほとんど残っていません",
  low: "少なめ",
  medium: "ふつう",
  high: "余裕あり",
  unknown: "読めていません",
};

/** unknown を単独表示する時の正規形（visual-contract §3.2「薄い輪郭 + まだ読めていません」） */
export const UNKNOWN_TEXT = "まだ読めていません";

/** 昨日の負荷（負荷方向 — 余力方向の帯語を流用しない。§3.3 例: 「高め」） */
export const YESTERDAY_LOAD_LABEL: Record<Band, string> = {
  very_low: "軽め",
  low: "軽め",
  medium: "ふつう",
  high: "高め",
  unknown: UNKNOWN_TEXT,
};

/** 回復の質（§3.3: 帯語 or まだ読めていません） */
export const RECOVERY_QUALITY_LABEL: Record<Band, string> = {
  very_low: "浅め",
  low: "浅め",
  medium: "ふつう",
  high: "とれていそう",
  unknown: UNKNOWN_TEXT,
};

/** 明日への持ち越し（§3.3 例: 「少なめに抑えられそう」） */
export const CARRY_OVER_LABEL: Record<Band, string> = {
  very_low: "少なめに抑えられそう",
  low: "少なめに抑えられそう",
  medium: "少し残りそう",
  high: "多めに残りそう",
  unknown: UNKNOWN_TEXT,
};

/** 小バー（数値なし・幅のみ）の描画割合。昨日の負荷カード用 — 数字は一切表示しない */
export const BAND_BAR_FRACTION: Record<Band, number> = {
  very_low: 0.15,
  low: 0.3,
  medium: 0.55,
  high: 0.8,
  unknown: 0,
};

/** 3 系統バッテリーのゾーンキー */
export type ZoneKey = "brain" | "heart" | "body";

/** ゾーン配色（visual-contract §3.2: 脳=パープル〜青紫 / 心臓=ピンク〜ローズ / 体=ブルー〜ミント） */
export const ZONE_STYLE: Record<
  ZoneKey,
  { dotClass: string; textClass: string; badgeClass: string; liquidFrom: string; liquidTo: string }
> = {
  brain: {
    dotClass: "bg-violet-400",
    textClass: "text-violet-600",
    badgeClass: "bg-violet-50 border-violet-200 text-violet-600",
    liquidFrom: "#a78bfa", // violet-400
    liquidTo: "#6366f1", // indigo-500
  },
  heart: {
    dotClass: "bg-rose-300",
    textClass: "text-rose-500",
    badgeClass: "bg-rose-50 border-rose-200 text-rose-500",
    liquidFrom: "#fda4af", // rose-300
    liquidTo: "#f472b6", // pink-400
  },
  body: {
    dotClass: "bg-sky-400",
    textClass: "text-sky-600",
    badgeClass: "bg-sky-50 border-sky-200 text-sky-600",
    liquidFrom: "#38bdf8", // sky-400
    liquidTo: "#2dd4bf", // teal-400
  },
};
