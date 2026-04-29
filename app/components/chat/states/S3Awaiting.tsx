"use client";

/**
 * Stage 4 L4-b/B-1 — S3 返答待ち のレイアウト (本番版)
 *
 * 正本: UI spec §5.6 / preview app/(dev)/coalter-preview/.../states/S3Awaiting.tsx
 *
 * 密度: compact-card (S2 の残像維持)
 * 折りたたみ: 発話本文カードは「薄表示」(opacity 低下)、チップは前回のまま残る
 * 固定アンカー: S2 と同じレイアウト骨格 (要素位置を動かさない)
 */

import UpperLayerShell from "./UpperLayerShell";
import Chip from "./Chip";
import type { PresenceMode } from "@/lib/coalter/presence/types";

export interface S3AwaitingProps {
  mode: PresenceMode;
  onSwitchMode: (target: PresenceMode) => void;
}

export default function S3Awaiting({ mode, onSwitchMode }: S3AwaitingProps) {
  return (
    <UpperLayerShell
      statusLabel="返答待ち"
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
            opacity: 0.5,
          }}
          aria-label="発話本文カード（薄表示）"
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
