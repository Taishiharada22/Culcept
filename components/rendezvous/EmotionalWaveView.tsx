"use client";

/**
 * EmotionalWaveView
 * 二人の感情フローを可視化するデュアルウェーブチャート
 */

import { motion } from "framer-motion";
import { GlassCard, GlassBadge, FadeInView } from "@/components/ui/glassmorphism-design";
import type {
  ContagionProfile,
  MessageEmotion,
  EmotionSignal,
} from "@/lib/rendezvous/emotionalContagion";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  profile: ContagionProfile;
  selfName?: string;
  otherName?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SVG_W = 400;
const SVG_H = 200;
const WAVE_MID = SVG_H / 2;
const WAVE_AMP = 60; // max amplitude per side
const PADDING_X = 20;

const EMOTION_HUE: Record<EmotionSignal, number> = {
  warm: 30,
  excited: 50,
  calm: 210,
  anxious: 0,
  playful: 150,
  serious: 260,
  tender: 330,
  neutral: 220,
};

const FLOW_LABELS: Record<ContagionProfile["dominantFlow"], string> = {
  self_to_other: "あなた → 相手",
  other_to_self: "相手 → あなた",
  mutual: "相互共鳴",
  independent: "それぞれ独立",
};

const FLOW_ARROWS: Record<ContagionProfile["dominantFlow"], string> = {
  self_to_other: "→",
  other_to_self: "←",
  mutual: "↔",
  independent: "·",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emotionColor(emotion: EmotionSignal, alpha = 1): string {
  const h = EMOTION_HUE[emotion];
  return `hsla(${h}, 70%, 55%, ${alpha})`;
}

/** Build a smooth wave path from emotion data points */
function buildWavePath(
  points: MessageEmotion[],
  side: "top" | "bottom",
  total: number,
): string {
  if (points.length === 0) return "";

  const usableW = SVG_W - PADDING_X * 2;

  const coords = points.map((p) => {
    const x = PADDING_X + (p.messageIndex / Math.max(1, total - 1)) * usableW;
    const amp = p.intensity * WAVE_AMP;
    const y = side === "top" ? WAVE_MID - amp : WAVE_MID + amp;
    return { x, y };
  });

  if (coords.length === 1) {
    return `M${coords[0].x},${WAVE_MID} L${coords[0].x},${coords[0].y}`;
  }

  // Catmull-Rom to cubic bezier for smooth curves
  let d = `M${coords[0].x},${WAVE_MID} L${coords[0].x},${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
  }
  // Close back to midline
  d += ` L${coords[coords.length - 1].x},${WAVE_MID}`;

  return d;
}

/** Temperature gauge color based on value */
function tempColor(t: number): string {
  // 0=cool blue, 0.5=warm amber, 1=hot pink
  if (t < 0.5) {
    const ratio = t / 0.5;
    return `hsl(${210 - ratio * 180}, 70%, 55%)`;
  }
  const ratio = (t - 0.5) / 0.5;
  return `hsl(${30 - ratio * 30}, 80%, 55%)`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EmotionalWaveView({
  profile,
  selfName = "あなた",
  otherName = "相手",
}: Props) {
  const { emotionalWave, contagionEvents, peakMoments, resonanceScore, dominantFlow, currentTemperature } = profile;

  const totalMessages = emotionalWave.length;
  const selfWave = emotionalWave.filter((m) => m.sender === "self");
  const otherWave = emotionalWave.filter((m) => m.sender === "other");

  const selfPath = buildWavePath(selfWave, "top", totalMessages);
  const otherPath = buildWavePath(otherWave, "bottom", totalMessages);

  // Find contagion spark positions
  const sparks = contagionEvents.slice(0, 12).map((ev, idx) => {
    // Find corresponding message in timeline
    const matchIdx = emotionalWave.findIndex(
      (m, i) =>
        i > 0 &&
        m.sender !== emotionalWave[i - 1].sender &&
        ((m.sender === "self" && ev.fromSender === "other") ||
          (m.sender === "other" && ev.fromSender === "self")),
    );
    const usableW = SVG_W - PADDING_X * 2;
    const x =
      matchIdx >= 0
        ? PADDING_X + (matchIdx / Math.max(1, totalMessages - 1)) * usableW
        : PADDING_X + ((idx + 1) / (contagionEvents.length + 1)) * usableW;
    return { x, intensity: ev.intensity, idx };
  });

  // Peak moment x-positions
  const peakXs = peakMoments.map((pm) => {
    const usableW = SVG_W - PADDING_X * 2;
    return PADDING_X + (pm.index / Math.max(1, totalMessages - 1)) * usableW;
  });

  const resonancePct = Math.round(resonanceScore * 100);

  if (totalMessages < 2) {
    return (
      <FadeInView>
        <GlassCard className="p-4 text-center">
          <p className="text-sm text-gray-400">
            メッセージが増えると感情の波が見えてきます
          </p>
        </GlassCard>
      </FadeInView>
    );
  }

  return (
    <FadeInView>
      <GlassCard className="p-4 space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">
              感情共鳴度{" "}
              <span className="text-lg font-bold text-purple-600">
                {resonancePct}%
              </span>
            </h3>
            <div className="flex items-center gap-1 mt-0.5">
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5, duration: 0.5 }}
                className="text-xs text-gray-500"
              >
                {FLOW_ARROWS[dominantFlow]}{" "}
                {FLOW_LABELS[dominantFlow]}
              </motion.span>
            </div>
          </div>

          {/* Temperature gauge */}
          <div className="flex flex-col items-center gap-0.5">
            <div className="relative w-10 h-10">
              <svg viewBox="0 0 40 40" className="w-full h-full">
                {/* Background ring */}
                <circle
                  cx={20}
                  cy={20}
                  r={16}
                  fill="none"
                  stroke="rgba(0,0,0,0.06)"
                  strokeWidth={3}
                />
                {/* Animated temperature arc */}
                <motion.circle
                  cx={20}
                  cy={20}
                  r={16}
                  fill="none"
                  stroke={tempColor(currentTemperature)}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 16}`}
                  strokeDashoffset={`${2 * Math.PI * 16 * (1 - currentTemperature)}`}
                  transform="rotate(-90 20 20)"
                  initial={{ strokeDashoffset: 2 * Math.PI * 16 }}
                  animate={{
                    strokeDashoffset:
                      2 * Math.PI * 16 * (1 - currentTemperature),
                  }}
                  transition={{ duration: 1.2, ease: "easeOut", delay: 0.5 }}
                />
              </svg>
              <span
                className="absolute inset-0 flex items-center justify-center text-[10px] font-bold"
                style={{ color: tempColor(currentTemperature) }}
              >
                {Math.round(currentTemperature * 100)}
              </span>
            </div>
            <span className="text-[10px] text-gray-400">温度</span>
          </div>
        </div>

        {/* Wave SVG */}
        <div className="relative">
          {/* Name labels */}
          <div className="flex justify-between text-[10px] text-gray-400 px-1 mb-0.5">
            <span>
              <span
                className="inline-block w-2 h-2 rounded-full mr-1"
                style={{ background: "rgba(139,92,246,0.7)" }}
              />
              {selfName}
            </span>
            <span>
              <span
                className="inline-block w-2 h-2 rounded-full mr-1"
                style={{ background: "rgba(236,72,153,0.7)" }}
              />
              {otherName}
            </span>
          </div>

          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="w-full"
            style={{ height: 200 }}
            preserveAspectRatio="none"
          >
            <defs>
              {/* Self wave gradient (purple) */}
              <linearGradient id="ecw-self-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(139,92,246,0.5)" />
                <stop offset="100%" stopColor="rgba(139,92,246,0.05)" />
              </linearGradient>
              {/* Other wave gradient (pink) */}
              <linearGradient
                id="ecw-other-grad"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="rgba(236,72,153,0.05)" />
                <stop offset="100%" stopColor="rgba(236,72,153,0.5)" />
              </linearGradient>
            </defs>

            {/* Center line */}
            <line
              x1={PADDING_X}
              y1={WAVE_MID}
              x2={SVG_W - PADDING_X}
              y2={WAVE_MID}
              stroke="rgba(0,0,0,0.06)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />

            {/* Tick marks along time axis */}
            {Array.from({ length: 5 }).map((_, i) => {
              const x =
                PADDING_X +
                (i / 4) * (SVG_W - PADDING_X * 2);
              return (
                <line
                  key={i}
                  x1={x}
                  y1={WAVE_MID - 3}
                  x2={x}
                  y2={WAVE_MID + 3}
                  stroke="rgba(0,0,0,0.1)"
                  strokeWidth={1}
                />
              );
            })}

            {/* Self wave (top, purple) */}
            {selfPath && (
              <motion.path
                d={selfPath}
                fill="url(#ecw-self-grad)"
                stroke="rgba(139,92,246,0.7)"
                strokeWidth={2}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
              />
            )}

            {/* Other wave (bottom, pink) */}
            {otherPath && (
              <motion.path
                d={otherPath}
                fill="url(#ecw-other-grad)"
                stroke="rgba(236,72,153,0.7)"
                strokeWidth={2}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, ease: "easeInOut", delay: 0.3 }}
              />
            )}

            {/* Contagion sparks */}
            {sparks.map((spark, i) => (
              <motion.g
                key={`spark-${i}`}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  delay: 1.8 + i * 0.15,
                  duration: 0.4,
                  ease: "backOut",
                }}
              >
                {/* Connection line */}
                <line
                  x1={spark.x}
                  y1={WAVE_MID - 8}
                  x2={spark.x}
                  y2={WAVE_MID + 8}
                  stroke={`rgba(251,191,36,${0.3 + spark.intensity * 0.5})`}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
                {/* Spark dot */}
                <circle
                  cx={spark.x}
                  cy={WAVE_MID}
                  r={2 + spark.intensity * 2}
                  fill={`rgba(251,191,36,${0.5 + spark.intensity * 0.5})`}
                />
              </motion.g>
            ))}

            {/* Peak moment stars */}
            {peakXs.map((x, i) => (
              <motion.g
                key={`peak-${i}`}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 2.2 + i * 0.2, duration: 0.5 }}
              >
                <text
                  x={x}
                  y={12}
                  textAnchor="middle"
                  fontSize={12}
                  fill="rgba(251,191,36,0.8)"
                >
                  ★
                </text>
              </motion.g>
            ))}
          </svg>
        </div>

        {/* Peak moment cards */}
        {peakMoments.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
              ピークモーメント
            </p>
            <div className="flex flex-wrap gap-2">
              {peakMoments.map((pm, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 2.5 + i * 0.15, duration: 0.4 }}
                >
                  <GlassBadge className="text-[11px] px-2 py-1">
                    ★ {pm.description}
                  </GlassBadge>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </GlassCard>
    </FadeInView>
  );
}
