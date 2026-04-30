"use client";

/**
 * AutoEscalationBanner (L1-g)
 *
 * 正本: UI spec §6.4 自動昇格の UI フロー (S5 状態優先切替時)
 *       §4.4 状態優先切替時の視覚キュー (pulse / urgent / expanded / chip 削減)
 *
 * S5 で介入価値閾値超過 + 長期構造化必要判定 → 通常 → Daily/Travel 自動昇格。
 *
 * 視覚キュー必須 (§4.4 / §6.4):
 *   - pulse アニメ 1 回 (枠強調)
 *   - トーン urgent (具体文面はテンプレ doc)
 *   - 密度 expanded-card
 *
 * §6.6.1 拒否可: 「通常に戻す」chip を併設。
 *
 * 本 component は preview 静的視覚化 (pulse は CSS keyframes 風、L1-j で
 * AnimationCatalog に集約予定)。
 */

import { useState } from "react";

export default function AutoEscalationBanner() {
  const [escalated, setEscalated] = useState<"normal" | "daily" | "travel">(
    "daily",
  );
  const [pulseKey, setPulseKey] = useState(0);

  const trigger = (target: "daily" | "travel") => {
    setEscalated(target);
    setPulseKey((k) => k + 1);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#4a4a68" }}>
        自動昇格 (§6.4)：S5 状態優先切替 + 長期構造化必要判定で発動。
        視覚キュー必須 (pulse / urgent / expanded / chip 削減)。
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={() => trigger("daily")}
          style={btn}
        >
          通常 → Daily 昇格を発動
        </button>
        <button
          type="button"
          onClick={() => trigger("travel")}
          style={btn}
        >
          通常 → Travel 昇格を発動
        </button>
      </div>

      {/* pulse 枠強調 (§4.4 / §1.5)。preview 用簡易表現 */}
      <div
        key={pulseKey}
        style={{
          padding: 12,
          border: "2px solid #6366F1",
          borderRadius: 8,
          background: "#f5f6fa",
          // 警告色 (赤・オレンジ) は §6.8 で禁止 — indigo 系で urgency を表現
          animation: "pulseFrame 0.6s ease-out 1",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span
            style={{
              padding: "2px 8px",
              fontSize: 11,
              background: "#6366F1",
              color: "#ffffff",
              borderRadius: 10,
              fontWeight: 600,
            }}
          >
            ● urgent
          </span>
          <span style={{ fontSize: 12, color: "#1a1a2e", fontWeight: 600 }}>
            通常 → {escalated === "daily" ? "Daily" : "Travel"} に切替えるね
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#4a4a68", lineHeight: 1.6 }}>
          {escalated === "daily"
            ? "今日の話で整理した方がよさそう"
            : "複数日で考えていきたいから"}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button
            type="button"
            onClick={() => setEscalated("normal")}
            style={{
              ...btn,
              padding: "4px 10px",
              fontSize: 11,
              background: "transparent",
              borderColor: "#c8c8dc",
              color: "#4a4a68",
            }}
            aria-label="モード昇格の拒否 (§6.6.1)"
          >
            通常に戻す
          </button>
          <span style={{ fontSize: 11, color: "#8888a0", alignSelf: "center" }}>
            (§6.6.1 モード昇格拒否、同セッションでは自動昇格再試行を抑制)
          </span>
        </div>
      </div>

      <style>{`
        @keyframes pulseFrame {
          0%   { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
          70%  { box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
          100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
        }
      `}</style>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 12,
  background: "#ffffff",
  border: "1px solid #c8c8dc",
  color: "#1a1a2e",
  borderRadius: 6,
  cursor: "pointer",
};
