/**
 * BrandSalonIcon — 美容院 / ヘアサロン (general) 識別 icon
 * 設計: ピンク background + 白 鋏 (scissors)
 * Brand color: salon rose (#ec4899)
 */
import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandSalonIcon({
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
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#ec4899" />
      {/* 鋏 (= scissors、 X 形 + 持ち手 2 つの輪) */}
      <circle cx="8" cy="17" r="2.5" fill="none" stroke="#ffffff" strokeWidth="1.5" />
      <circle cx="16" cy="17" r="2.5" fill="none" stroke="#ffffff" strokeWidth="1.5" />
      {/* 刃 */}
      <path d="M9.5 15 L15 6" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14.5 15 L9 6" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
      {/* 刃先 */}
      <circle cx="12" cy="11" r="0.5" fill="#ffffff" />
    </svg>
  );
}
