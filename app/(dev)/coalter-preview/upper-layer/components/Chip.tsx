"use client";

/**
 * CoAlter Stage 1 上部レイヤー preview — Chip
 *
 * 正本: layout plan v0.2 §4.2 / UI spec §3.4 (チップ体系)
 *
 * 常設チップ component。S1 status chip / S2-S5 応答チップ / S6 提案導線 等の
 * 共通形状を提供する。
 *
 * variant:
 *   - status:    S1 介入気配 (1 個、中央寄せ)
 *   - response:  S2-S5 応答チップ (横並び 2-3、本文カード直下)
 *   - action:    S6 提案導線 3 ボタン (縦並び、中央)
 *   - approve:   S7 承認チップ (1 個、中央)
 *   - close:     S5/S7 「閉じる/いったん戻る」 (右肩固定)
 *
 * 本 component は scaffold (静的 React)。click 時の logic は Stage 2 接続。
 */

import type { ReactNode } from "react";

export type ChipVariant =
  | "status"
  | "response"
  | "action"
  | "approve"
  | "close";

export interface ChipProps {
  variant: ChipVariant;
  children: ReactNode;
  /** preview のみ; click handler は Stage 2 で接続 */
  onClick?: () => void;
  ariaLabel?: string;
}

const C = {
  bgLight: "#ffffff",
  bgAccent: "#6366F1",
  bgSoft: "#f5f6fa",
  border: "#c8c8dc",
  borderAccent: "#6366F1",
  text: "#1a1a2e",
  textSoft: "#4a4a68",
  textOnAccent: "#ffffff",
  textMuted: "#8888a0",
} as const;

const variantStyles: Record<ChipVariant, React.CSSProperties> = {
  status: {
    padding: "4px 12px",
    fontSize: 12,
    background: C.bgSoft,
    border: `1px solid ${C.border}`,
    color: C.textSoft,
    borderRadius: 16,
  },
  response: {
    padding: "4px 10px",
    fontSize: 12,
    background: C.bgLight,
    border: `1px solid ${C.border}`,
    color: C.text,
    borderRadius: 14,
  },
  action: {
    padding: "8px 16px",
    fontSize: 13,
    background: C.bgAccent,
    border: `1px solid ${C.borderAccent}`,
    color: C.textOnAccent,
    borderRadius: 6,
    minWidth: 200,
    textAlign: "center" as const,
    fontWeight: 500,
  },
  approve: {
    padding: "6px 14px",
    fontSize: 12,
    background: C.bgAccent,
    border: `1px solid ${C.borderAccent}`,
    color: C.textOnAccent,
    borderRadius: 6,
    fontWeight: 500,
  },
  close: {
    padding: "4px 8px",
    fontSize: 11,
    background: "transparent",
    border: `1px solid ${C.border}`,
    color: C.textMuted,
    borderRadius: 4,
  },
};

export default function Chip({
  variant,
  children,
  onClick,
  ariaLabel,
}: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        ...variantStyles[variant],
        cursor: onClick ? "pointer" : "default",
        display: "inline-block",
      }}
    >
      {children}
    </button>
  );
}
