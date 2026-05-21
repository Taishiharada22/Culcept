/**
 * CategoryTransitIcon — 「通り道」 (Aneurasync category icon system, Phase 2-I)
 *
 * 設計思想:
 *   - 波線 path + 矢印 (= 「移動」 「通過」 の抽象、 物理的車両より概念的)
 *   - 「通り道」 = 場所そのものではなく path、 抽象表現が思想に整合
 *   - 矢印先端で方向性を示唆
 */

import * as React from "react";

import type { CategoryIconProps } from "./types";

export function CategoryTransitIcon({
  className,
  size = 24,
  title,
  ariaLabel,
}: CategoryIconProps): React.ReactElement {
  const isInteractive = !!(title || ariaLabel);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={isInteractive ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={isInteractive ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {/* 波線 path (= 「通り道」 の流動性) */}
      <path d="M3 14 Q7 10 11 14 Q15 18 19 14" />
      {/* 矢印先端 (= 方向性、 右へ) */}
      <path d="M16 11 L19 14 L16 17" />
    </svg>
  );
}
