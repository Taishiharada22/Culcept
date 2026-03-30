"use client";

import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { RV_COLORS } from "@/components/ui/rendezvous-design";

// =============================================================================
// Tab definitions
// =============================================================================

export type RendezvousTab = "home" | "explore" | "talk" | "live" | "my";

type TabDef = {
  key: RendezvousTab;
  label: string;
  icon: string;
  path: string;
};

const TABS: TabDef[] = [
  { key: "home", label: "ホーム", icon: "\u{1F3E0}", path: "/rendezvous" },
  { key: "explore", label: "探索", icon: "\u{1F50D}", path: "/rendezvous/explore" },
  { key: "talk", label: "トーク", icon: "\u{1F4AC}", path: "/rendezvous/stories" },
  { key: "live", label: "ライブ", icon: "\u2728", path: "/rendezvous/live" },
  { key: "my", label: "マイ", icon: "\u{1F464}", path: "/rendezvous/mirror" },
];

export function deriveActiveTab(pathname: string): RendezvousTab {
  if (pathname === "/rendezvous" || pathname === "/rendezvous/") return "home";
  if (
    pathname.startsWith("/rendezvous/live") ||
    pathname.startsWith("/rendezvous/session") ||
    pathname.startsWith("/rendezvous/game") ||
    pathname.startsWith("/rendezvous/constellation")
  )
    return "live";
  if (pathname.startsWith("/rendezvous/mirror") || pathname.startsWith("/rendezvous/settings") || pathname.startsWith("/rendezvous/universe"))
    return "my";
  if (pathname.includes("/chat") || pathname.startsWith("/rendezvous/conversations"))
    return "talk";
  if (pathname.startsWith("/rendezvous/explore") || pathname.startsWith("/rendezvous/invite"))
    return "explore";
  if (pathname.startsWith("/rendezvous/stories"))
    return "talk";
  return "home";
}

// =============================================================================
// Component — ライトウォームタブバー
// =============================================================================

type Props = {
  activeTab?: RendezvousTab;
};

export default function RendezvousTabBar({ activeTab: propActiveTab }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = propActiveTab ?? deriveActiveTab(pathname);

  const activeIndex = TABS.findIndex((t) => t.key === activeTab);

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
      {/* Sliding indicator — ワインレッド〜オレンジグラデーション */}
      <div className="relative">
        <motion.div
          className="absolute top-0 h-[2px] rounded-full"
          style={{
            background: RV_COLORS.gradient,
            width: `${100 / TABS.length}%`,
          }}
          animate={{ left: `${(activeIndex / TABS.length) * 100}%` }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      </div>

      <div className="flex items-center justify-around px-2 pt-2 pb-1">
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => router.push(tab.path)}
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
                  color: isActive ? RV_COLORS.primary : RV_COLORS.textMuted,
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
