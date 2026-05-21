/**
 * BrandBankIcon — 銀行 / 信用金庫 / ATM (general) 識別 icon
 * 設計: emerald green background + 白 building with columns + 円マーク
 * Brand color: bank emerald (#059669)
 */
import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandBankIcon({
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
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#059669" />
      {/* 三角屋根 */}
      <path d="M4 9 L12 5 L20 9 H4 Z" fill="#ffffff" />
      {/* 3 columns */}
      <rect x="6" y="9" width="2" height="8" fill="#ffffff" />
      <rect x="11" y="9" width="2" height="8" fill="#ffffff" />
      <rect x="16" y="9" width="2" height="8" fill="#ffffff" />
      {/* 基壇 */}
      <rect x="3" y="17" width="18" height="2" fill="#ffffff" />
      {/* 円マーク (= 中央、 emerald) */}
      <circle cx="12" cy="13" r="1.5" fill="#059669" />
      <path d="M11.5 11.5 V14.5 M10.5 12.5 H13.5 M10.5 13.5 H13.5" stroke="#ffffff" strokeWidth="0.5" />
    </svg>
  );
}
