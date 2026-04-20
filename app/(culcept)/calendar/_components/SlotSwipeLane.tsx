"use client";

import * as React from "react";
import Image, { type ImageLoader } from "next/image";
import { motion } from "framer-motion";
import type { WardrobeItem } from "@/app/my-style/_lib/types";
import type { Slot } from "../_lib/vcTypes";

const passthroughLoader: ImageLoader = ({ src }) => src;

/* ── Category silhouette SVGs ── */
const CATEGORY_SILHOUETTE: Record<string, React.ReactNode> = {
  tops: (
    <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 opacity-30">
      <path d="M14 12L10 18V36H38V18L34 12H30L28 16H20L18 12H14Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="24" y1="16" x2="24" y2="30" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  ),
  top: (
    <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 opacity-30">
      <path d="M14 12L10 18V36H38V18L34 12H30L28 16H20L18 12H14Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="24" y1="16" x2="24" y2="30" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  ),
  bottoms: (
    <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 opacity-30">
      <path d="M14 8H34V20L30 40H26L24 24L22 40H18L14 20V8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  bottom: (
    <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 opacity-30">
      <path d="M14 8H34V20L30 40H26L24 24L22 40H18L14 20V8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  shoes: (
    <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 opacity-30">
      <path d="M8 30L12 22H28L36 26L40 30V34H8V30Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M36 26L38 22" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  ),
  outer: (
    <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 opacity-30">
      <path d="M12 10L8 16V38H18V38L20 16H28L30 38H40V16L36 10H30L28 14H20L18 10H12Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="24" y1="14" x2="24" y2="32" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  ),
  outerwear: (
    <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 opacity-30">
      <path d="M12 10L8 16V38H18V38L20 16H28L30 38H40V16L36 10H30L28 14H20L18 10H12Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="24" y1="14" x2="24" y2="32" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  ),
  accessory: (
    <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 opacity-30">
      <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="4" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  ),
  accessories: (
    <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 opacity-30">
      <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="4" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  ),
};

/* ── ItemCard ── */
function ItemCard({
  item,
  isCenter,
}: {
  item: WardrobeItem;
  isCenter: boolean;
}) {
  const cat = item.categoryMain || item.category;
  const colorHex = item.colorHex || item.color || "#888";
  const displayName = item.name || item.subcategory || cat;

  return (
    <div
      className={`
        snap-center shrink-0 w-[152px] sm:w-[168px] rounded-xl overflow-hidden
        transition-all duration-300 select-none
        ${isCenter
          ? "bg-white/80 shadow-lg shadow-purple-200/30 border border-white/70 scale-100"
          : "bg-white/50 shadow-md border border-white/40 scale-[0.9] opacity-70"
        }
      `}
    >
      {/* 画像エリア */}
      <div className="relative w-full aspect-[1/1.08] bg-gradient-to-br from-gray-50 to-gray-100/50">
        {item.imageUrl ? (
          <Image
            loader={passthroughLoader}
            src={item.imageUrl}
            alt={displayName}
            fill
            className="object-contain p-2"
            sizes="168px"
            unoptimized
          />
        ) : (
          /* Category-specific silhouette + color accent */
          <div className="flex flex-col items-center justify-center h-full gap-1 text-gray-400">
            {/* Color accent bar */}
            <div
              className="w-10 h-1 rounded-full mb-1"
              style={{ backgroundColor: colorHex, opacity: 0.7 }}
            />
            {CATEGORY_SILHOUETTE[cat] ?? CATEGORY_SILHOUETTE.tops}
          </div>
        )}
      </div>
      {/* Item identity footer */}
      <div className="px-2 py-1.5 border-t border-gray-100/50">
        <div className="flex items-center gap-1.5">
          <div
            className="w-3 h-3 rounded-full shrink-0 border border-white/60"
            style={{ backgroundColor: colorHex }}
          />
          <span className="text-[10px] font-medium text-gray-600 truncate leading-tight">
            {displayName}
          </span>
        </div>
        {item.colorName && (
          <span className="text-[8px] text-gray-400 ml-[18px] block truncate">
            {item.colorName}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── SlotSwipeLane ── */
interface SlotSwipeLaneProps {
  slot: Slot;
  items: WardrobeItem[];
  index: number;
  locked: boolean;
  onIndexChange: (nextIndex: number) => void;
  onToggleLock: () => void;
}

export default function SlotSwipeLane({
  slot,
  items,
  index,
  locked,
  onIndexChange,
  onToggleLock,
}: SlotSwipeLaneProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const isScrolling = React.useRef(false);

  // インデックス変更時にスクロール
  React.useEffect(() => {
    if (!scrollRef.current || isScrolling.current) return;
    const container = scrollRef.current;
    const child = container.children[index] as HTMLElement | undefined;
    if (!child) return;
    const offset = child.offsetLeft - (container.clientWidth - child.clientWidth) / 2;
    container.scrollTo({ left: offset, behavior: "smooth" });
  }, [index]);

  // スクロール停止時にインデックスを更新
  const handleScroll = React.useCallback(() => {
    if (!scrollRef.current) return;
    isScrolling.current = true;

    const container = scrollRef.current;
    const center = container.scrollLeft + container.clientWidth / 2;

    let closest = 0;
    let closestDist = Infinity;
    for (let i = 0; i < container.children.length; i++) {
      const child = container.children[i] as HTMLElement;
      const childCenter = child.offsetLeft + child.clientWidth / 2;
      const dist = Math.abs(center - childCenter);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    }

    if (closest !== index) {
      onIndexChange(closest);
    }

    // scrolling flag を少し遅延してリセット
    setTimeout(() => { isScrolling.current = false; }, 100);
  }, [index, onIndexChange]);

  // debounced scroll handler
  const scrollTimer = React.useRef<ReturnType<typeof setTimeout>>(null);
  const onScroll = React.useCallback(() => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(handleScroll, 80);
  }, [handleScroll]);

  // 矢印ボタン
  const goLeft = () => {
    if (index > 0) onIndexChange(index - 1);
  };
  const goRight = () => {
    if (index < items.length - 1) onIndexChange(index + 1);
  };

  if (items.length === 0) {
    return (
      <div className="py-1">
        <div className="flex items-center justify-center h-[128px] text-gray-300 text-sm">
          候補なし
        </div>
      </div>
    );
  }

  return (
    <div className="py-0.5" data-slot={slot}>
      {/* カルーセル */}
      <div className="relative">
        <div className="absolute right-3 top-1.5 z-10 flex items-center gap-1.5">
          <span className="rounded-full bg-white/75 px-1.5 py-0.5 text-[9px] font-medium text-gray-400 backdrop-blur">
            {index + 1}/{items.length}
          </span>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onToggleLock}
            className={`
              h-6 min-w-6 rounded-full px-1.5 text-[10px] transition-colors backdrop-blur
              ${locked
                ? "bg-purple-100/85 text-purple-600 border border-purple-200/60"
                : "bg-white/70 text-gray-400 border border-gray-200/40"
              }
            `}
          >
            {locked ? "🔒" : "🔓"}
          </motion.button>
        </div>

        {/* 左矢印 */}
        {index > 0 && (
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={goLeft}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-white/80 backdrop-blur shadow-md flex items-center justify-center text-gray-500"
          >
            ‹
          </motion.button>
        )}

        {/* スクロールコンテナ */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex gap-2 overflow-x-auto snap-x snap-mandatory scroll-smooth px-[calc(50%-76px)] sm:px-[calc(50%-84px)] no-scrollbar"
          style={{ scrollbarWidth: "none" }}
        >
          {items.map((item, i) => (
            <ItemCard key={item.id} item={item} isCenter={i === index} />
          ))}
        </div>

        {/* 右矢印 */}
        {index < items.length - 1 && (
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={goRight}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-white/80 backdrop-blur shadow-md flex items-center justify-center text-gray-500"
          >
            ›
          </motion.button>
        )}
      </div>
    </div>
  );
}
