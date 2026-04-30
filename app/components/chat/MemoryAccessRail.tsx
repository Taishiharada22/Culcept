"use client";

/**
 * Stage 4 L4-g — MemoryAccessRail (本番化、preview L1-h 移植)
 *
 * 正本: layout plan v0.3 §7.7 / UI spec §8.2.2
 *
 * 上部レイヤー右端の rail。「何を知っている？」tap で drawer 展開 (本 phase は
 * button のみ、drawer 本体は L4-l 接続時に MemorySurface を modal/drawer で表示)。
 */

export interface MemoryAccessRailProps {
  itemCount: number;
  onOpenDrawer: () => void;
}

export default function MemoryAccessRail({
  itemCount,
  onOpenDrawer,
}: MemoryAccessRailProps) {
  return (
    <button
      type="button"
      onClick={onOpenDrawer}
      data-testid="coalter-memory-access-rail"
      aria-label={`共有メモリ ${itemCount} 件、開く`}
      style={{
        padding: "4px 10px",
        fontSize: 11,
        background: "#f5f6fa",
        border: "1px solid #c8c8dc",
        color: "#4a4a68",
        borderRadius: 12,
        cursor: "pointer",
      }}
    >
      共有メモリ {itemCount} 件
    </button>
  );
}
