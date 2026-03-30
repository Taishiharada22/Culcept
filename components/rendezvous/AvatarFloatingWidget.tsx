"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RV_COLORS } from "@/components/ui/rendezvous-design";
import { getAvatarStatusSummary } from "@/lib/rendezvous/avatarMessages";
import type { RendezvousHomeTabId } from "@/components/rendezvous/home/RendezvousHomeTabs";

// =============================================================================
// Avatar Floating Widget
// Persistent small indicator in the bottom-right corner (above bottom nav).
// Shows avatar state with a small animated icon.
// Tap to expand: shows brief status.
// =============================================================================

type Props = {
  activeConversations: number;
  onTap?: () => void;
};

export default function AvatarFloatingWidget({
  activeConversations,
  onTap,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const statusText = getAvatarStatusSummary(activeConversations);
  const isActive = activeConversations > 0;

  const handleTap = () => {
    if (expanded) {
      onTap?.();
      setExpanded(false);
    } else {
      setExpanded(true);
    }
  };

  return (
    <motion.div
      className="fixed z-40"
      style={{ bottom: 100, right: 16 }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 25 }}
    >
      <motion.button
        onClick={handleTap}
        className="flex items-center gap-2 border-none cursor-pointer"
        style={{
          background: RV_COLORS.surface,
          borderRadius: expanded ? 20 : 28,
          padding: expanded ? "10px 16px" : "10px",
          boxShadow: `0 4px 20px ${RV_COLORS.shadowDeep}`,
          border: `1px solid ${RV_COLORS.border}`,
        }}
        whileTap={{ scale: 0.95 }}
        layout
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        {/* Avatar orb */}
        <motion.div
          className="relative w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: RV_COLORS.gradientSubtle,
            border: `1.5px solid ${isActive ? `${RV_COLORS.primary}30` : RV_COLORS.border}`,
          }}
          animate={
            isActive
              ? {
                  boxShadow: [
                    `0 0 0px ${RV_COLORS.primaryGlow}`,
                    `0 0 12px ${RV_COLORS.primaryGlow}`,
                    `0 0 0px ${RV_COLORS.primaryGlow}`,
                  ],
                }
              : {
                  y: [0, -2, 0],
                }
          }
          transition={{ duration: isActive ? 2 : 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="text-lg">&#x1F47B;</span>

          {/* Activity indicator dot */}
          {isActive && (
            <motion.div
              className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full"
              style={{
                background: RV_COLORS.success,
                border: `2px solid ${RV_COLORS.surface}`,
              }}
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </motion.div>

        {/* Expanded text */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <p
                className="text-xs font-bold"
                style={{ color: RV_COLORS.text }}
              >
                {statusText}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </motion.div>
  );
}
