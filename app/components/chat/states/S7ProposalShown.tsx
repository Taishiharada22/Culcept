"use client";

/**
 * Stage 4 L4-b/B-1 — S7 提案表示 のレイアウト (本番版)
 *
 * 正本: UI spec §5.10 / preview app/(dev)/coalter-preview/.../states/S7ProposalShown.tsx
 *
 * 密度: expanded-card
 * 折りたたみ: 発話本文カード = 提案 1 件で expanded、承認チップ 1 個 + 閉じる導線
 *             + 明示共有 tap (§2.7 handoff)
 * 固定アンカー:
 *   - 提案カード = 全幅、expanded-card
 *   - 承認チップ = 本文カード下、中央寄り 1 個固定
 *   - 閉じる導線 = 右肩固定
 *   - 「この提案をチャットに共有」tap = 承認チップの下段
 */

import UpperLayerShell from "./UpperLayerShell";
import Chip from "./Chip";
import type { PresenceMode } from "@/lib/coalter/presence/types";

export interface S7ProposalShownProps {
  mode: PresenceMode;
  onSwitchMode: (target: PresenceMode) => void;
  /**
   * L4-i Phase 1 (CEO 確定 2026-04-30): 動的 speech body。
   * undefined 時は既存 hardcoded fallback (Phase 1 default 挙動を維持)。
   */
  body?: string;
  /**
   * B-3 Phase 1 残作業 (CEO 確定 2026-05-09): approve / close chip tap handler。
   * UI spec §4.3.8 通り、approve (提案を受ける) と close (× 閉じる) の両者は
   * いずれも S8 退出のため同一 handler に wire する。production usage では
   * UpperLayerMount が `exec.dispatch.presenceEvent({ type: "S7_DONE" })` を
   * bind する。
   *
   * **scope 外**: 「この提案をチャットに共有」 (handoff) chip は §2.7 の明示
   * handoff 機構で別経路、本 phase では touch しない。
   */
  onResolveTap?: () => void;
}

const S7_FALLBACK_NODE = (
  <>
    <div style={{ fontWeight: 600, marginBottom: 4 }}>提案:</div>
    <div>〜</div>
    <div>〜</div>
  </>
);

export default function S7ProposalShown({
  mode,
  onSwitchMode,
  body,
  onResolveTap,
}: S7ProposalShownProps) {
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
          {body !== undefined ? <div>{body}</div> : S7_FALLBACK_NODE}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Chip variant="approve" onClick={onResolveTap}>
            提案を受ける
          </Chip>
          <Chip variant="close" onClick={onResolveTap}>
            × 閉じる
          </Chip>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Chip variant="response" ariaLabel="明示 handoff">
            この提案をチャットに共有
          </Chip>
        </div>
      </div>
    </UpperLayerShell>
  );
}
