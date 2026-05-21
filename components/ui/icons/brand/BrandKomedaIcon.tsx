/**
 * BrandKomedaIcon — コメダ珈琲店 識別 icon
 *
 * 設計: クリーム色 background + 茶色 トースト 1 切れ (= モーニング名物)
 * Brand color: Komeda cream / tan (= 喫茶店らしい暖色)
 */

import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandKomedaIcon({
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
      {/* タン色 (= クリーム) rounded square */}
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#c4a484" />
      {/* 茶色 toast slice */}
      <path
        d="M6 8 Q6 6 8 6 H14 Q16 6 16 8 V17 Q16 19 14 19 H8 Q6 19 6 17 Z"
        fill="#8b5a2b"
      />
      {/* Crust (= トーストの耳) */}
      <path
        d="M8 9 H14 M8 12 H14 M8 15 H14"
        stroke="#5d3a1a"
        strokeWidth="0.8"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
