"use client";

/**
 * Stage 4 L4-f — ModeSwitcher (本番化、preview L1-g 移植)
 *
 * 正本: layout plan v0.3 §7.6 / UI spec §6.3 手動切替
 *
 * 不変原則 (modeReducer L2-h):
 *   - Daily ↔ Travel 直接遷移禁止 (chip 上は表示しても reducer で reject される)
 *   - tap 即時反映、モーダル確認なし (§6.3 / §2.3 モーダル化禁止)
 */

import type { PresenceMode } from "@/lib/coalter/presence/types";

const LABELS: Record<PresenceMode, string> = {
  normal: "通常",
  daily: "Daily",
  travel: "Travel",
};

export interface ModeSwitcherProps {
  active: PresenceMode;
  onSwitch: (target: PresenceMode) => void;
  disabled?: boolean;
}

export default function ModeSwitcher({
  active,
  onSwitch,
  disabled = false,
}: ModeSwitcherProps) {
  return (
    <div
      role="radiogroup"
      aria-label="CoAlter Presence Mode 切替"
      data-testid="coalter-mode-switcher"
      style={{ display: "flex", gap: 6 }}
    >
      {(["normal", "daily", "travel"] as const).map((m) => {
        const isActive = active === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => onSwitch(m)}
            data-testid={`coalter-mode-${m}`}
            style={{
              padding: "5px 12px",
              fontSize: 12,
              border: "1px solid",
              borderColor: isActive ? "#6366F1" : "#c8c8dc",
              background: isActive ? "#6366F1" : "#ffffff",
              color: isActive ? "#ffffff" : "#1a1a2e",
              borderRadius: 14,
              cursor: disabled ? "default" : "pointer",
            }}
          >
            {LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}
