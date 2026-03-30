// app/stargazer/_components/InteractiveConstellationMap.tsx
// インタラクティブ特性マップ — タッチ操作可能な深層観測レーダー
"use client";

import { useState, useMemo, useCallback, useId, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";
import { hapticLight } from "@/lib/rendezvous/haptics";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InteractiveConstellationMapProps {
  /** 各軸名 → 0-100 のスコア */
  axisScores: Record<string, number>;
  /** 前回比較用スコア（ゴーストオーバーレイ） */
  previousScores?: Record<string, number>;
  /** 矛盾ペア */
  contradictions?: Array<{ axisA: string; axisB: string; severity: number }>;
  /** アーキタイプコード（中央表示） */
  archetypeCode?: string;
  /** 理解度 0-100 */
  understandingLevel?: number;
  /** データ充足度 0-100 (トリプルリング中環) */
  dataCompleteness?: number;
  /** 予測精度 0-100 (トリプルリング内環) */
  predictionAccuracy?: number;
  /** ノードタップ時のコールバック */
  onAxisTap?: (axis: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { axisLabel } from "@/lib/stargazer/axisLabels";

/** スコアの変化傾向を記号で返す */
function trendArrow(current: number, previous: number | undefined): string {
  if (previous === undefined) return "";
  const diff = current - previous;
  if (diff > 5) return " \u2191";
  if (diff < -5) return " \u2193";
  return " \u2192";
}

function trendColor(current: number, previous: number | undefined): string {
  if (previous === undefined) return "rgba(120,125,140,0.6)";
  const diff = current - previous;
  if (diff > 5) return "rgba(74,180,128,0.9)";
  if (diff < -5) return "rgba(220,80,80,0.9)";
  return "rgba(120,125,140,0.6)";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InteractiveConstellationMap({
  axisScores,
  previousScores,
  contradictions = [],
  archetypeCode,
  understandingLevel = 0,
  dataCompleteness = 0,
  predictionAccuracy = 0,
  onAxisTap,
}: InteractiveConstellationMapProps) {
  const uid = useId();
  const { theme } = useArchetypeTheme();
  const [selectedAxis, setSelectedAxis] = useState<string | null>(null);
  const [hoveredAxis, setHoveredAxis] = useState<string | null>(null);

  // Pinch-zoom + pan state
  const [mapScale, setMapScale] = useState(1);
  const [mapTranslate, setMapTranslate] = useState({ x: 0, y: 0 });
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);
  const lastTapRef = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch start
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { startDist: Math.hypot(dx, dy), startScale: mapScale };
    } else if (e.touches.length === 1 && mapScale > 1) {
      // Pan start (only when zoomed)
      panRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startTx: mapTranslate.x,
        startTy: mapTranslate.y,
      };
    }
  }, [mapScale, mapTranslate]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = Math.min(3, Math.max(1, pinchRef.current.startScale * (dist / pinchRef.current.startDist)));
      setMapScale(scale);
      if (Math.abs(scale - mapScale) > 0.1) hapticLight();
    } else if (e.touches.length === 1 && panRef.current && mapScale > 1) {
      // Pan
      const maxPan = (mapScale - 1) * 80;
      const dx = e.touches[0].clientX - panRef.current.startX;
      const dy = e.touches[0].clientY - panRef.current.startY;
      setMapTranslate({
        x: Math.min(maxPan, Math.max(-maxPan, panRef.current.startTx + dx)),
        y: Math.min(maxPan, Math.max(-maxPan, panRef.current.startTy + dy)),
      });
    }
  }, [mapScale]);

  const handleTouchEnd = useCallback(() => {
    pinchRef.current = null;
    panRef.current = null;
  }, []);

  const handleDoubleClick = useCallback(() => {
    // Double-tap to reset zoom
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      setMapScale(1);
      setMapTranslate({ x: 0, y: 0 });
      hapticLight();
    }
    lastTapRef.current = now;
  }, []);

  // Theme-derived colors
  const thPrimary = theme?.palette.primary ?? "#C9A96E";
  const thAccent = theme?.palette.accent ?? "#7C3AED";
  const thText = theme?.palette.text ?? "rgba(20,25,45,0.95)";
  const goldFill = hexToRgba(thPrimary, 0.85);
  const goldFillBright = hexToRgba(thPrimary, 0.95);
  const goldGlow = hexToRgba(thPrimary, 0.08);
  const goldStroke = hexToRgba(thPrimary, 0.55);
  const mutedStroke = "rgba(160,170,200,0.15)";

  // Derive ordered axis list
  const axes = useMemo(() => Object.keys(axisScores), [axisScores]);
  const total = axes.length;

  // Build contradiction lookup: axis → list of contradicted axes
  const contradictionMap = useMemo(() => {
    const m = new Map<string, Array<{ other: string; severity: number }>>();
    for (const c of contradictions) {
      if (!m.has(c.axisA)) m.set(c.axisA, []);
      if (!m.has(c.axisB)) m.set(c.axisB, []);
      m.get(c.axisA)!.push({ other: c.axisB, severity: c.severity });
      m.get(c.axisB)!.push({ other: c.axisA, severity: c.severity });
    }
    return m;
  }, [contradictions]);

  // SVG geometry — enlarged for better readability with 33 axes
  const size = 420;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.34;
  const padding = 80;

  const getPoint = useCallback(
    (index: number, score: number): [number, number] => {
      const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
      const r = radius * (score / 100);
      return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
    },
    [total, cx, cy, radius],
  );

  const getEdgePoint = useCallback(
    (index: number): [number, number] => {
      const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
      return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    },
    [total, cx, cy, radius],
  );

  // Polygon helpers
  const makePolygon = useCallback(
    (scores: Record<string, number>) =>
      axes
        .map((a, i) => {
          const s = scores[a] ?? 0;
          const [x, y] = getPoint(i, s);
          return `${x},${y}`;
        })
        .join(" "),
    [axes, getPoint],
  );

  const mainPoints = useMemo(() => makePolygon(axisScores), [axisScores, makePolygon]);
  const ghostPoints = useMemo(
    () => (previousScores ? makePolygon(previousScores) : null),
    [previousScores, makePolygon],
  );

  // Grid
  const gridLevels = [25, 50, 75, 100];
  const gridPath = useCallback(
    (level: number) => {
      const pts = axes.map((_, i) => {
        const [x, y] = getPoint(i, level);
        return `${x},${y}`;
      });
      return `M ${pts.join(" L ")} Z`;
    },
    [axes, getPoint],
  );

  // Label position
  const labelPos = useCallback(
    (index: number) => {
      const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
      const labelR = radius + 32;
      const x = cx + labelR * Math.cos(angle);
      const y = cy + labelR * Math.sin(angle);
      let anchor: "start" | "middle" | "end" = "middle";
      if (Math.cos(angle) > 0.3) anchor = "start";
      else if (Math.cos(angle) < -0.3) anchor = "end";
      return { x, y: y + 4, anchor };
    },
    [total, cx, cy, radius],
  );

  // Node tap
  const handleNodeTap = useCallback(
    (axis: string) => {
      setSelectedAxis((prev) => (prev === axis ? null : axis));
      onAxisTap?.(axis);
      hapticLight();
    },
    [onAxisTap],
  );

  // Contradiction line pairs (indices)
  const contradictionLines = useMemo(() => {
    return contradictions.map((c) => ({
      indexA: axes.indexOf(c.axisA),
      indexB: axes.indexOf(c.axisB),
      severity: c.severity,
    })).filter((c) => c.indexA >= 0 && c.indexB >= 0);
  }, [contradictions, axes]);

  // Selected axis detail data
  const detail = useMemo(() => {
    if (!selectedAxis) return null;
    const score = axisScores[selectedAxis] ?? 0;
    const prev = previousScores?.[selectedAxis];
    const contras = contradictionMap.get(selectedAxis) ?? [];
    return { axis: selectedAxis, score, prev, contras };
  }, [selectedAxis, axisScores, previousScores, contradictionMap]);

  // Triple ring values computed inline in JSX

  return (
    <div className="relative w-full">
      {/* ── SVG Star Map ── */}
      <div
        className="relative mx-auto rounded-2xl overflow-hidden"
        style={{
          maxWidth: `min(${size + padding * 2}px, calc(100vw - 2rem))`,
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(20,18,40,0.97) 0%, rgba(10,10,28,0.99) 70%)",
          touchAction: mapScale > 1 ? "none" : "pan-y",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleDoubleClick}
      >
        {/* Ambient glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 50% 45%, rgba(190,170,110,0.06) 0%, transparent 60%)",
          }}
        />

        <svg
          viewBox={`${-padding} ${-padding} ${size + padding * 2} ${size + padding * 2}`}
          width="100%"
          className="relative z-10"
          style={{
            overflow: "visible",
            transform: `scale(${mapScale}) translate(${mapTranslate.x / mapScale}px, ${mapTranslate.y / mapScale}px)`,
            transformOrigin: "center center",
            transition: pinchRef.current ? "none" : "transform 0.3s ease-out",
          }}
          role="img"
          aria-label="性格特性の特性マップ"
        >
          <defs>
            {/* Main fill gradient */}
            <radialGradient id={`${uid}-fill`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={thPrimary} stopOpacity={0.2} />
              <stop offset="100%" stopColor={thPrimary} stopOpacity={0.04} />
            </radialGradient>

            {/* Glow filter for nodes */}
            <filter id={`${uid}-glow`}>
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Red pulse filter */}
            <filter id={`${uid}-red-glow`}>
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid rings */}
          {gridLevels.map((level) => (
            <path
              key={level}
              d={gridPath(level)}
              fill="none"
              stroke="rgba(160,170,200,0.08)"
              strokeWidth={0.5}
            />
          ))}

          {/* Axis lines from center */}
          {axes.map((_, i) => {
            const [ex, ey] = getEdgePoint(i);
            return (
              <line
                key={`axis-${i}`}
                x1={cx}
                y1={cy}
                x2={ex}
                y2={ey}
                stroke="rgba(160,170,200,0.06)"
                strokeWidth={0.5}
              />
            );
          })}

          {/* Contradiction tension lines (red pulsing) */}
          {contradictionLines.map((c, ci) => {
            const [ax, ay] = getPoint(c.indexA, axisScores[axes[c.indexA]] ?? 0);
            const [bx, by] = getPoint(c.indexB, axisScores[axes[c.indexB]] ?? 0);
            const opacity = 0.15 + c.severity * 0.35;
            return (
              <motion.line
                key={`contra-${ci}`}
                x1={ax}
                y1={ay}
                x2={bx}
                y2={by}
                stroke={`rgba(220,80,80,${opacity})`}
                strokeWidth={1.5}
                filter={`url(#${uid}-red-glow)`}
                animate={{ opacity: [opacity, opacity * 0.3, opacity] }}
                transition={{ duration: 1.5 + c.severity * 0.5, repeat: Infinity, ease: "easeInOut" }}
              />
            );
          })}

          {/* Ghost overlay (previous scores) */}
          {ghostPoints && (
            <motion.polygon
              points={ghostPoints}
              fill="none"
              stroke="rgba(160,170,200,0.25)"
              strokeWidth={1}
              strokeLinejoin="round"
              strokeDasharray="4 4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            />
          )}

          {/* Main data polygon */}
          <motion.polygon
            points={mainPoints}
            fill={`url(#${uid}-fill)`}
            stroke={goldStroke}
            strokeWidth={1.5}
            strokeLinejoin="round"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />

          {/* Connection lines between adjacent nodes */}
          {axes.map((_, i) => {
            const nextI = (i + 1) % total;
            const [ax2, ay2] = getPoint(i, axisScores[axes[i]] ?? 0);
            const [bx2, by2] = getPoint(nextI, axisScores[axes[nextI]] ?? 0);
            return (
              <line
                key={`conn-${i}`}
                x1={ax2}
                y1={ay2}
                x2={bx2}
                y2={by2}
                stroke={hexToRgba(thPrimary, 0.12)}
                strokeWidth={0.5}
              />
            );
          })}

          {/* Data point nodes (stars) */}
          {axes.map((axis, i) => {
            const score = axisScores[axis] ?? 0;
            const [px, py] = getPoint(i, score);
            const isSelected = selectedAxis === axis;
            const hasContradiction = contradictionMap.has(axis);
            const nodeSize = 5 + (score / 100) * 5;
            const glowSize = nodeSize * 3;
            const isHovered = hoveredAxis === axis;

            return (
              <g
                key={`node-${i}`}
                role="button"
                aria-label={`${axisLabel(axis)}: ${score}点`}
                tabIndex={0}
                onClick={() => handleNodeTap(axis)}
                onMouseEnter={() => setHoveredAxis(axis)}
                onMouseLeave={() => setHoveredAxis(null)}
                onFocus={() => setHoveredAxis(axis)}
                onBlur={() => setHoveredAxis(null)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleNodeTap(axis); } }}
                style={{ cursor: "pointer", outline: "none" }}
              >
                {/* Invisible larger hit area */}
                <circle cx={px} cy={py} r={22} fill="transparent" />

                {/* Outer glow */}
                <motion.circle
                  cx={px}
                  cy={py}
                  r={glowSize}
                  fill={hasContradiction ? "rgba(220,80,80,0.06)" : goldGlow}
                  animate={
                    isSelected
                      ? { r: [glowSize, glowSize * 1.5, glowSize], opacity: [0.15, 0.05, 0.15] }
                      : { opacity: isHovered ? 0.15 : 0.08 }
                  }
                  transition={isSelected ? { duration: 2, repeat: Infinity } : { duration: 0.3 }}
                />

                {/* Selection pulse ring */}
                {isSelected && (
                  <motion.circle
                    cx={px}
                    cy={py}
                    r={nodeSize + 4}
                    fill="none"
                    stroke={hexToRgba(thPrimary, 0.5)}
                    strokeWidth={1}
                    animate={{ r: [nodeSize + 4, nodeSize + 14], opacity: [0.5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}

                {/* Core star point */}
                <motion.circle
                  cx={px}
                  cy={py}
                  r={isSelected ? nodeSize + 2 : isHovered ? nodeSize + 1 : nodeSize}
                  fill={
                    isSelected
                      ? goldFillBright
                      : hasContradiction
                        ? "rgba(220,160,120,0.85)"
                        : goldFill
                  }
                  filter={`url(#${uid}-glow)`}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + i * 0.06, type: "spring", stiffness: 200 }}
                />

                {/* Inner white core */}
                <motion.circle
                  cx={px}
                  cy={py}
                  r={nodeSize * 0.35}
                  fill="rgba(255,255,255,0.7)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 + i * 0.06 }}
                />

                {/* Hover tooltip */}
                {isHovered && !isSelected && (
                  <g>
                    <rect
                      x={px - 36}
                      y={py - nodeSize - 28}
                      width={72}
                      height={20}
                      rx={6}
                      fill="rgba(10,10,28,0.85)"
                      stroke={hexToRgba(thPrimary, 0.2)}
                      strokeWidth={0.5}
                    />
                    <text
                      x={px}
                      y={py - nodeSize - 15}
                      textAnchor="middle"
                      fill="rgba(255,235,180,0.9)"
                      fontSize={10}
                      fontWeight={600}
                      fontFamily="var(--font-body), system-ui, sans-serif"
                    >
                      {axisLabel(axis)} {score}{previousScores?.[axis] !== undefined ? trendArrow(score, previousScores[axis]) : ""}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Labels with background rects */}
          {axes.map((axis, i) => {
            const pos = labelPos(i);
            const isSelected = selectedAxis === axis;
            const isLabelHovered = hoveredAxis === axis;
            const label = axisLabel(axis);
            const labelWidth = label.length * 11 + 12;
            const labelX = pos.anchor === "end" ? pos.x - labelWidth + 6 : pos.anchor === "start" ? pos.x - 6 : pos.x - labelWidth / 2;
            return (
              <g key={`label-${i}`} onClick={() => handleNodeTap(axis)} style={{ cursor: "pointer" }}>
                {/* Background rect for readability */}
                <rect
                  x={labelX}
                  y={pos.y - 11}
                  width={labelWidth}
                  height={18}
                  rx={4}
                  fill={isSelected || isLabelHovered ? "rgba(10,10,28,0.65)" : "rgba(10,10,28,0.4)"}
                  style={{ transition: "fill 0.3s" }}
                />
                <text
                  x={pos.x}
                  y={pos.y}
                  textAnchor={pos.anchor}
                  fill={
                    isSelected
                      ? goldFillBright
                      : isLabelHovered
                        ? hexToRgba(thPrimary, 0.95)
                        : "rgba(220,225,240,0.85)"
                  }
                  fontSize={isSelected || isLabelHovered ? 13 : 11.5}
                  fontWeight={isSelected || isLabelHovered ? 700 : 500}
                  fontFamily="var(--font-body), system-ui, sans-serif"
                  style={{ transition: "fill 0.3s, font-size 0.3s" }}
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Center: Triple ring (Apple Watch style) + archetype */}
          <g aria-label={`理解度 ${understandingLevel}%, データ充足 ${dataCompleteness}%, 予測精度 ${predictionAccuracy}%`}>
            {/* Outer ring: Understanding */}
            <circle cx={cx} cy={cy} r={42} fill="none" stroke={hexToRgba(thPrimary, 0.08)} strokeWidth={3.5} />
            <motion.circle cx={cx} cy={cy} r={42} fill="none" stroke={hexToRgba(thPrimary, 0.5)} strokeWidth={3.5} strokeLinecap="round" strokeDasharray={2 * Math.PI * 42} initial={{ strokeDashoffset: 2 * Math.PI * 42 }} animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - understandingLevel / 100) }} transition={{ duration: 1.2, ease: "easeOut", delay: 0.5 }} style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }} />
            {/* Middle ring: Data Completeness */}
            <circle cx={cx} cy={cy} r={34} fill="none" stroke={hexToRgba(thAccent, 0.08)} strokeWidth={3.5} />
            <motion.circle cx={cx} cy={cy} r={34} fill="none" stroke={hexToRgba(thAccent, 0.5)} strokeWidth={3.5} strokeLinecap="round" strokeDasharray={2 * Math.PI * 34} initial={{ strokeDashoffset: 2 * Math.PI * 34 }} animate={{ strokeDashoffset: 2 * Math.PI * 34 * (1 - dataCompleteness / 100) }} transition={{ duration: 1.2, ease: "easeOut", delay: 0.8 }} style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }} />
            {/* Inner ring: Prediction Accuracy */}
            <circle cx={cx} cy={cy} r={26} fill="none" stroke="rgba(160,170,200,0.06)" strokeWidth={3.5} />
            <motion.circle cx={cx} cy={cy} r={26} fill="none" stroke={hexToRgba(thPrimary, 0.35)} strokeWidth={3.5} strokeLinecap="round" strokeDasharray={2 * Math.PI * 26} initial={{ strokeDashoffset: 2 * Math.PI * 26 }} animate={{ strokeDashoffset: 2 * Math.PI * 26 * (1 - predictionAccuracy / 100) }} transition={{ duration: 1.2, ease: "easeOut", delay: 1.1 }} style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }} />

            {/* Archetype code */}
            {archetypeCode && (
              <text
                x={cx}
                y={cy - 6}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={hexToRgba(thPrimary, 0.8)}
                fontSize={10}
                fontWeight={600}
                fontFamily="var(--font-mono), monospace"
                letterSpacing="0.08em"
              >
                {archetypeCode}
              </text>
            )}

            {/* Understanding percentage */}
            <text
              x={cx}
              y={cy + (archetypeCode ? 8 : 2)}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="rgba(255,235,180,0.85)"
              fontSize={14}
              fontWeight={700}
              fontFamily="var(--font-display), system-ui, sans-serif"
            >
              {understandingLevel}%
            </text>

            {/* Label */}
            <text
              x={cx}
              y={cy + (archetypeCode ? 22 : 16)}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="rgba(160,170,200,0.35)"
              fontSize={7}
              fontFamily="var(--font-mono), monospace"
              letterSpacing="0.12em"
            >
              理解度
            </text>
          </g>

          {/* Ghost legend */}
          {previousScores && (
            <g>
              <line
                x1={-padding + 10}
                y1={size + padding - 14}
                x2={-padding + 26}
                y2={size + padding - 14}
                stroke="rgba(160,170,200,0.25)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={-padding + 30}
                y={size + padding - 10}
                fill="rgba(160,170,200,0.35)"
                fontSize={9}
                fontFamily="var(--font-body), system-ui, sans-serif"
              >
                前回
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* ── Drill-down panel ── */}
      <div aria-live="polite">
      <AnimatePresence>
        {detail && (
          <motion.div
            key={detail.axis}
            layout
            role="region"
            aria-label={`${axisLabel(detail.axis)}の詳細`}
            initial={{ opacity: 0, y: 24, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 24, height: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="mt-3"
          >
            <GlassCard variant="elevated" padding="md">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-slate-800">
                  {axisLabel(detail.axis)}
                </h3>
                <button
                  onClick={() => setSelectedAxis(null)}
                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 transition-colors text-xs"
                  aria-label="閉じる"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="2" y1="2" x2="10" y2="10" />
                    <line x1="10" y1="2" x2="2" y2="10" />
                  </svg>
                </button>
              </div>

              {/* Current score + trend */}
              <div className="flex items-end gap-4 mb-4">
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-1">現在値</p>
                  <p className="text-3xl font-bold text-slate-900 leading-none">
                    {detail.score}
                    <span className="text-lg ml-1" style={{ color: trendColor(detail.score, detail.prev) }}>
                      {trendArrow(detail.score, detail.prev)}
                    </span>
                  </p>
                </div>
                {detail.prev !== undefined && (
                  <div className="pb-1">
                    <p className="text-xs text-slate-400 font-medium mb-0.5">前回</p>
                    <p className="text-lg font-semibold text-slate-400">{detail.prev}</p>
                  </div>
                )}
                {/* Score bar */}
                <div className="flex-1 pb-2">
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background:
                          "linear-gradient(90deg, rgba(170,150,90,0.5), rgba(201,169,110,0.8))",
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${detail.score}%` }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    />
                  </div>
                </div>
              </div>

              {/* Change trend description */}
              {detail.prev !== undefined && (
                <div className="mb-4 rounded-xl p-3" style={{ background: "rgba(160,170,200,0.06)" }}>
                  <p className="text-sm text-slate-600">
                    {(() => {
                      const diff = detail.score - detail.prev;
                      if (diff > 10) return "大きく上昇しています。最近の行動パターンが強化されている可能性があります。";
                      if (diff > 5) return "やや上昇傾向にあります。";
                      if (diff < -10) return "大きく変動しています。状況や文脈による揺れがあるかもしれません。";
                      if (diff < -5) return "やや低下傾向にあります。";
                      return "安定しています。この傾向は一貫しているようです。";
                    })()}
                  </p>
                </div>
              )}

              {/* Contradictions for this axis */}
              {detail.contras.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    関連する矛盾
                  </p>
                  <div className="space-y-2">
                    {detail.contras.map((c, ci) => (
                      <motion.div
                        key={ci}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: ci * 0.05 }}
                        className="flex items-center gap-2 rounded-lg px-3 py-2"
                        style={{
                          background: `rgba(220,80,80,${0.03 + c.severity * 0.04})`,
                          border: `1px solid rgba(220,80,80,${0.08 + c.severity * 0.1})`,
                        }}
                      >
                        <motion.div
                          className="w-2 h-2 rounded-full bg-red-400"
                          animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        />
                        <span className="text-sm text-slate-700 font-medium">
                          {axisLabel(detail.axis)} / {axisLabel(c.other)}
                        </span>
                        <span className="ml-auto text-xs font-mono text-red-400">
                          {Math.round(c.severity * 100)}%
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
