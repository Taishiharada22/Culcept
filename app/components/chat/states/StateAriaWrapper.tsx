"use client";

/**
 * Stage 4 L4-k — State Aria Wrapper
 *
 * 正本: layout plan v0.3 §7.11 / UI spec §1 全体 (a11y)
 *
 * 各 state × mode の本体に a11y 属性を付与する wrapper:
 *   - role="region" / aria-label="CoAlter {state} {mode}"
 *   - aria-live (urgent 状態は "assertive"、その他は "polite")
 *   - tabIndex 管理 (focus trap 防止、§2.4)
 *
 * 27 セル全網羅: 各 (state, mode) で本 wrapper を必ず通すことで a11y 統一。
 */

import type { PresenceMode, PresenceState } from "@/lib/coalter/presence/types";

const STATE_LABEL: Record<PresenceState, string> = {
  S0: "見守り中",
  S1: "介入気配",
  S2: "入口発話",
  S3: "返答待ち",
  S4: "理解更新中",
  S5: "橋渡し中",
  S6: "提案可能",
  S7: "提案表示",
  S8: "クールダウン",
};

const MODE_LABEL: Record<PresenceMode, string> = {
  normal: "通常",
  daily: "Daily",
  travel: "Travel",
};

export interface StateAriaWrapperProps {
  state: PresenceState;
  mode: PresenceMode;
  /** urgent 中なら true (aria-live を assertive に) */
  isUrgent?: boolean;
  children: React.ReactNode;
}

export default function StateAriaWrapper({
  state,
  mode,
  isUrgent = false,
  children,
}: StateAriaWrapperProps) {
  const ariaLive = isUrgent ? "assertive" : "polite";
  const ariaLabel = `CoAlter ${STATE_LABEL[state]} (${MODE_LABEL[mode]} mode)`;

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      aria-live={ariaLive}
      data-coalter-state={state}
      data-coalter-mode={mode}
      data-coalter-urgent={isUrgent ? "true" : "false"}
      data-testid="coalter-state-aria-wrapper"
    >
      {children}
    </div>
  );
}
