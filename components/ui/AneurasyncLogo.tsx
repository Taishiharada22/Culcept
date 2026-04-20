"use client";

import { memo } from "react";

interface AneurasyncLogoProps {
  /** Display size in px */
  size?: number;
  /** Fill/stroke color (default: currentColor) */
  color?: string;
  /** Enable organic breathing pulse (default: false — static logo) */
  animate?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/* ═══════════════ geometry ═══════════════ */

const CX = 12;
const CY = 12;
const NR = 2.5; // nucleus radius
const DEG = Math.PI / 180;
const f = (n: number) => n.toFixed(1);

// 7 arms — prime number, natural asymmetry
// [angle, length, cv1(1/3 curve), cv2(2/3 curve), baseHalfWidth, extend, dur, delay]
// cv1 & cv2 opposite sign → subtle S-curve ("searching")
const RAW: readonly (readonly [number, number, number, number, number, number, number, number])[] = [
  [15, 8.2, 1.2, 0.7, 1.3, 2.8, 0.70, 0.00],
  [67, 5.5, -0.9, -0.5, 1.1, 2.0, 0.85, 0.05],
  [115, 7.2, 1.0, -0.4, 1.2, 2.5, 0.60, 0.12], // S-curve
  [165, 6.2, -0.8, -0.5, 1.1, 2.2, 0.95, 0.03],
  [218, 8.0, 1.0, 0.7, 1.4, 3.0, 0.65, 0.08],
  [272, 5.2, -0.6, 0.3, 1.0, 1.8, 0.80, 0.15], // S-curve
  [328, 7.5, -1.1, -0.7, 1.3, 2.6, 0.55, 0.02],
];

function calcArm(i: number) {
  const [a, len, cv1, cv2, bw, ext, dur, del] = RAW[i];
  const r = a * DEG;
  const co = Math.cos(r);
  const si = Math.sin(r);

  // direction (SVG coords) & perpendicular
  const dx = co;
  const dy = -si;
  const px = si; // perp CCW
  const py = co;

  // key points along center line
  const bx = CX + NR * dx;
  const by = CY + NR * dy;
  const armLen = len - NR;
  const tipX = CX + len * dx;
  const tipY = CY + len * dy;

  // cubic bezier control points (at 1/3 and 2/3 of arm) with curve offsets
  const c1x = bx + armLen * 0.33 * dx + cv1 * px;
  const c1y = by + armLen * 0.33 * dy + cv1 * py;
  const c2x = bx + armLen * 0.67 * dx + cv2 * px;
  const c2y = by + armLen * 0.67 * dy + cv2 * py;

  // tapered outline: base(1.0) → cp1(0.5) → cp2(0.12) → tip(0)
  // left side (base→tip), then right side (tip→base)
  const d =
    `M${f(bx + bw * px)} ${f(by + bw * py)}` +
    `C${f(c1x + bw * 0.5 * px)} ${f(c1y + bw * 0.5 * py)} ` +
    `${f(c2x + bw * 0.12 * px)} ${f(c2y + bw * 0.12 * py)} ` +
    `${f(tipX)} ${f(tipY)}` +
    `C${f(c2x - bw * 0.12 * px)} ${f(c2y - bw * 0.12 * py)} ` +
    `${f(c1x - bw * 0.5 * px)} ${f(c1y - bw * 0.5 * py)} ` +
    `${f(bx - bw * px)} ${f(by - bw * py)}Z`;

  // animation: radial extend
  const atx = (ext * co).toFixed(2);
  const aty = (-ext * si).toFixed(2);

  return { d, atx, aty, dur, del };
}

const BR = Array.from({ length: RAW.length }, (_, i) => calcArm(i));

/* ═══════════════ CSS keyframes ═══════════════ */

// Arms: fast extend (40%), slow retract (60%) — breathing rhythm
const CSS =
  BR.map(
    (b, i) =>
      `@keyframes _anrsk${i}{` +
      `0%,100%{transform:translate(0,0)}` +
      `40%{transform:translate(${b.atx}px,${b.aty}px)}` +
      `}`,
  ).join("") +
  // Nucleus glow: slow deep pulse
  `@keyframes _anrsk_glow{0%,100%{opacity:.12}50%{opacity:.22}}` +
  `@media(prefers-reduced-motion:reduce){[data-anrsk]{animation:none!important}}`;

// Breathing easing: snap out, ease back
const BREATH = "cubic-bezier(0.16,1,0.3,1)";

/* ═══════════════ component ═══════════════ */

const AneurasyncLogo = memo(function AneurasyncLogo({
  size = 24,
  color = "currentColor",
  animate = false,
  className,
  style: sx,
}: AneurasyncLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...sx }}
      role="img"
      aria-label="Aneurasync"
    >
      <defs>
        <style>{CSS}</style>
      </defs>

      {/* ── Nucleus glow (behind everything) ── */}
      <circle cx={CX} cy={CY} r={NR + 2.5} fill={color} opacity={0.05} />
      <circle
        cx={CX}
        cy={CY}
        r={NR + 1.2}
        fill={color}
        data-anrsk=""
        opacity={0.12}
        style={animate ? { animation: `_anrsk_glow 2.5s ease-in-out infinite` } : undefined}
      />

      {/* ── Arms — tapered filled shapes ── */}
      {BR.map((b, i) => (
        <g
          key={i}
          data-anrsk=""
          style={
            animate
              ? { animation: `_anrsk${i} ${b.dur}s ${BREATH} ${b.del}s infinite` }
              : undefined
          }
        >
          <path d={b.d} fill={color} />
        </g>
      ))}

      {/* ── Nucleus core (on top, covers arm bases) ── */}
      <circle cx={CX} cy={CY} r={NR} fill={color} />
    </svg>
  );
});

export default AneurasyncLogo;
