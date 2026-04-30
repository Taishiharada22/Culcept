"use client";

/**
 * S4 — 理解更新中 のレイアウト (UI spec §5.7)
 *
 * 密度: single-line or compact-card (派手さ抑制)
 * 折りたたみ: 発話本文カードは fade out 途中、チップは既に消失
 * 固定アンカー: 発話本文カードは fade-out 中でも位置を動かさない（空間保持）
 *
 * 重要: S4 は Stage 1 Understand の生進捗バーではない（統合契約 §3.2 / §3.6）。
 *       本 component は UI 演出のみ、executor 進捗を直接購読しない。
 */

import UpperLayerShell from "../UpperLayerShell";

export default function S4Understanding({
  modeLabel = "通常",
}: {
  modeLabel?: "通常" | "Daily" | "Travel";
}) {
  return (
    <UpperLayerShell statusLabel="理解更新中" density="compact-card" modeLabel={modeLabel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            border: "1px dashed #c8c8dc",
            borderRadius: 6,
            padding: "10px 12px",
            background: "#ffffff",
            fontSize: 13,
            color: "#8888a0",
            textAlign: "center",
            opacity: 0.4,
          }}
          aria-label="発話本文カード（fade-out 中、位置保持）"
        >
          （発話本文 fade out）
        </div>
      </div>
    </UpperLayerShell>
  );
}
