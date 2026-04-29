"use client";

/**
 * Stage 4 L4-b/B-1 — UpperLayerShell (本番版)
 *
 * 正本: layout plan v0.3 §7.2 / Core UX v1.1 §3.1 / UI spec §5.2
 *
 * preview `app/(dev)/coalter-preview/upper-layer/components/UpperLayerShell.tsx`
 * を本番化:
 *   - preview の `modeLabel: string` static placeholder を **動的 ModeSwitcher**
 *     (本番 `app/components/chat/ModeSwitcher.tsx` を内蔵 mount) に置換
 *   - mode + onSwitchMode を props で受け取り、ModeSwitcher へ流す
 *   - Stage 4 L4-f の本番化を兼ねる (本 shell 内に ModeSwitcher を mount するため)
 *
 * 上部レイヤーの外枠 (常設要素 header + body slot) を提供。全 state (S0-S8) で
 * 共通の outer frame として機能。
 *
 * 不変原則:
 *   - status label + 本物の ModeSwitcher が常設要素として表示される (UI spec §5.2)
 *   - children は各 state component (S0Observing 等) が渡す body content
 *   - density で min-height を切替 (UI 詰め込み度)
 *   - "use client" directive 必須 (内部で本番 ModeSwitcher を mount)
 */

import type { ReactNode } from "react";

import ModeSwitcher from "@/app/components/chat/ModeSwitcher";
import type { PresenceMode } from "@/lib/coalter/presence/types";

const C = {
  bg: "#ffffff",
  frame: "#1a1a2e",
  frameSoft: "#c8c8dc",
  text: "#1a1a2e",
  textSoft: "#4a4a68",
  textMuted: "#8888a0",
  accent: "#6366F1",
} as const;

/**
 * Status label 列挙 (UI spec §5.2)。
 *
 * S0-S8 の 9 状態に対する mapping は `mapStateToStatusLabel` (本 module 末尾) で
 * encode。9 状態 → 7 label の写像 (S0/S1 = "見守り中", S2/S5/S7 = "発話中"
 * etc.) は preview state component の仕様を踏襲。
 */
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
  /** 現在 mode (本物の PresenceMode、ModeSwitcher の active 表示) */
  mode: PresenceMode;
  /** Mode 切替 callback (ModeSwitcher click → modeReducer dispatch) */
  onSwitchMode: (target: PresenceMode) => void;
  /** body slot — 各 state component が渡す content */
  children?: ReactNode;
}

/**
 * UI spec §3.1 の `🔵 CoAlter ● {status}` 常設要素 + 本物の ModeSwitcher + body slot。
 *
 * density に応じて min-height を切り替える:
 *   - single-line:    36px (status のみ)
 *   - compact-card:   80px (status + 1 chip 程度)
 *   - expanded-card:  160px (status + body card + chips)
 */
export default function UpperLayerShell({
  statusLabel,
  density,
  mode,
  onSwitchMode,
  children,
}: UpperLayerShellProps) {
  const minHeight =
    density === "single-line" ? 36 : density === "compact-card" ? 80 : 160;

  return (
    <section
      role="region"
      aria-label="CoAlter 上部レイヤー"
      data-testid="coalter-upper-layer-mount"
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
        maxWidth: 512,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* 常設要素 (UI spec §3.2): symbol + status label + 本物の ModeSwitcher */}
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
        <ModeSwitcher active={mode} onSwitch={onSwitchMode} />
      </header>

      {/* body slot — 各 state component が children として渡す */}
      {children && <div style={{ flex: 1 }}>{children}</div>}
    </section>
  );
}
