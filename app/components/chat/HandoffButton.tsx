"use client";

/**
 * Stage 4 L4-c — 明示 handoff button (UI spec §4.3.8 / §2.7)
 *
 * 正本: layout plan v0.3 §7.3 / UI spec §2.7 / §4.3.8 / 統合契約 §1.6-3
 *
 * 「この提案をチャットに共有」tap で 1 回きり broadcast。自動 broadcast しない
 * (統合契約 §1.6-3 不可侵: handoff は明示 tap のみ、auto-copy 禁止)。
 *
 * 連投ガード: tap 後 100ms は再 fire しない (構造的 1 回きり保証)。
 */

import { useCallback, useRef } from "react";

const REFIRE_GUARD_MS = 100;

export interface HandoffButtonProps {
  /** tap 時に 1 回呼ばれる handler (broadcast 経路) */
  onHandoff: () => void;
  /** disabled 時は handler 非起動 */
  disabled?: boolean;
  /** custom label (default: "この提案をチャットに共有") */
  label?: string;
  className?: string;
}

export default function HandoffButton({
  onHandoff,
  disabled = false,
  label = "この提案をチャットに共有",
  className,
}: HandoffButtonProps) {
  const firingRef = useRef(false);

  const handleClick = useCallback(() => {
    if (disabled) return;
    if (firingRef.current) return; // 連投ガード
    firingRef.current = true;
    try {
      onHandoff();
    } finally {
      // 再 fire ガードは 100ms で解除 (誤連打のみ防止、長時間 lock しない)
      setTimeout(() => {
        firingRef.current = false;
      }, REFIRE_GUARD_MS);
    }
  }, [disabled, onHandoff]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={label}
      data-testid="coalter-handoff-button"
      className={className}
      style={{
        padding: "6px 14px",
        fontSize: 12,
        background: disabled ? "#e8e8ec" : "#6366F1",
        color: disabled ? "#8888a0" : "#ffffff",
        border: "1px solid",
        borderColor: disabled ? "#c8c8dc" : "#6366F1",
        borderRadius: 6,
        cursor: disabled ? "default" : "pointer",
        fontWeight: 500,
      }}
    >
      {label}
    </button>
  );
}
