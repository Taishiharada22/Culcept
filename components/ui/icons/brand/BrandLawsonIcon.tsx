/**
 * BrandLawsonIcon — ローソン 識別 icon
 * 設計: 青 background + 白 ミルク bottle (= ローソン創業当時の象徴)
 * Brand color: Lawson blue (#0067b3)
 */
import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandLawsonIcon({
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
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#0067b3" />
      {/* ミルク bottle 本体 (= 白 rounded) */}
      <path
        d="M10 7 V9 L9 10 V19 Q9 20 10 20 H14 Q15 20 15 19 V10 L14 9 V7 Z"
        fill="#ffffff"
      />
      {/* Label band (= 中央の青 line) */}
      <rect x="9" y="13" width="6" height="2" fill="#0067b3" />
    </svg>
  );
}
