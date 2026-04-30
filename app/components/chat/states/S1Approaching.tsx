"use client";

/**
 * Stage 4 L4-b/B-1 — S1 介入気配 のレイアウト (本番版)
 *
 * 正本: UI spec §5.4 / preview app/(dev)/coalter-preview/.../states/S1Approaching.tsx
 *
 * 密度: compact-card (status chip 1 個分の最小展開)
 * 折りたたみ: 常設要素 + status chip 1 個。発話本文カードは未出現
 * 固定アンカー: status chip は常設要素直下、1 個のみ、中央または左寄せ
 *
 * B-1 では visible にならない (signal なしで S0 固定)、B-2 で signal 接続後に visible。
 */

import UpperLayerShell from "./UpperLayerShell";
import Chip from "./Chip";
import type { PresenceMode } from "@/lib/coalter/presence/types";

export interface S1ApproachingProps {
  mode: PresenceMode;
  onSwitchMode: (target: PresenceMode) => void;
}

export default function S1Approaching({
  mode,
  onSwitchMode,
}: S1ApproachingProps) {
  return (
    <UpperLayerShell
      statusLabel="見守り中"
      density="compact-card"
      mode={mode}
      onSwitchMode={onSwitchMode}
    >
      <div
        style={{ display: "flex", justifyContent: "flex-start", paddingTop: 4 }}
      >
        <Chip variant="status">少し整理できそう</Chip>
      </div>
    </UpperLayerShell>
  );
}
