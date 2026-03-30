"use client";

/**
 * RendezvousStateBadge
 * Small inline badge for candidate user state.
 * Light-mode: 透明感のある淡い色合い
 */

import type { RendezvousUserState } from "@/lib/rendezvous/types";

const STATE_CONFIG: Record<
  string,
  { label: string; bg: string; color: string; glow?: boolean }
> = {
  unseen: { label: "New", bg: "rgba(99,102,241,0.12)", color: "#6366F1", glow: true },
  seen: { label: "New", bg: "rgba(99,102,241,0.12)", color: "#6366F1" },
  liked: { label: "応答待ち", bg: "rgba(251,191,36,0.12)", color: "#D97706" },
  saved: { label: "保留中", bg: "rgba(139,92,246,0.12)", color: "#7C3AED" },
  chat_opened: { label: "Connected", bg: "rgba(52,211,153,0.12)", color: "#059669", glow: true },
  expired: { label: "期限切れ", bg: "rgba(148,163,184,0.08)", color: "#94A3B8" },
  passed: { label: "見送り済", bg: "rgba(148,163,184,0.08)", color: "#94A3B8" },
  muted: { label: "ミュート", bg: "rgba(148,163,184,0.08)", color: "#94A3B8" },
};

type Props = {
  state: RendezvousUserState | string;
};

export default function RendezvousStateBadge({ state }: Props) {
  const cfg = STATE_CONFIG[state] ?? {
    label: state,
    bg: "rgba(148,163,184,0.08)",
    color: "#94A3B8",
  };

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 7px",
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.4,
        color: cfg.color,
        background: cfg.bg,
        boxShadow: cfg.glow ? `0 0 8px ${cfg.color}22` : "none",
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}
