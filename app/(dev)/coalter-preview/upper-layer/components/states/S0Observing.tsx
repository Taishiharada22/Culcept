"use client";

/**
 * S0 — 見守り中 のレイアウト (UI spec §5.3)
 *
 * 密度: single-line
 * 折りたたみ: 上部レイヤー全体最小化、発話本文カード・チップ類は全て非表示
 * 固定アンカー: 常設要素のみ（status + mode switcher）、カード類一切出現しない
 */

import UpperLayerShell from "../UpperLayerShell";

export default function S0Observing({
  modeLabel = "通常",
}: {
  modeLabel?: "通常" | "Daily" | "Travel";
}) {
  return (
    <UpperLayerShell statusLabel="見守り中" density="single-line" modeLabel={modeLabel} />
  );
}
