"use client";

/**
 * Stage 4 L4-g — VisibilityControls (本番化、preview L1-h 移植)
 *
 * 正本: layout plan v0.3 §7.7 / UI spec §8.4.1 4 操作 / §8.4.1.1 意味境界
 *
 * 4 操作:
 *   - view (表示) / mute (自分の画面から外す) / share (相手にも見せる) / unshare (相手の可視範囲を下げる)
 *
 * §8.4.1.1 不可侵: 「削除」「忘却」「消去」語彙は使用禁止 (範囲越境防止)。
 * §8.4.3 トーン: view=neutral / mute=calm / share=neutral / unshare=retreat。
 *
 * 共有解除 (unshare) のみ 1 クッション確認 (§8.4.1.1 原則)。
 */

import { useState } from "react";

export type VisibilityOp = "view" | "mute" | "share" | "unshare";

const OP_LABELS: Record<VisibilityOp, string> = {
  view: "表示",
  mute: "自分の画面から外す",
  share: "相手にも見せる",
  unshare: "相手の可視範囲を下げる",
};

export interface VisibilityControlsProps {
  onOp: (op: VisibilityOp) => void;
  /** disabled なら button 全体非活性 */
  disabled?: boolean;
}

export default function VisibilityControls({
  onOp,
  disabled = false,
}: VisibilityControlsProps) {
  const [confirmingUnshare, setConfirmingUnshare] = useState(false);

  const handleClick = (op: VisibilityOp) => {
    if (disabled) return;
    if (op === "unshare" && !confirmingUnshare) {
      setConfirmingUnshare(true);
      return;
    }
    onOp(op);
    setConfirmingUnshare(false);
  };

  return (
    <div
      role="group"
      aria-label="CoAlter 可視性 4 操作"
      data-testid="coalter-visibility-controls"
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(Object.keys(OP_LABELS) as VisibilityOp[]).map((op) => (
          <button
            key={op}
            type="button"
            onClick={() => handleClick(op)}
            disabled={disabled}
            data-testid={`coalter-visibility-${op}`}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              background: "#ffffff",
              border: "1px solid #c8c8dc",
              color: "#1a1a2e",
              borderRadius: 4,
              cursor: disabled ? "default" : "pointer",
            }}
          >
            {OP_LABELS[op]}
          </button>
        ))}
      </div>
      {confirmingUnshare && (
        <div
          data-testid="coalter-visibility-unshare-confirm"
          style={{
            padding: "6px 10px",
            fontSize: 11,
            background: "#f5f6fa",
            border: "1px solid #c8c8dc",
            borderRadius: 4,
            display: "flex",
            justifyContent: "space-between",
            gap: 6,
            alignItems: "center",
          }}
        >
          <span style={{ color: "#4a4a68" }}>
            相手の可視範囲を下げます。続けますか？
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              type="button"
              onClick={() => handleClick("unshare")}
              style={{
                padding: "3px 8px",
                fontSize: 10,
                background: "#6366F1",
                color: "#ffffff",
                border: "none",
                borderRadius: 3,
                cursor: "pointer",
              }}
            >
              続ける
            </button>
            <button
              type="button"
              onClick={() => setConfirmingUnshare(false)}
              style={{
                padding: "3px 8px",
                fontSize: 10,
                background: "transparent",
                color: "#4a4a68",
                border: "1px solid #c8c8dc",
                borderRadius: 3,
                cursor: "pointer",
              }}
            >
              戻る
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
