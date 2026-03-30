"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FloatingGuidePillProps {
  step: string;
  detail?: string;
  visible: boolean;
  position?: "bottom" | "top";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FloatingGuidePill({
  step,
  detail,
  visible,
  position = "bottom",
}: FloatingGuidePillProps) {
  const [expanded, setExpanded] = useState(false);

  const positionStyles =
    position === "bottom"
      ? "bottom-20 left-1/2 -translate-x-1/2"
      : "top-4 left-1/2 -translate-x-1/2";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="guide-pill"
          className={`fixed z-40 ${positionStyles}`}
          initial={{ opacity: 0, y: position === "bottom" ? 20 : -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: position === "bottom" ? 20 : -20, scale: 0.9 }}
          transition={{ type: "spring", damping: 22, stiffness: 260 }}
        >
          <button
            type="button"
            onClick={() => detail && setExpanded((v) => !v)}
            className="flex flex-col items-center gap-1 rounded-2xl border border-white/40 bg-white/70 px-4 py-2 shadow-lg backdrop-blur-xl ring-1 ring-slate-200/50 transition-colors hover:bg-white/80"
          >
            {/* Main pill row */}
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <span className="text-base leading-none">💡</span>
              {step}
              {detail && (
                <motion.span
                  animate={{ rotate: expanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-[10px] text-slate-400"
                >
                  ▼
                </motion.span>
              )}
            </span>

            {/* Expandable detail */}
            <AnimatePresence>
              {expanded && detail && (
                <motion.span
                  key="pill-detail"
                  className="text-xs text-slate-500 leading-relaxed max-w-[260px] text-center"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {detail}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
