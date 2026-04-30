"use client";

/**
 * InputBoundary (L1-j)
 *
 * 正本: UI spec §2.6 入力欄との競合境界
 *
 * 原則:
 *   - 入力欄は単一 (CoAlter で別々に持たない)
 *   - CoAlter 宛 routing は明示トリガー or 状態依存トリガー
 *   - routing 記法は本書では固定しない (interaction refinement で確定)
 *
 * 本書で固定:
 *   - 入力欄の個数: 1 個 (専用欄追加禁止)
 *   - CoAlter 宛入力中の視覚差別化: 必要 (形式は §9 保留)
 *
 * 構造的担保 (制約):
 *   - IME composition 中は signal 起動禁止
 *   - 入力中は CoAlter 自動発話を抑制
 *
 * §2.6 禁止:
 *   - CoAlter 専用の入力欄を別途追加 (単一原則)
 *   - CoAlter 宛入力中に視覚差別化なし (どちらに向けて書いてるか判別不能禁止)
 */

import { useState } from "react";

export default function InputBoundary() {
  const [text, setText] = useState("");
  const [isComposing, setIsComposing] = useState(false);

  // 暫定: prefix `@coalter ` を CoAlter 宛 trigger として例示扱い
  // (§2.6: 最終的な記法は interaction refinement で確定。本 demo は例示のみ)
  const isCoAlterAddressed = text.trim().startsWith("@coalter");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#4a4a68", lineHeight: 1.6 }}>
        §2.6 入力欄競合境界。入力欄は単一。CoAlter 宛 routing は明示トリガー /
        状態依存トリガー (記法は §9 保留、本 demo は <code>@coalter</code> prefix
        を例示扱いで使用)。IME composition 中は signal 起動を構造的に抑制。
      </div>

      <div
        style={{
          padding: 10,
          border: "1px solid #c8c8dc",
          borderRadius: 6,
          background: "#ffffff",
        }}
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          placeholder="ここに入力 (例: @coalter で話しかけると視覚差別化、IME 中は signal 起動なし)"
          style={{
            width: "100%",
            padding: "8px 12px",
            fontSize: 13,
            // §2.6: CoAlter 宛入力中の視覚差別化必要 → 枠と背景を変える
            border: isCoAlterAddressed
              ? "2px solid #6366F1"
              : "1px solid #c8c8dc",
            background: isCoAlterAddressed ? "#eef2ff" : "#ffffff",
            borderRadius: 4,
            outline: "none",
          }}
        />

        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "#4a4a68",
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <span>
            送信先:{" "}
            <strong style={{ color: isCoAlterAddressed ? "#6366F1" : "#1a1a2e" }}>
              {isCoAlterAddressed ? "CoAlter 宛" : "メインチャット (相手宛)"}
            </strong>
          </span>
          <span>
            IME composition:{" "}
            <strong style={{ color: isComposing ? "#0EA5E9" : "#4a4a68" }}>
              {isComposing ? "中 (signal 起動抑制)" : "なし"}
            </strong>
          </span>
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
        <div>· 入力欄は 1 個 (CoAlter 専用欄を追加しない)</div>
        <div>· CoAlter 宛入力中は枠 / 背景の視覚差別化を出す (どちらに向けて書いてるか判別可)</div>
        <div>· IME composition 中は signal 起動禁止 (構造的担保、test 必須)</div>
        <div>· routing 記法 (@coalter / mention / chip 起点) は将来の refinement で確定</div>
      </div>
    </div>
  );
}
