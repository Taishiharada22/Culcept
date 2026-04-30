"use client";

/**
 * S1 — 介入気配 のレイアウト (UI spec §5.4)
 *
 * 密度: compact-card (status chip 1 個分の最小展開)
 * 折りたたみ: 常設要素 + status chip 1 個。発話本文カードは未出現
 * 固定アンカー: status chip は常設要素直下、1 個のみ、中央または左寄せ
 */

import UpperLayerShell from "../UpperLayerShell";
import Chip from "../Chip";

export default function S1Approaching({
  modeLabel = "通常",
}: {
  modeLabel?: "通常" | "Daily" | "Travel";
}) {
  return (
    <UpperLayerShell statusLabel="見守り中" density="compact-card" modeLabel={modeLabel}>
      <div style={{ display: "flex", justifyContent: "flex-start", paddingTop: 4 }}>
        <Chip variant="status">少し整理できそう</Chip>
      </div>
    </UpperLayerShell>
  );
}
