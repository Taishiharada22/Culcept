/**
 * BrandDepartmentStoreIcon — 百貨店 / デパート (general、 三越 / 高島屋 / 伊勢丹 等) 識別 icon
 * 設計: rose 系 background + 白 elegant building + sparkle
 * Brand color: department rose (#e11d48)
 */
import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandDepartmentStoreIcon({
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
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#e11d48" />
      {/* Building rectangle */}
      <rect x="6" y="6" width="12" height="14" fill="#ffffff" rx="0.5" />
      {/* 4 階層 (= 横線 3 本) */}
      <path d="M6 10 H18 M6 13 H18 M6 16 H18" stroke="#e11d48" strokeWidth="0.6" />
      {/* 中央入り口 */}
      <rect x="11" y="16.5" width="2" height="3.5" fill="#e11d48" />
      {/* Sparkle (= 装飾、 上部) */}
      <path d="M20 4 L20.5 5.5 L22 6 L20.5 6.5 L20 8 L19.5 6.5 L18 6 L19.5 5.5 Z" fill="#fcd34d" />
    </svg>
  );
}
