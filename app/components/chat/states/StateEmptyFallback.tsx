"use client";

/**
 * Stage 4 L4-k — Empty Fallback
 *
 * 正本: layout plan v0.3 §7.11 / UI spec §5 各 S レイアウト
 *
 * 各 state × mode の empty 状態 (観測なし時)。S0 single-line 同様の minimal 表示。
 */

import type { PresenceMode, PresenceState } from "@/lib/coalter/presence/types";
import StateAriaWrapper from "./StateAriaWrapper";

const STATE_BRIEF: Record<PresenceState, string> = {
  S0: "見守り中",
  S1: "介入気配",
  S2: "発話中",
  S3: "返答待ち",
  S4: "理解更新中",
  S5: "発話中",
  S6: "提案準備中",
  S7: "発話中",
  S8: "クールダウン",
};

export interface StateEmptyFallbackProps {
  state: PresenceState;
  mode: PresenceMode;
}

export default function StateEmptyFallback({
  state,
  mode,
}: StateEmptyFallbackProps) {
  return (
    <StateAriaWrapper state={state} mode={mode}>
      <div
        data-testid="coalter-state-empty-fallback"
        style={{
          padding: "6px 12px",
          fontSize: 11,
          color: "#8888a0",
          background: "transparent",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ color: "#6366F1" }}>🔵</span>
        <span>CoAlter ● {STATE_BRIEF[state]}</span>
      </div>
    </StateAriaWrapper>
  );
}
