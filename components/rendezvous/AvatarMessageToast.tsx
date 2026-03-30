"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RV_COLORS } from "@/components/ui/rendezvous-design";

// =============================================================================
// Avatar Message Toast
// A toast notification that looks like it's FROM the avatar.
// Avatar icon + message text + timestamp.
// Slides in from bottom, auto-dismisses after 5 seconds.
// Tap to navigate to avatar tab.
// =============================================================================

type Props = {
  message: string | null;
  onDismiss: () => void;
  onTap?: () => void;
};

export default function AvatarMessageToast({
  message,
  onDismiss,
  onTap,
}: Props) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 5000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  const handleTap = () => {
    onTap?.();
    onDismiss();
  };

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className="fixed z-50 left-4 right-4"
          style={{ bottom: 160 }}
          initial={{ y: 60, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 60, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
        >
          <button
            onClick={handleTap}
            className="w-full border-none cursor-pointer p-0 bg-transparent"
          >
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{
                background: RV_COLORS.surface,
                boxShadow: `0 8px 32px ${RV_COLORS.shadowDeep}`,
                border: `1px solid ${RV_COLORS.border}`,
              }}
            >
              {/* Avatar icon */}
              <motion.div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: RV_COLORS.gradientSubtle,
                  border: `1.5px solid ${RV_COLORS.border}`,
                }}
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <span className="text-xl">&#x1F47B;</span>
              </motion.div>

              {/* Message */}
              <div className="flex-1 min-w-0 text-left">
                <p
                  className="text-[10px] font-bold tracking-wider uppercase"
                  style={{ color: RV_COLORS.primary }}
                >
                  分身からの報告
                </p>
                <p
                  className="text-xs leading-relaxed mt-0.5"
                  style={{
                    color: RV_COLORS.text,
                    fontFamily: "'Noto Serif JP', serif",
                  }}
                >
                  {message}
                </p>
              </div>

              {/* Dismiss indicator */}
              <div className="shrink-0">
                <motion.div
                  className="w-1 h-6 rounded-full"
                  style={{ background: RV_COLORS.primary }}
                  initial={{ scaleY: 1 }}
                  animate={{ scaleY: 0 }}
                  transition={{ duration: 5, ease: "linear" }}
                />
              </div>
            </div>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
