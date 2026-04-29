"use client";

/**
 * Stage 4 L4-b/B-1 — S8 クールダウン のレイアウト (本番版)
 *
 * 正本: UI spec §5.11 / preview app/(dev)/coalter-preview/.../states/S8Cooldown.tsx
 *
 * 密度: single-line (最小化)
 * 折りたたみ: 退出メッセージ 1 行表示後、ステータスのみ single-line に収束
 *             発話本文カード・チップ類は完全消失
 * 固定アンカー:
 *   - 退出メッセージ = 1 行のみ、ステータス位置に統合
 *   - 数秒後 single-line に収束、カード類完全消失
 *   - 高さは single-line に戻る (S0 と同じ骨格)
 *   - 警告色・叱責的アイコンへの変化禁止 (UI spec §6.8)
 */

import UpperLayerShell from "./UpperLayerShell";
import type { PresenceMode } from "@/lib/coalter/presence/types";

export interface S8CooldownProps {
  mode: PresenceMode;
  onSwitchMode: (target: PresenceMode) => void;
}

export default function S8Cooldown({
  mode,
  onSwitchMode,
}: S8CooldownProps) {
  return (
    <UpperLayerShell
      statusLabel="退出"
      density="single-line"
      mode={mode}
      onSwitchMode={onSwitchMode}
    />
  );
}
