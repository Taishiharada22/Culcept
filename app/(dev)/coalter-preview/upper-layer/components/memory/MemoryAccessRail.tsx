"use client";

/**
 * MemoryAccessRail (L1-h)
 *
 * 正本: UI spec §8.2.2 アクセス導線
 *
 * 上部レイヤー右端の rail。「何を知っている？」系 tap で drawer 展開、
 * inline reference 表示。urgent 中は badge に縮退 (§8.6)。
 *
 * §8.2.2 原則:
 *   - 恒常表示の panel は常設要素 (§3) 扱い
 *   - drawer 展開はユーザー起動のみ (CoAlter 自動展開禁止)
 *   - inline reference は CoAlter が必要最小限で付与
 */

import { useState } from "react";
import { MEMORY_ITEMS } from "../../mock/memoryItems";

type FormKind = "panel" | "drawer" | "inline_reference" | "badge";

const FORM_LABELS: Record<FormKind, string> = {
  panel: "panel (恒常表示)",
  drawer: "drawer (明示展開)",
  inline_reference: "inline reference (発話埋め込み)",
  badge: "badge (urgent 中の縮退)",
};

export default function MemoryAccessRail() {
  const [active, setActive] = useState<FormKind>("panel");
  const visibleCount = MEMORY_ITEMS.filter(
    (i) => i.visibility !== "internal_only",
  ).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#4a4a68" }}>
        §8.2.2 アクセス導線：4 形態を切替 (panel / drawer / inline / badge)。
        drawer 展開はユーザー起動のみ (自動展開禁止)。
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(["panel", "drawer", "inline_reference", "badge"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setActive(f)}
            style={{
              padding: "6px 10px",
              fontSize: 11,
              border: "1px solid",
              borderColor: active === f ? "#6366F1" : "#c8c8dc",
              background: active === f ? "#eef2ff" : "#ffffff",
              color: "#1a1a2e",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {FORM_LABELS[f]}
          </button>
        ))}
      </div>

      <div
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
        {active === "panel" && (
          <div>
            <div style={{ fontSize: 11, color: "#4a4a68", marginBottom: 4 }}>
              恒常表示 — home sheet 内の常設ブロック
            </div>
            <div>共有メモリ {visibleCount} 件 (両者可視・片側可視の合計)</div>
          </div>
        )}
        {active === "drawer" && (
          <div>
            <div style={{ fontSize: 11, color: "#4a4a68", marginBottom: 4 }}>
              明示展開 — 「何を知っている？」tap で全項目閲覧
            </div>
            <div>drawer slide-in: ユーザー起動のみ (自動展開禁止)</div>
          </div>
        )}
        {active === "inline_reference" && (
          <div>
            <div style={{ fontSize: 11, color: "#4a4a68", marginBottom: 4 }}>
              inline reference — 発話 surface 内の引用 (1 発話 1 参照まで)
            </div>
            <div style={{ fontStyle: "italic", color: "#4a4a68" }}>
              {`> 共有メモリ「`}
              {MEMORY_ITEMS[0].body.slice(0, 28)}
              {`...」を参照`}
            </div>
          </div>
        )}
        {active === "badge" && (
          <div>
            <div style={{ fontSize: 11, color: "#4a4a68", marginBottom: 4 }}>
              urgent 中の縮退 — 件数のみの集約
            </div>
            <div>
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  background: "#f5f6fa",
                  border: "1px solid #c8c8dc",
                  borderRadius: 10,
                  fontSize: 11,
                  color: "#4a4a68",
                }}
              >
                memory {visibleCount}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
