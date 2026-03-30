"use client";

import Link from "next/link";
import type React from "react";

/**
 * Unified Home Card component implementing the "主役と脇役の明暗" (hero vs supporting) hierarchy.
 *
 * 4 tiers:
 * - primary: gradient bg + colored shadow + bold — the ONE thing user should do next
 * - supporting: white bg + subtle border — important but not urgent
 * - completed: muted bg + low opacity — already done, just visible for reference
 * - urgent: rose gradient + pulse animation — time-sensitive (streak, vanishing insight)
 */

type Tier = "primary" | "supporting" | "completed" | "urgent";

type HomeCardProps = {
  tier?: Tier;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** data-tour attribute for HomeTour */
  dataTour?: string;
};

const tierStyles: Record<Tier, string> = {
  primary: [
    "bg-gradient-to-br from-indigo/[0.06] via-white to-violet/[0.04]",
    "border-[1.5px] border-indigo/30",
    "shadow-primary-glow",
    "hover:shadow-[0_12px_48px_rgba(99,102,241,0.4),0_4px_16px_rgba(0,0,0,0.1)]",
    "hover:-translate-y-1",
  ].join(" "),

  supporting: [
    "bg-surface",
    "border border-border-subtle",
    "shadow-card",
    "hover:shadow-card-hover",
    "hover:-translate-y-0.5",
    "hover:border-border-medium",
  ].join(" "),

  completed: [
    "bg-[#f5f5f8]",
    "border border-[rgba(0,0,0,0.03)]",
    "opacity-60",
    "shadow-none",
  ].join(" "),

  urgent: [
    "bg-gradient-to-br from-rose to-[#F87171]",
    "border-none",
    "shadow-[0_8px_32px_rgba(239,68,68,0.2),0_2px_8px_rgba(0,0,0,0.08)]",
    "text-white",
    "animate-[primaryActionPulse_3s_ease-in-out_infinite]",
    "hover:-translate-y-1",
  ].join(" "),
};

const baseTw = [
  "rounded-[20px]",
  "p-5",
  "transition-all duration-300 ease-out",
  "relative overflow-hidden",
].join(" ");

export default function HomeCard({
  tier = "supporting",
  href,
  onClick,
  children,
  className = "",
  style,
  dataTour,
}: HomeCardProps) {
  const tw = `${baseTw} ${tierStyles[tier]} ${className}`;

  if (href) {
    return (
      <Link
        href={href}
        className={tw}
        style={{ textDecoration: "none", color: "inherit", ...style }}
        data-tour={dataTour}
      >
        {children}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={tw}
        style={{ textAlign: "left", cursor: "pointer", width: "100%", ...style }}
        data-tour={dataTour}
      >
        {children}
      </button>
    );
  }

  return (
    <div className={tw} style={style} data-tour={dataTour}>
      {children}
    </div>
  );
}

/* ── Sub-components for common patterns ── */

export function CardLabel({ children, tier = "supporting" }: { children: React.ReactNode; tier?: Tier }) {
  const colorMap: Record<Tier, string> = {
    primary: "text-indigo",
    supporting: "text-text3",
    completed: "text-text4",
    urgent: "text-white/80",
  };
  return (
    <span className={`text-[9px] font-bold tracking-[2px] font-mono uppercase ${colorMap[tier]}`}>
      {children}
    </span>
  );
}

export function CardTitle({ children, tier = "supporting" }: { children: React.ReactNode; tier?: Tier }) {
  const colorMap: Record<Tier, string> = {
    primary: "text-text1",
    supporting: "text-text1",
    completed: "text-text3",
    urgent: "text-white",
  };
  return (
    <h3 className={`text-[15px] font-bold tracking-tight ${colorMap[tier]}`}>
      {children}
    </h3>
  );
}

export function CardBody({ children, tier = "supporting" }: { children: React.ReactNode; tier?: Tier }) {
  const colorMap: Record<Tier, string> = {
    primary: "text-text2",
    supporting: "text-text2",
    completed: "text-text4",
    urgent: "text-white/90",
  };
  return (
    <p className={`text-[12px] leading-relaxed mt-1 ${colorMap[tier]}`}>
      {children}
    </p>
  );
}
