"use client";

// ============================================================
// PhantomPulse — 共鳴する誰かの気配を示す浮遊オーブ
// 控えめで非侵入的、右下に配置、30秒後にフェードアウト
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PhantomSignal } from "@/lib/rendezvous/phantomPresence";
import { getPhantomColor } from "@/lib/rendezvous/phantomPresence";

type Props = {
  signal: PhantomSignal | null;
};

const VISIBILITY_DURATION_MS = 30_000; // 30 seconds auto-fade

export default function PhantomPulse({ signal }: Props) {
  const [visible, setVisible] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const prevSignalRef = useRef(signal);

  // Reset state when signal changes (during render)
  if (prevSignalRef.current !== signal) {
    prevSignalRef.current = signal;
    if (!signal) {
      if (visible) setVisible(false);
      if (showMessage) setShowMessage(false);
    } else {
      const expiresAt = new Date(signal.expiresAt).getTime();
      if (expiresAt <= Date.now()) {
        if (visible) setVisible(false);
      } else {
        if (!visible) setVisible(true);
        if (showMessage) setShowMessage(false);
      }
    }
  }

  // Auto-fade after 30s
  useEffect(() => {
    if (!visible) return;
    const fadeTimer = setTimeout(() => {
      setVisible(false);
    }, VISIBILITY_DURATION_MS);
    return () => clearTimeout(fadeTimer);
  }, [visible]);

  const handleTap = useCallback(() => {
    if (!signal) return;
    setShowMessage((prev) => !prev);
  }, [signal]);

  if (!signal) return null;

  const color = getPhantomColor(signal.resonanceHint);
  const size = 40 + signal.intensity * 20; // 40..60px based on intensity
  const glowSize = size * 2;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-2"
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.3 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          {/* Poetic message bubble */}
          <AnimatePresence>
            {showMessage && (
              <motion.div
                className="max-w-[220px] rounded-2xl px-4 py-3 text-xs leading-relaxed backdrop-blur-md"
                style={{
                  background: `rgba(255,255,255,0.85)`,
                  border: `1px solid ${color}30`,
                  color: "#374151",
                  boxShadow: `0 4px 20px ${color}20`,
                }}
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.9 }}
                transition={{ duration: 0.3 }}
              >
                {signal.message}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Floating orb */}
          <motion.button
            onClick={handleTap}
            className="relative cursor-pointer border-0 bg-transparent p-0"
            style={{ width: glowSize, height: glowSize }}
            whileTap={{ scale: 0.9 }}
            aria-label="共鳴シグナル"
          >
            {/* Outer glow */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                background: `radial-gradient(circle, ${color}40 0%, ${color}10 50%, transparent 70%)`,
              }}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.6, 0.3, 0.6],
              }}
              transition={{
                duration: 3 / signal.intensity, // faster breathing at higher intensity
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />

            {/* Inner orb */}
            <motion.div
              className="absolute rounded-full"
              style={{
                width: size,
                height: size,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background: `radial-gradient(circle at 35% 35%, ${color}CC, ${color}80)`,
                boxShadow: `0 0 ${size / 2}px ${color}60, inset 0 -${size / 6}px ${size / 3}px ${color}30`,
              }}
              animate={{
                scale: [1, 1.08, 1],
              }}
              transition={{
                duration: 2 / signal.intensity,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />

            {/* Core highlight */}
            <motion.div
              className="absolute rounded-full"
              style={{
                width: size * 0.3,
                height: size * 0.3,
                top: `calc(50% - ${size * 0.15}px)`,
                left: `calc(50% - ${size * 0.05}px)`,
                background: `radial-gradient(circle, rgba(255,255,255,0.8), transparent)`,
              }}
              animate={{
                opacity: [0.8, 0.4, 0.8],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
