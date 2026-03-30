"use client";

/**
 * ConstellationOverlap
 * デュアルレーダーSVG — 二人のマッチングベクトル（10軸）を半透明ポリゴンで重ね合わせ
 * RadarChart.tsx の getPoint/getPolygonPoints パターンを流用
 * 重なる領域が共鳴ゾーンとして輝く
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type CategoryType = "romantic" | "friendship" | "cocreation" | "community" | "partner";

type PropsWithVectors = {
  myVector: Record<string, number>;
  theirVector: Record<string, number>;
  category: CategoryType;
  candidateId?: string;
};

type PropsWithCandidateOnly = {
  candidateId: string;
  myVector?: undefined;
  theirVector?: undefined;
  category?: undefined;
};

type Props = PropsWithVectors | PropsWithCandidateOnly;

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const AXIS_LABELS: Record<string, string> = {
  conversation_temperature: "会話の温度",
  distance_need: "距離感",
  depth_speed: "深さの速度",
  stability_need: "安定性",
  stimulation_need: "刺激欲求",
  initiative: "主体性",
  emotional_openness: "感情の開放度",
  conflict_directness: "対立の直接性",
  social_energy: "社交エネルギー",
  structure_preference: "構造の好み",
};

const AXIS_KEYS = Object.keys(AXIS_LABELS);

const CATEGORY_COLORS: Record<CategoryType, string> = {
  romantic: "#EC4899",
  friendship: "#6366F1",
  cocreation: "#F59E0B",
  community: "#8B5CF6",
  partner: "#D4776B",
};

/** Complementary color per category (used for "theirs" polygon) */
const COMPLEMENT_COLORS: Record<CategoryType, string> = {
  romantic: "#6366F1",
  friendship: "#EC4899",
  cocreation: "#8B5CF6",
  community: "#F59E0B",
  partner: "#6366F1",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ConstellationOverlap(props: Props) {
  const [activeAxis, setActiveAxis] = useState<string | null>(null);
  const [fetched, setFetched] = useState<{
    myVector: Record<string, number>;
    theirVector: Record<string, number>;
    category: CategoryType;
  } | null>(null);

  const needsFetch = !props.myVector;
  const candidateId = props.candidateId;

  useEffect(() => {
    if (!needsFetch || !candidateId) return;
    fetch(`/api/rendezvous/${candidateId}/constellation`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setFetched({
            myVector: d.myVector,
            theirVector: d.theirVector,
            category: d.category ?? "friendship",
          });
        }
      })
      .catch(() => {});
  }, [needsFetch, candidateId]);

  const myVector = props.myVector ?? fetched?.myVector;
  const theirVector = props.theirVector ?? fetched?.theirVector;
  const category: CategoryType = props.category ?? fetched?.category ?? "friendship";

  if (!myVector || !theirVector) {
    return (
      <div className="py-6 text-center">
        <span className="text-[10px] text-slate-300">星座を読み込み中...</span>
      </div>
    );
  }

  const size = 280;
  const padding = 58;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.36;
  const total = AXIS_KEYS.length;

  const myColor = CATEGORY_COLORS[category];
  const theirColor = COMPLEMENT_COLORS[category];

  /* ---------- geometry ---------- */

  function getPoint(index: number, value01: number): [number, number] {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    const r = radius * value01;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  function makePolygon(vec: Record<string, number>): string {
    return AXIS_KEYS.map((key, i) => {
      const [x, y] = getPoint(i, vec[key] ?? 0);
      return `${x},${y}`;
    }).join(" ");
  }

  function getGridPath(level: number): string {
    const pts = Array.from({ length: total }, (_, i) => {
      const [x, y] = getPoint(i, level);
      return `${x},${y}`;
    });
    return `M ${pts.join(" L ")} Z`;
  }

  function getLabelPos(index: number) {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    const labelR = radius + 26;
    const x = cx + labelR * Math.cos(angle);
    const y = cy + labelR * Math.sin(angle);
    let anchor: "start" | "middle" | "end" = "middle";
    if (Math.cos(angle) > 0.3) anchor = "start";
    else if (Math.cos(angle) < -0.3) anchor = "end";
    return { x, y: y + 4, anchor };
  }

  /* ---------- overlap zone ---------- */
  const overlapPoints = AXIS_KEYS.map((key, i) => {
    const mine = myVector[key] ?? 0;
    const theirs = theirVector[key] ?? 0;
    return Math.min(mine, theirs);
  });

  function overlapPolygon(): string {
    return overlapPoints
      .map((v, i) => {
        const [x, y] = getPoint(i, v);
        return `${x},${y}`;
      })
      .join(" ");
  }

  /* ---------- DNA strip segments ---------- */
  type DnaSegment = { key: string; type: "resonance" | "complement" | "friction"; width: number };

  const dnaSegments: DnaSegment[] = AXIS_KEYS.map((key) => {
    const diff = Math.abs((myVector[key] ?? 0) - (theirVector[key] ?? 0));
    const type: DnaSegment["type"] =
      diff < 0.2 ? "resonance" : diff < 0.45 ? "complement" : "friction";
    // width proportional to inverse of diff (higher similarity = wider)
    const width = 1 - diff;
    return { key, type, width };
  });

  const totalWidth = dnaSegments.reduce((s, d) => s + d.width, 0);

  const DNA_COLORS: Record<DnaSegment["type"], string> = {
    resonance: "#22C55E",
    complement: "#6366F1",
    friction: "#F59E0B",
  };

  /* ---------- tooltip ---------- */
  const handleAxisTap = (key: string) => {
    setActiveAxis(activeAxis === key ? null : key);
  };

  const gridLevels = [0.33, 0.66, 1];

  return (
    <div className="relative">
      {/* ---- SVG radar ---- */}
      <svg
        viewBox={`${-padding} ${-padding} ${size + padding * 2} ${size + padding * 2}`}
        width={size}
        height={size}
        className="mx-auto block"
        style={{ overflow: "visible" }}
      >
        {/* Grid */}
        {gridLevels.map((level) => (
          <path
            key={level}
            d={getGridPath(level)}
            fill="none"
            stroke="rgba(30,30,60,0.06)"
            strokeWidth={1}
          />
        ))}

        {/* Axis lines */}
        {AXIS_KEYS.map((_, i) => {
          const [x, y] = getPoint(i, 1);
          return (
            <line
              key={`ax-${i}`}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="rgba(30,30,60,0.06)"
              strokeWidth={1}
            />
          );
        })}

        {/* Overlap glow zone */}
        <motion.polygon
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          transition={{ duration: 1, delay: 0.8 }}
          points={overlapPolygon()}
          fill="url(#overlapGlow)"
          stroke="none"
        />

        {/* Mine polygon – solid fill */}
        <motion.polygon
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
          points={makePolygon(myVector)}
          fill={hexToRgba(myColor, 0.15)}
          stroke={hexToRgba(myColor, 0.6)}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        {/* Theirs polygon – dashed stroke */}
        <motion.polygon
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
          points={makePolygon(theirVector)}
          fill={hexToRgba(theirColor, 0.15)}
          stroke={hexToRgba(theirColor, 0.5)}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeDasharray="5 3"
        />

        {/* Data points */}
        {AXIS_KEYS.map((key, i) => {
          const [mx, my] = getPoint(i, myVector[key] ?? 0);
          const [tx, ty] = getPoint(i, theirVector[key] ?? 0);
          return (
            <g key={key}>
              <motion.circle
                initial={{ r: 0 }}
                animate={{ r: activeAxis === key ? 5 : 3 }}
                transition={{ type: "spring", delay: 0.5 + i * 0.04 }}
                cx={mx}
                cy={my}
                fill={myColor}
                stroke="white"
                strokeWidth={1}
                style={{ cursor: "pointer" }}
                onClick={() => handleAxisTap(key)}
              />
              <motion.circle
                initial={{ r: 0 }}
                animate={{ r: activeAxis === key ? 5 : 3 }}
                transition={{ type: "spring", delay: 0.7 + i * 0.04 }}
                cx={tx}
                cy={ty}
                fill={theirColor}
                stroke="white"
                strokeWidth={1}
                style={{ cursor: "pointer" }}
                onClick={() => handleAxisTap(key)}
              />
            </g>
          );
        })}

        {/* Axis labels */}
        {AXIS_KEYS.map((key, i) => {
          const pos = getLabelPos(i);
          const isActive = activeAxis === key;
          return (
            <text
              key={`label-${key}`}
              x={pos.x}
              y={pos.y}
              textAnchor={pos.anchor}
              dominantBaseline="central"
              style={{
                fontSize: isActive ? 11 : 9.5,
                fill: isActive ? myColor : "rgba(30,30,60,0.45)",
                fontWeight: isActive ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onClick={() => handleAxisTap(key)}
            >
              {AXIS_LABELS[key]}
            </text>
          );
        })}

        {/* Gradient defs */}
        <defs>
          <radialGradient id="overlapGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={myColor} stopOpacity={0.35} />
            <stop offset="50%" stopColor={theirColor} stopOpacity={0.2} />
            <stop offset="100%" stopColor="transparent" stopOpacity={0} />
          </radialGradient>
        </defs>
      </svg>

      {/* ---- Legend ---- */}
      <div className="flex justify-center gap-4 mt-2">
        <LegendDot color={myColor} label="あなた" />
        <LegendDot color={theirColor} label="相手" dashed />
      </div>

      {/* ---- Tooltip ---- */}
      <AnimatePresence>
        {activeAxis && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-3 mx-auto max-w-[260px] rounded-xl px-3 py-2"
            style={{
              background: hexToRgba(myColor, 0.06),
              border: `1px solid ${hexToRgba(myColor, 0.15)}`,
            }}
          >
            <p className="text-[11px] font-bold" style={{ color: myColor }}>
              {AXIS_LABELS[activeAxis]}
            </p>
            <div className="flex gap-4 mt-1 text-[10px] text-slate-500">
              <span>あなた: {Math.round((myVector[activeAxis] ?? 0) * 100)}%</span>
              <span>相手: {Math.round((theirVector[activeAxis] ?? 0) * 100)}%</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Relationship DNA strip ---- */}
      <div className="mt-4 px-2">
        <p className="text-[9px] text-slate-400 mb-1 font-medium">Relationship DNA</p>
        <div className="flex h-[6px] rounded-full overflow-hidden">
          {dnaSegments.map((seg) => (
            <div
              key={seg.key}
              style={{
                flex: seg.width / totalWidth,
                backgroundColor: DNA_COLORS[seg.type],
                opacity: 0.7,
              }}
            />
          ))}
        </div>
        <div className="flex gap-3 mt-1.5">
          <DnaLegend color={DNA_COLORS.resonance} label="共鳴" />
          <DnaLegend color={DNA_COLORS.complement} label="補完" />
          <DnaLegend color={DNA_COLORS.friction} label="摩擦" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function LegendDot({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-2 h-2 rounded-full"
        style={{
          background: dashed ? "transparent" : color,
          border: dashed ? `1.5px dashed ${color}` : "none",
        }}
      />
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
  );
}

function DnaLegend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color, opacity: 0.7 }} />
      <span className="text-[8px] text-slate-400">{label}</span>
    </div>
  );
}
