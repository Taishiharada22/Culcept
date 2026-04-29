"use client";

/**
 * Stage 4 L4-b/B-1 — S6 提案可能 のレイアウト (本番版)
 *
 * 正本: UI spec §5.9 / preview app/(dev)/coalter-preview/.../states/S6ReadyForProposal.tsx
 *
 * 密度: compact-card (3 ボタン縦並び)
 * 折りたたみ: 発話本文カードは S5 の残像として薄表示、応答チップ完全消失、
 *             提案導線 3 ボタン縦並びに置換
 * 固定アンカー:
 *   - 発話本文カード = 薄表示で位置・サイズ維持 (S5 の残像)
 *   - 提案導線 3 ボタン = 中央縦並び、等幅
 *   - 応答チップ = 消失、新規追加禁止 (3 択以外の UI を出さない)
 */

import UpperLayerShell from "./UpperLayerShell";
import Chip from "./Chip";
import type { PresenceMode } from "@/lib/coalter/presence/types";

export interface S6ReadyForProposalProps {
  mode: PresenceMode;
  onSwitchMode: (target: PresenceMode) => void;
}

export default function S6ReadyForProposal({
  mode,
  onSwitchMode,
}: S6ReadyForProposalProps) {
  return (
    <UpperLayerShell
      statusLabel="提案準備中"
      density="expanded-card"
      mode={mode}
      onSwitchMode={onSwitchMode}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            border: "1px dashed #c8c8dc",
            borderRadius: 6,
            padding: "10px 12px",
            background: "#ffffff",
            fontSize: 13,
            color: "#1a1a2e",
            opacity: 0.4,
          }}
          aria-label="発話本文カード（S5 残像、薄表示）"
        >
          〜
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "center",
          }}
        >
          <Chip variant="action">提案を聞く</Chip>
          <Chip variant="action">もう少し整理する</Chip>
          <Chip variant="action">今はここまでにする</Chip>
        </div>
      </div>
    </UpperLayerShell>
  );
}
