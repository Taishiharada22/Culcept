/**
 * BrandSubwayIcon — Subway サブウェイ 識別 icon
 * 設計: 緑黄 horizontal stripes + sandwich silhouette
 * Brand color: Subway green (#008c15) + yellow (#fec00c)
 */
import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandSubwayIcon({
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
      {/* 緑 upper half */}
      <rect x="1" y="1" width="22" height="11" rx="5" fill="#008c15" />
      {/* 黄 lower half */}
      <rect x="1" y="12" width="22" height="11" rx="5" fill="#fec00c" />
      {/* Sandwich (= 横長、 細長い 6 inch sub) */}
      <path d="M4 11 Q4 9 7 9 H17 Q20 9 20 11 V13 Q20 15 17 15 H7 Q4 15 4 13 Z" fill="#e8c896" stroke="#5d3a1a" strokeWidth="0.5" />
      {/* Lettuce 中央 */}
      <path d="M5 12 H19" stroke="#3d7e2c" strokeWidth="0.8" />
    </svg>
  );
}
