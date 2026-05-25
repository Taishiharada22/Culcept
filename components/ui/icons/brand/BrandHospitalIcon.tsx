/**
 * BrandHospitalIcon — 病院 / クリニック (general) 識別 icon
 * 設計: 赤 background + 白 medical cross + 円 (= 国際標準 medical sign)
 * Brand color: medical red (#dc2626)
 * 注: sensitive anchor では本 icon を使わず CategorySensitiveIcon 優先 (= 既存仕様)
 */
import * as React from "react";
import type { BrandIconProps } from "./types";

export function BrandHospitalIcon({
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
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#dc2626" />
      {/* White medical cross */}
      <rect x="10.5" y="5" width="3" height="14" fill="#ffffff" rx="0.5" />
      <rect x="5" y="10.5" width="14" height="3" fill="#ffffff" rx="0.5" />
    </svg>
  );
}
