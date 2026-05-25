/**
 * CategoryPublicIcon — 「市民の場」 (Aneurasync category icon system, Phase 2-I)
 *
 * 設計思想:
 *   - 三角屋根 + 矩形 + 3 本柱 + 基壇 (= ギリシャ柱建物の抽象、 公共施設)
 *   - 「市民の場」 = 文化施設 / 役所 / 公的施設の共通形態
 *   - 5 本柱は noisy なので 3 本に絞る
 */

import * as React from "react";

import type { CategoryIconProps } from "./types";

export function CategoryPublicIcon({
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
      {/* 三角屋根 (= 公共施設の象徴的アーキテクチャ) */}
      <path d="M4 9 L12 4 L20 9" />
      {/* 屋根下の梁 */}
      <path d="M4 9 H20" />
      {/* 3 本柱 (= 左 / 中 / 右) */}
      <path d="M6 9 V18" />
      <path d="M12 9 V18" />
      <path d="M18 9 V18" />
      {/* 基壇 (= 底辺の横線) */}
      <path d="M3 18 H21" />
    </svg>
  );
}
