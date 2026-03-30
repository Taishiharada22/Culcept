"use client";

import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { useCallback, useEffect, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

const SNAP_PREVIEW = 0.4; // 40% of viewport
const SNAP_FULL = 0.9; // 90% of viewport
const CLOSE_VELOCITY = 500;

/**
 * モバイル用ボトムシート
 * 40%プレビュー / 90%フル展開 / 下スワイプで閉じる
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const heightRef = useRef(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      heightRef.current = window.innerHeight;
    }
  }, []);

  // ESCキーで閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleDragEnd = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      // 高速下スワイプで閉じる
      if (info.velocity.y > CLOSE_VELOCITY) {
        onClose();
        return;
      }
      // 位置に基づくスナップ判定
      if (info.offset.y > 100) {
        onClose();
      }
    },
    [onClose],
  );

  const previewHeight = `${SNAP_PREVIEW * 100}vh`;
  const sheetStyle = {
    height: `${SNAP_FULL * 100}vh`,
    maxHeight: `${SNAP_FULL * 100}vh`,
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* バックドロップ */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/20 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* シート本体 */}
          <motion.div
            ref={sheetRef}
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl bg-[#f5f0e8] shadow-xl lg:hidden"
            style={sheetStyle}
            initial={{ y: "100%" }}
            animate={{ y: `calc(100% - ${previewHeight})` }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
          >
            {/* ドラッグハンドル */}
            <div className="flex shrink-0 flex-col items-center pb-1 pt-3">
              <div className="h-1 w-10 rounded-full bg-gray-300/60" />
            </div>

            {/* ヘッダー */}
            {title && (
              <div className="flex shrink-0 items-center justify-between border-b border-amber-200/30 px-5 pb-3">
                <span
                  className="text-sm font-semibold"
                  style={{ color: "#3a2a1a" }}
                >
                  {title}
                </span>
                <button
                  onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/60 text-xs text-gray-500"
                >
                  ✕
                </button>
              </div>
            )}

            {/* コンテンツ */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-1">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
