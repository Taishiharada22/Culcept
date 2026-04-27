"use client";

/**
 * Stage 4 L4-f — ModeReturnPrompt (本番化、preview L1-g 移植)
 *
 * 正本: layout plan v0.3 §7.6 / UI spec §6.5 通常モード復帰
 *
 * 復帰 2 経路 (§6.5.1 自然退出 / §6.5.2 手動復帰) を統合 UI として提供。
 * 自然退出は親 component が PLAN_COMPLETE event を発火、本 component は手動復帰の
 * button 提供のみ (自然退出は trigger 表示なし、自動 fade)。
 */

import type { PresenceMode } from "@/lib/coalter/presence/types";

export interface ModeReturnPromptProps {
  currentMode: Exclude<PresenceMode, "normal">;
  /** [通常] tap で MANUAL_RETURN event 発火 */
  onManualReturn: () => void;
}

const MODE_LABEL: Record<"daily" | "travel", string> = {
  daily: "Daily",
  travel: "Travel",
};

export default function ModeReturnPrompt({
  currentMode,
  onManualReturn,
}: ModeReturnPromptProps) {
  return (
    <div
      role="region"
      aria-label="通常モードへの復帰"
      data-testid="coalter-mode-return-prompt"
      style={{
        padding: "8px 12px",
        background: "#ffffff",
        border: "1px solid #c8c8dc",
        borderRadius: 6,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 11, color: "#4a4a68" }}>
        {MODE_LABEL[currentMode]} mode 中。プラン完成 or 明示で通常へ復帰。
      </span>
      <button
        type="button"
        onClick={onManualReturn}
        data-testid="coalter-mode-manual-return"
        style={{
          padding: "4px 10px",
          fontSize: 11,
          background: "#ffffff",
          border: "1px solid #6366F1",
          color: "#6366F1",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        通常に戻す
      </button>
    </div>
  );
}
