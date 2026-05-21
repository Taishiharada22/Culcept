/**
 * BrandMosBurgerIcon — モスバーガー 識別 icon
 *
 * 設計: モス緑 background + 茶 hamburger (= マック との色で差別化)
 * Brand color: Mos Burger green (= #2a8d3e 系)
 */

import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandMosBurgerIcon({
  className,
  size = 24,
  title,
  ariaLabel,
}: BrandIconProps): React.ReactElement {
  const isInteractive = !!(title || ariaLabel);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role={isInteractive ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={isInteractive ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {/* モス緑 rounded square */}
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#2a8d3e" />
      {/* バンズ上 (= 薄ベージュ) */}
      <path
        d="M5 11 Q5 7 12 7 Q19 7 19 11 Z"
        fill="#e8c896"
      />
      {/* トマト (= 赤) */}
      <path
        d="M5 11 H19 L18 12.5 H6 Z"
        fill="#c4302b"
      />
      {/* パティ (= 茶) */}
      <path
        d="M6 12.5 H18 V14.5 H6 Z"
        fill="#5d3a1a"
      />
      {/* レタス */}
      <path
        d="M6 14.5 H18 L17 16 H7 Z"
        fill="#9bc66c"
      />
      {/* バンズ下 */}
      <path
        d="M5 16 Q5 18 12 18 Q19 18 19 16 Z"
        fill="#e8c896"
      />
    </svg>
  );
}
