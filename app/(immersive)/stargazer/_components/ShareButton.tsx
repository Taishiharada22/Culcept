// app/stargazer/_components/ShareButton.tsx
// シェアボタン — Web Share API + クリップボードフォールバック
"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ShareableCard } from "@/lib/stargazer/shareCardGenerator";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Props
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ShareButtonProps {
  shareData: ShareableCard;
  /** ボタンラベル (デフォルト: "シェア") */
  label?: string;
  /** コンパクト表示 (アイコンのみ) */
  compact?: boolean;
  className?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Share icon SVG
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ShareIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Toast
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CopiedToast({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium z-50"
          style={{
            background: "rgba(255,255,255,0.15)",
            backdropFilter: "blur(16px)",
            color: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          コピーしました
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function ShareButton({
  shareData,
  label = "シェア",
  compact = false,
  className = "",
}: ShareButtonProps) {
  const [showCopied, setShowCopied] = useState(false);
  const [ripple, setRipple] = useState(false);

  const handleShare = useCallback(async () => {
    // Visual feedback
    setRipple(true);
    setTimeout(() => setRipple(false), 300);

    // Try Web Share API first (mobile)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: shareData.title,
          text: shareData.shareText,
        });
        return;
      } catch {
        // User cancelled or API failed — fall through to clipboard
      }
    }

    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(shareData.shareText);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [shareData]);

  return (
    <div className={`relative inline-flex ${className}`}>
      <CopiedToast show={showCopied} />

      <motion.button
        onClick={handleShare}
        className={`relative overflow-hidden flex items-center gap-2 rounded-xl text-sm font-medium transition-colors ${
          compact ? "p-2.5" : "px-4 py-2"
        }`}
        style={{
          background: "rgba(255,255,255,0.1)",
          backdropFilter: "blur(12px)",
          color: "rgba(255,255,255,0.85)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
      >
        {/* Tap ripple effect */}
        <AnimatePresence>
          {ripple && (
            <motion.div
              className="absolute inset-0 rounded-xl pointer-events-none"
              style={{ background: "rgba(255,255,255,0.15)" }}
              initial={{ opacity: 1, scale: 0.8 }}
              animate={{ opacity: 0, scale: 1.2 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            />
          )}
        </AnimatePresence>

        <ShareIcon size={compact ? 18 : 16} />
        {!compact && <span>{label}</span>}
      </motion.button>
    </div>
  );
}

export type { ShareButtonProps };
