// components/home/QuickAccessBar.tsx
// 共通クイックアクセスバー — SVGアイコン + glassmorphism + tap animation
"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavActive } from "@/lib/navigation";
import { AnimatePresence, motion } from "framer-motion";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SVG Icon Map — 24x24 stroke icons
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ICON_SVG: Record<string, ReactNode> = {
  // ホーム
  home: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  ),
  // 観測 (Stargazer)
  observe: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ),
  // コーデ (Calendar)
  outfit: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2l3 4h6l3-4" />
      <path d="M9 6v14a1 1 0 001 1h4a1 1 0 001-1V6" />
      <path d="M6 2C4 3 3 5 3 8c0 2 1 3 3 3" />
      <path d="M18 2c2 1 3 3 3 6 0 2-1 3-3 3" />
    </svg>
  ),
  // 日記 (Origin)
  journal: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h12a2 2 0 012 2v12a2 2 0 01-2 2H4" />
      <path d="M4 4a2 2 0 012-2h8a2 2 0 012 2" />
      <line x1="8" y1="10" x2="14" y2="10" />
      <line x1="8" y1="14" x2="12" y2="14" />
      <path d="M4 4v16" strokeWidth={2.2} />
    </svg>
  ),
  // トーク (Talk)
  talk: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  ),
  // 出会う (Rendezvous)
  rendezvous: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-1a4 4 0 00-4-4H8a4 4 0 00-4 4v1" />
      <circle cx="10" cy="8" r="3" />
      <path d="M20 21v-1a3 3 0 00-2.13-2.88" />
      <path d="M17.5 4.12a3 3 0 010 5.76" />
    </svg>
  ),
  // 外見分析 (Body Color)
  palette: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r="2" />
      <circle cx="17.5" cy="10.5" r="2" />
      <circle cx="8.5" cy="7.5" r="2" />
      <circle cx="6.5" cy="12" r="2" />
      <path d="M12 2a10 10 0 000 20c1.1 0 2-.9 2-2v-1a2 2 0 012-2h1a10 10 0 00-5-15z" />
    </svg>
  ),
  // Genome
  genome: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 15c6.667-6 13.333 0 20-6" />
      <path d="M9 22c1.8-4 1.8-8 0-12" />
      <path d="M15 2c-1.8 4-1.8 8 0 12" />
      <path d="M2 9c6.667 6 13.333 0 20 6" />
    </svg>
  ),
  // Presence
  presence: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 20v-1a5 5 0 0110 0v1" />
    </svg>
  ),
  // CEO
  ceo: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  // 他 (More dots)
  more: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
    </svg>
  ),
};

/** href → SVG icon key mapping */
const HREF_ICON_KEY: Record<string, string> = {
  "/": "home",
  "/stargazer": "observe",
  "/calendar": "outfit",
  "/origin": "journal",
  "/talk": "talk",
  "/rendezvous": "rendezvous",
  "/body-color/avatar": "palette",
  "/aneurasync/genome": "genome",
  "/sns/profile": "presence",
  "/ceo": "ceo",
};

function getIconForHref(href: string): ReactNode {
  const key = HREF_ICON_KEY[href];
  return key ? ICON_SVG[key] : null;
}

/** アイコンごとの固有色（inactive でもはっきり見える濃さ） */
const HREF_ICON_COLOR: Record<string, { active: string; inactive: string; activeBg: string }> = {
  "/": { active: "#6366F1", inactive: "rgba(99,102,241,0.65)", activeBg: "rgba(99,102,241,0.12)" },
  "/stargazer": { active: "#7C3AED", inactive: "rgba(124,58,237,0.60)", activeBg: "rgba(124,58,237,0.12)" },
  "/calendar": { active: "#0284C7", inactive: "rgba(2,132,199,0.60)", activeBg: "rgba(2,132,199,0.12)" },
  "/origin": { active: "#EA580C", inactive: "rgba(234,88,12,0.60)", activeBg: "rgba(234,88,12,0.12)" },
  "/talk": { active: "#059669", inactive: "rgba(5,150,105,0.60)", activeBg: "rgba(5,150,105,0.12)" },
  "/rendezvous": { active: "#DB2777", inactive: "rgba(219,39,119,0.60)", activeBg: "rgba(219,39,119,0.12)" },
  "/body-color/avatar": { active: "#9333EA", inactive: "rgba(147,51,234,0.60)", activeBg: "rgba(147,51,234,0.12)" },
  "/aneurasync/genome": { active: "#0891B2", inactive: "rgba(8,145,178,0.60)", activeBg: "rgba(8,145,178,0.12)" },
  "/sns/profile": { active: "#6366F1", inactive: "rgba(99,102,241,0.60)", activeBg: "rgba(99,102,241,0.12)" },
  "/ceo": { active: "#4B5563", inactive: "rgba(75,85,99,0.60)", activeBg: "rgba(75,85,99,0.12)" },
};

const DEFAULT_ICON_COLOR = { active: "#6366F1", inactive: "rgba(99,102,241,0.55)", activeBg: "rgba(99,102,241,0.12)" };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface QuickNavItem {
  href: string;
  label: string;
  icon?: string; // emoji fallback (unused if SVG exists)
}

interface QuickAccessBarProps {
  items: QuickNavItem[];
  moreItems: QuickNavItem[];
  /** Stargazer テーマ（紫基調） */
  variant?: "default" | "stargazer";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function QuickAccessBar({ items, moreItems, variant = "default" }: QuickAccessBarProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  const moreColor = { active: "rgba(107,114,128,0.85)", inactive: "rgba(120,120,130,0.40)", activeBg: "rgba(107,114,128,0.10)" };

  return (
    <nav
      aria-label="クイックアクセス"
      className="relative"
      style={{
        borderTop: "1px solid rgba(0,0,0,0.04)",
        background: "rgba(255,255,255,0.80)",
        backdropFilter: "blur(24px) saturate(1.5)",
        WebkitBackdropFilter: "blur(24px) saturate(1.5)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* More 展開パネル */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            ref={moreRef}
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="absolute bottom-full left-0 right-0 px-3 pb-2"
          >
            <div
              className="rounded-2xl p-2.5 flex gap-1.5 justify-center"
              style={{
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(0,0,0,0.04)",
                boxShadow: "0 -8px 32px rgba(0,0,0,0.06), 0 -1px 3px rgba(0,0,0,0.03)",
                backdropFilter: "blur(16px)",
              }}
            >
              {moreItems.map((item) => {
                const ic = HREF_ICON_COLOR[item.href] ?? DEFAULT_ICON_COLOR;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-2xl transition-all duration-150 active:scale-[0.93]"
                    style={{
                      background: ic.activeBg,
                      color: ic.active,
                    }}
                  >
                    <span className="flex items-center justify-center w-6 h-6">
                      {getIconForHref(item.href) ?? <span className="text-lg">{item.icon}</span>}
                    </span>
                    <span className="text-[10px] font-semibold leading-none tracking-wide"
                      style={{ color: "rgba(55,65,81,0.75)" }}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* メインナビ行 */}
      <div className="flex items-center h-[56px]">
        {items.map((item) => {
          const active = isNavActive(item.href, pathname);
          const ic = HREF_ICON_COLOR[item.href] ?? DEFAULT_ICON_COLOR;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className="flex flex-1 flex-col items-center justify-center gap-1 transition-all duration-150 active:scale-[0.92]"
            >
              <motion.span
                className="relative flex items-center justify-center w-8 h-8 rounded-2xl"
                style={{
                  color: active ? ic.active : ic.inactive,
                  background: active ? ic.activeBg : "transparent",
                }}
                animate={{ scale: active ? 1 : 0.95 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {getIconForHref(item.href) ?? <span className="text-lg">{item.icon}</span>}
              </motion.span>
              <span
                className="text-[10px] font-medium leading-none tracking-wide"
                style={{ color: active ? ic.active : ic.inactive }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* 「他」ボタン */}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          aria-label="その他"
          aria-expanded={moreOpen}
          className="flex flex-1 flex-col items-center justify-center gap-1 transition-all duration-150 active:scale-[0.92]"
        >
          <motion.span
            className="relative flex items-center justify-center w-8 h-8 rounded-2xl"
            style={{
              color: moreOpen ? moreColor.active : moreColor.inactive,
              background: moreOpen ? moreColor.activeBg : "transparent",
            }}
            animate={{
              scale: moreOpen ? 1 : 0.95,
              rotate: moreOpen ? 90 : 0,
            }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {ICON_SVG.more}
          </motion.span>
          <span
            className="text-[10px] font-medium leading-none tracking-wide"
            style={{ color: moreOpen ? moreColor.active : moreColor.inactive }}
          >
            他
          </span>
        </button>
      </div>
    </nav>
  );
}
