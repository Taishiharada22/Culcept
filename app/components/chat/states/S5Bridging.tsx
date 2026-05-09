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
  /**
   * L4-i Phase 1 (CEO 確定 2026-04-30): 動的 speech body。
   * undefined 時は既存 hardcoded fallback (Phase 1 default 挙動を維持)。
   */
  body?: string;
  /**
   * B-3 Phase 1 残作業 (CEO 確定 2026-05-09): response chip tap handler。
   * 指定時 3 chip (近い / 少し違う / 続けて) 共通 wire される。production usage
   * では UpperLayerMount が `exec.dispatch.presenceEvent({ type: "S5_DONE" })`
   * を bind したものを渡し、S5 → S6 transition を発火させる。
   */
  onResponseTap?: () => void;
  /**
   * B-3 Phase 1 残作業 (CEO 確定 2026-05-09): close chip tap handler (いったん戻る)。
   * 指定時 close chip の onClick として wire される。production usage では
   * UpperLayerMount が `exec.dispatch.presenceEvent({ type: "S5_DIRECT_EXIT" })`
   * を bind したものを渡し、S5 → S8 transition を発火させる。
   */
  onCloseTap?: () => void;
}

const S5_FALLBACK_NODE = (
  <>
    たいしさんは〜
    <br />
    みさきさんは〜
    <br />
    少し整理しながら話す？
  </>
);

export default function S5Bridging({
  mode,
  onSwitchMode,
  body,
  onResponseTap,
  onCloseTap,
}: S5BridgingProps) {
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
          {body ?? S5_FALLBACK_NODE}
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
            <Chip variant="response" onClick={onResponseTap}>
              近い
            </Chip>
            <Chip variant="response" onClick={onResponseTap}>
              少し違う
            </Chip>
            <Chip variant="response" onClick={onResponseTap}>
              続けて
            </Chip>
          </div>
          <Chip variant="close" onClick={onCloseTap}>
            いったん戻る
          </Chip>
        </div>
      </div>
    </UpperLayerShell>
  );
}
