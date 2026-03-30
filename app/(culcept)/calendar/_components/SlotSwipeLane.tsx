"use client";

import * as React from "react";
import Image, { type ImageLoader } from "next/image";
import { motion } from "framer-motion";
import type { WardrobeItem } from "@/app/my-style/_lib/types";
import type { Slot } from "../_lib/vcTypes";

const passthroughLoader: ImageLoader = ({ src }) => src;

/* ── ItemCard ── */
function ItemCard({
  item,
  isCenter,
}: {
  item: WardrobeItem;
  isCenter: boolean;
}) {
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
      {/* 画像 */}
      <div className="relative w-full aspect-[1/1.08] bg-gradient-to-br from-gray-50 to-gray-100/50">
        {item.imageUrl ? (
          <Image
            loader={passthroughLoader}
            src={item.imageUrl}
            alt={item.name}
            fill
            className="object-contain p-2"
            sizes="168px"
            unoptimized
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-300 text-4xl">
            👕
          </div>
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
