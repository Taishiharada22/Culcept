"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion";
import Link from "next/link";
import { trackFeatureView, trackInteraction } from "@/lib/stargazer/trackClient";
import {
  GlassCard,
  GlassButton,
  GlassBadge,
  FadeInView,
  LightBackground,
  Skeleton,
} from "@/components/ui/glassmorphism-design";
import {
  generatePsycheSignature,
  generatePsycheWrapped,
  type PsycheSignature,
  type PsycheWrapped,
  type SignatureInput,
  type SignatureShape,
  type WrappedStat,
} from "@/lib/stargazer/psycheSignature";

// ---------------------------------------------------------------------------
// Archetype Color Palette — Layer1 x Layer3 combinations
// ---------------------------------------------------------------------------
const ARCHETYPE_COLOR_PALETTES: Record<string, { primary: string; secondary: string; accent: string }> = {
  PA: { primary: "#FF6B35", secondary: "#FF9F1C", accent: "#FFD700" },
  PW: { primary: "#6B5B95", secondary: "#9B8EC4", accent: "#D4C5F9" },
  PD: { primary: "#2C3E50", secondary: "#34495E", accent: "#1ABC9C" },
  BA: { primary: "#E74C3C", secondary: "#FF7675", accent: "#FD79A8" },
  BW: { primary: "#3498DB", secondary: "#74B9FF", accent: "#A8D8EA" },
  BD: { primary: "#2D3436", secondary: "#636E72", accent: "#00CEC9" },
  HA: { primary: "#F39C12", secondary: "#FDCB6E", accent: "#FFEAA7" },
  HW: { primary: "#00B894", secondary: "#55EFC4", accent: "#81ECEC" },
  HD: { primary: "#2D3436", secondary: "#636E72", accent: "#B2BEC3" },
};

function getArchetypePalette(code: string) {
  const key = (code[0] ?? "P") + (code[2] ?? "A");
  return ARCHETYPE_COLOR_PALETTES[key] ?? ARCHETYPE_COLOR_PALETTES["PA"]!;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
const today = new Date();
const weekAgo = new Date(today.getTime() - 7 * 86400000);

const MOCK_INPUT: SignatureInput = {
  archetypeCode: "PEA",
  axisScores: {
    cautious_vs_bold: 0.2,
    change_embrace_vs_resist: -0.3,
    perfectionist_vs_pragmatic: -0.4,
    independence_vs_harmony: 0.1,
    direct_vs_diplomatic: 0.15,
    analytical_vs_intuitive: 0.35,
    plan_vs_spontaneous: -0.1,
    introvert_vs_extrovert: -0.2,
    emotional_variability: 0.25,
    minimal_vs_maximal: 0.1,
    tradition_vs_novelty: 0.3,
  },
  weatherHistory: [
    { date: weekAgo.toISOString().slice(0, 10), type: "calm" },
    { date: new Date(weekAgo.getTime() + 86400000).toISOString().slice(0, 10), type: "storm" },
    { date: new Date(weekAgo.getTime() + 2 * 86400000).toISOString().slice(0, 10), type: "rain" },
    { date: new Date(weekAgo.getTime() + 3 * 86400000).toISOString().slice(0, 10), type: "cloudy" },
    { date: new Date(weekAgo.getTime() + 4 * 86400000).toISOString().slice(0, 10), type: "aurora" },
    { date: new Date(weekAgo.getTime() + 5 * 86400000).toISOString().slice(0, 10), type: "sunny" },
    { date: today.toISOString().slice(0, 10), type: "calm" },
  ],
  blindSpotDrops: 5,
  prophecyAccuracy: 0.68,
  mapProgress: 0.42,
  discoveries: [
    "完璧主義の裏に「失敗への恐怖」ではなく「退屈への恐怖」があった",
    "直感を信じる場面で実は慎重になっていた",
    "他者評価への依存が減少傾向にある",
  ],
  period: "weekly",
  periodStart: weekAgo.toISOString().slice(0, 10),
  periodEnd: today.toISOString().slice(0, 10),
};

// ---------------------------------------------------------------------------
// Shape descriptions
// ---------------------------------------------------------------------------
const SHAPE_MEANINGS: Record<SignatureShape, { name: string; meaning: string; icon: string }> = {
  circle:  { name: "調和環",  meaning: "安定と調和を求める心。内向的で、確実な選択を好む傾向がある。", icon: "circle" },
  star:    { name: "放射星",  meaning: "外向的なエネルギーと大胆さの象徴。周囲を照らす存在。", icon: "star" },
  crystal: { name: "結晶体",  meaning: "複雑な内面構造を持つ。矛盾を内包しながらも美しい秩序を保つ。", icon: "crystal" },
  wave:    { name: "波動形",  meaning: "感情の豊かさと変動性。流れに身を任せる柔軟さがある。", icon: "wave" },
  spiral:  { name: "螺旋",   meaning: "成長と変化を求め続ける。同じ場所に留まることを拒む。", icon: "spiral" },
  flame:   { name: "焔型",   meaning: "情熱と高い強度。大胆に燃え上がり、周囲を巻き込む力がある。", icon: "flame" },
};

// ---------------------------------------------------------------------------
// PsycheSignatureVisual — SVG-based animated fingerprint
// ---------------------------------------------------------------------------
function PsycheSignatureVisual({
  shape,
  dominantColor,
  stateColor,
  weatherColor,
  complexity,
  symmetry,
  pulseIntensity,
  size = 300,
}: {
  shape: SignatureShape;
  dominantColor: string;
  stateColor: string;
  weatherColor: string;
  complexity: number;
  symmetry: number;
  pulseIntensity: number;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const particleCount = Math.min(Math.floor(complexity * 4), 40);
  const orbitCount = 2 + (complexity > 6 ? 1 : 0);
  const pulseScale = 0.98 + pulseIntensity * 0.04;

  // Generate deterministic particles
  const particles = useMemo(() => {
    const result: Array<{ x: number; y: number; r: number; delay: number; duration: number }> = [];
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const dist = 80 + (i * 37 % 60);
      result.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        r: 1 + (i % 3),
        delay: (i * 0.15) % 3,
        duration: 2 + (i % 3),
      });
    }
    return result;
  }, [particleCount, cx, cy]);

  const renderCoreShape = () => {
    const baseR = 55 + complexity * 3;
    switch (shape) {
      case "circle":
        return (
          <motion.circle
            cx={cx} cy={cy} r={baseR}
            fill="url(#coreGrad)"
            animate={{ scale: [1, pulseScale, 1] }}
            transition={{ duration: 3 + pulseIntensity, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
        );
      case "star": {
        const points = 5 + Math.floor(complexity / 3);
        const outer = baseR;
        const inner = outer * (0.4 + symmetry * 0.2);
        const d = Array.from({ length: points * 2 }, (_, i) => {
          const angle = (Math.PI * i) / points - Math.PI / 2;
          const r = i % 2 === 0 ? outer : inner;
          return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
        }).join(" ");
        return (
          <motion.polygon
            points={d}
            fill="url(#coreGrad)"
            animate={{ scale: [1, pulseScale, 1] }}
            transition={{ duration: 3 + pulseIntensity, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
        );
      }
      case "crystal": {
        const sides = 6 + Math.floor(complexity / 2);
        const r = baseR;
        const pts = Array.from({ length: sides }, (_, i) => {
          const angle = (2 * Math.PI * i) / sides - Math.PI / 2;
          const jitter = i % 2 === 0 ? 1 : 0.85 + symmetry * 0.15;
          return `${cx + r * jitter * Math.cos(angle)},${cy + r * jitter * Math.sin(angle)}`;
        }).join(" ");
        return (
          <motion.polygon
            points={pts}
            fill="url(#coreGrad)"
            animate={{ scale: [1, pulseScale, 1] }}
            transition={{ duration: 3 + pulseIntensity, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
        );
      }
      case "wave": {
        const amp = 25 + complexity * 3;
        const freq = 3 + Math.floor(complexity / 3);
        const pts: string[] = [];
        for (let x = cx - 80; x <= cx + 80; x += 2) {
          const nx = (x - (cx - 80)) / 160;
          const y = cy + Math.sin(nx * freq * Math.PI * 2) * amp;
          pts.push(`${x},${y}`);
        }
        // Close the path to make it fillable
        const dPath = `M ${pts.join(" L ")} L ${cx + 80},${cy + amp + 20} L ${cx - 80},${cy + amp + 20} Z`;
        return (
          <motion.path
            d={dPath}
            fill="url(#coreGrad)"
            opacity={0.8}
            animate={{ y: [-3, 3, -3] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
        );
      }
      case "spiral": {
        const turns = 2.5 + complexity * 0.2;
        const pts: string[] = [];
        for (let t = 0; t < turns * Math.PI * 2; t += 0.08) {
          const r = 5 + t * (55 / (turns * Math.PI * 2));
          pts.push(`${cx + r * Math.cos(t)},${cy + r * Math.sin(t)}`);
        }
        return (
          <motion.polyline
            points={pts.join(" ")}
            fill="none"
            stroke="url(#coreGrad)"
            strokeWidth={5 + complexity * 0.4}
            strokeLinecap="round"
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
        );
      }
      case "flame": {
        const h = 80 + complexity * 4;
        const w = 30 + complexity * 2;
        return (
          <motion.path
            d={`M${cx},${cy + h * 0.35} Q${cx - w},${cy - h * 0.05} ${cx},${cy - h * 0.45} Q${cx + w},${cy - h * 0.05} ${cx},${cy + h * 0.35} Z`}
            fill="url(#coreGrad)"
            animate={{ scale: [1, pulseScale + 0.01, 1, pulseScale - 0.005, 1] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
        );
      }
    }
  };

  return (
    <motion.svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full h-full max-w-[300px] max-h-[300px] mx-auto"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <defs>
        {/* Core gradient: dominant -> state */}
        <radialGradient id="coreGrad" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor={dominantColor} stopOpacity="1" />
          <stop offset="60%" stopColor={stateColor} stopOpacity="0.85" />
          <stop offset="100%" stopColor={weatherColor} stopOpacity="0.5" />
        </radialGradient>
        {/* Ambient glow */}
        <radialGradient id="ambientGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={dominantColor} stopOpacity="0.15" />
          <stop offset="70%" stopColor={stateColor} stopOpacity="0.05" />
          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
        </radialGradient>
        {/* Particle gradient */}
        <radialGradient id="particleGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={weatherColor} stopOpacity="0.9" />
          <stop offset="100%" stopColor={weatherColor} stopOpacity="0" />
        </radialGradient>
        {/* Glow filter */}
        <filter id="sigGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Soft blur for ambient */}
        <filter id="softBlur">
          <feGaussianBlur stdDeviation="20" />
        </filter>
      </defs>

      {/* Ambient glow background */}
      <motion.circle
        cx={cx} cy={cy} r={120}
        fill="url(#ambientGlow)"
        filter="url(#softBlur)"
        initial={{ r: 120 }}
        animate={{ r: [120, 140, 120] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Orbit rings */}
      {Array.from({ length: orbitCount }, (_, i) => {
        const orbitR = 75 + i * 25;
        const orbitOpacity = (0.15 + symmetry * 0.15) * (1 - i * 0.2);
        return (
          <motion.circle
            key={`orbit-${i}`}
            cx={cx} cy={cy} r={orbitR}
            fill="none"
            stroke={i % 2 === 0 ? stateColor : weatherColor}
            strokeWidth={1}
            strokeOpacity={orbitOpacity}
            strokeDasharray={i === 0 ? "none" : `${4 + i * 2} ${3 + i}`}
            animate={{ rotate: i % 2 === 0 ? [0, 360] : [360, 0] }}
            transition={{ duration: 45 + i * 15, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
        );
      })}

      {/* Particles */}
      {particles.map((p, i) => (
        <motion.circle
          key={`particle-${i}`}
          cx={p.x} cy={p.y} r={p.r}
          fill={i % 3 === 0 ? weatherColor : i % 3 === 1 ? stateColor : dominantColor}
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0.7, 0],
            scale: [0.5, 1.2, 0.5],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Core shape with glow */}
      <g filter="url(#sigGlow)">
        {renderCoreShape()}
      </g>

      {/* Center highlight */}
      <circle
        cx={cx} cy={cy} r={15}
        fill="white"
        opacity={0.15}
      />
    </motion.svg>
  );
}

// ---------------------------------------------------------------------------
// TraitRadarChart — SVG radar with glassmorphism fill
// ---------------------------------------------------------------------------
// スコア解釈:
//   score -1〜+1 → normalized 0〜100
//   中央(50%) = ニュートラル
//   外側(100%) = positive側（ラベル右側の特性が強い）
//   内側(0%)   = negative側（ラベル左側の特性が強い）
// ---------------------------------------------------------------------------
interface RadarAxis {
  key: string;
  label: string;         // "大胆" (positive側 = 外側方向のラベル)
  negLabel?: string;     // "慎重" (negative側 = 内側方向のラベル)
  score: number; // -1 to 1, will be normalized to 0-100
}

function TraitRadarChart({
  axes,
  compareAxes,
  dominantColor = "#8B5CF6",
  compareColor = "#3B82F6",
  size = 280,
}: {
  axes: RadarAxis[];
  compareAxes?: RadarAxis[];
  dominantColor?: string;
  compareColor?: string;
  size?: number;
}) {
  const padding = 48;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.34;
  const total = axes.length;

  function getPoint(index: number, normalizedScore: number): [number, number] {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    const r = radius * (normalizedScore / 100);
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  function getPolygonPoints(data: RadarAxis[]): string {
    return data
      .map((d, i) => {
        const normalized = ((d.score + 1) / 2) * 100;
        const [x, y] = getPoint(i, normalized);
        return `${x},${y}`;
      })
      .join(" ");
  }

  function getGridPath(level: number): string {
    const points = Array.from({ length: total }, (_, i) => {
      const [x, y] = getPoint(i, level);
      return `${x},${y}`;
    });
    return `M ${points.join(" L ")} Z`;
  }

  const gridLevels = [25, 50, 75, 100];
  const mainPoints = getPolygonPoints(axes);
  const overlayPoints = compareAxes ? getPolygonPoints(compareAxes) : null;

  return (
    <div>
    <svg
      viewBox={`${-padding} ${-padding} ${size + padding * 2} ${size + padding * 2}`}
      width={size + padding * 2}
      height={size + padding * 2}
      className="mx-auto"
      style={{ overflow: "visible" }}
    >
      <defs>
        <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={dominantColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={dominantColor} stopOpacity="0.08" />
        </radialGradient>
      </defs>

      {/* Grid */}
      {gridLevels.map((level) => (
        <path
          key={level}
          d={getGridPath(level)}
          fill="none"
          stroke={level === 50 ? "rgba(160,170,200,0.3)" : "rgba(160,170,200,0.12)"}
          strokeWidth={level === 50 ? 1.5 : 0.5}
          strokeDasharray={level === 50 ? "4 3" : "none"}
        />
      ))}

      {/* 中間ラベル（50%基準線の説明） */}
      <text
        x={cx + 4}
        y={cy - radius * 0.5 - 6}
        textAnchor="start"
        fill="rgba(120,130,160,0.5)"
        fontSize={9}
        fontFamily="var(--font-mono, monospace)"
      >
        中間
      </text>

      {/* Axis lines */}
      {axes.map((_, i) => {
        const [x, y] = getPoint(i, 100);
        return (
          <line
            key={`axis-${i}`}
            x1={cx} y1={cy} x2={x} y2={y}
            stroke="rgba(160,170,200,0.1)"
            strokeWidth={1}
          />
        );
      })}

      {/* Compare polygon */}
      {overlayPoints && (
        <motion.polygon
          points={overlayPoints}
          fill={compareColor}
          fillOpacity={0.06}
          stroke={compareColor}
          strokeWidth={1.5}
          strokeOpacity={0.4}
          strokeDasharray="4 3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        />
      )}

      {/* Main polygon */}
      <motion.polygon
        points={mainPoints}
        fill="url(#radarFill)"
        stroke={dominantColor}
        strokeWidth={2}
        strokeOpacity={0.7}
        strokeLinejoin="round"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
      />

      {/* Data points */}
      {axes.map((d, i) => {
        const normalized = ((d.score + 1) / 2) * 100;
        const [px, py] = getPoint(i, normalized);
        return (
          <motion.circle
            key={`pt-${i}`}
            cx={px} cy={py} r={3.5}
            fill={dominantColor}
            stroke="white"
            strokeWidth={1.5}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.06, type: "spring", stiffness: 200 }}
          />
        );
      })}

      {/* Labels — positive側（外側方向）を強調、negative側（内側）を小さく添える */}
      {axes.map((d, i) => {
        const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
        const labelR = radius + 26;
        const x = cx + labelR * Math.cos(angle);
        const y = cy + labelR * Math.sin(angle);
        let anchor: "start" | "middle" | "end" = "middle";
        if (Math.cos(angle) > 0.3) anchor = "start";
        else if (Math.cos(angle) < -0.3) anchor = "end";

        return (
          <g key={`label-${i}`}>
            {/* メインラベル（外側 = positive側） */}
            <text
              x={x} y={y + 2}
              textAnchor={anchor}
              fill="rgba(40,45,65,0.88)"
              fontSize={11.5}
              fontWeight={700}
            >
              {d.label}
            </text>
            {/* サブラベル（内側 = negative側） */}
            {d.negLabel && (
              <text
                x={x} y={y + 15}
                textAnchor={anchor}
                fill="rgba(120,130,160,0.55)"
                fontSize={9}
                fontWeight={400}
              >
                ← {d.negLabel}
              </text>
            )}
          </g>
        );
      })}
    </svg>

    {/* 凡例: チャートの読み方 */}
    <p className="text-[10px] text-center mt-1" style={{ color: "rgba(120,130,160,0.6)" }}>
      外側ほど強い傾向 ・ 破線 = 中間（どちらでもない）
    </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShareCard — 1:1 social card
// ---------------------------------------------------------------------------
function ShareCard({
  signature,
  wrapped,
  archetypeCode,
}: {
  signature: PsycheSignature;
  wrapped: PsycheWrapped;
  archetypeCode: string;
}) {
  const palette = getArchetypePalette(archetypeCode);

  return (
    <div
      className="relative w-full aspect-square max-w-[400px] mx-auto rounded-3xl overflow-hidden"
      style={{
        background: `linear-gradient(145deg, ${palette.primary} 0%, ${palette.secondary} 50%, ${palette.accent} 100%)`,
      }}
    >
      {/* Noise texture overlay */}
      <div className="absolute inset-0 opacity-[0.06]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      }} />

      {/* Glass circle background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] rounded-full bg-white/10 backdrop-blur-sm" />

      {/* Signature visual */}
      <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-[55%]">
        <PsycheSignatureVisual
          shape={signature.shape}
          dominantColor="rgba(255,255,255,0.9)"
          stateColor="rgba(255,255,255,0.6)"
          weatherColor="rgba(255,255,255,0.3)"
          complexity={signature.complexity}
          symmetry={signature.symmetry}
          pulseIntensity={0.3}
          size={200}
        />
      </div>

      {/* Text content */}
      <div className="absolute bottom-0 left-0 right-0 p-6 text-center text-white">
        <p className="text-xs tracking-[0.3em] uppercase opacity-70 mb-2">
          Psyche Signature
        </p>
        <p className="text-2xl font-bold mb-1">
          {SHAPE_MEANINGS[signature.shape].name}
        </p>
        <p className="text-sm opacity-80 mb-3">
          {wrapped.shareCard.archetypeHint}
        </p>
        <div className="flex justify-center gap-4 text-xs opacity-70 mb-4">
          <span>複雑さ {signature.complexity}/10</span>
          <span>対称性 {Math.round(signature.symmetry * 100)}%</span>
        </div>
        <div className="pt-3 border-t border-white/20">
          <p className="text-[10px] tracking-[0.2em] uppercase opacity-50">
            Aneurasync Stargazer
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AnimatedCounter — Spotify Wrapped-style number counter
// ---------------------------------------------------------------------------
function AnimatedCounter({ value, delay = 0 }: { value: number; delay?: number }) {
  const [displayed, setDisplayed] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay * 1000);
    return () => clearTimeout(t);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    const duration = 800;
    const steps = 20;
    const stepDuration = duration / steps;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      // Ease-out curve
      const progress = 1 - Math.pow(1 - step / steps, 3);
      setDisplayed(Math.round(value * progress));
      if (step >= steps) {
        clearInterval(interval);
        setDisplayed(value);
      }
    }, stepDuration);
    return () => clearInterval(interval);
  }, [started, value]);

  return (
    <span className="text-3xl font-bold text-white tabular-nums">{displayed}</span>
  );
}

// ---------------------------------------------------------------------------
// UniquenessRadar — Dual overlay: user vs average
// ---------------------------------------------------------------------------
function UniquenessRadar({
  axes,
  dominantColor,
  averageColor,
  size = 220,
}: {
  axes: RadarAxis[];
  dominantColor: string;
  averageColor: string;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.38;
  const total = axes.length;

  function getPoint(index: number, score: number): [number, number] {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    // Normalize score from [-1,1] to [0,1]
    const normalized = (score + 1) / 2;
    const r = radius * normalized;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  function getPolygonPoints(scores: number[]): string {
    return scores.map((s, i) => getPoint(i, s).join(",")).join(" ");
  }

  function getGridPath(level: number): string {
    const points = Array.from({ length: total }, (_, i) => {
      const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
      const r = radius * level;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    });
    return `M ${points.join(" L ")} Z`;
  }

  // "Average" scores are all 0 (center)
  const averageScores = axes.map(() => 0);
  const userPoints = getPolygonPoints(axes.map((a) => a.score));
  const avgPoints = getPolygonPoints(averageScores);

  return (
    <svg
      viewBox={`-30 -30 ${size + 60} ${size + 60}`}
      width={size}
      height={size}
      className="mx-auto"
      style={{ overflow: "visible" }}
    >
      {[0.33, 0.66, 1].map((level) => (
        <path
          key={level}
          d={getGridPath(level)}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={0.5}
        />
      ))}

      {/* Average filled circle (neutral) */}
      <motion.polygon
        points={avgPoints}
        fill={averageColor}
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={1}
        strokeDasharray="3 3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        transition={{ delay: 0.3 }}
      />

      {/* User polygon */}
      <motion.polygon
        points={userPoints}
        fill={`${dominantColor.replace(/[\d.]+\)$/, "0.12)")}`}
        stroke={dominantColor}
        strokeWidth={2}
        strokeLinejoin="round"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.25 }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />

      {/* Axis labels */}
      {axes.map((a, i) => {
        const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
        const labelR = radius + 18;
        const x = cx + labelR * Math.cos(angle);
        const y = cy + labelR * Math.sin(angle);
        let anchor: "start" | "middle" | "end" = "middle";
        if (Math.cos(angle) > 0.3) anchor = "start";
        else if (Math.cos(angle) < -0.3) anchor = "end";

        return (
          <text
            key={`u-label-${i}`}
            x={x} y={y + 4}
            textAnchor={anchor}
            fill="rgba(255,255,255,0.55)"
            fontSize={9}
            fontWeight={500}
          >
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// WrappedStoryCards — Full-screen swipeable Spotify Wrapped experience
// ---------------------------------------------------------------------------

interface StoryCard {
  id: string;
  title: string;
  subtitle?: string;
  content: React.ReactNode;
  gradient: string;
}

function WrappedStoryCards({
  signature,
  wrapped,
  archetypeCode,
  onClose,
}: {
  signature: PsycheSignature;
  wrapped: PsycheWrapped;
  archetypeCode: string;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const palette = getArchetypePalette(archetypeCode);

  const discoveryStats = wrapped.stats.filter((s) => s.category === "discovery");
  const patternStats = wrapped.stats.filter((s) => s.category === "pattern");
  const edgeStats = wrapped.stats.filter((s) => s.category === "edge");

  // Build axes for radar
  const STORY_AXIS_MAP: Record<string, { label: string; negLabel: string }> = {
    cautious_vs_bold: { label: "大胆", negLabel: "慎重" },
    change_embrace_vs_resist: { label: "変化志向", negLabel: "安定志向" },
    perfectionist_vs_pragmatic: { label: "実用的", negLabel: "完璧主義" },
    independence_vs_harmony: { label: "調和的", negLabel: "独立的" },
    direct_vs_diplomatic: { label: "外交的", negLabel: "率直" },
    analytical_vs_intuitive: { label: "直感的", negLabel: "分析的" },
    plan_vs_spontaneous: { label: "即興的", negLabel: "計画的" },
    introvert_vs_extrovert: { label: "外向的", negLabel: "内向的" },
  };
  const radarAxes: RadarAxis[] = Object.entries(MOCK_INPUT.axisScores)
    .slice(0, 8)
    .map(([key, score]) => ({
      key,
      label: STORY_AXIS_MAP[key]?.label ?? key,
      negLabel: STORY_AXIS_MAP[key]?.negLabel,
      score,
    }));

  const AXIS_LABEL_MAP: Record<string, { label: string; negLabel: string }> = {
    cautious_vs_bold: { label: "大胆", negLabel: "慎重" },
    change_embrace_vs_resist: { label: "変化志向", negLabel: "安定志向" },
    perfectionist_vs_pragmatic: { label: "実用的", negLabel: "完璧主義" },
    independence_vs_harmony: { label: "調和的", negLabel: "独立的" },
    direct_vs_diplomatic: { label: "外交的", negLabel: "率直" },
    analytical_vs_intuitive: { label: "直感的", negLabel: "分析的" },
    plan_vs_spontaneous: { label: "即興的", negLabel: "計画的" },
    introvert_vs_extrovert: { label: "外向的", negLabel: "内向的" },
  };

  const cleanRadarAxes: RadarAxis[] = Object.entries(MOCK_INPUT.axisScores)
    .slice(0, 8)
    .map(([key, score]) => ({
      key,
      label: AXIS_LABEL_MAP[key]?.label ?? key,
      negLabel: AXIS_LABEL_MAP[key]?.negLabel,
      score,
    }));

  const cards: StoryCard[] = [
    // Card 1: Shape
    {
      id: "shape",
      title: "あなたの形",
      gradient: `linear-gradient(160deg, ${palette.primary} 0%, ${palette.secondary} 100%)`,
      content: (
        <div className="flex flex-col items-center justify-center flex-1 px-6">
          <motion.div
            className="w-56 h-56 mb-8"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.4, type: "spring" }}
          >
            <PsycheSignatureVisual
              shape={signature.shape}
              dominantColor="rgba(255,255,255,0.95)"
              stateColor="rgba(255,255,255,0.6)"
              weatherColor="rgba(255,255,255,0.3)"
              complexity={signature.complexity}
              symmetry={signature.symmetry}
              pulseIntensity={signature.pulseIntensity}
              size={224}
            />
          </motion.div>
          <motion.p
            className="text-4xl font-bold text-white mb-3"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            {SHAPE_MEANINGS[signature.shape].name}
          </motion.p>
          <motion.p
            className="text-base text-white/80 text-center leading-relaxed max-w-[280px]"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            {SHAPE_MEANINGS[signature.shape].meaning}
          </motion.p>
        </div>
      ),
    },
    // Card 2: Colors
    {
      id: "colors",
      title: "あなたの色",
      gradient: `linear-gradient(160deg, ${signature.dominantColor} 0%, ${signature.stateColor} 50%, ${signature.weatherColor} 100%)`,
      content: (
        <div className="flex flex-col items-center justify-center flex-1 px-8">
          <div className="space-y-8 w-full max-w-[300px]">
            {[
              { color: signature.dominantColor, label: "核の色", desc: "あなたの本質を表す色。アーキタイプの深層から導出される。" },
              { color: signature.stateColor, label: "状態の色", desc: "現在の軸スコア分布が描く色。今この瞬間のあなた。" },
              { color: signature.weatherColor, label: "天候の色", desc: "内なる天気が映す色。心の嵐も凪も、この色に宿る。" },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                className="flex items-start gap-4"
                initial={{ x: -40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.2 }}
              >
                <div
                  className="w-14 h-14 rounded-2xl shrink-0 shadow-lg"
                  style={{ backgroundColor: item.color, boxShadow: `0 8px 24px ${item.color}66` }}
                />
                <div>
                  <p className="text-lg font-bold text-white">{item.label}</p>
                  <p className="text-sm text-white/70 leading-relaxed">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ),
    },
    // Card 3: Discoveries
    {
      id: "discoveries",
      title: "発見",
      gradient: `linear-gradient(160deg, #1a1a2e 0%, ${palette.primary}88 100%)`,
      content: (
        <div className="flex flex-col items-center justify-center flex-1 px-6">
          <motion.p
            className="text-6xl font-bold text-white mb-6"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
          >
            {discoveryStats.length + patternStats.length}
          </motion.p>
          <motion.p
            className="text-lg text-white/80 mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            つの気づきがあった
          </motion.p>
          <div className="space-y-4 w-full max-w-[320px]">
            {[...discoveryStats, ...patternStats].slice(0, 3).map((stat, i) => (
              <motion.div
                key={stat.label}
                className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10"
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 + i * 0.06 }}
              >
                <p className="text-sm font-semibold text-white">{stat.label}</p>
                <p className="text-xs text-white/60 mt-1">{stat.insight}</p>
              </motion.div>
            ))}
          </div>
        </div>
      ),
    },
    // Card 4: Patterns (Radar)
    {
      id: "patterns",
      title: "パターン",
      gradient: `linear-gradient(160deg, #0a0a1a 0%, ${palette.secondary}55 100%)`,
      content: (
        <div className="flex flex-col items-center justify-center flex-1 px-4">
          <motion.p
            className="text-lg text-white/80 mb-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            あなたの判断特性マップ
          </motion.p>
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.25 }}
          >
            <TraitRadarChart
              axes={cleanRadarAxes}
              dominantColor="rgba(255,255,255,0.7)"
              size={260}
            />
          </motion.div>
          {signature.mostExtremeAxis && (
            <motion.p
              className="text-sm text-white/70 mt-4 text-center max-w-[280px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              最も強い傾向: {signature.mostExtremeAxis.direction}
            </motion.p>
          )}
        </div>
      ),
    },
    // Card 5: Edges / Contradictions
    {
      id: "edges",
      title: "エッジ",
      gradient: `linear-gradient(160deg, ${palette.accent} 0%, ${palette.primary} 100%)`,
      content: (
        <div className="flex flex-col items-center justify-center flex-1 px-6">
          {signature.biggestContradiction ? (
            <>
              <motion.p
                className="text-lg text-white/80 mb-6 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                あなたの中の最大の矛盾
              </motion.p>
              <motion.div
                className="relative mb-8"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.4, type: "spring" }}
              >
                <div className="w-28 h-28 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
                  <span className="text-5xl text-white/90">vs</span>
                </div>
              </motion.div>
              <motion.p
                className="text-base text-white text-center font-medium max-w-[300px] leading-relaxed"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                {signature.biggestContradiction.description}
              </motion.p>
              <motion.p
                className="text-sm text-white/60 text-center mt-4 max-w-[280px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                矛盾は欠陥ではない。二つの世界を同時に見ることができる人だけが持つ力だ。
              </motion.p>
            </>
          ) : (
            <>
              {edgeStats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/10 mb-4 w-full max-w-[320px]"
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 + i * 0.2 }}
                >
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-sm text-white/80 mt-1">{stat.label}</p>
                  <p className="text-xs text-white/50 mt-2">{stat.insight}</p>
                </motion.div>
              ))}
            </>
          )}
        </div>
      ),
    },
    // Card 6: Narrative / Reflection
    {
      id: "narrative",
      title: "内省",
      gradient: `linear-gradient(160deg, #0a0a1a 0%, #1a1a2e 50%, ${palette.primary}44 100%)`,
      content: (
        <div className="flex flex-col items-center justify-center flex-1 px-6">
          <motion.p
            className="text-sm tracking-[0.3em] uppercase text-white/40 mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            潜在意識からの手紙
          </motion.p>
          <motion.p
            className="text-base text-white/90 text-center leading-[1.8] max-w-[320px] whitespace-pre-line"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.4 }}
          >
            {wrapped.narrative.slice(0, 300)}
            {wrapped.narrative.length > 300 ? "..." : ""}
          </motion.p>
          <motion.div
            className="mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <ShareCard
              signature={signature}
              wrapped={wrapped}
              archetypeCode={archetypeCode}
            />
          </motion.div>
        </div>
      ),
    },
    // Card 7: Personal Statistics — "今年のあなた"
    {
      id: "stats",
      title: "今年のあなた",
      gradient: `linear-gradient(160deg, #0f0f1f 0%, ${palette.primary}66 50%, ${palette.accent}44 100%)`,
      content: (
        <div className="flex flex-col items-center justify-center flex-1 px-6">
          <motion.p
            className="text-sm tracking-[0.25em] uppercase text-white/40 mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            Personal Statistics
          </motion.p>

          <div className="grid grid-cols-2 gap-4 w-full max-w-[320px] mb-8">
            {[
              { value: wrapped.stats.length, label: "総観測回数", unit: "回" },
              { value: edgeStats.length, label: "矛盾発見数", unit: "件" },
              { value: discoveryStats.length + patternStats.length, label: "パターン検出", unit: "件" },
              { value: Math.round(signature.complexity * 10), label: "最深インサイト深度", unit: "pt" },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                className="bg-white/8 backdrop-blur-sm rounded-2xl p-4 border border-white/10 text-center"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.06, type: "spring", stiffness: 200 }}
              >
                <AnimatedCounter value={stat.value} delay={0.5 + i * 0.15} />
                <p className="text-[10px] text-white/40 mt-0.5">{stat.unit}</p>
                <p className="text-xs text-white/70 mt-1.5">{stat.label}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            className="bg-white/6 backdrop-blur-sm rounded-2xl p-4 border border-white/8 w-full max-w-[320px]"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.9 }}
          >
            <p className="text-xs text-white/40 mb-2">1ヶ月前のあなたとの比較</p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-white/60">自己理解度</span>
                  <span className="text-white/90 font-bold">+23%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: palette.accent }}
                    initial={{ width: "0%" }}
                    animate={{ width: "73%" }}
                    transition={{ delay: 1.1, duration: 0.4 }}
                  />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-white/60">矛盾認識</span>
                  <span className="text-white/90 font-bold">+41%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: palette.secondary }}
                    initial={{ width: "0%" }}
                    animate={{ width: "85%" }}
                    transition={{ delay: 1.2, duration: 0.4 }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      ),
    },
    // Card 8: Unique Fingerprint Comparison — "あなただけの特徴"
    {
      id: "uniqueness",
      title: "あなただけの特徴",
      gradient: `linear-gradient(160deg, ${palette.secondary}44 0%, #0a0a1a 50%, ${palette.accent}33 100%)`,
      content: (
        <div className="flex flex-col items-center justify-center flex-1 px-6">
          <motion.p
            className="text-sm tracking-[0.25em] uppercase text-white/40 mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            Unique Fingerprint
          </motion.p>

          {/* Dual radar comparison: you vs average */}
          <motion.div
            className="mb-6"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.25 }}
          >
            <UniquenessRadar
              axes={cleanRadarAxes}
              dominantColor="rgba(255,255,255,0.8)"
              averageColor="rgba(255,255,255,0.2)"
              size={220}
            />
          </motion.div>

          {/* Unique trait highlights */}
          <div className="w-full max-w-[300px] space-y-3">
            <motion.p
              className="text-xs text-white/50 text-center mb-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              平均と最も異なるあなたの特性
            </motion.p>
            {(() => {
              // Find top 3 most extreme axes
              const sorted = [...cleanRadarAxes]
                .map((a) => ({ ...a, extremity: Math.abs(a.score) }))
                .sort((a, b) => b.extremity - a.extremity)
                .slice(0, 3);

              return sorted.map((axis, i) => (
                <motion.div
                  key={axis.key}
                  className="bg-white/8 backdrop-blur-sm rounded-xl p-3 border border-white/10 flex items-center gap-3"
                  initial={{ x: 30, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.7 + i * 0.06 }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold text-white/90 shrink-0"
                    style={{
                      backgroundColor: `${i === 0 ? palette.primary : i === 1 ? palette.secondary : palette.accent}44`,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{axis.label}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: palette.accent }}
                          initial={{ width: "0%" }}
                          animate={{ width: `${((axis.score + 1) / 2) * 100}%` }}
                          transition={{ delay: 0.9 + i * 0.06, duration: 0.25 }}
                        />
                      </div>
                      <span className="text-[10px] text-white/50 tabular-nums w-8 text-right">
                        {axis.score > 0 ? "+" : ""}{(axis.score * 100).toFixed(0)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ));
            })()}
          </div>
        </div>
      ),
    },
  ];

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const threshold = 50;
    if (info.offset.x < -threshold && currentIndex < cards.length - 1) {
      setDirection(1);
      setCurrentIndex((prev) => prev + 1);
    } else if (info.offset.x > threshold && currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? "100%" : "-100%",
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? "-100%" : "100%",
      opacity: 0,
    }),
  };

  const card = cards[currentIndex]!;

  return (
    <motion.div
      className="fixed inset-0 z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-[60] w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Card content */}
      <AnimatePresence initial={false} custom={direction} mode="wait">
        <motion.div
          key={card.id}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.1}
          onDragEnd={handleDragEnd}
          className="absolute inset-0 flex flex-col overflow-y-auto"
          style={{ background: card.gradient }}
        >
          {/* Title */}
          <div className="pt-14 px-6 pb-4">
            <motion.p
              className="text-xs tracking-[0.3em] uppercase text-white/50"
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              {currentIndex + 1} / {cards.length}
            </motion.p>
            <motion.h2
              className="text-3xl font-bold text-white mt-2"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              {card.title}
            </motion.h2>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col min-h-0">
            {card.content}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Progress dots */}
      <div className="absolute bottom-8 left-0 right-0 z-[60] flex justify-center gap-2">
        {cards.map((c, i) => (
          <button
            key={c.id}
            onClick={() => {
              setDirection(i > currentIndex ? 1 : -1);
              setCurrentIndex(i);
            }}
            className="p-1"
          >
            <motion.div
              className="rounded-full"
              animate={{
                width: i === currentIndex ? 24 : 8,
                height: 8,
                backgroundColor: i === currentIndex ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
              }}
              transition={{ duration: 0.18 }}
            />
          </button>
        ))}
      </div>

      {/* Navigation hints */}
      {currentIndex > 0 && (
        <button
          onClick={() => { setDirection(-1); setCurrentIndex((p) => p - 1); }}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-[60] w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:text-white/80"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      {currentIndex < cards.length - 1 && (
        <button
          onClick={() => { setDirection(1); setCurrentIndex((p) => p + 1); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-[60] w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:text-white/80"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Color Swatch
// ---------------------------------------------------------------------------
function ColorSwatch({ color, label, description }: { color: string; label: string; description?: string }) {
  return (
    <motion.div
      className="flex items-center gap-3"
      whileHover={{ x: 4 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <div
        className="w-10 h-10 rounded-xl border border-white/50 shadow-md"
        style={{ backgroundColor: color, boxShadow: `0 4px 12px ${color}44` }}
      />
      <div>
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        {description && <p className="text-xs text-slate-400">{description}</p>}
        <p className="text-[10px] text-slate-300 font-mono">{color}</p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function SignatureClient() {
  useEffect(() => { trackFeatureView("psyche_signature"); }, []);

  const [ready, setReady] = useState(false);
  const [showWrapped, setShowWrapped] = useState(false);
  const [copied, setCopied] = useState(false);
  const [apiSignature, setApiSignature] = useState<PsycheSignature | null>(null);
  const [apiArchetypeCode, setApiArchetypeCode] = useState<string | null>(null);

  // ── API からデータ取得。取得できなければ生成を試み、それも失敗なら MOCK_INPUT fallback ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1. まず GET で既存のシグネチャを取得
        const getRes = await fetch("/api/stargazer/psyche-signature", { credentials: "include" });
        if (getRes.ok) {
          const getData = await getRes.json();
          if (getData.signature && !cancelled) {
            setApiSignature(getData.signature as PsycheSignature);
            setApiArchetypeCode((getData.signature as PsycheSignature).userId ? null : null);
            setReady(true);
            return;
          }
        }

        // 2. 既存がなければ POST で新規生成
        const postRes = await fetch("/api/stargazer/psyche-signature", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ period: "weekly" }),
        });
        if (postRes.ok && !cancelled) {
          const postData = await postRes.json();
          if (postData.signature) {
            setApiSignature(postData.signature as PsycheSignature);
            setApiArchetypeCode(postData.archetypeCode ?? null);
            setReady(true);
            return;
          }
        }
      } catch {
        // API 失敗 → MOCK fallback
      }

      // 3. Fallback: MOCK_INPUT で即座に表示
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // 実データまたは MOCK からシグネチャを導出
  const signature = useMemo(() => {
    if (apiSignature) return apiSignature;
    const sig = generatePsycheSignature(MOCK_INPUT);
    sig.userId = "demo-user";
    return sig;
  }, [apiSignature]);

  const effectiveInput = useMemo(() => {
    if (apiSignature) {
      // API から来たシグネチャ用の疑似 input (wrapped 生成用)
      return {
        ...MOCK_INPUT,
        archetypeCode: apiArchetypeCode ?? MOCK_INPUT.archetypeCode,
        axisScores: {} as Record<string, number>, // wrapped では使わない
      };
    }
    return MOCK_INPUT;
  }, [apiSignature, apiArchetypeCode]);

  const wrapped = useMemo(() => generatePsycheWrapped(effectiveInput), [effectiveInput]);

  const palette = useMemo(() => getArchetypePalette(apiArchetypeCode ?? MOCK_INPUT.archetypeCode), [apiArchetypeCode]);
  const shapeMeta = SHAPE_MEANINGS[signature.shape];

  // Build radar axes from signature axis data or fallback
  const radarAxes: RadarAxis[] = useMemo(() => {
    const AXIS_LABEL_MAP: Record<string, { label: string; negLabel: string }> = {
      cautious_vs_bold: { label: "大胆", negLabel: "慎重" },
      change_embrace_vs_resist: { label: "変化志向", negLabel: "安定志向" },
      perfectionist_vs_pragmatic: { label: "実用的", negLabel: "完璧主義" },
      independence_vs_harmony: { label: "調和的", negLabel: "独立的" },
      direct_vs_diplomatic: { label: "外交的", negLabel: "率直" },
      analytical_vs_intuitive: { label: "直感的", negLabel: "分析的" },
      plan_vs_spontaneous: { label: "即興的", negLabel: "計画的" },
      introvert_vs_extrovert: { label: "外向的", negLabel: "内向的" },
    };
    const scores = MOCK_INPUT.axisScores; // radar は常にスコアから生成
    return Object.entries(scores)
      .slice(0, 8)
      .map(([key, score]) => ({
        key,
        label: AXIS_LABEL_MAP[key]?.label ?? key,
        negLabel: AXIS_LABEL_MAP[key]?.negLabel,
        score,
      }));
  }, []);

  const handleCopyLink = useCallback(() => {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/stargazer/signature/share/${signature.shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      trackInteraction("psyche_signature", "share_link_copied");
      setTimeout(() => setCopied(false), 2000);
    });
  }, [signature.shareToken]);

  if (!ready) {
    return (
      <LightBackground>
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-32">
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            {/* Fingerprint rings forming animation */}
            <div className="relative w-40 h-40">
              <svg className="w-full h-full" viewBox="0 0 160 160">
                {/* Concentric fingerprint arcs that draw sequentially */}
                {[20, 30, 40, 50, 60].map((r, i) => (
                  <motion.circle
                    key={i}
                    cx={80} cy={80} r={r}
                    fill="none"
                    stroke={i % 2 === 0 ? palette.primary : palette.secondary}
                    strokeWidth={1}
                    strokeOpacity={0.25}
                    strokeDasharray={`${r * 0.8} ${r * 0.5}`}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{
                      pathLength: [0, 1, 0],
                      opacity: [0, 0.4, 0],
                      rotate: [0, i % 2 === 0 ? 90 : -90, 0],
                    }}
                    transition={{
                      duration: 4,
                      delay: i * 0.3,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    style={{ transformOrigin: "80px 80px" }}
                  />
                ))}

                {/* Center glow pulse */}
                <motion.circle
                  cx={80} cy={80} r={10}
                  fill={`${palette.primary}15`}
                  initial={{ r: 10 }}
                  animate={{ r: [10, 16, 10], opacity: [0.15, 0.35, 0.15] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <motion.circle
                  cx={80} cy={80} r={4}
                  fill={`${palette.primary}55`}
                  animate={{ opacity: [0.4, 0.8, 0.4] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />

                {/* Scattered particles */}
                {Array.from({ length: 8 }, (_, i) => {
                  const angle = (i / 8) * Math.PI * 2;
                  const dist = 45 + (i % 3) * 10;
                  return (
                    <motion.circle
                      key={`p-${i}`}
                      cx={80 + Math.cos(angle) * dist}
                      cy={80 + Math.sin(angle) * dist}
                      r={1 + (i % 2) * 0.5}
                      fill={palette.accent}
                      initial={{ opacity: 0 }}
                      animate={{
                        opacity: [0, 0.5, 0],
                        scale: [0.5, 1, 0.5],
                      }}
                      transition={{
                        duration: 2.5,
                        delay: i * 0.25,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  );
                })}
              </svg>
            </div>

            <div className="text-center mt-4">
              <motion.p
                className="text-sm font-body"
                style={{ color: "rgba(100,105,130,0.6)" }}
                animate={{ opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              >
                心の指紋を生成中
              </motion.p>
              <motion.p
                className="text-[10px] font-mono-sg tracking-[0.15em] mt-1.5"
                style={{ color: "rgba(160,150,200,0.4)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                心の指紋を解析中
              </motion.p>
            </div>
          </div>
        </div>
      </LightBackground>
    );
  }

  return (
    <LightBackground>
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-32">
        {/* Header */}
        <FadeInView>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/stargazer"
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">
              心の指紋
            </h1>
          </div>
          <p className="text-sm text-slate-500 mb-8">
            あなただけの心理的パターンを、形と色で可視化する
          </p>
        </FadeInView>

        {/* Section 1: Hero Signature Visual */}
        <FadeInView delay={0.1}>
          <GlassCard variant="elevated" className="text-center mb-6 overflow-hidden">
            {/* Colored background glow */}
            <div
              className="absolute inset-0 opacity-10"
              style={{
                background: `radial-gradient(ellipse at 50% 40%, ${palette.primary} 0%, transparent 70%)`,
              }}
            />

            <div className="relative z-10">
              <div className="py-4">
                <PsycheSignatureVisual
                  shape={signature.shape}
                  dominantColor={signature.dominantColor}
                  stateColor={signature.stateColor}
                  weatherColor={signature.weatherColor}
                  complexity={signature.complexity}
                  symmetry={signature.symmetry}
                  pulseIntensity={signature.pulseIntensity}
                />
              </div>

              <motion.p
                className="text-xs text-slate-400 font-mono tracking-[0.3em] mt-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
              >
                SIG:{signature.shareToken.slice(0, 8).toUpperCase()}
              </motion.p>

              <motion.p
                className="text-2xl font-bold text-slate-800 mt-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1 }}
              >
                {shapeMeta.name}
              </motion.p>

              <motion.p
                className="text-sm text-slate-500 mt-1 mb-2 max-w-[280px] mx-auto"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.3 }}
              >
                {shapeMeta.meaning}
              </motion.p>
            </div>
          </GlassCard>
        </FadeInView>

        {/* Section 2: Color Palette */}
        <FadeInView delay={0.2}>
          <GlassCard className="mb-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: palette.primary }} />
              カラーパレット
            </h2>
            <div className="space-y-4">
              <ColorSwatch color={signature.dominantColor} label="核の色" description="アーキタイプの本質" />
              <ColorSwatch color={signature.stateColor} label="状態の色" description="軸分布の現在地" />
              <ColorSwatch color={signature.weatherColor} label="天候の色" description="心の天気図" />
            </div>

            {/* Mini trait badges */}
            <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-slate-100">
              <GlassBadge variant="info" size="sm">
                複雑さ {signature.complexity}/10
              </GlassBadge>
              <GlassBadge variant="success" size="sm">
                対称性 {Math.round(signature.symmetry * 100)}%
              </GlassBadge>
              <GlassBadge variant="default" size="sm">
                天候: {signature.dominantWeather}
              </GlassBadge>
              <GlassBadge variant="warning" size="sm">
                脈動 {Math.round(signature.pulseIntensity * 100)}%
              </GlassBadge>
            </div>
          </GlassCard>
        </FadeInView>

        {/* Section 3: Trait Radar */}
        <FadeInView delay={0.25}>
          <GlassCard variant="bordered" className="mb-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-2">
              判断特性マップ
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              8つの主要軸で描く、あなたの特性パターン
            </p>
            <TraitRadarChart
              axes={radarAxes}
              dominantColor={palette.primary}
              size={280}
            />
          </GlassCard>
        </FadeInView>

        {/* Section 4: Mood Arc */}
        <FadeInView delay={0.3}>
          <GlassCard variant="bordered" className="mb-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-2">
              心の天気図
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {signature.moodArc}
            </p>
            <p className="text-xs text-slate-400 mt-3">
              期間: {signature.periodStart} - {signature.periodEnd}
              ({signature.period === "weekly" ? "週次" : signature.period === "monthly" ? "月次" : "年次"})
            </p>
          </GlassCard>
        </FadeInView>

        {/* Section 5: Share Card Preview */}
        <FadeInView delay={0.35}>
          <GlassCard className="mb-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">
              共有カード
            </h2>
            <ShareCard
              signature={signature}
              wrapped={wrapped}
              archetypeCode={apiArchetypeCode ?? MOCK_INPUT.archetypeCode}
            />
            <div className="flex gap-3 mt-4">
              <GlassButton
                variant="gradient"
                className="flex-1"
                onClick={handleCopyLink}
              >
                {copied ? "コピーしました" : "共有リンクをコピー"}
              </GlassButton>
            </div>
          </GlassCard>
        </FadeInView>

        {/* Section 6: Psyche Wrapped CTA */}
        <FadeInView delay={0.4}>
          <motion.div
            className="relative rounded-3xl overflow-hidden mb-6"
            style={{
              background: `linear-gradient(145deg, ${palette.primary} 0%, ${palette.secondary} 50%, ${palette.accent} 100%)`,
            }}
            whileHover={{ scale: 1.01 }}
            transition={{ type: "spring", stiffness: 200 }}
          >
            {/* Decorative particles */}
            <div className="absolute inset-0 overflow-hidden">
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 rounded-full bg-white/20"
                  style={{
                    left: `${15 + i * 15}%`,
                    top: `${20 + (i * 37 % 60)}%`,
                  }}
                  animate={{
                    y: [-5, 5, -5],
                    opacity: [0.2, 0.5, 0.2],
                  }}
                  transition={{
                    duration: 2 + i * 0.3,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                />
              ))}
            </div>

            <div className="relative p-6 text-center">
              <p className="text-xs tracking-[0.25em] uppercase text-white/60 mb-2">
                心理サマリー
              </p>
              <p className="text-xl font-bold text-white mb-2">
                {wrapped.openingLine.slice(0, 50)}
                {wrapped.openingLine.length > 50 ? "..." : ""}
              </p>
              <p className="text-sm text-white/70 mb-5">
                {wrapped.period === "weekly" ? "今週" : wrapped.period === "monthly" ? "今月" : "今年"}のあなたを、物語として体験する
              </p>

              <GlassButton
                variant="default"
                onClick={() => {
                  setShowWrapped(true);
                  trackInteraction("psyche_signature", "wrapped_opened");
                }}
              >
                サマリーを見る
              </GlassButton>
            </div>
          </motion.div>
        </FadeInView>

        {/* Wrapped full stats (expandable) */}
        <FadeInView delay={0.45}>
          <GlassCard className="mb-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-4 flex items-center justify-between">
              <span>心理サマリー</span>
              <GlassBadge variant="gradient" size="sm">
                {wrapped.period === "weekly" ? "今週" : wrapped.period === "monthly" ? "今月" : "今年"}
              </GlassBadge>
            </h2>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {wrapped.stats.slice(0, 4).map((stat) => (
                <GlassCard key={stat.label} padding="sm" variant="bordered" hoverEffect={false}>
                  <p className="text-xs text-slate-500 mb-1">
                    {stat.category === "discovery" ? "発見" : stat.category === "pattern" ? "パターン" : stat.category === "edge" ? "エッジ" : "内省"}
                  </p>
                  <p className="text-lg font-bold text-slate-800 truncate">
                    {stat.value}
                  </p>
                  <p className="text-xs font-medium text-slate-600 mt-1 line-clamp-2">
                    {stat.label}
                  </p>
                </GlassCard>
              ))}
            </div>

            {/* Narrative preview */}
            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100">
              <p className="text-xs text-slate-400 mb-2 tracking-wider uppercase">潜在意識からの手紙</p>
              <p className="text-sm text-slate-600 leading-relaxed line-clamp-4">
                {wrapped.narrative}
              </p>
            </div>

            {/* Discoveries */}
            {wrapped.signature.topDiscoveries.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  この期間の発見
                </h3>
                <div className="space-y-2">
                  {wrapped.signature.topDiscoveries.map((d, i) => (
                    <motion.div
                      key={i}
                      className="flex items-start gap-2 text-sm text-slate-600"
                      initial={{ x: -10, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: i * 0.06 }}
                    >
                      <span
                        className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: palette.primary }}
                      />
                      <span>{d}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </GlassCard>
        </FadeInView>
      </div>

      {/* Wrapped Story Overlay */}
      <AnimatePresence>
        {showWrapped && (
          <WrappedStoryCards
            signature={signature}
            wrapped={wrapped}
            archetypeCode={apiArchetypeCode ?? MOCK_INPUT.archetypeCode}
            onClose={() => setShowWrapped(false)}
          />
        )}
      </AnimatePresence>
    </LightBackground>
  );
}
