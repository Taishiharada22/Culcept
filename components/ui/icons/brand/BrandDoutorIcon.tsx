/**
 * BrandDoutorIcon — ドトール 識別 icon
 *
 * 設計: 黄色 background + 茶色 coffee cup with saucer (= 焙煎色)
 * Brand color: Doutor yellow (= ロゴ背景の黄、 #fcd116 系)
 */

import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandDoutorIcon({
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
      {/* 黄色 rounded square */}
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#fcd116" />
      {/* 茶色 coffee cup */}
      <path
        d="M7 11 H17 V15.5 Q17 17 15.5 17 H8.5 Q7 17 7 15.5 Z"
        fill="#5d3a1a"
      />
      {/* Saucer (= 受け皿) */}
      <ellipse cx="12" cy="18.5" rx="6" ry="1" fill="#5d3a1a" />
      {/* 取っ手 */}
      <path
        d="M17 12.5 Q19 12.5 19 14.5 Q19 16 17 15.5"
        stroke="#5d3a1a"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
