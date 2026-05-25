/**
 * CategoryCafeIcon — 「ひと息の場」 (Aneurasync category icon system, Phase 2-I)
 *
 * 設計思想:
 *   - 浅いカップ + 取っ手 + 短い湯気 2 本 (= 「呼吸」 「ひと息」 のニュアンス)
 *   - 湯気は subtle (= 強調しすぎない、 Aneurasync 思想: 強制しない)
 *   - 取っ手は 1 つだけ (= 抽象度高)
 */

import * as React from "react";

import type { CategoryIconProps } from "./types";

export function CategoryCafeIcon({
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
      {/* カップ (= 浅い rectangle、 底辺が rounded) */}
      <path d="M5 11 H17 V17 Q17 19 15 19 H7 Q5 19 5 17 Z" />
      {/* 取っ手 (= 右側に丸い arc) */}
      <path d="M17 13 Q21 13 21 16 Q21 19 17 17.5" />
      {/* 湯気 2 本 (= 短く curved up) */}
      <path d="M9 5 Q9 7 10 8" />
      <path d="M13 5 Q13 7 14 8" />
    </svg>
  );
}
