"use client";

import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { useState } from "react";

interface Props {
  children: React.ReactNode;
  onClose: () => void;
}

/**
 * 探索フロー時のフルスクリーンラッパー
 * nav/tab を完全に覆い、集中できる環境を作る
 */
export default function FocusMode({ children, onClose }: Props) {
  const [mounted, setMounted] = useState(true);

  const content = (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#f5f0e8]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* 閉じるボタン */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/60 text-gray-500 backdrop-blur-sm transition-colors hover:bg-white/80"
        aria-label="閉じる"
      >
        ✕
      </button>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg px-4 py-6">
          {children}
        </div>
      </div>
    </motion.div>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
