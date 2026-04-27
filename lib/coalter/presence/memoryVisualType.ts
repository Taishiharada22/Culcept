/**
 * CoAlter Stage 2 — §8.3.2 視覚記号型 mapping (L2-i)
 *
 * 正本: UI spec §8.3.2 視覚記号の型定義
 *
 * 3 軸の視覚チャンネル:
 *   - 由来 (Origin)        : 形 (アイコン、色ではなく形)、項目左端
 *   - 確定度 (Certainty)   : 線種・枠 (主) + 透明度 (補助、2 チャンネル構成)、項目全体
 *   - 可視性 (Visibility)  : 文言ミニラベル、項目右上
 *
 * 不可侵 (§8.3.2):
 *   - 確定度の透明度単独表現は禁止 (主チャンネル不在の構成は accessibility 違反)
 *   - low 項目を通常項目から線種でも透明度でも区別しない表示は禁止
 *
 * 本ファイルは type-safe な mapping のみ提供。具体配色 / アイコン文字 / 文言は
 * UI 側 (preview L1-h MemoryItemCard) で確定。本層は記号「型」のみ。
 */

import type { Certainty, Origin, Visibility } from "./memoryTypes";

/**
 * 由来の視覚型 (形カテゴリ)。具体アイコンは UI 層で決定、本層は型分類のみ。
 */
export type OriginShape = "diamond" | "circle" | "triangle";

/**
 * 確定度の視覚型 (線種主チャンネル + 透明度補助の組)。
 */
export interface CertaintyVisualHint {
  /** 主チャンネル: 線種 (§8.3.2 主) */
  borderStyle: "solid" | "dashed" | "dotted";
  /** 補助チャンネル: 透明度 0.0-1.0 (§8.3.2 副、主と併用) */
  opacity: number;
  /** 補助ラベル (low のみ「(推定中)」等、§8.3.2) */
  auxLabel: string | null;
}

/**
 * 可視性の視覚型 (文言ミニラベル分類)。具体文言は UI 層、本層は分類のみ。
 */
export type VisibilityLabelKind =
  | "both"        // 「両者に見えています」
  | "user_a"      // 「あなた (たいし) だけに見えています」
  | "user_b"      // 「あなた (みさき) だけに見えています」
  | "internal";   // 「CoAlter 内部のみ (両者非表示)」

/**
 * 由来 → 形カテゴリ (§8.3.2 由来は形で区別、色ではない)。
 */
export const ORIGIN_SHAPE: Readonly<Record<Origin, OriginShape>> = {
  explicit_shared: "diamond",
  inferred: "circle",
  transient_summary: "triangle",
};

/**
 * 確定度 → 視覚 hint (§8.3.2 線種主 + 透明度補助)。
 */
export const CERTAINTY_VISUAL: Readonly<Record<Certainty, CertaintyVisualHint>> = {
  high: { borderStyle: "solid", opacity: 1.0, auxLabel: null },
  medium: { borderStyle: "dashed", opacity: 0.85, auxLabel: null },
  // low は補助ラベル必須 (§8.3.2 単独透明度依存禁止の代替)
  low: { borderStyle: "dotted", opacity: 0.7, auxLabel: "(推定中)" },
};

/**
 * 可視性 → 文言ラベルカテゴリ (§8.3.2)。
 */
export const VISIBILITY_LABEL: Readonly<Record<Visibility, VisibilityLabelKind>> = {
  both_visible: "both",
  user_a_only: "user_a",
  user_b_only: "user_b",
  internal_only: "internal",
};
