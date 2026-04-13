// app/stargazer/_components/ShareButton.tsx
// シェアボタン — Web Share API + Clipboard + execCommand 3段階フォールバック
"use client";

import { useState, useCallback, useRef } from "react";
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

function ShareToast({ show, message, isError }: { show: boolean; message: string; isError?: boolean }) {
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
            background: isError ? "rgba(220,80,80,0.15)" : "rgba(255,255,255,0.15)",
            backdropFilter: "blur(16px)",
            color: isError ? "rgba(255,200,200,0.95)" : "rgba(255,255,255,0.9)",
            border: `1px solid ${isError ? "rgba(220,80,80,0.2)" : "rgba(255,255,255,0.12)"}`,
          }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Legacy copy fallback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function legacyCopy(text: string): boolean {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
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
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null);
  const [ripple, setRipple] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((message: string, isError = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, isError });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const handleShare = useCallback(async () => {
    // Visual feedback
    setRipple(true);
    setTimeout(() => setRipple(false), 300);

    // 1. Web Share API (mobile)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: shareData.title,
          text: shareData.shareText,
        });
        return;
      } catch {
        // User cancelled or API failed — fall through
      }
    }

    // 2. Clipboard API
    try {
      await navigator.clipboard.writeText(shareData.shareText);
      showToast("コピーしました");
      return;
    } catch {
      // Permission denied or unavailable — fall through
    }

    // 3. Legacy execCommand fallback
    if (legacyCopy(shareData.shareText)) {
      showToast("コピーしました");
      return;
    }

    // 4. All methods failed — show error
    showToast("コピーできませんでした", true);
  }, [shareData, showToast]);

  return (
    <div className={`relative inline-flex ${className}`}>
      <ShareToast
        show={!!toast}
        message={toast?.message ?? ""}
        isError={toast?.isError}
      />

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
