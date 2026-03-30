// components/ui/rendezvous-design.tsx
// Rendezvous デザインシステム — ライトベース + ワインレッド〜オレンジの温もり
// 写真が主役。色は「瞬間」に使う。
"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// =============================================================================
// カラーパレット
// =============================================================================

export const RV_COLORS = {
  base: "#FAFAF8",
  surface: "#FFFFFF",
  surfaceMuted: "#F5F3F0",

  primary: "#C2185B",
  primaryLight: "#E91E63",
  primaryGlow: "rgba(194,24,91,0.25)",
  primarySoft: "rgba(194,24,91,0.08)",

  accent: "#FF6D00",
  accentWarm: "#FF8F00",
  accentGlow: "rgba(255,109,0,0.20)",
  accentSoft: "rgba(255,109,0,0.08)",

  gradient: "linear-gradient(135deg, #C2185B 0%, #E91E63 30%, #FF6D00 70%, #FF8F00 100%)",
  gradientSubtle: "linear-gradient(135deg, rgba(194,24,91,0.06) 0%, rgba(255,109,0,0.06) 100%)",

  secondary: "#7B61FF",
  secondaryGlow: "rgba(123,97,255,0.20)",
  secondarySoft: "rgba(123,97,255,0.08)",

  success: "#00C853",
  successGlow: "rgba(0,200,83,0.20)",

  text: "#1A1025",
  textSub: "#6B6580",
  textMuted: "#A8A0B8",

  shadow: "rgba(26,16,37,0.08)",
  shadowDeep: "rgba(26,16,37,0.14)",
  border: "rgba(26,16,37,0.06)",
  borderActive: "rgba(194,24,91,0.20)",
} as const;

export const RV_CATEGORY_COLORS = {
  romantic: "#E91E63",
  friendship: "#7B61FF",
  cocreation: "#FF6D00",
  community: "#00C853",
  partner: "#D4776B", // テラコッタコーラル — 温かさ・深さ・持続を表現
} as const;

export const RV_CATEGORY_LABELS: Record<RvCategory, string> = {
  romantic: "恋愛",
  friendship: "友情",
  cocreation: "ビジネス",
  community: "仲間",
  partner: "パートナー",
};

export type RvCategory = keyof typeof RV_CATEGORY_COLORS;

// =============================================================================
// RvCard
// =============================================================================

export type RvCardProps = {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
  accentBorder?: string;
  onClick?: () => void;
};

export function RvCard({ children, className, elevated, accentBorder, onClick }: RvCardProps) {
  return (
    <motion.div
      whileTap={onClick ? { scale: 0.985 } : undefined}
      whileHover={onClick ? { y: -2 } : undefined}
      onClick={onClick}
      className={cn("rounded-2xl p-5 relative overflow-hidden", onClick && "cursor-pointer", className)}
      style={{
        backgroundColor: RV_COLORS.surface,
        border: accentBorder ? `1.5px solid ${accentBorder}` : `1px solid ${RV_COLORS.border}`,
        boxShadow: elevated ? `0 8px 32px ${RV_COLORS.shadowDeep}` : `0 2px 12px ${RV_COLORS.shadow}`,
        color: RV_COLORS.text,
      }}
    >
      {children}
    </motion.div>
  );
}

// =============================================================================
// RvGlowCard — ワインレッド〜オレンジのグラデーションボーダー
// =============================================================================

export function RvGlowCard({
  children, className, gradient, onClick,
}: { children: ReactNode; className?: string; gradient?: string; onClick?: () => void }) {
  return (
    <motion.div
      whileTap={onClick ? { scale: 0.98 } : undefined}
      whileHover={onClick ? { scale: 1.01 } : undefined}
      onClick={onClick}
      className={cn("relative rounded-2xl p-[2px] overflow-hidden", onClick && "cursor-pointer", className)}
      style={{ background: gradient ?? RV_COLORS.gradient }}
    >
      <div className="relative rounded-[14px] p-5" style={{ backgroundColor: RV_COLORS.surface, color: RV_COLORS.text }}>
        {children}
      </div>
    </motion.div>
  );
}

// =============================================================================
// RvBadge
// =============================================================================

export type RvBadgeProps = { category: RvCategory; label?: string; className?: string };

export function RvBadge({ category, label, className }: RvBadgeProps) {
  const color = RV_CATEGORY_COLORS[category];
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold leading-none tracking-wide", className)}
      style={{ backgroundColor: `${color}12`, color, border: `1px solid ${color}20` }}
    >
      {label ?? RV_CATEGORY_LABELS[category]}
    </span>
  );
}

// =============================================================================
// RvButton
// =============================================================================

export type RvButtonVariant = "primary" | "secondary" | "ghost" | "glow";
export type RvButtonProps = { children: ReactNode; variant?: RvButtonVariant; className?: string; disabled?: boolean; onClick?: () => void };

export function RvButton({ children, variant = "primary", className, disabled, onClick }: RvButtonProps) {
  const styles: Record<RvButtonVariant, React.CSSProperties> = {
    primary: { background: RV_COLORS.gradient, color: "#FFFFFF", boxShadow: `0 4px 16px ${RV_COLORS.primaryGlow}` },
    secondary: { background: "transparent", color: RV_COLORS.primary, border: `1.5px solid ${RV_COLORS.primary}40` },
    ghost: { background: "transparent", color: RV_COLORS.textSub },
    glow: { background: RV_COLORS.gradient, color: "#FFFFFF", boxShadow: `0 4px 20px ${RV_COLORS.primaryGlow}, 0 0 30px ${RV_COLORS.accentGlow}` },
  };
  return (
    <motion.button whileTap={disabled ? undefined : { scale: 0.95 }} whileHover={disabled ? undefined : { scale: 1.02, y: -1 }}
      disabled={disabled} onClick={onClick}
      className={cn("inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all", disabled && "opacity-40 cursor-not-allowed", className)}
      style={styles[variant]}
    >{children}</motion.button>
  );
}

// =============================================================================
// RvReactionBar
// =============================================================================

export const RV_REACTIONS = ["fire", "gem", "laugh", "target", "think", "angry"] as const;
export type RvReaction = (typeof RV_REACTIONS)[number];
const REACTION_EMOJI: Record<RvReaction, string> = { fire: "\uD83D\uDD25", gem: "\uD83D\uDC8E", laugh: "\uD83D\uDE02", target: "\uD83C\uDFAF", think: "\uD83E\uDD14", angry: "\uD83D\uDE24" };
export type RvReactionBarProps = { onReact: (reaction: RvReaction) => void; active?: RvReaction | null; className?: string };

export function RvReactionBar({ onReact, active, className }: RvReactionBarProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {RV_REACTIONS.map((r) => (
        <motion.button key={r} whileTap={{ scale: 1.35 }} whileHover={{ scale: 1.12 }} onClick={() => onReact(r)}
          className="flex items-center justify-center w-10 h-10 rounded-full text-lg transition-all"
          style={{ backgroundColor: active === r ? RV_COLORS.surfaceMuted : "transparent", border: active === r ? `1px solid ${RV_COLORS.border}` : "1px solid transparent" }}
          aria-label={r}
        >{REACTION_EMOJI[r]}</motion.button>
      ))}
    </div>
  );
}

// =============================================================================
// RvProgressRing
// =============================================================================

export type RvProgressRingProps = { progress: number; size?: number; strokeWidth?: number; color?: string; children?: ReactNode; className?: string };

export function RvProgressRing({ progress, size = 64, strokeWidth = 4, color = RV_COLORS.primary, children, className }: RvProgressRingProps) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={RV_COLORS.surfaceMuted} strokeWidth={strokeWidth} />
        <motion.circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: circ * (1 - Math.min(Math.max(progress,0),1)) }}
          transition={{ duration: 0.8, ease: "easeOut" }} style={{ strokeDasharray: circ }} />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}

// =============================================================================
// RvStoryProgressBar
// =============================================================================

export type RvStoryProgressBarProps = { total: number; current: number; progress?: number; className?: string };
export function RvStoryProgressBar({ total, current, progress = 0, className }: RvStoryProgressBarProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="relative flex-1 h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: RV_COLORS.surfaceMuted }}>
          <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: RV_COLORS.gradient }} initial={false}
            animate={{ width: i < current ? "100%" : i === current ? `${progress*100}%` : "0%" }} transition={{ duration: 0.3, ease: "easeOut" }} />
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// RvTabBar
// =============================================================================

export type RvTab = "home" | "explore" | "chat" | "cosmos" | "profile";
export type RvTabBarProps = { active: RvTab; onSelect: (tab: RvTab) => void; className?: string };
const TAB_ITEMS: { id: RvTab; icon: string }[] = [
  { id: "home", icon: "\uD83C\uDF0C" }, { id: "explore", icon: "\u2728" },
  { id: "chat", icon: "\uD83D\uDCAC" }, { id: "cosmos", icon: "\uD83E\uDE90" }, { id: "profile", icon: "\uD83D\uDC64" },
];

export function RvTabBar({ active, onSelect, className }: RvTabBarProps) {
  return (
    <nav className={cn("fixed bottom-0 left-0 right-0 z-50 flex items-end justify-around pb-[env(safe-area-inset-bottom)] px-2 pt-2 pb-3", className)}
      style={{ backgroundColor: "rgba(250,250,248,0.92)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderTop: `1px solid ${RV_COLORS.border}` }}
    >
      {TAB_ITEMS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button key={tab.id} onClick={() => onSelect(tab.id)} className="relative flex flex-col items-center gap-0.5 px-3 py-1">
            <span className="text-xl leading-none" style={{ filter: isActive ? "none" : "grayscale(0.8) opacity(0.5)" }}>{tab.icon}</span>
            {isActive && <motion.div layoutId="rv-tab-indicator" className="absolute -bottom-0.5 w-5 h-[3px] rounded-full" style={{ background: RV_COLORS.gradient }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />}
          </button>
        );
      })}
    </nav>
  );
}

// =============================================================================
// RvAnimaText
// =============================================================================

export type RvAnimaTextProps = { text: string; reveal?: boolean; revealSpeed?: number; className?: string; onComplete?: () => void };
export function RvAnimaText({ text, reveal = false, revealSpeed = 50, className, onComplete }: RvAnimaTextProps) {
  const [visibleCount, setVisibleCount] = useState(reveal ? 0 : text.length);
  const cb = useRef(onComplete); cb.current = onComplete;
  useEffect(() => { if (!reveal) { setVisibleCount(text.length); return; } setVisibleCount(0); let i = 0;
    const t = setInterval(() => { i++; setVisibleCount(i); if (i >= text.length) { clearInterval(t); cb.current?.(); } }, revealSpeed);
    return () => clearInterval(t);
  }, [text, reveal, revealSpeed]);
  return (
    <p className={cn("leading-relaxed", className)} style={{ fontFamily: '"Noto Serif JP", serif', color: RV_COLORS.text }}>
      <span>{text.slice(0, visibleCount)}</span>
      {reveal && visibleCount < text.length && <motion.span animate={{ opacity: [1,0] }} transition={{ duration: 0.5, repeat: Infinity }} className="inline-block w-[2px] h-[1em] align-middle ml-px" style={{ backgroundColor: RV_COLORS.primary }} />}
    </p>
  );
}

// =============================================================================
// RvFocusBlur
// =============================================================================

export type RvFocusBlurProps = { depth: number; children: ReactNode; className?: string };
export function RvFocusBlur({ depth, children, className }: RvFocusBlurProps) {
  const c = Math.min(Math.max(depth,0),1);
  return <motion.div className={cn(className)} animate={{ filter: `blur(${c*6}px)`, opacity: 1-c*0.35 }} transition={{ duration: 0.4, ease: "easeOut" }}>{children}</motion.div>;
}

// =============================================================================
// RvSectionTitle
// =============================================================================

export function RvSectionTitle({ children, accent, className }: { children: ReactNode; accent?: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="w-1 h-5 rounded-full" style={{ background: accent ? `linear-gradient(180deg, ${accent}, ${accent}40)` : RV_COLORS.gradient }} />
      <h3 className="text-sm font-bold tracking-wide" style={{ color: RV_COLORS.text }}>{children}</h3>
    </div>
  );
}

// =============================================================================
// RvHeartbeat
// =============================================================================

export function RvHeartbeat({ size = 48, color = RV_COLORS.primary, intensity = 1, className }: { size?: number; color?: string; intensity?: number; className?: string }) {
  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      <motion.div className="absolute inset-0 rounded-full" style={{ backgroundColor: `${color}20` }}
        animate={{ scale: [1, 1.3+intensity*0.3, 1, 1.15+intensity*0.15, 1] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", times: [0, 0.15, 0.35, 0.45, 0.7] }} />
      <motion.div className="absolute inset-[20%] rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 ${12+intensity*12}px ${color}60` }}
        animate={{ scale: [1, 1.1+intensity*0.1, 1, 1.05, 1] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", times: [0, 0.15, 0.35, 0.45, 0.7] }} />
    </div>
  );
}

// =============================================================================
// RvLaneHeader — Reusable lane header with title + tagline + background
// =============================================================================

export type RvLaneHeaderProps = {
  title: string;
  subtitle: string;
  tagline: string;
  color: string;
  backgroundTint?: string;
  children?: ReactNode;
  className?: string;
};

export function RvLaneHeader({ title, subtitle, tagline, color, backgroundTint, children, className }: RvLaneHeaderProps) {
  return (
    <div className={cn("relative px-6 pt-8 pb-6", className)}>
      {backgroundTint && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: backgroundTint }} />
      )}
      <div className="relative">
        <div className="flex items-baseline gap-3 mb-2">
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: RV_COLORS.text, fontFamily: '"Noto Serif JP", serif' }}
          >
            {title}
          </h1>
          <span
            className="text-xs font-medium tracking-widest uppercase"
            style={{ color }}
          >
            {subtitle}
          </span>
        </div>
        <p
          className="text-sm leading-relaxed"
          style={{ color: RV_COLORS.textMuted, fontFamily: '"Noto Serif JP", serif' }}
        >
          {tagline}
        </p>
        {children}
      </div>
    </div>
  );
}

// =============================================================================
// RvLockedPreview — "Locked" overlay for gated content
// =============================================================================

export type RvLockedPreviewProps = {
  message: string;
  subMessage?: string;
  color?: string;
  className?: string;
};

export function RvLockedPreview({ message, subMessage, color = RV_COLORS.textMuted, className }: RvLockedPreviewProps) {
  return (
    <div
      className={cn("relative rounded-2xl overflow-hidden p-8 text-center", className)}
      style={{
        background: `linear-gradient(135deg, ${RV_COLORS.surfaceMuted} 0%, ${RV_COLORS.base} 100%)`,
        border: `1px dashed ${RV_COLORS.border}`,
      }}
    >
      <div
        className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
        style={{ background: `${color}10`, border: `1px solid ${color}15` }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <p className="text-sm font-medium mb-1" style={{ color: RV_COLORS.textSub }}>
        {message}
      </p>
      {subMessage && (
        <p className="text-xs" style={{ color: RV_COLORS.textMuted }}>
          {subMessage}
        </p>
      )}
    </div>
  );
}

// =============================================================================
// RvActionCircle — Circular action button (for romance swipe bar etc.)
// =============================================================================

export type RvActionCircleProps = {
  icon: ReactNode;
  size?: number;
  color: string;
  variant?: "filled" | "outlined";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
};

export function RvActionCircle({ icon, size = 56, color, variant = "outlined", onClick, disabled, className }: RvActionCircleProps) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.85 }}
      whileHover={disabled ? undefined : { scale: 1.08 }}
      onClick={onClick}
      disabled={disabled}
      className={cn("flex items-center justify-center rounded-full transition-all", disabled && "opacity-30 cursor-not-allowed", className)}
      style={{
        width: size,
        height: size,
        background: variant === "filled" ? color : "transparent",
        color: variant === "filled" ? "#fff" : color,
        border: variant === "outlined" ? `2px solid ${color}40` : "none",
        boxShadow: variant === "filled" ? `0 4px 16px ${color}30` : `0 2px 8px ${RV_COLORS.shadow}`,
      }}
    >
      {icon}
    </motion.button>
  );
}

// =============================================================================
// RvEmptyState — Premium empty state
// =============================================================================

export type RvEmptyStateProps = {
  message: string;
  subMessage?: string;
  color?: string;
  className?: string;
};

export function RvEmptyState({ message, subMessage, color = RV_COLORS.textMuted, className }: RvEmptyStateProps) {
  return (
    <div className={cn("text-center py-16 px-8", className)}>
      <div
        className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
        style={{ background: `${color}08` }}
      >
        <div
          className="w-3 h-3 rounded-full"
          style={{ background: `${color}30` }}
        />
      </div>
      <p
        className="text-sm font-medium leading-relaxed mb-2"
        style={{ color: RV_COLORS.textSub, fontFamily: '"Noto Serif JP", serif' }}
      >
        {message}
      </p>
      {subMessage && (
        <p className="text-xs leading-relaxed" style={{ color: RV_COLORS.textMuted }}>
          {subMessage}
        </p>
      )}
    </div>
  );
}
