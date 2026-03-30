"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface Props {
  emoji: string;
  text: string;
  onDismiss: () => void;
  /** 知的深度 1=浅い 2=中 3=深い（省略時1） */
  depth?: 1 | 2 | 3;
  /** 自動消去までの秒数（デフォルト: depth依存） */
  autoHideSeconds?: number;
}

const DEPTH_LABELS: Record<number, string> = {
  1: "Origin の観察",
  2: "Origin の分析",
  3: "Origin の洞察",
};

const DEPTH_GRADIENTS: Record<number, string> = {
  1: "linear-gradient(135deg, rgba(99,102,241,0.06), rgba(255,255,255,0.92))",
  2: "linear-gradient(135deg, rgba(99,102,241,0.10), rgba(139,92,246,0.06), rgba(255,255,255,0.88))",
  3: "linear-gradient(135deg, rgba(99,102,241,0.14), rgba(139,92,246,0.10), rgba(79,70,229,0.04), rgba(255,255,255,0.85))",
};

/**
 * AIコンパニオンカード
 * 深度に応じてビジュアル強度が変わる + タイプライター表示
 */
export default function AICompanionCard({
  emoji,
  text,
  onDismiss,
  depth = 1,
  autoHideSeconds,
}: Props) {
  const [displayedChars, setDisplayedChars] = useState(0);

  // 深度に応じた自動消去時間
  const hideAfter = autoHideSeconds ?? (depth === 3 ? 15 : depth === 2 ? 12 : 8);

  // タイプライター効果
  useEffect(() => {
    if (displayedChars >= text.length) return;
    const timer = setTimeout(() => {
      setDisplayedChars((prev) => Math.min(prev + 2, text.length));
    }, 30);
    return () => clearTimeout(timer);
  }, [displayedChars, text.length]);

  // 自動消去
  useEffect(() => {
    const timer = setTimeout(onDismiss, hideAfter * 1000);
    return () => clearTimeout(timer);
  }, [hideAfter, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={`mb-4 cursor-pointer overflow-hidden rounded-2xl shadow-sm ${
        depth >= 3
          ? "border border-indigo-300/50"
          : depth >= 2
            ? "border border-indigo-200/40"
            : "border border-indigo-100/30"
      }`}
      onClick={onDismiss}
      style={{ background: DEPTH_GRADIENTS[depth] }}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        {/* AIアイコン */}
        <div className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100/60">
          <span className="text-sm">{emoji}</span>
          {/* 深度3のみ呼吸アニメーション */}
          {depth >= 3 && (
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(99,102,241,0.25), transparent 70%)",
                animation: "sg-breathe 3s ease-in-out infinite",
              }}
            />
          )}
          {/* 深度2はゆっくりpulse */}
          {depth === 2 && (
            <div
              className="absolute inset-0 animate-pulse rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(99,102,241,0.15), transparent 70%)",
              }}
            />
          )}
        </div>

        {/* メッセージ */}
        <div className="flex-1">
          <p className={`text-[10px] font-semibold ${
            depth >= 3 ? "text-indigo-500/80" : "text-indigo-400/70"
          }`}>
            {DEPTH_LABELS[depth]}
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-gray-700">
            {text.slice(0, displayedChars)}
            {displayedChars < text.length && (
              <span className="inline-block h-3 w-0.5 animate-pulse bg-indigo-400/50" />
            )}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
