// app/stargazer/_tabs/star-map/StarMapSubNav.tsx
// アーキタイプタブ内サブビューナビゲーション — 3ピル型、モバイル・デスクトップ両対応
"use client";

import { motion } from "framer-motion";
import { useArchetypeTheme } from "../../_components/ArchetypeThemeProvider";
import { hexToRgba } from "../../_utils/color";

export type StarMapSubView = "overview" | "map" | "profile";

// SVG icons — 14x14, currentColor, strokeWidth 1.5
function IconOverview() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function IconConstellation() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <line x1="12" y1="7" x2="5" y2="17" />
      <line x1="12" y1="7" x2="19" y2="17" />
      <line x1="7" y1="19" x2="17" y2="19" />
    </svg>
  );
}

function IconProfile() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

interface SubNavItem {
  key: StarMapSubView;
  label: string;
  icon: React.ReactNode;
}

const SUB_NAV_ITEMS: SubNavItem[] = [
  { key: "overview", label: "概要", icon: <IconOverview /> },
  { key: "map", label: "特性マップ", icon: <IconConstellation /> },
  { key: "profile", label: "プロフィール", icon: <IconProfile /> },
];

interface StarMapSubNavProps {
  activeView: StarMapSubView;
  onChangeView: (view: StarMapSubView) => void;
}

export default function StarMapSubNav({
  activeView,
  onChangeView,
}: StarMapSubNavProps) {
  const { theme } = useArchetypeTheme();

  const activeBg = theme
    ? hexToRgba(theme.palette.primary, 0.12)
    : "rgba(176,144,80,0.12)";
  const activeBorder = theme
    ? hexToRgba(theme.palette.primary, 0.3)
    : "rgba(176,144,80,0.3)";
  const activeText = theme?.palette.text ?? "rgba(20,25,45,0.95)";
  const inactiveText = theme?.palette.textMuted ?? "rgba(100,105,130,0.6)";

  return (
    <nav
      aria-label="アーキタイプサブナビゲーション"
      className="sticky z-10 -mx-1 px-1 py-2"
      style={{
        top: "env(safe-area-inset-top, 0px)",
        paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        background: "rgba(255,255,255,0.75)",
      }}
    >
      <div
        className="flex gap-1.5 p-1 rounded-xl"
        style={{
          background: theme
            ? hexToRgba(theme.palette.primary, 0.04)
            : "rgba(176,144,80,0.04)",
          border: `1px solid ${theme ? hexToRgba(theme.palette.primary, 0.08) : "rgba(176,144,80,0.08)"}`,
        }}
      >
        {SUB_NAV_ITEMS.map((item) => {
          const isActive = activeView === item.key;

          return (
            <button
              key={item.key}
              onClick={() => onChangeView(item.key)}
              aria-current={isActive ? "page" : undefined}
              aria-label={item.label}
              className="relative flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors"
              style={{
                color: isActive ? activeText : inactiveText,
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="starmap-subnav-active"
                  className="absolute inset-0 rounded-lg"
                  style={{
                    background: activeBg,
                    border: `1px solid ${activeBorder}`,
                    boxShadow: `0 1px 4px ${theme ? hexToRgba(theme.palette.primary, 0.08) : "rgba(176,144,80,0.08)"}`,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 30,
                  }}
                />
              )}
              <span className="relative z-[1]">{item.icon}</span>
              <span className="relative z-[1] font-display text-xs sm:text-sm">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
