/**
 * BrandSevenElevenIcon — セブンイレブン 識別 icon
 * 設計: 緑・赤・オレンジ tri-color stripes (= セブン看板の特徴的 配色)
 * 商標安全性: 「7」 数字 / 「11」 文字を使わない、 色配置のみで識別
 * Brand color: 緑 (#0fa84a) + 赤 (#cf2418) + オレンジ (#ee7521)
 */
import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandSevenElevenIcon({
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
      {/* white base */}
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#ffffff" />
      {/* オレンジ top stripe */}
      <rect x="1" y="3" width="22" height="6" fill="#ee7521" />
      {/* 緑 middle (= 細) */}
      <rect x="1" y="9" width="22" height="2" fill="#0fa84a" />
      {/* オレンジ middle stripe */}
      <rect x="1" y="11" width="22" height="6" fill="#ee7521" />
      {/* 赤 bottom (= 細) */}
      <rect x="1" y="17" width="22" height="2" fill="#cf2418" />
      {/* オレンジ bottom stripe */}
      <rect x="1" y="19" width="22" height="2" fill="#ee7521" />
      {/* border (= 角丸維持) */}
      <rect x="1" y="1" width="22" height="22" rx="5" fill="none" stroke="#ffffff" strokeWidth="1" />
    </svg>
  );
}
