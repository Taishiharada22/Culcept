// app/stargazer/_components/ScrollIndicator.tsx
// スクロールインジケーター — 下にコンテンツがあることを示す
// ・バウンスするシェ��ロン矢印
// ・下端グラデーションフェード
// ・スクロール底近くでフェードアウ���
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  /** スクロール対象の要素ref */
  scrollRef: React.RefObject<HTMLElement | null>;
  /** ライトモード（デフォルトtrue） */
  light?: boolean;
}

export default function ScrollIndicator({ scrollRef, light = true }: Props) {
  const [showArrow, setShowArrow] = useState(false);
  const [showGradient, setShowGradient] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const hasOverflow = el.scrollHeight > el.clientHeight + 10;
    const isNearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;

    setShowGradient(hasOverflow && !isNearBottom);
    setShowArrow(hasOverflow && !isNearBottom);
  }, [scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // 初期チェック
    checkScroll();

    // ResizeObserver でコンテンツサイズ変更を検知
    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(el);

    // スクロールイベント
    el.addEventListener("scroll", checkScroll, { passive: true });

    return () => {
      resizeObserver.disconnect();
      el.removeEventListener("scroll", checkScroll);
    };
  }, [scrollRef, checkScroll]);

  const baseColor = light ? "rgba(250,251,254," : "rgba(8,11,18,";

  return (
    <>
      {/* 下端グラデーションフェード */}
      <AnimatePresence>
        {showGradient && (
          <motion.div
            className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-16"
            style={{
              background: `linear-gradient(to bottom, ${baseColor}0), ${baseColor}0.8))`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>

      {/* バウンスシェブロ�� */}
      <AnimatePresence>
        {showArrow && (
          <motion.div
            className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <svg
                width="24"
                height="14"
                viewBox="0 0 24 14"
                fill="none"
                className={light ? "text-[rgba(18,24,44,0.2)]" : "text-[rgba(255,255,255,0.25)]"}
              >
                <path
                  d="M2 2L12 12L22 2"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
