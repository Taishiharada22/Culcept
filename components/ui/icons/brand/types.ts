/**
 * Aneurasync Brand Icon System — shared types (Phase 2-I 拡張)
 *
 * Brand 別 icon (= スタバ / マック / コンビニ 等の chain identity 表現):
 *   - filled style (= category icon の outlined と差別化)
 *   - brand color を SVG 内で hardcode (= className text color に依存しない)
 *   - 商標 logo を直接コピーしない (= 抽象 silhouette + brand color の組み合わせで識別)
 *
 * 設計書: Phase 2-I docs §19 「将来拡張」 で予告、 本実装で具現化
 */

export interface BrandIconProps {
  /**
   * Tailwind CSS class (= size 制御に使用、 color は brand 固有なので className では override しない)。
   * 例: "w-7 h-7"
   */
  className?: string;
  /** Icon size (= width / height、 default 24)。 */
  size?: number;
  /** `<title>` 要素 (= mouse hover tooltip、 brand 名を入れる推奨) */
  title?: string;
  /** aria-label (= screen reader、 不在なら decorative `aria-hidden=true`) */
  ariaLabel?: string;
}
