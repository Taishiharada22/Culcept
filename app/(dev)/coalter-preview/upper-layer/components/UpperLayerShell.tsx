"use client";

/**
 * CoAlter Stage 1 上部レイヤー preview — UpperLayerShell
 *
 * 正本: layout plan v0.2 §4.2 / Core UX v1.1 §3.1 / UI spec §5.2
 *
 * 上部レイヤーの外枠 (╔═╗ ║ ╚═╝) を React 静的に翻訳する。
 * 全 state (S0-S8) で共通の outer frame として機能。
 *
 * UI spec §5.2 共通規約:
 *   - 表示名 placeholder: たいし / みさき
 *   - 常設要素: status label + mode switcher placeholder
 *   - density: single-line / compact-card / expanded-card
 *
 * 本 component は scaffold (静的 React)。実機 logic は Stage 2 reducer 接続。
 */

import type { ReactNode } from "react";

const C = {
  bg: "#ffffff",
  frame: "#1a1a2e",
  frameSoft: "#c8c8dc",
  text: "#1a1a2e",
  textSoft: "#4a4a68",
  textMuted: "#8888a0",
  accent: "#6366F1",
  modeChipBg: "#f5f6fa",
  modeChipBorder: "#e8e8ec",
} as const;

export type UpperLayerStatusLabel =
  | "見守り中"
  | "発話中"
  | "返答待ち"
  | "理解更新中"
  | "提案準備中"
  | "退出"
  | "クールダウン";

export type UpperLayerDensity = "single-line" | "compact-card" | "expanded-card";

export interface UpperLayerShellProps {
  statusLabel: UpperLayerStatusLabel;
  density: UpperLayerDensity;
  /** 現在 mount 中の Mode 表示 (preview のみ、Stage 2 reducer 接続前) */
  modeLabel?: "通常" | "Daily" | "Travel";
  children?: ReactNode;
}

/**
 * UI spec §3.1 の `🔵 CoAlter ● {status}` 常設要素 + mode switcher placeholder + body slot。
 *
 * density に応じて min-height を切り替える:
 *   - single-line:    36px (status のみ)
 *   - compact-card:   80px (status + 1 chip 程度)
 *   - expanded-card:  160px (status + body card + chips)
 */
export default function UpperLayerShell({
  statusLabel,
  density,
  modeLabel = "通常",
  children,
}: UpperLayerShellProps) {
  const minHeight =
    density === "single-line" ? 36 : density === "compact-card" ? 80 : 160;

  return (
    <section
      role="region"
      aria-label="CoAlter 上部レイヤー"
      style={{
        background: C.bg,
        border: `2px solid ${C.frame}`,
        borderRadius: 8,
        padding: "10px 14px",
        minHeight,
        display: "flex",
        flexDirection: "column",
        gap: density === "single-line" ? 0 : 8,
        position: "relative",
      }}
    >
      {/* 常設要素 (UI spec §3.2): symbol + status label + mode switcher placeholder */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          fontSize: 13,
          color: C.text,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: C.accent, fontSize: 14 }}>🔵</span>
          <span style={{ fontWeight: 600 }}>CoAlter</span>
          <span style={{ color: C.textSoft }}>●</span>
          <span style={{ color: C.textSoft }}>{statusLabel}</span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 4,
            fontSize: 11,
            color: C.textMuted,
          }}
          aria-label="mode switcher placeholder"
        >
          {(["通常", "Daily", "Travel"] as const).map((m) => (
            <span
              key={m}
              style={{
                padding: "2px 8px",
                background: m === modeLabel ? C.accent : C.modeChipBg,
                color: m === modeLabel ? "#ffffff" : C.textMuted,
                border: `1px solid ${m === modeLabel ? C.accent : C.modeChipBorder}`,
                borderRadius: 4,
              }}
            >
              {m}
            </span>
          ))}
        </div>
      </header>

      {/* body slot — 各 state component が children として渡す */}
      {children && <div style={{ flex: 1 }}>{children}</div>}
    </section>
  );
}
