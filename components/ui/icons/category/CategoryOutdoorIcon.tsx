/**
 * CategoryOutdoorIcon — 「外の空気」 (Aneurasync category icon system, Phase 2-I)
 *
 * 設計思想:
 *   - 2 つの重なる山 + 太陽 (= 「自然」 「外」 を抽象化)
 *   - 山は 2 つで奥行きを表現 (= 1 つだけだと記号的すぎ、 3 つ以上は noisy)
 *   - 太陽は右上に円 1 つ (= 季節感、 明るさ)
 */

import * as React from "react";

import type { CategoryIconProps } from "./types";

export function CategoryOutdoorIcon({
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
      {/* 2 つの山 (= 重なるシルエット、 底辺は描かない = 抽象度高) */}
      <path d="M3 19 L9 10 L13 14 L17 9 L21 19" />
      {/* 太陽 (= 右上に小円) */}
      <circle cx="17" cy="5" r="1.5" />
    </svg>
  );
}
