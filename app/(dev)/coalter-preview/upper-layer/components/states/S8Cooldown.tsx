"use client";

/**
 * S8 — クールダウン のレイアウト (UI spec §5.11)
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

import UpperLayerShell from "../UpperLayerShell";

export default function S8Cooldown({
  modeLabel = "通常",
}: {
  modeLabel?: "通常" | "Daily" | "Travel";
}) {
  // preview では「退出メッセージあり」段階を表示。実 logic では数秒後に
  // ステータスを「見守り中（待機）」に収束させる (Stage 2 reducer 接続後)。
  return (
    <UpperLayerShell statusLabel="退出" density="single-line" modeLabel={modeLabel} />
  );
}
