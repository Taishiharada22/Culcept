// app/stargazer/_components/StressDecayCurveCard.tsx
// ストレス減衰曲線カード — ストレスからの回復パターンを時系列で可視化
"use client";

import { motion } from "framer-motion";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface StressDecayDataPoint {
  /** 日付ラベル */
  dayLabel: string;
  /** ストレス値 (0-1) */
  stressLevel: number;
  /** エネルギー状態 */
  energy: "stressed" | "low_energy" | "moderate" | "high_energy" | "relaxed";
  /** 注記 */
  annotation?: string;
}

export interface StressDecayCurveData {
  /** 時系列データポイント */
  dataPoints: StressDecayDataPoint[];
  /** 回復パターンタイプ */
  recoveryPattern: "elastic" | "gradual" | "stepwise" | "oscillating";
  /** 平均回復日数 */
  avgRecoveryDays: number;
  /** レジリエンス指標 (0-1) */
  resilience: number;
  /** 回復を助ける条件 */
  recoveryAccelerators: string[];
  /** 回復を妨げる条件 */
  recoveryInhibitors: string[];
  /** パターンの解釈 */
  interpretation: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Recovery Pattern Config
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PATTERN_CONFIG: Record<
  StressDecayCurveData["recoveryPattern"],
  { icon: string; label: string; color: string }
> = {
  elastic: { icon: "⚡", label: "弾力型", color: "#48BB78" },
  gradual: { icon: "〜", label: "漸近型", color: "#63B3ED" },
  stepwise: { icon: "▦", label: "階段型", color: "#F6AD55" },
  oscillating: { icon: "∿", label: "振動型", color: "#9F7AEA" },
};

interface Props {
  curveData: StressDecayCurveData;
}

export default function StressDecayCurveCard({ curveData }: Props) {
  const { theme } = useArchetypeTheme();

  if (!theme || curveData.dataPoints.length === 0) return null;

  const { primary, accent, text, textMuted, border } = theme.palette;
  const patternConfig = PATTERN_CONFIG[curveData.recoveryPattern];

  // Chart dimensions
  const chartWidth = 280;
  const chartHeight = 80;
  const points = curveData.dataPoints;
  const maxStress = Math.max(...points.map((p) => p.stressLevel), 0.01);

  // Generate SVG path
  const pathPoints = points.map((p, i) => ({
    x: (i / Math.max(points.length - 1, 1)) * chartWidth,
    y: chartHeight - (p.stressLevel / maxStress) * chartHeight,
  }));

  // Smooth curve using bezier
  const pathD = pathPoints.length > 1
    ? `M ${pathPoints[0].x},${pathPoints[0].y} ` +
      pathPoints.slice(1).map((p, i) => {
        const prev = pathPoints[i];
        const cpx = (prev.x + p.x) / 2;
        return `C ${cpx},${prev.y} ${cpx},${p.y} ${p.x},${p.y}`;
      }).join(" ")
    : "";

  // Fill area path
  const areaD = pathD
    ? `${pathD} L ${chartWidth},${chartHeight} L 0,${chartHeight} Z`
    : "";

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
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${hexToRgba(primary, 0.3)} 100%)`,
            }}
          />
          <span
            className="text-xs font-mono-sg tracking-[0.25em] uppercase"
            style={{ color: hexToRgba(text, 0.74) }}
          >
            ストレス減衰曲線
          </span>
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, ${hexToRgba(primary, 0.3)} 0%, transparent 100%)`,
            }}
          />
        </div>

        <h3
          className="text-base font-medium mb-1"
          style={{ color: hexToRgba(text, 0.96) }}
        >
          ストレス減衰曲線 — 回復の軌跡
        </h3>
        <p
          className="text-sm leading-relaxed mb-4"
          style={{ color: hexToRgba(text, 0.84) }}
        >
          ストレスからどう立ち直るか -- その回復の軌跡に、あなたの心の回復力が表れます。
        </p>

        {/* Recovery Pattern Badge + Resilience */}
        <div className="flex items-center gap-3 mb-4">
          <span
            className="text-sm px-2.5 py-1 rounded-full font-medium"
            style={{
              background: hexToRgba(patternConfig.color, 0.12),
              color: patternConfig.color,
            }}
          >
            {patternConfig.icon} {patternConfig.label}
          </span>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs" style={{ color: hexToRgba(text, 0.8) }}>
                回復力
              </span>
              <span
                className="text-xs font-mono"
                style={{ color: patternConfig.color }}
              >
                {(curveData.resilience * 100).toFixed(0)}%
              </span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: hexToRgba(primary, 0.06) }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${hexToRgba(patternConfig.color, 0.4)}, ${hexToRgba(patternConfig.color, 0.7)})`,
                }}
                initial={{ width: 0 }}
                whileInView={{ width: `${curveData.resilience * 100}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        </div>

        {/* Stress Curve SVG Chart */}
        <div
          className="rounded-xl p-3 mb-4"
          style={{
            background: hexToRgba(accent, 0.03),
            border: `1px solid ${hexToRgba(accent, 0.08)}`,
          }}
        >
          <motion.svg
            width="100%"
            viewBox={`0 0 ${chartWidth} ${chartHeight + 24}`}
            preserveAspectRatio="xMidYMid meet"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.2 }}
          >
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <line
                key={ratio}
                x1={0}
                y1={chartHeight - ratio * chartHeight}
                x2={chartWidth}
                y2={chartHeight - ratio * chartHeight}
                stroke={hexToRgba(primary, 0.06)}
                strokeWidth={0.5}
              />
            ))}

            {/* Area fill */}
            {areaD && (
              <motion.path
                d={areaD}
                fill={hexToRgba(patternConfig.color, 0.08)}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1, delay: 0.3 }}
              />
            )}

            {/* Curve line */}
            {pathD && (
              <motion.path
                d={pathD}
                fill="none"
                stroke={patternConfig.color}
                strokeWidth={2}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                whileInView={{ pathLength: 1, opacity: 0.8 }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              />
            )}

            {/* Data points */}
            {pathPoints.map((p, i) => {
              const dp = points[i];
              const isAnnotated = !!dp.annotation;

              return (
                <g key={i}>
                  <motion.circle
                    cx={p.x}
                    cy={p.y}
                    r={isAnnotated ? 3 : 2}
                    fill={
                      dp.energy === "stressed"
                        ? "#FC8181"
                        : dp.energy === "relaxed"
                          ? "#48BB78"
                          : patternConfig.color
                    }
                    initial={{ r: 0 }}
                    whileInView={{ r: isAnnotated ? 3 : 2 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.05 }}
                  />
                </g>
              );
            })}

            {/* X-axis labels */}
            {points.map((p, i) => {
              // Only show every Nth label to avoid crowding
              if (points.length > 8 && i % Math.ceil(points.length / 6) !== 0 && i !== points.length - 1) return null;
              const x = (i / Math.max(points.length - 1, 1)) * chartWidth;

              return (
                <text
                  key={`label-${i}`}
                  x={x}
                  y={chartHeight + 14}
                  textAnchor="middle"
                  fill={hexToRgba(text, 0.78)}
                  fontSize={8.5}
                  fontFamily="monospace"
                >
                  {p.dayLabel}
                </text>
              );
            })}
          </motion.svg>
        </div>

        {/* Recovery Stats */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div
            className="rounded-lg p-2.5"
            style={{
              background: hexToRgba(primary, 0.03),
              border: `1px solid ${hexToRgba(border, 0.2)}`,
            }}
          >
            <span
              className="text-xs block mb-1"
              style={{ color: hexToRgba(text, 0.8) }}
            >
              平均回復日数
            </span>
            <span
              className="text-base font-mono font-medium"
              style={{ color: hexToRgba(text, 0.94) }}
            >
              {curveData.avgRecoveryDays.toFixed(1)}
              <span className="text-xs ml-0.5" style={{ color: hexToRgba(text, 0.8) }}>日</span>
            </span>
          </div>

          <div
            className="rounded-lg p-2.5"
            style={{
              background: hexToRgba(primary, 0.03),
              border: `1px solid ${hexToRgba(border, 0.2)}`,
            }}
          >
            <span
              className="text-xs block mb-1"
              style={{ color: hexToRgba(text, 0.8) }}
            >
              回復パターン
            </span>
            <span
              className="text-base font-medium"
              style={{ color: patternConfig.color }}
            >
              {patternConfig.label}
            </span>
          </div>
        </div>

        {/* Accelerators & Inhibitors */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {curveData.recoveryAccelerators.length > 0 && (
            <div
              className="rounded-lg p-2.5"
              style={{
                background: hexToRgba("#48BB78", 0.04),
                border: `1px solid ${hexToRgba("#48BB78", 0.1)}`,
              }}
            >
              <span
                className="text-xs block mb-1.5"
                style={{ color: "#48BB78" }}
              >
                回復を加速
              </span>
              {curveData.recoveryAccelerators.map((a) => (
                <div key={a} className="flex items-center gap-1 mb-0.5">
                  <div
                    className="w-1 h-1 rounded-full flex-shrink-0"
                    style={{ background: "#48BB78" }}
                  />
                  <span
                    className="text-xs"
                    style={{ color: hexToRgba(text, 0.86) }}
                  >
                    {a}
                  </span>
                </div>
              ))}
            </div>
          )}
          {curveData.recoveryInhibitors.length > 0 && (
            <div
              className="rounded-lg p-2.5"
              style={{
                background: hexToRgba("#FC8181", 0.04),
                border: `1px solid ${hexToRgba("#FC8181", 0.1)}`,
              }}
            >
              <span
                className="text-xs block mb-1.5"
                style={{ color: "#FC8181" }}
              >
                回復を遅延
              </span>
              {curveData.recoveryInhibitors.map((a) => (
                <div key={a} className="flex items-center gap-1 mb-0.5">
                  <div
                    className="w-1 h-1 rounded-full flex-shrink-0"
                    style={{ background: "#FC8181" }}
                  />
                  <span
                    className="text-xs"
                    style={{ color: hexToRgba(text, 0.86) }}
                  >
                    {a}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Interpretation */}
        <div
          className="p-3 rounded-lg"
          style={{
            background: hexToRgba(primary, 0.03),
            border: `1px dashed ${hexToRgba(border, 0.3)}`,
          }}
        >
          <p
            className="text-xs leading-relaxed text-center"
            style={{ color: hexToRgba(text, 0.82) }}
          >
            {curveData.interpretation}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
