"use client";

/**
 * ScrollSync (L1-j)
 *
 * 正本: UI spec §2.5 scroll (スクロール連動)
 *
 * 原則: CoAlter 上部レイヤーは pinned (スクロールしても常に上部に残る)。
 * 高さは状態で変わる (single-line / compact-card / expanded-card)。
 *
 * 振る舞い:
 *   - 状態変化で上部レイヤー高さが変わっても、メインチャット scroll 位置は維持
 *   - 新着メッセージへの auto-scroll は CoAlter 状態と独立
 *   - メインチャット側に上部レイヤー高さ分の safe-area padding 確保
 *     (実装詳細は §9 保留)
 */

import { useState } from "react";

const HEIGHT_BY_STATE: Record<string, number> = {
  "single-line": 36,
  "compact-card": 80,
  "expanded-card": 160,
};

export default function ScrollSync() {
  const [density, setDensity] = useState<keyof typeof HEIGHT_BY_STATE>(
    "compact-card",
  );
  const layerHeight = HEIGHT_BY_STATE[density];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#4a4a68", lineHeight: 1.6 }}>
        §2.5 scroll 連動 demo。CoAlter 高さを切替してもメインチャット scroll
        位置は維持される (mock では切替時にも要素が同じ位置に残る)。
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        {(Object.keys(HEIGHT_BY_STATE) as Array<keyof typeof HEIGHT_BY_STATE>).map(
          (d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDensity(d)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                border: "1px solid",
                borderColor: density === d ? "#6366F1" : "#c8c8dc",
                background: density === d ? "#eef2ff" : "#ffffff",
                color: "#1a1a2e",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              {d}
            </button>
          ),
        )}
      </div>

      <div
        style={{
          height: 240,
          border: "1px solid #c8c8dc",
          borderRadius: 6,
          overflow: "hidden",
          background: "#ffffff",
          position: "relative",
        }}
      >
        {/* pinned CoAlter 上部レイヤー */}
        <div
          style={{
            position: "sticky",
            top: 0,
            height: layerHeight,
            background: "#eef2ff",
            border: "0 0 1px 0 solid #c8c8dc",
            borderBottom: "1px solid #c8c8dc",
            padding: "0 12px",
            display: "flex",
            alignItems: "center",
            fontSize: 12,
            color: "#1a1a2e",
            transition: "height 0.3s ease",
            zIndex: 2,
          }}
        >
          🔵 CoAlter 上部レイヤー (pinned, density: {density}, height: {layerHeight}px)
        </div>

        {/* メインチャット (scroll する) */}
        <div
          style={{
            position: "absolute",
            top: layerHeight,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: "auto",
            padding: 12,
          }}
        >
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              style={{
                marginBottom: 8,
                padding: "6px 10px",
                background: i % 2 === 0 ? "#f5f6fa" : "#ffffff",
                border: "1px solid #e8e8ec",
                borderRadius: 6,
                fontSize: 12,
                color: "#1a1a2e",
              }}
            >
              {i % 2 === 0 ? "たいし" : "みさき"}: メッセージ {i + 1} (mock)
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: "8px 10px",
          background: "#f5f6fa",
          borderRadius: 6,
          fontSize: 11,
          color: "#4a4a68",
          lineHeight: 1.6,
        }}
      >
        <div>· CoAlter 上部レイヤーは pinned (sticky top: 0)</div>
        <div>· 高さ切替時もメインチャット scroll 位置は維持</div>
        <div>· auto-scroll は CoAlter 状態と独立</div>
      </div>
    </div>
  );
}
