/**
 * Aneurasync Category Icon System — shared types (Phase 2-I)
 *
 * 設計書: docs/alter-plan-phase2-i-category-icon-system-mini-design.md
 *
 * 全 category icon が implement する props 型 (= 統一インターフェース)。
 */

export interface CategoryIconProps {
  /**
   * Tailwind CSS class (= size / color control)。
   * 例: "w-5 h-5 text-slate-500"
   */
  className?: string;
  /**
   * Icon size in px (= width / height、 default 24)。
   * 推奨: 16 / 20 / 24 / 32 (= Aneurasync Compact / Detail density に整合)。
   */
  size?: number;
  /**
   * `<title>` 要素として埋め込む文字列 (= mouse hover tooltip)。
   * 推奨: CATEGORY_META.hint を渡す (= 「自分の聖域」 等の Aneurasync 思想)。
   */
  title?: string;
  /**
   * アクセシビリティ用 aria-label (= screen reader 読み上げ)。
   * 不在 (= undefined) の場合、 icon は decorative として `aria-hidden=true` で扱う。
   * interactive な context (= button 子要素等) では aria-label / title のいずれかを渡す。
   */
  ariaLabel?: string;
}
