"use client";

import { useMemo } from "react";

// CloudCurtainLayer.tsx — White fluffy clouds at map edges

interface CloudCurtainLayerProps {
  phase: number;
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface CloudDef {
  x: number;
  y: number;
  w: number;
  h: number;
  blur: number;
  opacity: number;
  delay: number;
  drift: number;
}

export default function CloudCurtainLayer({ phase }: CloudCurtainLayerProps) {
  const clouds = useMemo(() => {
    const rng = seededRandom(77);
    const items: CloudDef[] = [];
    for (let i = 0; i < 60; i++) {
      let x = rng() * 100;
      let y = rng() * 100;
      if (x > 25 && x < 75 && y > 20 && y < 75) {
        if (rng() > 0.5) x = rng() > 0.5 ? rng() * 20 : 80 + rng() * 20;
        else y = rng() > 0.5 ? rng() * 15 : 80 + rng() * 20;
      }
      items.push({
        x, y,
        w: 80 + rng() * 220,
        h: (80 + rng() * 220) * (0.3 + rng() * 0.25),
        blur: 18 + rng() * 18,
        opacity: 0.4 + rng() * 0.55,
        delay: rng() * 3,
        drift: 10 + rng() * 30,
      });
    }
    return items;
  }, []);

  if (phase === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 25 }}>
      {phase >= 1 && (
        <div
          className="absolute inset-0 transition-opacity duration-1000"
          style={{
            opacity: phase >= 2 ? 1 : 0.5,
            background: "radial-gradient(ellipse 55% 50% at 50% 50%, transparent 45%, rgba(255,250,240,0.35) 75%, rgba(255,250,240,0.6) 100%)",
          }}
        />
      )}
      {phase >= 2 && clouds.map((c, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${c.x}%`,
            top: `${c.y}%`,
            width: c.w,
            height: c.h,
            background: `radial-gradient(ellipse at 50% 50%, rgba(255,252,245,${c.opacity}) 0%, rgba(255,250,240,${c.opacity * 0.5}) 60%, transparent 100%)`,
            filter: `blur(${c.blur}px)`,
            opacity: phase >= 3 ? 1 : 0.6,
            transition: "opacity 1.5s ease",
            animation: `cloudDrift${i % 4} ${20 + c.drift}s ease-in-out infinite`,
            animationDelay: `${c.delay}s`,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
      <style jsx>{`
        @keyframes cloudDrift0 { 0%, 100% { transform: translate(-50%, -50%) translateX(0); } 50% { transform: translate(-50%, -50%) translateX(12px); } }
        @keyframes cloudDrift1 { 0%, 100% { transform: translate(-50%, -50%) translateY(0); } 50% { transform: translate(-50%, -50%) translateY(-8px); } }
        @keyframes cloudDrift2 { 0%, 100% { transform: translate(-50%, -50%) translate(0, 0); } 50% { transform: translate(-50%, -50%) translate(8px, -6px); } }
        @keyframes cloudDrift3 { 0%, 100% { transform: translate(-50%, -50%) translate(0, 0); } 50% { transform: translate(-50%, -50%) translate(-10px, 4px); } }
      `}</style>
    </div>
  );
}
