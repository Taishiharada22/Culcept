"use client";

/**
 * Stage 4 L4-b/B-1 — S3 返答待ち のレイアウト (本番版)
 *
 * 正本: UI spec §5.6 / preview app/(dev)/coalter-preview/.../states/S3Awaiting.tsx
 *
 * 密度: compact-card (S2 の残像維持)
 * 折りたたみ: 発話本文カードは「薄表示」(opacity 低下)、チップは前回のまま残る
 * 固定アンカー: S2 と同じレイアウト骨格 (要素位置を動かさない)
 */

import UpperLayerShell from "./UpperLayerShell";
import Chip from "./Chip";
import type { PresenceMode } from "@/lib/coalter/presence/types";

export interface S3AwaitingProps {
  mode: PresenceMode;
  onSwitchMode: (target: PresenceMode) => void;
  /**
   * B-3 Phase 1 残作業 (CEO 確定 2026-05-09): response chip tap handler。
   * 指定時 Chip.onClick として 2 chip (S2 残像) 共通 wire される。production
   * usage では UpperLayerMount が
   * `exec.dispatch.presenceEvent({ type: "S3_RESPONSE" })` を bind したものを
   * 渡し、S3 → S4 transition を発火させる。未指定なら non-interactive。
   */
  onResponseTap?: () => void;
}

export default function S3Awaiting({
  mode,
  onSwitchMode,
  onResponseTap,
}: S3AwaitingProps) {
  return (
    <UpperLayerShell
      statusLabel="返答待ち"
      density="compact-card"
      mode={mode}
      onSwitchMode={onSwitchMode}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            border: "1px solid #c8c8dc",
            borderRadius: 6,
            padding: "10px 12px",
            background: "#ffffff",
            fontSize: 13,
            color: "#1a1a2e",
            opacity: 0.5,
          }}
          aria-label="発話本文カード（薄表示）"
        >
          今、間に入れそう 〜
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Chip variant="response" onClick={onResponseTap}>
            たいし: そうかも
          </Chip>
          <Chip variant="response" onClick={onResponseTap}>
            みさき: …
          </Chip>
        </div>
      </div>
    </UpperLayerShell>
  );
}
