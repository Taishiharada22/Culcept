"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RV_COLORS } from "@/components/ui/rendezvous-design";

// =============================================================================
// Tab definition
// =============================================================================

export type RendezvousHomeTabId = "today" | "avatar" | "connections" | "discover";

export const RENDEZVOUS_HOME_TABS: {
  id: RendezvousHomeTabId;
  label: string;
  icon: string;
}[] = [
  { id: "today", label: "今日", icon: "\u2726" },
  { id: "avatar", label: "分身", icon: "\u25CE" },
  { id: "connections", label: "つながり", icon: "\u223F" },
  { id: "discover", label: "発見", icon: "\u25C7" },
];

// =============================================================================
// Tab bar component
// =============================================================================

type Props = {
  activeTab: RendezvousHomeTabId;
  onTabChange: (tab: RendezvousHomeTabId) => void;
  unreadCount?: number;
};

export default function RendezvousHomeTabs({
  activeTab,
  onTabChange,
  unreadCount = 0,
}: Props) {
  return (
    <div
      className="sticky top-0 z-30 px-4 pt-3 pb-2"
      style={{ background: `${RV_COLORS.base}F0`, backdropFilter: "blur(16px)" }}
    >
      <div
        className="flex items-center gap-1 p-1 rounded-2xl"
        style={{
          background: RV_COLORS.surfaceMuted,
          border: `1px solid ${RV_COLORS.border}`,
        }}
        role="tablist"
      >
        {RENDEZVOUS_HOME_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
              className="relative flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 border-none cursor-pointer bg-transparent"
              style={{
                color: isActive ? RV_COLORS.text : RV_COLORS.textMuted,
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="rvHomeActiveTab"
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: RV_COLORS.surface,
                    boxShadow: `0 2px 8px ${RV_COLORS.shadow}`,
                    border: `1px solid ${RV_COLORS.border}`,
                  }}
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <span className="text-xs">{tab.icon}</span>
                <span>{tab.label}</span>
                {/* Unread badge on connections tab */}
                {tab.id === "connections" && unreadCount > 0 && (
                  <span
                    className="min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px] font-bold text-white leading-none px-1"
                    style={{ background: RV_COLORS.primary }}
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Tab content wrapper with animation
// =============================================================================

export function TabContentWrapper({
  tabId,
  children,
}: {
  tabId: RendezvousHomeTabId;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tabId}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
