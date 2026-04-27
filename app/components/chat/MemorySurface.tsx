"use client";

/**
 * Stage 4 L4-g — MemorySurface (本番化、preview L1-h 移植)
 *
 * 正本: layout plan v0.3 §7.7 / UI spec §8.2.1 (panel form)
 *
 * memory items を panel 形式で表示。viewer に応じて filterByViewer で gate。
 */

import { filterByViewer, filterByModeScope } from "@/lib/coalter/presence/memoryStore";
import type { MemoryItem, ModeContext } from "@/lib/coalter/presence/memoryTypes";
import MemoryItemCard from "./MemoryItemCard";

export interface MemorySurfaceProps {
  items: ReadonlyArray<MemoryItem>;
  viewer: "user_a" | "user_b";
  modeScope: ModeContext;
}

export default function MemorySurface({ items, viewer, modeScope }: MemorySurfaceProps) {
  const scoped = filterByModeScope(items, modeScope);
  const visible = filterByViewer(scoped, viewer);

  if (visible.length === 0) {
    return (
      <div
        data-testid="coalter-memory-surface-empty"
        style={{
          padding: 12,
          fontSize: 11,
          color: "#8888a0",
          fontStyle: "italic",
          background: "#ffffff",
          border: "1px dashed #c8c8dc",
          borderRadius: 6,
          textAlign: "center" as const,
        }}
      >
        共有メモリは空です
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="CoAlter 共有メモリ surface"
      data-testid="coalter-memory-surface"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {visible.map((item) => (
        <MemoryItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}
