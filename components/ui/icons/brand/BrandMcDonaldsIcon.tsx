/**
 * BrandMcDonaldsIcon — マクドナルド 識別 icon
 *
 * 設計: 黄色 background + 茶色 hamburger 3-layer シルエット
 * 商標安全性: "M" arch を使わない、 burger silhouette + brand color
 * Brand color: McDonald's gold (= #ffc72c) + red (= #da291c)
 */

import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandMcDonaldsIcon({
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
      {/* 赤 rounded square */}
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#da291c" />
      {/* バンズ 上 (= 黄ゴールド) */}
      <path
        d="M5 11 Q5 7 12 7 Q19 7 19 11 Z"
        fill="#ffc72c"
      />
      {/* レタス (= 緑) */}
      <path
        d="M5 11 H19 L18 13 H6 Z"
        fill="#7fb069"
      />
      {/* パティ (= 茶) */}
      <path
        d="M6 13 H18 V15 H6 Z"
        fill="#5d3a1a"
      />
      {/* バンズ 下 (= 黄ゴールド) */}
      <path
        d="M5 15 Q5 18 12 18 Q19 18 19 15 Z"
        fill="#ffc72c"
      />
    </svg>
  );
}
