"use client";

/**
 * ModeReturn (L1-g)
 *
 * 正本: UI spec §6.5 通常モードへの復帰
 *
 * Daily/Travel から通常モードへの戻り経路は 2 つ:
 *   - §6.5.1 自然退出 (自動): プラン完成後、即時 fade
 *   - §6.5.2 手動復帰 (ユーザー操作): モード切替 chip [通常] tap
 *
 * 文脈継承: プラン結果 / 中間状態 → 共有メモリ surface
 * (v1.1 §10.3、詳細 UI は L1-h)
 *
 * 本 component は preview 静的視覚化。
 */

import { RETURN_PATHS } from "../mock/modeTransitions";

export default function ModeReturn() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#4a4a68" }}>
        通常モード復帰 (§6.5)：2 経路を分離視覚化
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {RETURN_PATHS.map((p) => (
          <div
            key={p.kind}
            style={{
              padding: "10px 12px",
              border: "1px solid #c8c8dc",
              borderRadius: 6,
              background: "#ffffff",
              fontSize: 12,
              color: "#1a1a2e",
              lineHeight: 1.6,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: p.kind === "natural" ? "#0EA5E9" : "#6366F1",
                marginBottom: 4,
                fontWeight: 600,
              }}
            >
              {p.kind === "natural" ? "◆ 自然退出 (自動)" : "◇ 手動復帰 (ユーザー操作)"}
            </div>
            <div style={{ marginBottom: 4 }}>{p.label}</div>
            <div style={{ fontSize: 11, color: "#4a4a68" }}>
              発動: {p.trigger}
            </div>
            <div style={{ fontSize: 11, color: "#4a4a68" }}>
              文脈継承: {p.contextInheritance}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
