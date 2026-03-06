"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { OriginV2Tab } from "@/lib/origin/v2/types";
import LifeMapTopBar from "@/components/life-map/LifeMapTopBar";
import JapanLifeMap from "@/components/origin/v6/JapanLifeMap";
import EarthTraceSection from "@/components/origin/v2/EarthTraceSection";

// OriginPageClient.tsx — Switches between Life Map and Earth Trace views.

const TAB_KEY_MAP: Record<string, OriginV2Tab> = {
  life: "lifemap",
  globe: "earthtrace",
};

export default function OriginPageClient() {
  const [tabKey, setTabKey] = useState("life");
  const tab: OriginV2Tab = TAB_KEY_MAP[tabKey] ?? "lifemap";

  const handleTabChange = useCallback((key: string) => {
    setTabKey(key);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#e8dfc8]">
      {/* Top navigation */}
      <nav
        className="relative z-30 flex items-center justify-between px-4 shrink-0"
        style={{ height: 56, borderBottom: "1px solid #d4c4a8", background: "#f3eadb" }}
      >
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm font-bold tracking-wide"
          style={{ color: "#3a2a1a", textDecoration: "none" }}
        >
          <span style={{ fontSize: 18, opacity: 0.6 }}>←</span>
          Origin
        </Link>
        <LifeMapTopBar activeKey={tabKey} onTabChange={handleTabChange} />
        <div style={{ width: 48 }} />
      </nav>

      {/* Content area */}
      <div className="relative flex-1 overflow-hidden">
        {tab === "lifemap" && <JapanLifeMap />}
        {tab === "earthtrace" && <EarthTraceSection />}
      </div>
    </div>
  );
}
