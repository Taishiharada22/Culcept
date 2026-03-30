"use client";

import { motion } from "framer-motion";
import type { ActivePanel } from "@/lib/origin/v7/workspaceTypes";

type Props = {
  active: ActivePanel;
  onChange: (panel: ActivePanel) => void;
};

const TABS: { key: ActivePanel; label: string; icon: string }[] = [
  { key: "left", label: "履歴", icon: "📋" },
  { key: "center", label: "タイムライン", icon: "🕐" },
  { key: "right", label: "詳細", icon: "📝" },
];

export default function MobilePanelTabBar({ active, onChange }: Props) {
  return (
    <nav
      className="relative z-30 flex shrink-0 items-center justify-around border-t border-amber-200/30"
      style={{
        height: 52,
        background: "rgba(248,242,230,0.95)",
        backdropFilter: "blur(12px)",
      }}
    >
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className="relative flex flex-1 flex-col items-center gap-0.5 py-1.5"
          >
            <span className="text-base">{tab.icon}</span>
            <span
              className={`text-[10px] font-medium transition-colors ${
                isActive ? "text-amber-700" : "text-gray-400"
              }`}
            >
              {tab.label}
            </span>
            {isActive && (
              <motion.div
                layoutId="mobile-tab-indicator"
                className="absolute -top-px left-4 right-4 h-0.5 rounded-full bg-amber-400"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
