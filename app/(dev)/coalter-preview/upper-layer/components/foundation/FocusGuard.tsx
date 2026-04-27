"use client";

/**
 * FocusGuard (L1-j)
 *
 * 正本: UI spec §2.4 focus (フォーカス競合)
 *
 * 原則: ユーザーの注意は原則メインチャット。CoAlter は脇から話す。
 *
 * 振る舞い:
 *   - 通常時 (S0, S8): focus はメインチャット入力欄に
 *   - 発話中 (S2, S5, S7): focus はメインチャット留まり、CoAlter chip は
 *     tap で応答可だが入力欄 focus を奪わない
 *   - 状態優先切替時 (pulse): 視覚注意のみ、focus trap 作らない
 *   - chip tap 時: 一時的に CoAlter focus → 応答後すぐメインチャットに戻す
 *
 * §2.4 禁止:
 *   - メインチャット入力欄から focus を奪う UI
 *   - focus trap (キーボードで CoAlter 内に閉じ込める)
 *   - 全画面オーバーレイ
 */

import { useRef, useState } from "react";

export default function FocusGuard() {
  const mainInputRef = useRef<HTMLInputElement>(null);
  const [chipTapped, setChipTapped] = useState<string | null>(null);

  const tapChip = (label: string) => {
    setChipTapped(label);
    // §2.4: chip tap 時は応答後すぐメインチャットに戻す
    setTimeout(() => {
      mainInputRef.current?.focus();
      setChipTapped(null);
    }, 600);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#4a4a68", lineHeight: 1.6 }}>
        §2.4 focus 競合制御。chip tap 後は 600ms でメインチャット入力欄に
        focus が自動で戻る (focus trap 禁止)。
      </div>

      <div
        style={{
          padding: 12,
          background: "#f5f6fa",
          border: "1px dashed #c8c8dc",
          borderRadius: 6,
          fontSize: 11,
          color: "#4a4a68",
          lineHeight: 1.6,
        }}
      >
        <div style={{ marginBottom: 8, fontWeight: 600, color: "#1a1a2e" }}>
          mock pair-chat scaffold:
        </div>

        {/* CoAlter 上部レイヤー (chip 群) */}
        <div
          style={{
            marginBottom: 10,
            padding: "8px 10px",
            background: "#ffffff",
            border: "1px solid #c8c8dc",
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: 11, color: "#4a4a68", marginBottom: 4 }}>
            🔵 CoAlter 上部レイヤー
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => tapChip("近い")}
              style={chipBtn}
            >
              近い
            </button>
            <button
              type="button"
              onClick={() => tapChip("少し違う")}
              style={chipBtn}
            >
              少し違う
            </button>
          </div>
          {chipTapped && (
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color: "#6366F1",
                fontStyle: "italic",
              }}
            >
              CoAlter focus 一時取得: {chipTapped} → 600ms 後にメインチャット復帰
            </div>
          )}
        </div>

        {/* メインチャット 入力欄 */}
        <div
          style={{
            padding: "8px 10px",
            background: "#ffffff",
            border: "1px solid #c8c8dc",
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: 11, color: "#4a4a68", marginBottom: 4 }}>
            メインチャット 入力欄 (focus 主たる住処)
          </div>
          <input
            ref={mainInputRef}
            type="text"
            placeholder="ここに入力..."
            style={{
              width: "100%",
              padding: "6px 10px",
              fontSize: 12,
              border: "1px solid #c8c8dc",
              borderRadius: 4,
              outline: "none",
            }}
            autoFocus
          />
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
        <div>· focus trap 禁止 (キーボードで CoAlter 内に閉じ込めない)</div>
        <div>· 全画面オーバーレイ禁止 (CoAlter がメインチャットを覆わない)</div>
        <div>· 状態優先切替時 (pulse) は視覚注意のみ。focus 奪取しない</div>
      </div>
    </div>
  );
}

const chipBtn: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 12,
  background: "#ffffff",
  border: "1px solid #c8c8dc",
  borderRadius: 14,
  color: "#1a1a2e",
  cursor: "pointer",
};
