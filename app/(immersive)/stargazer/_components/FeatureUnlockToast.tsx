"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { FeatureGate } from "@/lib/stargazer/featureUnlock";

interface FeatureUnlockToastProps {
  feature: FeatureGate;
  onDismiss: () => void;
  onNavigate: (feature: string) => void;
}

/**
 * 新機能アンロック時に上部からスライドインするトースト
 * Glassmorphism + ゴールドアクセント
 */
export default function FeatureUnlockToast({
  feature,
  onDismiss,
  onNavigate,
}: FeatureUnlockToastProps) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      onDismiss();
    }, 8000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDismiss]);

  return (
    <AnimatePresence>
      <motion.div
        key={feature.feature}
        initial={{ opacity: 0, y: -80, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -40, scale: 0.95 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        className="fixed top-4 left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md -translate-x-1/2"
      >
        <div
          className="relative overflow-hidden rounded-2xl border border-amber-400/40 bg-white/70 backdrop-blur-xl shadow-lg"
          style={{
            boxShadow:
              "0 4px 24px rgba(245, 158, 11, 0.15), 0 1px 3px rgba(0, 0, 0, 0.06)",
          }}
        >
          {/* ゴールドアクセント上部ライン */}
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400" />

          <div className="px-4 py-3.5 flex items-start gap-3">
            {/* アイコン + NEW バッジ */}
            <div className="relative flex-shrink-0 mt-0.5">
              <span className="text-2xl" role="img" aria-label={feature.label}>
                {feature.icon}
              </span>
              <span className="absolute -top-1.5 -right-2.5 rounded-full bg-amber-500 px-1.5 py-px text-[9px] font-bold text-white leading-tight tracking-wide">
                NEW
              </span>
            </div>

            {/* テキスト */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                {feature.label}が解放されました
              </p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                {feature.description}
              </p>
            </div>

            {/* 閉じるボタン */}
            <button
              onClick={onDismiss}
              className="flex-shrink-0 p-1 rounded-full hover:bg-slate-100 transition-colors -mt-0.5 -mr-1"
              aria-label="閉じる"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="text-slate-400"
              >
                <path
                  d="M4.5 4.5l7 7M11.5 4.5l-7 7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* ナビゲーションボタン */}
          <div className="px-4 pb-3">
            <button
              onClick={() => onNavigate(feature.feature)}
              className="w-full rounded-xl bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-400/20 px-4 py-2 text-sm font-medium text-amber-700 hover:from-amber-500/20 hover:to-yellow-500/20 transition-all"
            >
              見てみる →
            </button>
          </div>

          {/* プログレスバー（自動消去タイマー） */}
          <motion.div
            className="absolute inset-x-0 bottom-0 h-[2px] bg-amber-400/60 origin-left"
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: 8, ease: "linear" }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
