"use client";

// components/home/PrimaryActionBanner.tsx
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Single Primary Action Banner — Premium Glassmorphism Edition
//
// 脳科学的根拠:
// Hick's Law — 選択肢が増えると決定時間が対数的に増加。
// 1つのアクションに収束させることで、認知負荷ゼロの行動導線を実現。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import Link from "next/link";
import type { PrimaryAction } from "@/lib/stargazer/primaryAction";
import { getActionStyle } from "@/lib/stargazer/primaryAction";

interface Props {
  action: PrimaryAction;
}

const mono = "'JetBrains Mono','SF Mono',monospace";

export default function PrimaryActionBanner({ action }: Props) {
  const style = getActionStyle(action.urgency);

  const isCritical = action.urgency === "critical" || action.urgency === "high";

  return (
    <Link
      href={action.href}
      className="hov"
      style={{
        display: "block",
        padding: "14px 16px 12px",
        borderRadius: 16,
        textDecoration: "none",
        background: style.gradient,
        border: `1px solid ${style.borderColor}`,
        boxShadow: `0 12px 40px ${style.shadowColor}, 0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.12)`,
        position: "relative",
        overflow: "hidden",
        animation: style.pulseAnimation ? "primaryActionPulse 3s ease-in-out infinite" : undefined,
      }}
    >
      {/* Ambient orb — top right */}
      <div
        style={{
          position: "absolute",
          top: -30,
          right: -20,
          width: 140,
          height: 140,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      {/* Ambient orb — bottom left */}
      <div
        style={{
          position: "absolute",
          bottom: -40,
          left: -20,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${style.shadowColor}, transparent 60%)`,
          pointerEvents: "none",
          opacity: 0.5,
        }}
      />
      {/* Shimmer sweep */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.08) 50%, transparent 60%)",
          backgroundSize: "200% 100%",
          animation: "nextActionShimmer 4s ease-in-out infinite",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Header: urgency tag + countdown */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Icon with glow ring */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.18)",
                boxShadow: isCritical
                  ? "0 0 16px rgba(255,255,255,0.15), 0 0 32px rgba(255,255,255,0.05)"
                  : "0 0 8px rgba(255,255,255,0.08)",
                fontSize: 18,
              }}
            >
              {action.icon}
            </div>
            <div
              style={{
                padding: "3px 10px",
                borderRadius: 8,
                background: isCritical
                  ? "rgba(255,255,255,0.18)"
                  : "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.12)",
                fontSize: 9,
                letterSpacing: "0.12em",
                color: "rgba(255,255,255,0.85)",
                fontFamily: mono,
                fontWeight: 700,
              }}
            >
              {isCritical ? "URGENT" : "NEXT ACTION"}
            </div>
          </div>

          {/* Countdown badge */}
          {action.countdown && (
            <div
              style={{
                padding: "5px 12px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.15)",
                backdropFilter: "blur(8px)",
                fontSize: 11,
                fontWeight: 700,
                color: "#fff",
                fontFamily: mono,
                animation: isCritical ? "countdownPulse 2s ease-in-out infinite" : undefined,
              }}
            >
              {action.countdown.label}
            </div>
          )}
        </div>

        {/* Main label */}
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.45,
            letterSpacing: -0.3,
            textShadow: "0 1px 8px rgba(0,0,0,0.12)",
          }}
        >
          {action.label}
        </div>

        {/* Sublabel */}
        <div
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.65)",
            marginTop: 6,
            lineHeight: 1.6,
          }}
        >
          {action.sublabel}
        </div>

        {/* CTA pill with arrow animation */}
        <div
          style={{
            marginTop: 10,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.22)",
            backdropFilter: "blur(8px)",
            color: style.textColor,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 0.3,
            transition: "background 0.2s",
          }}
        >
          {isCritical ? "今すぐ" : "始める"}
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ animation: "arrowBounce 1.5s ease-in-out infinite" }}>
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      <style>{`
        @keyframes nextActionShimmer {
          0%, 100% { background-position: -200% 0; }
          50% { background-position: 200% 0; }
        }
        @keyframes countdownPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes arrowBounce {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(4px); }
        }
      `}</style>
    </Link>
  );
}
