"use client";

/**
 * S2 — 入口発話 のレイアウト (UI spec §5.5)
 *
 * 密度: compact-card (通常時) / expanded-card (状態優先切替時)
 * 折りたたみ: 常設要素 + 発話本文カード + 応答チップ (最大 2、横並び)
 * 固定アンカー: 発話本文カード = 全幅、応答チップ = 本文カード直下、横並び (最大 2)
 */

import UpperLayerShell from "../UpperLayerShell";
import Chip from "../Chip";

export default function S2Opening({
  modeLabel = "通常",
}: {
  modeLabel?: "通常" | "Daily" | "Travel";
}) {
  return (
    <UpperLayerShell statusLabel="発話中" density="compact-card" modeLabel={modeLabel}>
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
