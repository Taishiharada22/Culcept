/**
 * BrandStationIcon — 駅 (general、 JR / 私鉄問わず) 識別 icon
 * 設計: 青 background + 白 train シルエット
 * Brand color: 駅一般 navy (#1e3a8a)
 */
import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandStationIcon({
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
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#1e3a8a" />
      {/* 電車 body */}
      <rect x="6" y="6" width="12" height="13" rx="2" fill="#ffffff" />
      {/* 窓 */}
      <rect x="7.5" y="8" width="9" height="3" rx="0.5" fill="#1e3a8a" />
      {/* ドア / line */}
      <path d="M12 11.5 V15" stroke="#1e3a8a" strokeWidth="0.6" />
      {/* 車輪 */}
      <circle cx="9" cy="17" r="1" fill="#1e3a8a" />
      <circle cx="15" cy="17" r="1" fill="#1e3a8a" />
      {/* 線路 */}
      <path d="M5 19.5 H19" stroke="#ffffff" strokeWidth="0.6" />
    </svg>
  );
}
