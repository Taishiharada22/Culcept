"use client";

import { memo, useMemo, type ReactElement } from "react";
import type { ArchetypeCode } from "@/lib/stargazer/archetypeTypes";

/* ═══════════════════════════════════════════════
   ArchetypeEmblem — Procedural Generative SVG
   27タイプを Layer1×Layer2×Layer3 で決定的に生成
   ═══════════════════════════════════════════════ */

interface ArchetypeEmblemProps {
  code: ArchetypeCode;
  size: number;
  tilt?: { x: number; y: number };
  completeness?: number; // 0-100
  accentHex: string;
  glow: string;
  compact?: boolean;
}

/* ── Math helpers ── */
const TAU = Math.PI * 2;
const polar = (cx: number, cy: number, r: number, angle: number) => ({
  x: cx + r * Math.cos(angle),
  y: cy + r * Math.sin(angle),
});
const toPath = (pts: { x: number; y: number }[], close = true) => {
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  return close ? d + " Z" : d;
};

/* ═══════════════════════════════════════════════
   Layer1: 外形シルエット
   P=Crystal(宝石), B=Bloom(花弁), H=Hexagon(盾)
   ═══════════════════════════════════════════════ */
function getOuterPath(layer1: string, cx: number, cy: number, r: number): string {
  switch (layer1) {
    case "P": {
      // Crystal — 不規則7頂点の宝石
      const offsets = [0, 0.85, 1.75, 2.55, 3.45, 4.3, 5.2];
      const radii  = [r, r * 0.88, r * 0.95, r * 0.82, r * 0.98, r * 0.85, r * 0.92];
      const pts = offsets.map((a, i) => polar(cx, cy, radii[i], (a / TAU) * TAU - Math.PI / 2));
      return toPath(pts);
    }
    case "B": {
      // Bloom — 5枚花弁
      const petals = 5;
      const pts: string[] = [];
      for (let i = 0; i < petals; i++) {
        const a0 = (i / petals) * TAU - Math.PI / 2;
        const a1 = ((i + 0.5) / petals) * TAU - Math.PI / 2;
        const a2 = ((i + 1) / petals) * TAU - Math.PI / 2;
        const tip = polar(cx, cy, r, a1);
        const innerR = r * 0.42;
        const p0 = polar(cx, cy, innerR, a0);
        const p2 = polar(cx, cy, innerR, a2);
        const cp1 = polar(cx, cy, r * 0.82, a0 + (TAU / petals) * 0.18);
        const cp2 = polar(cx, cy, r * 0.82, a2 - (TAU / petals) * 0.18);
        if (i === 0) pts.push(`M${p0.x.toFixed(2)},${p0.y.toFixed(2)}`);
        pts.push(`C${cp1.x.toFixed(2)},${cp1.y.toFixed(2)} ${tip.x.toFixed(2)},${tip.y.toFixed(2)} ${tip.x.toFixed(2)},${tip.y.toFixed(2)}`);
        pts.push(`C${tip.x.toFixed(2)},${tip.y.toFixed(2)} ${cp2.x.toFixed(2)},${cp2.y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`);
      }
      return pts.join(" ") + " Z";
    }
    case "H":
    default: {
      // Hexagon — 正六角形
      const pts = Array.from({ length: 6 }, (_, i) =>
        polar(cx, cy, r, (i / 6) * TAU - Math.PI / 2)
      );
      return toPath(pts);
    }
  }
}

/* ═══════════════════════════════════════════════
   Layer2: 内部パターン
   E=Lattice(格子), I=Spiral(渦巻), S=Ripple(波紋)
   ═══════════════════════════════════════════════ */
function getInnerElements(
  layer2: string, cx: number, cy: number, r: number, accentHex: string, opacity: number
): ReactElement[] {
  const els: ReactElement[] = [];
  const innerR = r * 0.72;

  switch (layer2) {
    case "E": {
      // Lattice — 放射線 + 多角リング
      const spokes = 10;
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * TAU;
        const end = polar(cx, cy, innerR, a);
        els.push(
          <line key={`spoke-${i}`} x1={cx} y1={cy} x2={end.x} y2={end.y}
            stroke={accentHex} strokeWidth="0.4" opacity={opacity * 0.5} />
        );
      }
      // 2層のリング
      for (const scale of [0.4, 0.7]) {
        const ringR = innerR * scale;
        const pts = Array.from({ length: spokes }, (_, i) =>
          polar(cx, cy, ringR, (i / spokes) * TAU)
        );
        els.push(
          <polygon key={`ring-${scale}`}
            points={pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}
            fill="none" stroke={accentHex} strokeWidth="0.3" opacity={opacity * 0.4} />
        );
      }
      break;
    }
    case "I": {
      // Spiral — 3本の対数螺旋
      const arms = 3;
      for (let a = 0; a < arms; a++) {
        const startAngle = (a / arms) * TAU;
        const pts: string[] = [];
        for (let t = 0; t <= 60; t++) {
          const angle = startAngle + (t / 60) * TAU * 1.2;
          const rr = (t / 60) * innerR;
          const p = polar(cx, cy, rr, angle);
          pts.push(`${t === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`);
        }
        els.push(
          <path key={`spiral-${a}`} d={pts.join(" ")}
            fill="none" stroke={accentHex} strokeWidth="0.4" opacity={opacity * 0.45}
            strokeLinecap="round" />
        );
      }
      break;
    }
    case "S":
    default: {
      // Ripple — 同心波紋
      const rings = 4;
      for (let i = 1; i <= rings; i++) {
        const ringR = (i / rings) * innerR;
        els.push(
          <circle key={`ripple-${i}`} cx={cx} cy={cy} r={ringR}
            fill="none" stroke={accentHex} strokeWidth="0.35"
            opacity={opacity * (0.15 + (i / rings) * 0.35)} />
        );
      }
      // 中心ドット
      els.push(
        <circle key="center-dot" cx={cx} cy={cy} r={1.2}
          fill={accentHex} opacity={opacity * 0.6} />
      );
      break;
    }
  }
  return els;
}

/* ═══════════════════════════════════════════════
   Layer3: 装飾 + アニメーションスタイル
   A=Rays(光線), W=Pupil(瞳), D=Fractal(再帰)
   ═══════════════════════════════════════════════ */
function getDecorationElements(
  layer3: string, layer1: string, cx: number, cy: number, r: number,
  accentHex: string, opacity: number
): ReactElement[] {
  const els: ReactElement[] = [];

  switch (layer3) {
    case "A": {
      // Rays — 外向き三角光線
      const count = 8;
      const rayLen = r * 0.22;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU;
        const base1 = polar(cx, cy, r * 0.92, a - 0.08);
        const base2 = polar(cx, cy, r * 0.92, a + 0.08);
        const tip = polar(cx, cy, r + rayLen, a);
        els.push(
          <polygon key={`ray-${i}`}
            points={`${base1.x.toFixed(2)},${base1.y.toFixed(2)} ${tip.x.toFixed(2)},${tip.y.toFixed(2)} ${base2.x.toFixed(2)},${base2.y.toFixed(2)}`}
            fill={accentHex} opacity={opacity * 0.25}
            style={{ filter: `drop-shadow(0 0 2px ${accentHex})` }} />
        );
      }
      break;
    }
    case "W": {
      // Pupil — 中心の瞳
      els.push(
        <circle key="pupil-ring" cx={cx} cy={cy} r={r * 0.18}
          fill="none" stroke={accentHex} strokeWidth="0.6"
          opacity={opacity * 0.5}
          className="animate-[emblem-breathe_3s_ease-in-out_infinite]" />
      );
      els.push(
        <circle key="pupil-dot" cx={cx} cy={cy} r={r * 0.06}
          fill={accentHex} opacity={opacity * 0.7}
          className="animate-[emblem-breathe_3s_ease-in-out_infinite_0.5s]" />
      );
      break;
    }
    case "D":
    default: {
      // Fractal — 外形を縮小+回転で内部に2回繰り返し
      for (const scale of [0.55, 0.3]) {
        const fractalR = r * scale;
        const fractalPath = getOuterPath(layer1, cx, cy, fractalR);
        els.push(
          <path key={`fractal-${scale}`} d={fractalPath}
            fill="none" stroke={accentHex} strokeWidth="0.3"
            opacity={opacity * 0.25}
            style={{ transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${scale === 0.55 ? 30 : 60}deg)` }} />
        );
      }
      break;
    }
  }
  return els;
}

/* ═══════════════════════════════════════════════
   Animation class by Layer3
   ═══════════════════════════════════════════════ */
function getAnimationClass(layer3: string): string {
  switch (layer3) {
    case "A": return "animate-[emblem-rotate-cw_20s_linear_infinite]";
    case "W": return ""; // breathe is on inner elements, outer is still
    case "D": return "animate-[emblem-rotate-ccw_40s_linear_infinite]";
    default:  return "";
  }
}

/* ═══════════════════════════════════════════════
   Completeness → layer opacities
   ═══════════════════════════════════════════════ */
function getLayerOpacities(completeness: number) {
  const c = Math.max(0, Math.min(100, completeness));
  return {
    outer:      c < 5 ? 0.3 : Math.min(1, 0.3 + (c / 100) * 0.7),
    outerFill:  c < 25 ? 0 : Math.min(0.15, ((c - 25) / 75) * 0.15),
    inner:      c < 25 ? 0 : Math.min(1, ((c - 25) / 50) * 1),
    decoration: c < 50 ? 0 : Math.min(1, ((c - 50) / 50) * 1),
    glow:       c < 75 ? 0 : Math.min(1, ((c - 75) / 25) * 1),
  };
}

/* ═══════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════ */
const ArchetypeEmblem = memo(function ArchetypeEmblem({
  code, size, tilt, completeness = 50, accentHex, glow, compact = false,
}: ArchetypeEmblemProps) {
  const layer1 = code[0]; // P/B/H
  const layer2 = code[1]; // E/I/S
  const layer3 = code[2]; // A/W/D

  const viewSize = 100;
  const cx = viewSize / 2;
  const cy = viewSize / 2;
  const r = 36;

  const opacities = useMemo(() => getLayerOpacities(completeness), [completeness]);

  const outerPath = useMemo(() => getOuterPath(layer1, cx, cy, r), [layer1]);

  const innerEls = useMemo(
    () => opacities.inner > 0 && !compact
      ? getInnerElements(layer2, cx, cy, r, accentHex, opacities.inner)
      : [],
    [layer2, accentHex, opacities.inner, compact]
  );

  const decoEls = useMemo(
    () => opacities.decoration > 0 && !compact
      ? getDecorationElements(layer3, layer1, cx, cy, r, accentHex, opacities.decoration)
      : [],
    [layer3, layer1, accentHex, opacities.decoration, compact]
  );

  const animClass = compact ? "" : getAnimationClass(layer3);

  const tiltTransform = tilt
    ? `rotateX(${tilt.x * 0.15}deg) rotateY(${tilt.y * 0.15}deg)`
    : "";

  const tiltShadow = tilt
    ? `drop-shadow(${tilt.y * 1.5}px ${tilt.x * 1.5}px 6px ${glow})`
    : `drop-shadow(0 0 6px ${glow})`;

  return (
    <div
      style={{
        width: size, height: size,
        transform: tiltTransform,
        filter: opacities.glow > 0 ? tiltShadow : undefined,
        willChange: "transform",
        perspective: 200,
      }}
    >
      <svg
        viewBox={`0 0 ${viewSize} ${viewSize}`}
        width={size} height={size}
        className={animClass}
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* グラデーション fill */}
          <radialGradient id={`emblem-fill-${code}`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={accentHex} stopOpacity={opacities.outerFill * 2} />
            <stop offset="100%" stopColor={accentHex} stopOpacity={0} />
          </radialGradient>

          {/* グロー filter */}
          {opacities.glow > 0 && (
            <filter id={`emblem-glow-${code}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
            </filter>
          )}
        </defs>

        {/* Layer 0: Glow backdrop */}
        {opacities.glow > 0 && (
          <path d={outerPath}
            fill={accentHex} opacity={opacities.glow * 0.15}
            filter={`url(#emblem-glow-${code})`}
            className="animate-[emblem-shimmer_4s_ease-in-out_infinite]"
          />
        )}

        {/* Layer 1: Outer silhouette */}
        <path d={outerPath}
          fill={`url(#emblem-fill-${code})`}
          stroke={accentHex}
          strokeWidth={compact ? "0.6" : "0.8"}
          opacity={opacities.outer}
          strokeLinejoin="round"
        />

        {/* Layer 2: Inner pattern */}
        {innerEls}

        {/* Layer 3: Decoration */}
        {decoEls}

        {/* Center symbol — small, subtle */}
        {!compact && opacities.inner > 0.3 && (
          <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central"
            fontSize="8" fill="white" opacity={0.6}
            style={{ filter: `drop-shadow(0 0 3px ${glow})` }}>
          </text>
        )}
      </svg>
    </div>
  );
});

export default ArchetypeEmblem;

/* ═══════════════════════════════════════════════
   Canvas描画ヘルパー（ShareMyCardModal用）
   ═══════════════════════════════════════════════ */
export function drawEmblemOnCanvas(
  ctx: CanvasRenderingContext2D,
  code: string,
  cx: number, cy: number,
  size: number,
  accentHex: string
) {
  const layer1 = code[0];
  const r = size * 0.36;

  ctx.save();
  ctx.translate(cx, cy);

  // Glow
  ctx.shadowColor = accentHex;
  ctx.shadowBlur = size * 0.12;

  // Outer path
  ctx.beginPath();
  const pts = getCanvasOuterPoints(layer1, 0, 0, r);
  pts.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();

  // Fill
  const grad = ctx.createRadialGradient(0, -r * 0.2, 0, 0, 0, r);
  grad.addColorStop(0, accentHex + "30");
  grad.addColorStop(1, accentHex + "05");
  ctx.fillStyle = grad;
  ctx.fill();

  // Stroke
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  ctx.stroke();

  // Inner pattern
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  const layer2 = code[1];
  drawCanvasInnerPattern(ctx, layer2, 0, 0, r * 0.72, accentHex);

  ctx.restore();
}

function getCanvasOuterPoints(layer1: string, cx: number, cy: number, r: number) {
  switch (layer1) {
    case "P": {
      const offsets = [0, 0.85, 1.75, 2.55, 3.45, 4.3, 5.2];
      const radii  = [r, r * 0.88, r * 0.95, r * 0.82, r * 0.98, r * 0.85, r * 0.92];
      return offsets.map((a, i) => polar(cx, cy, radii[i], (a / TAU) * TAU - Math.PI / 2));
    }
    case "B": {
      // Simplified bloom for canvas
      const petals = 5;
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < petals * 2; i++) {
        const isOuter = i % 2 === 0;
        const a = (i / (petals * 2)) * TAU - Math.PI / 2;
        pts.push(polar(cx, cy, isOuter ? r : r * 0.42, a));
      }
      return pts;
    }
    case "H":
    default:
      return Array.from({ length: 6 }, (_, i) =>
        polar(cx, cy, r, (i / 6) * TAU - Math.PI / 2)
      );
  }
}

function drawCanvasInnerPattern(
  ctx: CanvasRenderingContext2D,
  layer2: string, cx: number, cy: number, r: number, color: string
) {
  ctx.strokeStyle = color;

  switch (layer2) {
    case "E": {
      const spokes = 10;
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * TAU;
        const end = polar(cx, cy, r, a);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
      break;
    }
    case "I": {
      for (let arm = 0; arm < 3; arm++) {
        const startA = (arm / 3) * TAU;
        ctx.beginPath();
        for (let t = 0; t <= 60; t++) {
          const angle = startA + (t / 60) * TAU * 1.2;
          const rr = (t / 60) * r;
          const p = polar(cx, cy, rr, angle);
          if (t === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      break;
    }
    case "S":
    default: {
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (i / 4) * r, 0, TAU);
        ctx.stroke();
      }
      break;
    }
  }
}
