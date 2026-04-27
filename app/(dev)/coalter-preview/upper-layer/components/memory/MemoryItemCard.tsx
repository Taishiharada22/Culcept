"use client";

/**
 * MemoryItemCard (L1-h)
 *
 * 正本: UI spec §8.3.2 視覚記号型 / §8.3.3 ラベル階層 / §8.3.4 有効組み合わせ制約
 *
 * 個別 memory 項目の card。3 軸ラベル (由来 / 確定度 / 可視性) を独立に描画する。
 *
 * §8.3.2 視覚型:
 *   - 由来  : 形 (アイコン、色ではなく)、左端
 *   - 確定度 : 線種・枠 (主) + 透明度 (補助)、項目全体
 *   - 可視性 : 文言ミニラベル、右上
 *
 * §8.3.4 禁止: isForbiddenCombination が true のものは描画自体を拒否
 * (構造的 enforce、UI で生成されない)
 */

import {
  type MemoryItem,
  SOURCE_GLYPHS,
  SOURCE_LABELS,
  CONFIDENCE_LABELS,
  VISIBILITY_LABELS,
  isForbiddenCombination,
} from "../../mock/memoryItems";

const CONF_FRAME: Record<
  MemoryItem["confidence"],
  { border: string; opacity: number; tag: string }
> = {
  high: { border: "1px solid #1a1a2e", opacity: 1, tag: "" },
  medium: { border: "1px dashed #4a4a68", opacity: 0.85, tag: "" },
  // §8.3.2 透明度単独禁止 → ghost 線 + 補助ラベル
  low: { border: "1px dotted #8888a0", opacity: 0.7, tag: " (推定中)" },
};

export default function MemoryItemCard({ item }: { item: MemoryItem }) {
  // §8.3.4 構造的 enforce: 禁止組み合わせは描画しない
  if (isForbiddenCombination(item.source, item.confidence, item.visibility)) {
    return null;
  }

  const frame = CONF_FRAME[item.confidence];
  const isSideOnly =
    item.visibility === "user_a_only" || item.visibility === "user_b_only";

  return (
    <div
      style={{
        position: "relative",
        padding: "10px 12px",
        background: "#ffffff",
        border: frame.border,
        borderRadius: 6,
        opacity: frame.opacity,
        display: "flex",
        gap: 10,
      }}
      aria-label={`memory item: ${SOURCE_LABELS[item.source]} / ${CONFIDENCE_LABELS[item.confidence]} / ${VISIBILITY_LABELS[item.visibility]}`}
    >
      {/* 由来: 形 (アイコン) のみ、色ではない (§8.3.2) */}
      <div
        style={{
          fontSize: 16,
          color: "#4a4a68",
          minWidth: 18,
          textAlign: "center",
        }}
        aria-label={`由来: ${SOURCE_LABELS[item.source]}`}
      >
        {SOURCE_GLYPHS[item.source]}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 12, color: "#1a1a2e", lineHeight: 1.6 }}>
          {item.body}
        </div>
        <div style={{ display: "flex", gap: 10, fontSize: 10, color: "#8888a0" }}>
          <span>由来: {SOURCE_LABELS[item.source]}</span>
          <span>
            確定度: {CONFIDENCE_LABELS[item.confidence]}
            {frame.tag}
          </span>
          <span>{item.recordedAt}</span>
          {item.expiresAt && (
            <span style={{ fontStyle: "italic" }}>
              自動消滅: {item.expiresAt}
            </span>
          )}
        </div>
      </div>

      {/* 可視性: 文言ミニラベル、右上 (§8.3.2) */}
      <div
        style={{
          alignSelf: "flex-start",
          fontSize: 10,
          color: isSideOnly ? "#0369a1" : "#4a4a68",
          background: isSideOnly ? "#f0f9ff" : "#f5f6fa",
          padding: "2px 6px",
          borderRadius: 10,
          whiteSpace: "nowrap",
          border:
            item.visibility === "internal_only"
              ? "1px dashed #c8c8dc"
              : "1px solid #e8e8ec",
          fontStyle: item.visibility === "internal_only" ? "italic" : "normal",
        }}
        aria-label={`可視性: ${VISIBILITY_LABELS[item.visibility]}`}
      >
        {VISIBILITY_LABELS[item.visibility]}
      </div>
    </div>
  );
}
