/**
 * BrandMatsuyaIcon — 松屋 識別 icon
 * 設計: 黄 background + 白 丼 (= 牛丼チェーン 3 兄弟の色差別化)
 * Brand color: Matsuya yellow (#f5d514)
 */
import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandMatsuyaIcon({
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
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#f5d514" />
      <path d="M5 12 Q5 19 12 19 Q19 19 19 12 Z" fill="#ffffff" />
      <ellipse cx="12" cy="12" rx="7" ry="1" fill="#ffffff" />
      <path d="M6.5 12 Q6.5 15 12 15 Q17.5 15 17.5 12 Z" fill="#8b5a2b" opacity="0.6" />
    </svg>
  );
}
