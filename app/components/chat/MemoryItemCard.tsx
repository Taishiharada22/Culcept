"use client";

/**
 * Stage 4 L4-g — MemoryItemCard (本番化、preview L1-h 移植)
 *
 * 正本: layout plan v0.3 §7.7 / UI spec §8.3.2 視覚記号 / §8.3.3 ラベル階層 / §8.3.4 禁止組合せ
 *
 * 3 軸ラベル (由来 / 確定度 / 可視性) を独立に描画。§8.3.4 禁止組合せは
 * `isForbiddenCombination` で構造的に reject (描画自体しない)。
 */

import {
  isForbiddenCombination,
} from "@/lib/coalter/presence/memoryConstraints";
import {
  ORIGIN_SHAPE,
  CERTAINTY_VISUAL,
  VISIBILITY_LABEL,
} from "@/lib/coalter/presence/memoryVisualType";
import { resolveLabelDisplay } from "@/lib/coalter/presence/memoryLabelHierarchy";
import type { MemoryItem } from "@/lib/coalter/presence/memoryTypes";

const ORIGIN_GLYPH: Record<keyof typeof ORIGIN_SHAPE, string> = {
  explicit_shared: "◇",
  inferred: "◯",
  transient_summary: "△",
};

const VISIBILITY_TEXT: Record<keyof typeof VISIBILITY_LABEL, string> = {
  both_visible: "両者に見えています",
  user_a_only: "あなたにだけ見えています (A)",
  user_b_only: "あなたにだけ見えています (B)",
  internal_only: "CoAlter 内部のみ",
};

export interface MemoryItemCardProps {
  item: MemoryItem;
}

export default function MemoryItemCard({ item }: MemoryItemCardProps) {
  // §8.3.4 構造的 enforce: 禁止組み合わせは描画自体しない
  if (isForbiddenCombination(item.origin, item.certainty, item.visibility)) {
    return null;
  }

  const display = resolveLabelDisplay(item.origin, item.certainty, item.visibility);
  const certainty = CERTAINTY_VISUAL[item.certainty];
  const isSideOnly =
    item.visibility === "user_a_only" || item.visibility === "user_b_only";

  return (
    <div
      data-testid="coalter-memory-item-card"
      data-origin={item.origin}
      data-certainty={item.certainty}
      data-visibility={item.visibility}
      style={{
        position: "relative",
        padding: "10px 12px",
        background: "#ffffff",
        border: certainty.borderStyle === "solid"
          ? "1px solid #1a1a2e"
          : certainty.borderStyle === "dashed"
            ? "1px dashed #4a4a68"
            : "1px dotted #8888a0",
        borderRadius: 6,
        opacity: certainty.opacity,
        display: "flex",
        gap: 10,
      }}
    >
      {/* 由来: 形 (アイコン)、色なし */}
      {display.showOrigin && (
        <div
          style={{ fontSize: 16, color: "#4a4a68", minWidth: 18, textAlign: "center" }}
          aria-label={`由来: ${item.origin}`}
        >
          {ORIGIN_GLYPH[item.origin]}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 12, color: "#1a1a2e", lineHeight: 1.6 }}>
          {item.content}
        </div>
        {(display.showCertainty || certainty.auxLabel) && (
          <div style={{ fontSize: 10, color: "#8888a0" }}>
            確定度: {item.certainty}{certainty.auxLabel ?? ""}
          </div>
        )}
      </div>

      {display.showVisibility && (
        <div
          style={{
            alignSelf: "flex-start",
            fontSize: 10,
            color: isSideOnly ? "#0369a1" : "#4a4a68",
            background: isSideOnly ? "#f0f9ff" : "#f5f6fa",
            padding: "2px 6px",
            borderRadius: 10,
            whiteSpace: "nowrap",
            border: item.visibility === "internal_only"
              ? "1px dashed #c8c8dc"
              : "1px solid #e8e8ec",
          }}
          aria-label={`可視性: ${item.visibility}`}
        >
          {VISIBILITY_TEXT[item.visibility]}
        </div>
      )}
    </div>
  );
}
