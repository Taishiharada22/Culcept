"use client";

import { useCallback } from "react";

// LifeMapTopBar.tsx — Warm gold top tab bar

interface LifeMapTopBarProps {
  activeKey: string;
  onTabChange: (key: string) => void;
  tabs?: { key: string; label: string }[];
}

const DEFAULT_TABS = [
  { key: "life", label: "Life Map" },
  { key: "globe", label: "Earth Trace" },
];

export default function LifeMapTopBar({ activeKey, onTabChange, tabs = DEFAULT_TABS }: LifeMapTopBarProps) {
  const handleTab = useCallback((key: string) => () => onTabChange(key), [onTabChange]);

  return (
    <div className="flex items-center justify-center gap-2 px-4 shrink-0" style={{ height: 48, background: "rgba(248,242,230,0.88)", backdropFilter: "blur(12px)", borderRadius: 28, margin: "8px auto 0", width: "fit-content", boxShadow: "0 2px 8px rgba(120,100,60,0.12)" }}>
      {tabs.map((t) => {
        const active = t.key === activeKey;
        return (
          <button key={t.key} onClick={handleTab(t.key)} className="relative px-5 py-1.5 text-sm font-semibold transition-all duration-200" style={{ borderRadius: 20, color: active ? "#fff" : "#6a5a3a", background: active ? "linear-gradient(135deg, #c9a24e 0%, #a8802e 100%)" : "transparent", boxShadow: active ? "0 2px 8px rgba(160,120,40,0.3)" : "none" }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
