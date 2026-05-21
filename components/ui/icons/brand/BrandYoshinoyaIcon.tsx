/**
 * BrandYoshinoyaIcon — 吉野家 識別 icon
 * 設計: オレンジ background + 白 丼 + 米粒/牛肉抽象
 * Brand color: Yoshinoya orange (#f57c1f)
 */
import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandYoshinoyaIcon({
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
      {/* オレンジ */}
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#f57c1f" />
      {/* 丼 (= 半円) */}
      <path d="M5 12 Q5 19 12 19 Q19 19 19 12 Z" fill="#ffffff" />
      {/* 丼の縁 */}
      <ellipse cx="12" cy="12" rx="7" ry="1" fill="#ffffff" />
      {/* 米 / 具 (= 茶色 thin layer) */}
      <path d="M6.5 12 Q6.5 15 12 15 Q17.5 15 17.5 12 Z" fill="#8b5a2b" opacity="0.6" />
    </svg>
  );
}
