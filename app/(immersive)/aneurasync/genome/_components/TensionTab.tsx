"use client";

import { motion } from "framer-motion";
import type { GenomeVisualizationData } from "@/lib/aneurasync/personaGenome";
import type { StrandTension } from "@/lib/aneurasync/genomeTension";
import { useStrandTension } from "../hooks/useStrandTension";
import InsightNarrative from "./InsightNarrative";

const TITLE_STYLE = { fontFamily: "'Cormorant Garamond', serif" };

const STRAND_COLORS: Record<string, string> = {
  physical: "#6366f1",
  personality: "#8b5cf6",
  behavioral: "#ec4899",
  social: "#14b8a6",
};

const STRAND_LABELS: Record<string, string> = {
  physical: "フィジカル",
  personality: "パーソナリティ",
  behavioral: "ビヘイビア",
  social: "ソーシャル",
};

interface TensionTabProps {
  visualization: GenomeVisualizationData;
}

/**
 * TensionTab — Visualizes cross-strand tensions and harmonies.
 */
export default function TensionTab({ visualization }: TensionTabProps) {
  const tension = useStrandTension(visualization.strands);

  return (
    <div className="space-y-8">
      {/* Harmony Score */}
      <div className="rounded-[32px] border border-white/85 bg-white/76 px-8 py-10 text-center shadow-[0_18px_48px_rgba(148,163,184,0.14)] backdrop-blur-xl">
        <div className="text-sm text-slate-400">全体ハーモニースコア</div>
        <div className="mt-3 flex items-center justify-center">
          <HarmonyGauge score={tension.overallHarmony} />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-500">
          {tension.overallHarmony >= 70
            ? "4本の鎖は美しく調和しています — あなたの内面は一貫性を保っています"
            : tension.overallHarmony >= 40
              ? "いくつかの矛盾が見えています — これはあなたの内面の豊かさの証です"
              : "強いテンションが存在します — 自己理解を深める最高の出発点です"}
        </p>
      </div>

      {/* Insight */}
      {tension.topClashes.length > 0 && (
        <InsightNarrative
          insight={`あなたの内面には${tension.topClashes.length}つの矛盾があります — これは自己理解の深さの証です`}
          detail="矛盾は弱点ではありません。複雑さを持つ人ほど、状況に応じた柔軟な判断ができます。"
          icon="🔮"
          accentColor="#8b5cf6"
        />
      )}

      {/* Tension/Harmony Network Visualization */}
      <TensionNetwork tensions={tension.tensions} />

      {/* Clashes & Harmonies */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Clashes */}
        {tension.topClashes.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <span className="text-base">⚡</span>
              <span className="text-sm font-semibold text-slate-700">テンション（矛盾）</span>
            </div>
            {tension.topClashes.map((t, i) => (
              <TensionCard key={i} tension={t} type="clash" index={i} />
            ))}
          </div>
        )}

        {/* Harmonies */}
        {tension.topHarmonies.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <span className="text-base">✨</span>
              <span className="text-sm font-semibold text-slate-700">ハーモニー（共鳴）</span>
            </div>
            {tension.topHarmonies.map((t, i) => (
              <TensionCard key={i} tension={t} type="harmony" index={i} />
            ))}
          </div>
        )}
      </div>

      {/* Empty state */}
      {tension.tensions.length === 0 && (
        <div className="rounded-[32px] border border-white/85 bg-white/76 px-7 py-16 text-center backdrop-blur-xl">
          <div className="text-5xl">🌌</div>
          <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-slate-500">
            あなたの内面の地図を描く準備をしています。もう少しデータが集まると、鎖同士の共鳴と矛盾が浮かび上がります。
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function HarmonyGauge({ score }: { score: number }) {
  const angle = (score / 100) * 180;
  const radius = 70;
  const cx = 80;
  const cy = 80;

  // Arc path
  const startAngle = Math.PI;
  const endAngle = startAngle - (angle / 180) * Math.PI;
  const startX = cx + radius * Math.cos(startAngle);
  const startY = cy + radius * Math.sin(startAngle);
  const endX = cx + radius * Math.cos(endAngle);
  const endY = cy + radius * Math.sin(endAngle);
  const largeArc = angle > 90 ? 1 : 0;

  const color =
    score >= 70 ? "#14b8a6" : score >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative">
      <svg viewBox="0 0 160 90" width={200} height={110} role="img" aria-label={`ハーモニースコア: ${score}点（100点満点）`}>
        {/* Background arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="rgba(148,163,184,0.12)"
          strokeWidth={10}
          strokeLinecap="round"
        />
        {/* Active arc */}
        <motion.path
          d={`M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
        <div className="text-3xl font-bold" style={{ color }}>
          {score}
        </div>
        <div className="text-[10px] text-slate-400">/ 100</div>
      </div>
    </div>
  );
}

function TensionNetwork({ tensions }: { tensions: StrandTension[] }) {
  if (tensions.length === 0) return null;

  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const r = 80;

  // Position 4 strands in a diamond
  const strandPositions: Record<string, { x: number; y: number }> = {
    physical: { x: cx, y: cy - r },
    personality: { x: cx + r, y: cy },
    behavioral: { x: cx, y: cy + r },
    social: { x: cx - r, y: cy },
  };

  return (
    <div className="rounded-[28px] border border-white/85 bg-white/76 p-6 shadow-[0_18px_48px_rgba(148,163,184,0.14)] backdrop-blur-xl" aria-label="テンションネットワーク図">
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto block w-full" style={{ maxWidth: size }} role="img" aria-label="4本の鎖の関係を示すネットワーク図">
        {/* Connection lines */}
        {tensions.map((t, i) => {
          const from = strandPositions[t.fromStrand];
          const to = strandPositions[t.toStrand];
          if (!from || !to) return null;

          const isClash = t.tensionScore < 0;
          const intensity = Math.abs(t.tensionScore);

          return (
            <motion.line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={isClash ? "#ef4444" : "#14b8a6"}
              strokeWidth={1 + intensity * 3}
              strokeOpacity={0.3 + intensity * 0.4}
              strokeDasharray={isClash ? "6 4" : "none"}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.3 + i * 0.1, duration: 0.6 }}
            />
          );
        })}

        {/* Strand nodes */}
        {Object.entries(strandPositions).map(([id, pos]) => (
          <g key={id}>
            <circle
              cx={pos.x}
              cy={pos.y}
              r={22}
              fill={STRAND_COLORS[id] ?? "#8b5cf6"}
              fillOpacity={0.15}
              stroke={STRAND_COLORS[id] ?? "#8b5cf6"}
              strokeWidth={2}
              strokeOpacity={0.4}
            />
            <circle
              cx={pos.x}
              cy={pos.y}
              r={6}
              fill={STRAND_COLORS[id] ?? "#8b5cf6"}
            />
            <text
              x={pos.x}
              y={pos.y + 34}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill="rgba(58,64,88,0.7)"
            >
              {STRAND_LABELS[id] ?? id}
            </text>
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-center gap-5 text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 rounded bg-red-500" style={{ backgroundImage: "repeating-linear-gradient(90deg, #ef4444, #ef4444 3px, transparent 3px, transparent 5px)" }} />
          <span className="text-slate-400">テンション</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 rounded bg-teal-500" />
          <span className="text-slate-400">ハーモニー</span>
        </div>
      </div>
    </div>
  );
}

function TensionCard({
  tension,
  type,
  index,
}: {
  tension: StrandTension;
  type: "clash" | "harmony";
  index: number;
}) {
  const isClash = type === "clash";
  const fromColor = STRAND_COLORS[tension.fromStrand] ?? "#8b5cf6";
  const toColor = STRAND_COLORS[tension.toStrand] ?? "#8b5cf6";

  return (
    <motion.div
      role="article"
      className={`rounded-[24px] border px-6 py-5 ${
        isClash
          ? "border-red-200/40 bg-red-50/40"
          : "border-teal-200/40 bg-teal-50/40"
      }`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.08 }}
    >
      {/* Strand connection */}
      <div className="flex items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
          style={{ backgroundColor: fromColor }}
        >
          {STRAND_LABELS[tension.fromStrand]}
        </span>
        <span className="text-xs text-slate-400">
          {isClash ? "⚡" : "✨"}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
          style={{ backgroundColor: toColor }}
        >
          {STRAND_LABELS[tension.toStrand]}
        </span>
        <span className={`ml-auto text-xs font-bold ${isClash ? "text-red-500" : "text-teal-500"}`}>
          {isClash ? "-" : "+"}{Math.round(Math.abs(tension.tensionScore) * 100)}
        </span>
      </div>

      {/* Description */}
      <p className="mt-2 text-xs text-slate-600">{tension.label}</p>

      {/* Involved traits */}
      <div className="mt-2 flex gap-2 text-[10px] text-slate-400">
        <span>{tension.fromLabel}</span>
        <span>×</span>
        <span>{tension.toLabel}</span>
      </div>
    </motion.div>
  );
}
