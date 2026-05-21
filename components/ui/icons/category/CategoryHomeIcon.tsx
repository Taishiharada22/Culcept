/**
 * CategoryHomeIcon — 「自分の聖域」 (Aneurasync category icon system, Phase 2-I)
 *
 * 設計思想:
 *   - 屋根 + 壁 + 中央に小さな縦線 (= 「家の中心 / 自分」 を抽象化)
 *   - 細線 stroke (= 「強制しない」 思想)
 *   - corner round (= 「気付き」 「温かみ」)
 *   - currentColor 継承 (= theming 対応)
 *
 * 設計書: docs/alter-plan-phase2-i-category-icon-system-mini-design.md §3.2
 */

import * as React from "react";

import type { CategoryIconProps } from "./types";

export function CategoryHomeIcon({
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
      {/* 屋根 (= 三角の頂点) */}
      <path d="M3 11 L12 4 L21 11" />
      {/* 壁 (= 矩形の左右と底辺) */}
      <path d="M5 10 V20 H19 V10" />
      {/* 中央の縦線 (= 家の中心軸、「自分」 のシンボル) */}
      <path d="M12 14 V20" />
    </svg>
  );
}
