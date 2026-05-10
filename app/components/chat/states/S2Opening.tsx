"use client";

/**
 * Stage 4 L4-b/B-1 — S2 入口発話 のレイアウト (本番版)
 *
 * 正本: UI spec §5.5 / preview app/(dev)/coalter-preview/.../states/S2Opening.tsx
 *
 * 密度: compact-card (通常時) / expanded-card (状態優先切替時)
 * 折りたたみ: 常設要素 + 発話本文カード + 応答チップ (最大 2、横並び)
 * 固定アンカー: 発話本文カード = 全幅、応答チップ = 本文カード直下、横並び (最大 2)
 *
 * B-1 では visible にならない、B-2 で signal 接続後に S0→S1→S2 経路で visible。
 */

import UpperLayerShell from "./UpperLayerShell";
import Chip from "./Chip";
import type { PresenceMode } from "@/lib/coalter/presence/types";

export interface S2OpeningProps {
  mode: PresenceMode;
  onSwitchMode: (target: PresenceMode) => void;
  /**
   * L4-i Phase 1 (CEO 確定 2026-04-30): 動的 speech body。
   * undefined 時は既存 hardcoded fallback (Phase 1 default 挙動を維持)。
   */
  body?: string;
  /**
   * B-3 Phase 1 残作業 (CEO 確定 2026-05-09 Option A): response chip tap handler。
   * 指定時 Chip.onClick として 2 chip 共通 wire される。production usage では
   * UpperLayerMount が `exec.dispatch.presenceEvent({ type: "S2_ACCEPTED" })` を
   * bind したものを渡し、S2 → S3 transition を発火させる。
   * 未指定 (undefined) なら non-interactive (後方互換)。
   */
  onResponseTap?: () => void;
}

const S2_FALLBACK_BODY = "今、間に入れそう 〜";

export default function S2Opening({
  mode,
  onSwitchMode,
  body,
  onResponseTap,
}: S2OpeningProps) {
  const renderedBody = body ?? S2_FALLBACK_BODY;
  return (
    <UpperLayerShell
      statusLabel="発話中"
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
          }}
        >
          {renderedBody}
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
