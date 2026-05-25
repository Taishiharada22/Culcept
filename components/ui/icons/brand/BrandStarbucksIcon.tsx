/**
 * BrandStarbucksIcon — Starbucks 識別 icon
 *
 * 設計: 緑 circle background + white coffee cup シルエット + 短い湯気 1 本
 * 商標安全性: mermaid logo を使わない、 generic coffee + 緑色で「Starbucks らしさ」 を表現
 *
 * Brand color: Starbucks green (= 深い green、 #006241 系)
 */

import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandStarbucksIcon({
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
      {/* 緑 circle background (= Starbucks identity color) */}
      <circle cx="12" cy="12" r="11" fill="#006241" />
      {/* White coffee cup シルエット */}
      <path
        d="M7.5 11 H16.5 V15.5 Q16.5 17 15 17 H9 Q7.5 17 7.5 15.5 Z"
        fill="#ffffff"
      />
      {/* 取っ手 */}
      <path
        d="M16.5 12.5 Q19 12.5 19 14.5 Q19 16.5 16.5 16"
        stroke="#ffffff"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
      {/* 湯気 (= subtle 1 本) */}
      <path
        d="M12 7 Q12 8.5 13 9.5"
        stroke="#ffffff"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
