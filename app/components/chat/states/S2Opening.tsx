"use client";

/**
 * Stage 4 L4-b/B-1 — S2 入口発話 のレイアウト (本番版)
 *
 * 正本: UI spec §5.5 / preview app/(dev)/coalter-preview/.../states/S2Opening.tsx
 *
 * 密度: compact-card (通常時) / expanded-card (状態優先切替時)
 * 折りたたみ: 常設要素 + 発話本文カード + 応答チップ (最大 2、横並び)
 * 固定アンカー: 発話本文カード = 全幅、応答チップ = 本文カード直下、横並び (最大 2)
 *
 * B-1 では visible にならない、B-2 で signal 接続後に S0→S1→S2 経路で visible。
 */

import UpperLayerShell from "./UpperLayerShell";
import Chip from "./Chip";
import type { PresenceMode } from "@/lib/coalter/presence/types";

export interface S2OpeningProps {
  mode: PresenceMode;
  onSwitchMode: (target: PresenceMode) => void;
}

export default function S2Opening({ mode, onSwitchMode }: S2OpeningProps) {
  return (
    <UpperLayerShell
      statusLabel="発話中"
      density="compact-card"
      mode={mode}
      onSwitchMode={onSwitchMode}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            border: "1px solid #c8c8dc",
            borderRadius: 6,
            padding: "10px 12px",
            background: "#ffffff",
            fontSize: 13,
            color: "#1a1a2e",
          }}
        >
          今、間に入れそう 〜
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Chip variant="response">たいし: そうかも</Chip>
          <Chip variant="response">みさき: …</Chip>
        </div>
      </div>
    </UpperLayerShell>
  );
}
