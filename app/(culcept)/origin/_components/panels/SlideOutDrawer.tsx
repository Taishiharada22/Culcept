"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  title?: string;
  children: React.ReactNode;
}

/**
 * スライドアウトドロワー
 * デスクトップ: サイドからスライドイン + バックドロップ
 * モバイル: 同じ動作（タッチ対応）
 */
export default function SlideOutDrawer({
  open,
  onClose,
  side,
  title,
  children,
}: Props) {
  // ESCキーで閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const xInitial = side === "left" ? "-100%" : "100%";

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* バックドロップ */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleBackdropClick}
          />

          {/* ドロワー本体 */}
          <motion.div
            className={`fixed top-0 z-50 flex h-full flex-col bg-[#f5f0e8] shadow-xl ${
              side === "left" ? "left-0" : "right-0"
            }`}
            style={{ width: "min(380px, 85vw)" }}
            initial={{ x: xInitial }}
            animate={{ x: 0 }}
            exit={{ x: xInitial }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_e, info) => {
              const threshold = 100;
              if (side === "left" && info.offset.x < -threshold) onClose();
              if (side === "right" && info.offset.x > threshold) onClose();
            }}
          >
            {/* ヘッダー */}
            <div className="flex shrink-0 items-center justify-between border-b border-amber-200/30 px-4 py-3">
              <span
                className="text-sm font-semibold"
                style={{ color: "#3a2a1a" }}
              >
                {title ?? ""}
              </span>
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/60 text-xs text-gray-500"
              >
                ✕
              </button>
            </div>

            {/* コンテンツ */}
            <div className="flex-1 overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
