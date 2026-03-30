// app/stargazer/_components/RepetitionCycleViz.tsx
// 繰り返しの構造 — トリガー→防衛→安心→再発動のループを可視化
"use client";

import { motion } from "framer-motion";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { CORE_WOUND_MODELS } from "@/lib/stargazer/alter";
import { hexToRgba } from "../_utils/color";

// ── Types ──

interface CycleNode {
  id: string;
  label: string;
  sublabel: string;
  icon: string;
  angle: number; // degrees from top
}

const CYCLE_NODES: CycleNode[] = [
  {
    id: "trigger",
    label: "傷の発動",
    sublabel: "何かが引っかかる",
    icon: "⚡",
    angle: 0,
  },
  {
    id: "defense",
    label: "防衛反応",
    sublabel: "身を守ろうとする",
    icon: "🛡",
    angle: 90,
  },
  {
    id: "relief",
    label: "一時的な安心",
    sublabel: "その場はしのぐ",
    icon: "😮‍💨",
    angle: 180,
  },
  {
    id: "retrigger",
    label: "再発動",
    sublabel: "根本は変わらない",
    icon: "🔄",
    angle: 270,
  },
];

interface Props {
  archetypeCode?: string | null;
}

function polarToCart(angleDeg: number, radius: number, cx: number, cy: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

export default function RepetitionCycleViz({ archetypeCode }: Props) {
  const { theme } = useArchetypeTheme();

  if (!theme) return null;

  const { primary, accent, text, textMuted, border } = theme.palette;

  const wound = archetypeCode ? CORE_WOUND_MODELS[archetypeCode] : null;

  // SVG layout
  const SVG_SIZE = 280;
  const CX = SVG_SIZE / 2;
  const CY = SVG_SIZE / 2;
  const ORBIT_RADIUS = 95;
  const NODE_R = 28;

  // Build arc path segments between nodes (clockwise)
  function buildArcPath(fromAngle: number, toAngle: number): string {
    const GAP = 22; // degrees gap on each side of node
    const startAngle = fromAngle + GAP;
    const endAngle = toAngle - GAP;
    const start = polarToCart(startAngle, ORBIT_RADIUS, CX, CY);
    const end = polarToCart(endAngle, ORBIT_RADIUS, CX, CY);
    // Large arc flag: if sweep > 180
    const sweep = ((endAngle - startAngle + 360) % 360);
    const largeArc = sweep > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${ORBIT_RADIUS} ${ORBIT_RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }

  const arcPaths = CYCLE_NODES.map((node, i) => {
    const next = CYCLE_NODES[(i + 1) % CYCLE_NODES.length];
    return buildArcPath(node.angle, next.angle);
  });

  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      style={{
        background: theme.gradient.card,
        border: `1px solid ${border}`,
        backdropFilter: `blur(${theme.glassEffect.blur})`,
      }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${hexToRgba(primary, 0.3)} 100%)`,
            }}
          />
          <span
            className="text-[10px] font-mono-sg tracking-[0.25em] uppercase"
            style={{ color: textMuted }}
          >
            Repetition Cycle
          </span>
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, ${hexToRgba(primary, 0.3)} 0%, transparent 100%)`,
            }}
          />
        </div>

        <h3
          className="text-sm font-medium text-center mb-1"
          style={{ color: text }}
        >
          繰り返しの構造
        </h3>
        <p
          className="text-[11px] text-center mb-5"
          style={{ color: textMuted }}
        >
          なぜ同じパターンが戻ってくるのか
        </p>

        {/* SVG Cycle */}
        <div className="flex justify-center mb-4">
          <svg
            width={SVG_SIZE}
            height={SVG_SIZE}
            viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
            style={{ overflow: "visible" }}
          >
            {/* Orbit ring */}
            <circle
              cx={CX}
              cy={CY}
              r={ORBIT_RADIUS}
              fill="none"
              stroke={hexToRgba(primary, 0.08)}
              strokeWidth={1}
            />

            {/* Animated arc segments with arrowheads */}
            {arcPaths.map((d, i) => (
              <g key={i}>
                <motion.path
                  d={d}
                  fill="none"
                  stroke={hexToRgba(accent, 0.35)}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeDasharray="4 3"
                  initial={{ pathLength: 0, opacity: 0 }}
                  whileInView={{ pathLength: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.15 * i + 0.3, ease: "easeOut" }}
                />
              </g>
            ))}

            {/* Rotating pulse on orbit */}
            <motion.circle
              r={4}
              fill={hexToRgba(accent, 0.7)}
              style={{ filter: `drop-shadow(0 0 4px ${hexToRgba(accent, 0.6)})` }}
              animate={{
                // Clockwise full orbit
                cx: [
                  CX,
                  CX + ORBIT_RADIUS,
                  CX,
                  CX - ORBIT_RADIUS,
                  CX,
                ],
                cy: [
                  CY - ORBIT_RADIUS,
                  CY,
                  CY + ORBIT_RADIUS,
                  CY,
                  CY - ORBIT_RADIUS,
                ],
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: "linear",
              }}
            />

            {/* Nodes */}
            {CYCLE_NODES.map((node, i) => {
              const { x, y } = polarToCart(node.angle, ORBIT_RADIUS, CX, CY);
              return (
                <motion.g
                  key={node.id}
                  initial={{ opacity: 0, scale: 0.6 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.22, delay: 0.1 * i + 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  {/* Node circle */}
                  <circle
                    cx={x}
                    cy={y}
                    r={NODE_R}
                    fill={hexToRgba(primary, 0.06)}
                    stroke={hexToRgba(accent, 0.25)}
                    strokeWidth={1}
                  />
                  {/* Icon */}
                  <text
                    x={x}
                    y={y - 5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={14}
                  >
                    {node.icon}
                  </text>
                  {/* Label */}
                  <text
                    x={x}
                    y={y + 10}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={8}
                    fill={hexToRgba(text, 0.85)}
                    fontFamily="var(--font-body, system-ui)"
                    fontWeight={500}
                  >
                    {node.label}
                  </text>
                </motion.g>
              );
            })}

            {/* Center label */}
            <text
              x={CX}
              y={CY - 8}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fill={hexToRgba(textMuted, 0.7)}
              fontFamily="var(--font-body, system-ui)"
            >
              同じ場所に
            </text>
            <text
              x={CX}
              y={CY + 6}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fill={hexToRgba(textMuted, 0.7)}
              fontFamily="var(--font-body, system-ui)"
            >
              戻り続ける
            </text>
          </svg>
        </div>

        {/* Node sublabel legend */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {CYCLE_NODES.map((node) => (
            <div
              key={node.id}
              className="rounded-lg px-3 py-2 flex items-start gap-2"
              style={{
                background: hexToRgba(primary, 0.04),
                border: `1px solid ${hexToRgba(border, 0.2)}`,
              }}
            >
              <span className="text-xs mt-0.5">{node.icon}</span>
              <div>
                <p
                  className="text-[11px] font-medium leading-tight"
                  style={{ color: text }}
                >
                  {node.label}
                </p>
                <p
                  className="text-[10px] leading-tight mt-0.5"
                  style={{ color: textMuted }}
                >
                  {node.sublabel}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Wound context if available */}
        {wound && (
          <motion.div
            className="rounded-xl p-4"
            style={{
              background: hexToRgba(accent, 0.05),
              border: `1px solid ${hexToRgba(accent, 0.15)}`,
            }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: accent, fontSize: 10 }}>◈</span>
              <span
                className="text-[10px] font-mono-sg tracking-[0.15em] uppercase"
                style={{ color: accent }}
              >
                あなたのループの発動点
              </span>
            </div>
            <p
              className="text-[11px] leading-relaxed mb-2"
              style={{ color: text, opacity: 0.85 }}
            >
              <span style={{ color: textMuted }}>発動: </span>
              {wound.trigger}
            </p>
            <p
              className="text-[11px] leading-relaxed"
              style={{ color: text, opacity: 0.85 }}
            >
              <span style={{ color: textMuted }}>防衛: </span>
              {wound.defense}
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
