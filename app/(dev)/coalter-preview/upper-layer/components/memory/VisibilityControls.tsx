"use client";

/**
 * VisibilityControls (L1-h)
 *
 * 正本: UI spec §8.4.1 4 つの操作 / §8.4.1.1 操作の意味境界 (誤読防止)
 *       §8.4.3 操作フィードバックのトーン
 *
 * 4 操作: 表示 (閲覧) / 隠す (mute) / 明示共有 (share) / 共有解除 (unshare)
 *
 * §8.4.1.1 意味境界:
 *   - 隠す ≠ 削除 ≠ 忘却 — 自分の画面から外すだけ
 *   - 共有解除 ≠ 削除 — 相手の可視性を下げるだけ
 *   - 「削除」「忘却」「消去」の語彙は本 UI で使用禁止
 *
 * §8.4.3 トーン:
 *   - 表示: neutral / 隠す: calm / 明示共有: neutral / 共有解除: retreat
 *   - urgent 採用禁止 (どの操作も緊急ではない)
 *   - 解除操作後の追加挽留発話禁止
 *
 * 共有解除のみ 1 クッション確認 (§8.4.1.1 原則)
 */

import { useState } from "react";

type OpKey = "view" | "mute" | "share" | "unshare";

interface OpConfig {
  key: OpKey;
  label: string;
  meaning: string;
  toneHint: string;
}

const OPERATIONS: ReadonlyArray<OpConfig> = [
  {
    key: "view",
    label: "表示",
    meaning: "通常通り見る (default)",
    toneHint: "neutral",
  },
  {
    key: "mute",
    label: "自分の画面から外す",
    meaning: "自分の画面からのみ非表示化 (CoAlter 内部・相手画面には影響なし)",
    toneHint: "calm",
  },
  {
    key: "share",
    label: "相手にも見せる",
    meaning: "片側可視 → 両者可視に昇格",
    toneHint: "neutral",
  },
  {
    key: "unshare",
    label: "相手の可視範囲を下げる",
    meaning: "両者可視 → 片側可視 / 内部のみに降格 (1 クッション確認あり)",
    toneHint: "retreat",
  },
];

export default function VisibilityControls() {
  const [lastOp, setLastOp] = useState<OpKey | null>(null);
  const [confirmingUnshare, setConfirmingUnshare] = useState(false);

  const handleOp = (op: OpKey) => {
    if (op === "unshare" && !confirmingUnshare) {
      setConfirmingUnshare(true);
      return;
    }
    setLastOp(op);
    setConfirmingUnshare(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#4a4a68", lineHeight: 1.6 }}>
        §8.4.1 4 操作。「削除」「忘却」「消去」の語彙は範囲を越えるため不使用。
        共有解除のみ 1 クッション確認を挟む (§8.4.1.1 原則)。
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {OPERATIONS.map((op) => (
          <button
            key={op.key}
            type="button"
            onClick={() => handleOp(op.key)}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              border: "1px solid",
              borderColor: lastOp === op.key ? "#6366F1" : "#c8c8dc",
              background: lastOp === op.key ? "#eef2ff" : "#ffffff",
              color: "#1a1a2e",
              borderRadius: 6,
              cursor: "pointer",
            }}
            title={op.meaning}
          >
            {op.label}
          </button>
        ))}
      </div>

      {confirmingUnshare && (
        <div
          style={{
            padding: "8px 10px",
            background: "#f5f6fa",
            border: "1px solid #c8c8dc",
            borderRadius: 6,
            fontSize: 11,
            color: "#4a4a68",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          {/* §8.4.2 禁止: 警告文・心理的障壁文言 → calm に整える */}
          <span>相手の可視範囲を下げます。続けますか？</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => handleOp("unshare")}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                background: "#6366F1",
                border: "1px solid #6366F1",
                color: "#ffffff",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              続ける
            </button>
            <button
              type="button"
              onClick={() => setConfirmingUnshare(false)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                background: "transparent",
                border: "1px solid #c8c8dc",
                color: "#4a4a68",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              戻る
            </button>
          </div>
        </div>
      )}

      {lastOp && (
        <div
          style={{
            fontSize: 11,
            color: "#8888a0",
            fontStyle: "italic",
          }}
          aria-label={`最後の操作: ${lastOp} (tone: ${OPERATIONS.find((o) => o.key === lastOp)?.toneHint})`}
        >
          直前の操作: {OPERATIONS.find((o) => o.key === lastOp)?.label} (
          tone: {OPERATIONS.find((o) => o.key === lastOp)?.toneHint})
          {/* §8.4.3 解除後の追加挽留発話を出さない */}
        </div>
      )}

      <div
        style={{
          marginTop: 4,
          padding: "8px 10px",
          background: "#f5f6fa",
          borderRadius: 6,
          fontSize: 11,
          color: "#4a4a68",
          lineHeight: 1.6,
        }}
        aria-label="操作の意味境界 (§8.4.1.1)"
      >
        <div>· 自分の画面から外す = 自分の画面のみ。CoAlter 内部・相手画面に影響なし</div>
        <div>· 共有解除 = 相手の可視性を下げるだけ。削除ではない</div>
        <div>· 真の削除 / 忘却は §8 スコープ外 (実装側別経路)</div>
      </div>
    </div>
  );
}
