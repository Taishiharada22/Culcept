/**
 * BrandFamilyMartIcon — ファミリーマート 識別 icon
 * 設計: 緑+青+白 stripes (= ファミマ看板の特徴的縞)
 * Brand color: green (#009f4d) + blue (#0072bc)
 */
import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandFamilyMartIcon({
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
      {/* 白 base */}
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#ffffff" />
      {/* 緑 top diagonal */}
      <path d="M1 6 L1 1 H6 Z" fill="#009f4d" />
      <rect x="1" y="3" width="22" height="3" fill="#009f4d" />
      {/* 白 middle */}
      <rect x="1" y="6" width="22" height="11" fill="#ffffff" />
      {/* 青 bottom */}
      <rect x="1" y="17" width="22" height="3" fill="#0072bc" />
      <path d="M23 23 L23 18 H18 Z" fill="#0072bc" />
      {/* border */}
      <rect x="1" y="1" width="22" height="22" rx="5" fill="none" stroke="#cccccc" strokeWidth="0.5" />
    </svg>
  );
}
