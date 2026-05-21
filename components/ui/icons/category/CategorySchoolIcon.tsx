/**
 * CategorySchoolIcon — 「学びの場」 (Aneurasync category icon system, Phase 2-I)
 *
 * 設計思想:
 *   - 開いた本 outline (= 「学び」 そのものの抽象、 校舎よりメタファー深い)
 *   - 中央の谷 (= 本のセンター)
 *   - 物理的「学校」 ではなく **学習行為の象徴** (= Aneurasync 思想: 役割の場)
 */

import * as React from "react";

import type { CategoryIconProps } from "./types";

export function CategorySchoolIcon({
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
      {/*
       * 開いた本: 中央 (M12) で 2 ページが谷を作る形。
       * 左ページ: 上端から谷へ、 谷から下端へ
       * 右ページ: 同様 mirror
       */}
      <path d="M4 6 L11 7 V19 L4 18 Z" />
      <path d="M20 6 L13 7 V19 L20 18 Z" />
      {/* 中央の谷 (= 本の背) */}
      <path d="M12 7 V19" />
    </svg>
  );
}
