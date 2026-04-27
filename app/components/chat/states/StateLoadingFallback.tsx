"use client";

/**
 * Stage 4 L4-k — Loading Fallback
 *
 * 正本: layout plan v0.3 §7.11 / UI spec §1.5 アニメカテゴリ
 *
 * 各 state × mode の loading 状態。fade animation で控えめに表示。
 */

import type { PresenceMode, PresenceState } from "@/lib/coalter/presence/types";
import StateAriaWrapper from "./StateAriaWrapper";

export interface StateLoadingFallbackProps {
  state: PresenceState;
  mode: PresenceMode;
}

export default function StateLoadingFallback({
  state,
  mode,
}: StateLoadingFallbackProps) {
  return (
    <StateAriaWrapper state={state} mode={mode}>
      <div
        data-testid="coalter-state-loading-fallback"
        style={{
          padding: "8px 12px",
          background: "#ffffff",
          border: "1px dashed #c8c8dc",
          borderRadius: 6,
          fontSize: 11,
          color: "#8888a0",
          fontStyle: "italic",
          animation: "coalterLoadingFade 1.4s ease-in-out infinite alternate",
        }}
      >
        🔵 CoAlter 準備中…
      </div>
      <style>{`
        @keyframes coalterLoadingFade {
          from { opacity: 0.4; }
          to   { opacity: 1.0; }
        }
      `}</style>
    </StateAriaWrapper>
  );
}
