"use client";

import { memo } from "react";
import type { Crystal } from "@/lib/rendezvous/memoryCrystal";
import { getCrystalVisualConfig } from "@/lib/rendezvous/memoryCrystal";

type Props = {
  crystal: Crystal;
  size: "sm" | "md" | "lg";
};

const SIZE_MAP = { sm: 32, md: 48, lg: 72 } as const;

// ────────────────────────────────────────────
// Shape path generators (centered in viewbox)
// ────────────────────────────────────────────

function roundShape(cx: number, cy: number, r: number) {
  return <circle cx={cx} cy={cy} r={r} />;
}

function facetedShape(cx: number, cy: number, r: number) {
  // hexagon
  const pts = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");
  return <polygon points={pts} />;
}

function starShape(cx: number, cy: number, r: number) {
  const inner = r * 0.45;
  const pts = Array.from({ length: 10 }, (_, i) => {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : inner;
    return `${cx + rad * Math.cos(angle)},${cy + rad * Math.sin(angle)}`;
  }).join(" ");
  return <polygon points={pts} />;
}

function dropShape(cx: number, cy: number, r: number) {
  // teardrop using path
  const d = `M ${cx} ${cy - r} Q ${cx + r} ${cy - r * 0.2} ${cx} ${cy + r} Q ${cx - r} ${cy - r * 0.2} ${cx} ${cy - r} Z`;
  return <path d={d} />;
}

function spiralShape(cx: number, cy: number, r: number) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} />
      <path
        d={`M ${cx} ${cy - r * 0.6} A ${r * 0.3} ${r * 0.3} 0 1 1 ${cx + r * 0.3} ${cy} A ${r * 0.5} ${r * 0.5} 0 1 0 ${cx - r * 0.1} ${cy + r * 0.4}`}
        fill="none"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth={r * 0.08}
        strokeLinecap="round"
      />
    </>
  );
}

// ────────────────────────────────────────────
// Animation CSS keyframes per preset
// ────────────────────────────────────────────

const ANIMATION_CSS: Record<string, string> = {
  glow: "crystal-glow 3s ease-in-out infinite",
  pulse: "crystal-pulse 2s ease-in-out infinite",
  sparkle: "crystal-sparkle 2.5s ease-in-out infinite",
  rotate: "crystal-rotate 8s linear infinite",
  expand: "crystal-expand 3s ease-in-out infinite",
  float: "crystal-float 4s ease-in-out infinite",
  shimmer: "crystal-shimmer 3s ease-in-out infinite",
  breathe: "crystal-breathe 4s ease-in-out infinite",
};

const KEYFRAMES = `
@keyframes crystal-glow { 0%,100%{filter:drop-shadow(0 0 4px var(--glow))} 50%{filter:drop-shadow(0 0 12px var(--glow))} }
@keyframes crystal-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
@keyframes crystal-sparkle { 0%,100%{opacity:0.85;transform:scale(1)} 25%{opacity:1;transform:scale(1.05)} 75%{opacity:0.9;transform:scale(0.97)} }
@keyframes crystal-rotate { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
@keyframes crystal-expand { 0%,100%{transform:scale(1)} 50%{transform:scale(1.12)} }
@keyframes crystal-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
@keyframes crystal-shimmer { 0%,100%{opacity:0.8} 50%{opacity:1} }
@keyframes crystal-breathe { 0%,100%{transform:scale(1);opacity:0.85} 50%{transform:scale(1.06);opacity:1} }
`;

const CrystalVisualizer = memo(function CrystalVisualizer({ crystal, size }: Props) {
  const px = SIZE_MAP[size];
  const config = getCrystalVisualConfig(crystal.type);
  const vb = 100;
  const cx = vb / 2;
  const cy = vb / 2;
  const r = vb * 0.38;
  const filterId = `glow-${crystal.id}`;
  const gradId = `grad-${crystal.id}`;

  const shapeEl = (() => {
    switch (crystal.shape) {
      case "round":
        return roundShape(cx, cy, r);
      case "faceted":
        return facetedShape(cx, cy, r);
      case "star":
        return starShape(cx, cy, r);
      case "drop":
        return dropShape(cx, cy, r);
      case "spiral":
        return spiralShape(cx, cy, r);
      default:
        return roundShape(cx, cy, r);
    }
  })();

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div
        style={
          {
            width: px,
            height: px,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            animation: ANIMATION_CSS[config.animationPreset] ?? "none",
            "--glow": config.glowColor,
          } as React.CSSProperties
        }
      >
        <svg
          width={px}
          height={px}
          viewBox={`0 0 ${vb} ${vb}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id={gradId} cx="40%" cy="35%" r="60%">
              <stop offset="0%" stopColor={config.glowColor} stopOpacity={0.9} />
              <stop offset="60%" stopColor={config.color} stopOpacity={0.85} />
              <stop offset="100%" stopColor={config.color} stopOpacity={0.6} />
            </radialGradient>
          </defs>
          <g filter={`url(#${filterId})`} fill={`url(#${gradId})`}>
            {shapeEl}
          </g>
        </svg>
      </div>
    </>
  );
});

export default CrystalVisualizer;
