"use client";

/**
 * Stage 4 L4-b/B-1 — S5 橋渡し中 のレイアウト (本番版)
 *
 * 正本: UI spec §5.8 / preview app/(dev)/coalter-preview/.../states/S5Bridging.tsx
 *
 * 密度: expanded-card
 * 折りたたみ: 常設 + 発話本文カード + 応答チップ (最大 3) + 閉じる導線 (右肩)
 * 固定アンカー:
 *   - 発話本文カード = 全幅、常設要素直下
 *   - 応答チップ = 本文カード直下、横並び (最大 3)
 *   - 閉じる導線 = 右肩固定
 *   - 片側フォーカス導線 (D パターン時) = 応答チップ行 or 下段 (Travel では下段降格)
 */

import UpperLayerShell from "./UpperLayerShell";
import Chip from "./Chip";
import type { PresenceMode } from "@/lib/coalter/presence/types";

export interface S5BridgingProps {
  mode: PresenceMode;
  onSwitchMode: (target: PresenceMode) => void;
}

export default function S5Bridging({ mode, onSwitchMode }: S5BridgingProps) {
  return (
    <UpperLayerShell
      statusLabel="発話中"
      density="expanded-card"
      mode={mode}
      onSwitchMode={onSwitchMode}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            border: "1px solid #c8c8dc",
            borderRadius: 6,
            padding: "12px 14px",
            background: "#ffffff",
            fontSize: 13,
            color: "#1a1a2e",
            lineHeight: 1.6,
          }}
        >
          たいしさんは〜
          <br />
          みさきさんは〜
          <br />
          少し整理しながら話す？
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Chip variant="response">近い</Chip>
            <Chip variant="response">少し違う</Chip>
            <Chip variant="response">続けて</Chip>
          </div>
          <Chip variant="close">いったん戻る</Chip>
        </div>
      </div>
    </UpperLayerShell>
  );
}
