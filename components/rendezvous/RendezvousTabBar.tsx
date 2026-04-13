"use client";

import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { RV_COLORS } from "@/components/ui/rendezvous-design";
import { saveLastTab } from "@/lib/rendezvous/useLastTab";

// =============================================================================
// Tab definitions — 5カテゴリ（つながり / 恋愛 / パートナー / トーク / ライブ）
// =============================================================================

export type RendezvousTab = "connection" | "romance" | "partner" | "talk" | "live";

type TabDef = {
  key: RendezvousTab;
  label: string;
  icon: string;
  path: string;
  activeColor: string;
};

const TABS: TabDef[] = [
  { key: "connection", label: "つながり", icon: "\u{1F91D}", path: "/rendezvous/connection", activeColor: "#14B8A6" },
  { key: "romance", label: "恋愛", icon: "\u2764\uFE0F", path: "/rendezvous/romance", activeColor: "#E91E63" },
  { key: "partner", label: "パートナー", icon: "\u267E\uFE0F", path: "/rendezvous/partner", activeColor: "#10B981" },
  { key: "talk", label: "トーク", icon: "\u{1F4AC}", path: "/rendezvous/stories", activeColor: "#6366F1" },
  { key: "live", label: "ライブ", icon: "\u26A1", path: "/rendezvous/live", activeColor: "#F59E0B" },
];

export function deriveActiveTab(pathname: string): RendezvousTab {
  // Partner (also match /rendezvous/partner/*)
  if (pathname.startsWith("/rendezvous/partner")) return "partner";
  // Romance
  if (pathname.startsWith("/rendezvous/romance")) return "romance";
  // Connection
  if (pathname.startsWith("/rendezvous/connection")) return "connection";
  // Live cluster
  if (
    pathname.startsWith("/rendezvous/live") ||
    pathname.startsWith("/rendezvous/session") ||
    pathname.startsWith("/rendezvous/game") ||
    pathname.startsWith("/rendezvous/constellation")
  )
    return "live";
  // Talk
  if (
    pathname.startsWith("/rendezvous/stories") ||
    pathname.includes("/chat") ||
    pathname.startsWith("/rendezvous/conversations")
  )
    return "talk";
  // Default to connection
  return "connection";
}

// =============================================================================
// Component — カテゴリ別カラータブバー
// =============================================================================

type Props = {
  activeTab?: RendezvousTab;
};

export default function RendezvousTabBar({ activeTab: propActiveTab }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = propActiveTab ?? deriveActiveTab(pathname);

  const activeIndex = TABS.findIndex((t) => t.key === activeTab);
  const activeColor = TABS[activeIndex]?.activeColor ?? "#14B8A6";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: `1px solid ${RV_COLORS.border}`,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Sliding indicator — カテゴリ別カラー */}
      <div className="relative">
        <motion.div
          className="absolute top-0 h-[2px] rounded-full"
          style={{
            width: `${100 / TABS.length}%`,
          }}
          animate={{
            left: `${(activeIndex / TABS.length) * 100}%`,
            backgroundColor: activeColor,
          }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      </div>

      <div className="flex items-center justify-around px-2 pt-2 pb-1">
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => {
                // 前回タブを記憶（connection/romance/partner のみ保存）
                if (tab.key === "connection" || tab.key === "romance" || tab.key === "partner") {
                  saveLastTab(tab.key);
                }
                router.push(tab.path);
              }}
              className="flex flex-col items-center gap-0.5 min-w-0 flex-1 bg-transparent border-none cursor-pointer outline-none py-1"
            >
              <motion.span
                className="text-[18px] leading-none"
                animate={{
                  scale: isActive ? 1.15 : 1,
                }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                style={{
                  filter: isActive
                    ? "none"
                    : "grayscale(0.8) opacity(0.4)",
                }}
              >
                {tab.icon}
              </motion.span>
              <span
                className="text-[10px] font-semibold transition-colors duration-200"
                style={{
                  color: isActive ? tab.activeColor : RV_COLORS.textMuted,
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
