"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useVerticalDragPosition } from "@/hooks/useVerticalDragPosition";

type Props = {
  bottom?: number;
  mobileBottom?: number;
};

/**
 * Talk フローティングアクションボタン
 * Home ページの右下に固定表示。未読バッジ付き。
 */
export default function TalkFab({ bottom = 32, mobileBottom = 24 }: Props) {
  const [unreadCount, setUnreadCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const {
    dragHandlers,
    isDragging,
    offsetY,
    onClickCapture,
    targetRef,
  } = useVerticalDragPosition<HTMLDivElement>({
    storageKey: "aneurasync:talk-fab-drag-offset-y",
  });

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/talk/unread");
        const data = await res.json();
        if (data.ok) setUnreadCount(data.unreadCount);
      } catch { /* ignore */ }
    };

    fetchUnread();
    // 10秒ごとにポーリング（LINE並の反応速度）
    pollRef.current = setInterval(fetchUnread, 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return (
    <>
      <div
        ref={targetRef}
        data-talk-fab-shell="true"
        style={{
          position: "fixed",
          zIndex: 40,
          right: 24,
          bottom,
          transform: `translateY(${offsetY}px)`,
          ["--talk-fab-mobile-bottom" as string]: `${mobileBottom}px`,
        }}
      >
        <Link
          href="/talk"
          data-talk-fab="true"
          className="rounded-full bg-white/80 backdrop-blur-md shadow-lg border border-white/60 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          aria-label="Talk"
          onClickCapture={onClickCapture}
          style={{
            width: 52,
            height: 52,
            cursor: isDragging ? "grabbing" : "grab",
            touchAction: "none",
            transition: isDragging ? "none" : undefined,
            userSelect: "none",
          }}
          {...dragHandlers}
        >
          <span
            aria-hidden="true"
            style={{
              fontSize: 24,
              lineHeight: 1,
              transform: isDragging ? "scale(1.05)" : "scale(1)",
            }}
          >
            💬
          </span>

          {/* 未読バッジ */}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>
      </div>

      <style>{`
        @media (max-width: 480px) {
          [data-talk-fab-shell="true"] {
            right: 12px !important;
            bottom: var(--talk-fab-mobile-bottom) !important;
          }
          [data-talk-fab="true"] {
            width: 44px !important;
            height: 44px !important;
          }
          [data-talk-fab="true"] span[aria-hidden="true"] {
            font-size: 20px !important;
          }
        }
      `}</style>
    </>
  );
}
