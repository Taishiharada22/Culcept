/**
 * BrandAirportIcon — 空港 (general) 識別 icon
 * 設計: 青 background + 白 airplane (= tilted up)
 * Brand color: aviation sky blue (#0284c7)
 */
import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandAirportIcon({
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
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#0284c7" />
      {/* 飛行機 (= 斜め上昇、 白) */}
      <path
        d="M4 14 L11 11 L9 6 L11 5 L14 9 L19 8 L20 10 L15 12 L18 17 L16 18 L13 14 L9 17 L8 19 L7 18 L8 15 L4 15 Z"
        fill="#ffffff"
      />
    </svg>
  );
}
