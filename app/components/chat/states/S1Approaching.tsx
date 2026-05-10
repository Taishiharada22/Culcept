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
 *
 * B-2 残作業 (CEO 確定 2026-05-09、Stage 2.4-B Gap 2 blocker 解消):
 *   - status chip tap で S1_ENTRY_OK を dispatch する経路を production に接続。
 *   - onChipTap prop を受け取り、Chip の onClick にそのまま渡すだけの最小配線。
 *   - 未指定 (`undefined`) なら従来通り cursor "default" の non-interactive 表示
 *     (test / 単体使用での後方互換)。
 *   - 既存 dev preview (`app/(dev)/coalter-preview/full/page.tsx:174`) は
 *     `exec.dispatch.presenceEvent({ type: "S1_ENTRY_OK" })` を直接 button に
 *     wire していた。production 側は S1Approaching → Chip.onClick 経由で同じ
 *     dispatch を流す。
 */

import UpperLayerShell from "./UpperLayerShell";
import Chip from "./Chip";
import type { PresenceMode } from "@/lib/coalter/presence/types";

export interface S1ApproachingProps {
  mode: PresenceMode;
  onSwitchMode: (target: PresenceMode) => void;
  /**
   * status chip tap handler。指定時 Chip.onClick として渡される。
   * 通常 production usage では UpperLayerMount が
   * `exec.dispatch.presenceEvent({ type: "S1_ENTRY_OK" })` を bind したものを渡す
   * (CEO 確定 2026-05-09 B-2 残作業)。未指定 (undefined) なら non-interactive。
   */
  onChipTap?: () => void;
}

export default function S1Approaching({
  mode,
  onSwitchMode,
  onChipTap,
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
        <Chip variant="status" onClick={onChipTap}>
          少し整理できそう
        </Chip>
      </div>
    </UpperLayerShell>
  );
}
