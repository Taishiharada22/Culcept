"use client";

/**
 * Stage 4 L4-b/B-1 — S0 見守り中 のレイアウト (本番版)
 *
 * 正本: UI spec §5.3 / preview app/(dev)/coalter-preview/.../states/S0Observing.tsx
 *
 * 密度: single-line
 * 折りたたみ: 上部レイヤー全体最小化、発話本文カード・チップ類は全て非表示
 * 固定アンカー: 常設要素のみ (status + 本物の ModeSwitcher)、カード類一切出現しない
 *
 * B-1 で本番 mount。signal なしで初期 state = S0 のため、最初に visible になる
 * 状態。ModeSwitcher で mode 切替が動的反映される。
 */

import UpperLayerShell from "./UpperLayerShell";
import type { PresenceMode } from "@/lib/coalter/presence/types";

export interface S0ObservingProps {
  mode: PresenceMode;
  onSwitchMode: (target: PresenceMode) => void;
}

export default function S0Observing({
  mode,
  onSwitchMode,
}: S0ObservingProps) {
  return (
    <UpperLayerShell
      statusLabel="見守り中"
      density="single-line"
      mode={mode}
      onSwitchMode={onSwitchMode}
    />
  );
}
