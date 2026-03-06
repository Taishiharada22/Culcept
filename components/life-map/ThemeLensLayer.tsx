"use client";

import { useMemo } from "react";

// ThemeLensLayer.tsx — Opaque paper-textured theme circles at map edges

interface ThemeLensLayerProps {
  mapWidth: number;
  mapHeight: number;
  zoom: number;
}

interface LensDef {
  id: string;
  label: string;
  icon: string;
  color: string;
  fx: number;
  fy: number;
  spreadCenter: number;
  spreadArc: number;
}

const LENSES: LensDef[] = [
  { id: "friendship", label: "友情", icon: "🤝", color: "#7eb89e", fx: 0.08, fy: 0.20, spreadCenter: 45, spreadArc: 90 },
  { id: "challenge", label: "挑戦", icon: "🔥", color: "#d4895a", fx: 0.12, fy: 0.45, spreadCenter: 30, spreadArc: 80 },
  { id: "emotion", label: "感情", icon: "💧", color: "#6aa8c8", fx: 0.20, fy: 0.65, spreadCenter: -20, spreadArc: 90 },
  { id: "love", label: "恋愛", icon: "❤️", color: "#c86a7a", fx: 0.82, fy: 0.50, spreadCenter: 150, spreadArc: 80 },
  { id: "work", label: "仕事", icon: "💼", color: "#9a8a5a", fx: 0.88, fy: 0.65, spreadCenter: 200, spreadArc: 90 },
  { id: "face", label: "自分らしさ", icon: "🪞", color: "#a07ab8", fx: 0.78, fy: 0.12, spreadCenter: 240, spreadArc: 80 },
];

const LENS_SIZE = 260;

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export default function ThemeLensLayer({ mapWidth, mapHeight, zoom }: ThemeLensLayerProps) {
  const branches = useMemo(() => {
    return LENSES.map((lens) => {
      const rng = seededRandom(lens.id.length * 1000 + 42);
      const count = 5 + Math.floor(rng() * 4);
      const items: { angle: number; length: number; subCount: number }[] = [];
      for (let i = 0; i < count; i++) {
        const baseAngle = lens.spreadCenter - lens.spreadArc / 2 + (lens.spreadArc / (count - 1)) * i;
        const angle = baseAngle + (rng() - 0.5) * 15;
        const length = 60 + rng() * 50;
        const subCount = Math.floor(rng() * 3);
        items.push({ angle, length, subCount });
      }
      return { lensId: lens.id, items };
    });
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 15 }}>
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${mapWidth} ${mapHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="branchShadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(80,60,20,0.15)" />
          </filter>
          <radialGradient id="lensPaper" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(245,240,228,0.95)" />
            <stop offset="70%" stopColor="rgba(235,228,210,0.92)" />
            <stop offset="100%" stopColor="rgba(220,210,195,0.88)" />
          </radialGradient>
        </defs>

        {LENSES.map((lens, li) => {
          const cx = lens.fx * mapWidth;
          const cy = lens.fy * mapHeight;
          const branchData = branches[li];
          const r = (LENS_SIZE / 2) / zoom;

          return (
            <g key={lens.id} filter="url(#branchShadow)">
              <circle cx={cx} cy={cy} r={r} fill="url(#lensPaper)" stroke={lens.color} strokeWidth={3.5 / zoom} opacity={0.92} />
              {branchData.items.map((b, bi) => {
                const rad = (b.angle * Math.PI) / 180;
                const startX = cx + (r - 10 / zoom) * Math.cos(rad);
                const startY = cy + (r - 10 / zoom) * Math.sin(rad);
                const endX = cx + (r + b.length / zoom) * Math.cos(rad);
                const endY = cy + (r + b.length / zoom) * Math.sin(rad);
                return (
                  <g key={bi}>
                    <line x1={startX} y1={startY} x2={endX} y2={endY} stroke={lens.color} strokeWidth={7 / zoom} strokeLinecap="round" opacity={0.6} />
                    <circle cx={endX} cy={endY} r={10 / zoom} fill={lens.color} opacity={0.35} />
                    <circle cx={endX} cy={endY} r={5 / zoom} fill={lens.color} opacity={0.7} />
                    {Array.from({ length: b.subCount }).map((_, si) => {
                      const subRad = rad + ((si + 1) * 0.4 - 0.4 * (b.subCount / 2));
                      const mx = startX + (endX - startX) * (0.4 + si * 0.2);
                      const my = startY + (endY - startY) * (0.4 + si * 0.2);
                      const subLen = 25 + si * 10;
                      const sx = mx + (subLen / zoom) * Math.cos(subRad);
                      const sy = my + (subLen / zoom) * Math.sin(subRad);
                      return (
                        <g key={si}>
                          <line x1={mx} y1={my} x2={sx} y2={sy} stroke={lens.color} strokeWidth={4 / zoom} strokeLinecap="round" opacity={0.4} />
                          <circle cx={sx} cy={sy} r={4 / zoom} fill={lens.color} opacity={0.5} />
                        </g>
                      );
                    })}
                  </g>
                );
              })}
              <text x={cx} y={cy - 8 / zoom} textAnchor="middle" dominantBaseline="central" fontSize={44 / zoom}>{lens.icon}</text>
              <text x={cx} y={cy + 28 / zoom} textAnchor="middle" dominantBaseline="central" fontSize={28 / zoom} fontWeight="bold" fill="#4a3a2a" opacity={0.8}>{lens.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
