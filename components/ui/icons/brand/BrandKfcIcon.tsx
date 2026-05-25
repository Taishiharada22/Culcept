/**
 * BrandKfcIcon — KFC ケンタッキー 識別 icon
 * 設計: 赤 background + 白 bucket + チキン 抽象 (= bucket = KFC 特徴)
 * Brand color: KFC red (#e4002b)
 */
import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandKfcIcon({
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
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#e4002b" />
      {/* Bucket (= 白、 KFC の象徴的 form) */}
      <path d="M7 9 H17 L16 18 Q16 19 15 19 H9 Q8 19 8 18 Z" fill="#ffffff" />
      {/* Bucket top rim */}
      <ellipse cx="12" cy="9" rx="5" ry="1.2" fill="#ffffff" stroke="#ffffff" />
      {/* Stripe (= 縦の赤 line、 bucket の識別装飾) */}
      <path d="M11 9.5 V18 M13 9.5 V18" stroke="#e4002b" strokeWidth="0.8" />
    </svg>
  );
}
