/**
 * CategoryUnknownIcon — 「場所カテゴリ未設定」 (Aneurasync category icon system, Phase 2-I)
 *
 * 設計思想:
 *   - 標準 location pin shape (= 既存 emoji 📍 の SVG 版、 ユーザーに馴染みやすい)
 *   - 中央の小円 (= pin 内部、 dot 不在)
 *   - 「?」 等の問い合わせ記号は避ける (= 機械的すぎ、 思想違反)
 */

import * as React from "react";

import type { CategoryIconProps } from "./types";

export function CategoryUnknownIcon({
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
      {/* Pin shape: 上半円 + 下に向かう先端 */}
      <path d="M12 21 C12 21 5 14 5 9 A 7 7 0 0 1 19 9 C19 14 12 21 12 21 Z" />
      {/* 中央の小円 (= pin の中心、 location dot) */}
      <circle cx="12" cy="9" r="2" />
    </svg>
  );
}
