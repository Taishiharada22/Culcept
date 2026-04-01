"use client";

/**
 * AtmosphereProvider — 世界観の没入
 * 時間帯に応じたCSS custom propertiesを注入し、
 * 没入的な雰囲気を演出するラッパーコンポーネント。
 * night/midnight ではフローティングパーティクルを表示。
 */

import { ReactNode, useEffect, useState, useMemo } from "react";
import {
  getAtmosphere,
  getTimeZone,
  getGreeting,
  type AtmosphereTheme,
  type TimeZone,
} from "@/lib/rendezvous/atmosphere";

type Props = {
  children: ReactNode;
};

// ────────────────────────────────────────────
// Floating particle dots (CSS-only, night/midnight)
// ────────────────────────────────────────────

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function FloatingParticles({ color }: { color: string }) {
  // Use deterministic seed based on date to avoid hydration mismatch
  const particles = useMemo(() => {
    const daySeed = 20260313; // fixed seed for consistency
    const items: Array<{
      id: number;
      left: string;
      top: string;
      size: number;
      delay: string;
      duration: string;
      opacity: number;
    }> = [];
    const r = (seed: number, decimals = 4) => {
      const v = seededRandom(seed);
      return Math.round(v * 10 ** decimals) / 10 ** decimals;
    };
    for (let i = 0; i < 24; i++) {
      const s = daySeed + i;
      items.push({
        id: i,
        left: `${r(s * 1, 2) * 100}%`,
        top: `${r(s * 2, 2) * 100}%`,
        size: Math.round((1.5 + r(s * 3) * 2.5) * 100) / 100,
        delay: `${r(s * 4, 2) * 8}s`,
        duration: `${Math.round((6 + r(s * 5) * 8) * 100) / 100}s`,
        opacity: Math.round((0.15 + r(s * 6) * 0.35) * 100) / 100,
      });
    }
    return items;
  }, []);

  return (
    <>
      <style>{`
        @keyframes rv-atm-float {
          0%, 100% {
            transform: translateY(0) translateX(0);
            opacity: 0;
          }
          10% { opacity: var(--rv-p-opacity); }
          50% {
            transform: translateY(-30px) translateX(8px);
            opacity: var(--rv-p-opacity);
          }
          90% { opacity: var(--rv-p-opacity); }
        }
      `}</style>
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        {particles.map((p) => (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              background: color,
              "--rv-p-opacity": p.opacity,
              animation: `rv-atm-float ${p.duration} ease-in-out ${p.delay} infinite`,
              opacity: 0,
              boxShadow: `0 0 ${p.size * 2}px ${color}`,
            } as React.CSSProperties}
          />
        ))}
      </div>
    </>
  );
}

// ────────────────────────────────────────────
// AtmosphereProvider
// ────────────────────────────────────────────

export default function AtmosphereProvider({ children }: Props) {
  const [atmosphere, setAtmosphere] = useState<AtmosphereTheme>(() =>
    getAtmosphere(),
  );
  const [zone, setZone] = useState<TimeZone>(() => getTimeZone());
  const [reducedMotion, setReducedMotion] = useState(false);

  // Update atmosphere every minute
  useEffect(() => {
    const update = () => {
      const newZone = getTimeZone();
      if (newZone !== zone) {
        setZone(newZone);
        setAtmosphere(getAtmosphere());
      }
    };
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [zone]);

  // Detect prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time browser API read
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const showParticles =
    !reducedMotion && (zone === "night" || zone === "midnight");

  return (
    <div
      data-rv-zone={zone}
      style={
        {
          "--rv-bg": atmosphere.bg,
          "--rv-text-primary": atmosphere.textPrimary,
          "--rv-text-secondary": atmosphere.textSecondary,
          "--rv-card-bg": atmosphere.cardBg,
          "--rv-card-border": atmosphere.cardBorder,
          "--rv-accent": atmosphere.accent,
          "--rv-particle-color": atmosphere.particleColor,
          background: atmosphere.bg,
          minHeight: "100vh",
          position: "relative",
          transition: "background 2s ease-in-out",
          color: atmosphere.textPrimary,
        } as React.CSSProperties
      }
    >
      {showParticles && <FloatingParticles color={atmosphere.particleColor} />}

      {/* Content above particles */}
      <div style={{ position: "relative", zIndex: 2 }}>{children}</div>
    </div>
  );
}
