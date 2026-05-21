/**
 * BrandTullysIcon — Tully's Coffee 識別 icon
 *
 * 設計: オレンジ background + 茶色 tall cup with handle (= 米国 Tully's らしさ)
 * Brand color: Tully's red-orange (= #b81f29 系)
 */

import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandTullysIcon({
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
      {/* オレンジ red rounded square */}
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#b81f29" />
      {/* 白 tall cup */}
      <path
        d="M8 7 H16 V17 Q16 19 14 19 H10 Q8 19 8 17 Z"
        fill="#ffffff"
      />
      {/* 取っ手 (= tall cup の右) */}
      <path
        d="M16 10 Q18.5 10 18.5 13 Q18.5 16 16 16"
        stroke="#ffffff"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* 湯気 1 本 */}
      <path
        d="M12 4 Q12 5.5 13 6"
        stroke="#ffffff"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
