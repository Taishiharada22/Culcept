/**
 * CategorySensitiveIcon — 「内容秘匿、 privacy 配慮」 (Aneurasync category icon system, Phase 2-I)
 *
 * 設計思想:
 *   - Shield outline + 中央の小 dot (= 守る、 中に何かがある、 内容は見せない)
 *   - Lock icon より shield (= 「保護」 「守られる」 のニュアンス、 「閉じ込める」 ではない)
 *   - 警告色 / 強調装飾なし (= 既存 sensitive privacy 仕様維持、 Aneurasync 思想)
 */

import * as React from "react";

import type { CategoryIconProps } from "./types";

export function CategorySensitiveIcon({
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
       * Shield outline:
       *   上端中央から 下方へ、 左右の肩から胴体、 下端で丸く尖る (= 守る形)
       */}
      <path d="M12 3 L4 6 V12 Q4 18 12 21 Q20 18 20 12 V6 Z" />
      {/* 中央の小 dot (= 守られている対象の抽象、 内容は露出しない) */}
      <circle cx="12" cy="11" r="1.2" />
    </svg>
  );
}
