/**
 * CategoryOfficeIcon — 「労働の場」 (Aneurasync category icon system, Phase 2-I)
 *
 * 設計思想:
 *   - 縦長矩形 (= 高層建物の抽象) + 横線 3 本 (= 階層を最小表現)
 *   - 窓の格子は描かない (= noise 削減、 抽象度高)
 *   - 屋上は flat (= 商業ビル / オフィスビルの一般形)
 */

import * as React from "react";

import type { CategoryIconProps } from "./types";

export function CategoryOfficeIcon({
  className,
  size = 24,
  title,
  ariaLabel,
}: CategoryIconProps): React.ReactElement {
  const isInteractive = !!(title || ariaLabel);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={isInteractive ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={isInteractive ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {/* 矩形 (= 縦長建物 outline) */}
      <path d="M5 4 H19 V20 H5 Z" />
      {/* 3 本の横線 (= 階層、 抽象度高) */}
      <path d="M9 8 H15" />
      <path d="M9 12 H15" />
      <path d="M9 16 H15" />
    </svg>
  );
}
