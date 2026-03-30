"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import type { ContextualRendezvousVector, RendezvousVectorPreview } from "@/lib/origin/v7/secondSelfBridge";
import type { LifeDomain } from "@/lib/origin/v7/types";

type Props = {
  contextualVectors: ContextualRendezvousVector[];
  baseVector: RendezvousVectorPreview;
};

const DOMAIN_META: Record<LifeDomain, { label: string; color: string; fill: string; stroke: string }> = {
  work: { label: "仕事", color: "text-blue-500", fill: "rgba(59,130,246,0.12)", stroke: "rgba(59,130,246,0.6)" },
  romance: { label: "恋愛", color: "text-rose-500", fill: "rgba(244,63,94,0.12)", stroke: "rgba(244,63,94,0.6)" },
  friendship: { label: "友人", color: "text-amber-500", fill: "rgba(245,158,11,0.12)", stroke: "rgba(245,158,11,0.6)" },
  family: { label: "家族", color: "text-emerald-500", fill: "rgba(16,185,129,0.12)", stroke: "rgba(16,185,129,0.6)" },
  solitude: { label: "一人", color: "text-indigo-500", fill: "rgba(99,102,241,0.12)", stroke: "rgba(99,102,241,0.6)" },
};

const DIMENSION_LABELS: Record<string, string> = {
  conversation_temperature: "会話温度",
  distance_need: "距離感",
  depth_speed: "深まり速度",
  stability_need: "安定志向",
  stimulation_need: "刺激志向",
  initiative: "主導性",
  emotional_openness: "感情開示",
  conflict_directness: "衝突対処",
  social_energy: "社交性",
  structure_preference: "構造志向",
};

const DIMENSIONS = [
  "conversation_temperature", "distance_need", "depth_speed",
  "stability_need", "stimulation_need", "initiative",
  "emotional_openness", "conflict_directness", "social_energy",
  "structure_preference",
];

export default function DomainVectorComparison({
  contextualVectors,
  baseVector,
}: Props) {
  const [expandedDomain, setExpandedDomain] = useState<LifeDomain | null>(null);

  if (contextualVectors.length === 0) return null;

  const expanded = contextualVectors.find((cv) => cv.domain === expandedDomain);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-2"
    >
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
        <span className="text-sm">🎭</span>
        ドメイン別ベクトル
      </h3>

      {/* Mini radar row */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {contextualVectors.map((cv) => {
          const meta = DOMAIN_META[cv.domain];
          const isActive = expandedDomain === cv.domain;

          return (
            <motion.button
              key={cv.domain}
              whileTap={{ scale: 0.95 }}
              onClick={() =>
                setExpandedDomain(isActive ? null : cv.domain)
              }
              className={`flex shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-2 transition-all ${
                isActive
                  ? "border border-gray-200/50 bg-white/50"
                  : "hover:bg-white/30"
              }`}
            >
              <MiniRadar
                vector={cv.vector}
                fill={meta.fill}
                stroke={meta.stroke}
              />
              <span className={`text-[9px] font-medium ${meta.color}`}>
                {meta.label}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 overflow-hidden rounded-xl border border-gray-100/40 bg-white/30 px-3 py-2.5"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className={`text-[11px] font-semibold ${DOMAIN_META[expanded.domain].color}`}>
                {DOMAIN_META[expanded.domain].label}
              </span>
              <span className="rounded-full bg-gray-100/50 px-1.5 py-0.5 text-[8px] text-gray-400">
                信頼度 {Math.round(expanded.confidence * 100)}%
              </span>
              <span className="text-[8px] text-gray-300">
                {expanded.dataPointCount}データポイント
              </span>
            </div>

            {/* Dimension diff list */}
            <div className="space-y-1">
              {DIMENSIONS.map((dim) => {
                const baseVal = getVectorValue(baseVector, dim);
                const domainVal = getVectorValue(expanded.vector, dim);
                const diff = domainVal - baseVal;
                if (Math.abs(diff) < 0.05) return null;

                return (
                  <div
                    key={dim}
                    className="flex items-center gap-2 text-[10px]"
                  >
                    <span className="w-16 shrink-0 text-gray-500">
                      {DIMENSION_LABELS[dim]}
                    </span>
                    <DiffBar base={baseVal} domain={domainVal} />
                    <span
                      className={`shrink-0 text-[9px] ${
                        diff > 0 ? "text-emerald-500" : "text-rose-400"
                      }`}
                    >
                      {diff > 0 ? "+" : ""}
                      {Math.round(diff * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

/* ━━━ MiniRadar ━━━ */

function MiniRadar({
  vector,
  fill,
  stroke,
}: {
  vector: RendezvousVectorPreview;
  fill: string;
  stroke: string;
}) {
  const dims = DIMENSIONS.map((d) => getVectorValue(vector, d));
  const cx = 24;
  const cy = 24;
  const maxR = 20;
  const n = dims.length;

  const points = dims
    .map((val, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      const r = val * maxR;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 48 48" className="h-10 w-10">
      {/* Grid */}
      <polygon
        points={dims
          .map((_, i) => {
            const angle = (2 * Math.PI * i) / n - Math.PI / 2;
            return `${cx + maxR * Math.cos(angle)},${cy + maxR * Math.sin(angle)}`;
          })
          .join(" ")}
        fill="none"
        stroke="rgba(200,185,160,0.2)"
        strokeWidth="0.5"
      />
      {/* Data */}
      <polygon points={points} fill={fill} stroke={stroke} strokeWidth="1" />
    </svg>
  );
}

/* ━━━ DiffBar ━━━ */

function DiffBar({ base, domain }: { base: number; domain: number }) {
  const left = Math.min(base, domain);
  const width = Math.abs(domain - base);
  const isPositive = domain >= base;

  return (
    <div className="relative h-1.5 flex-1 rounded-full bg-gray-100/50">
      {/* Base marker */}
      <div
        className="absolute top-0 h-1.5 w-0.5 bg-gray-300"
        style={{ left: `${base * 100}%` }}
      />
      {/* Diff bar */}
      <div
        className={`absolute top-0 h-1.5 rounded-full ${
          isPositive ? "bg-emerald-300/60" : "bg-rose-300/60"
        }`}
        style={{
          left: `${left * 100}%`,
          width: `${width * 100}%`,
        }}
      />
    </div>
  );
}

/* ━━━ Helper ━━━ */

function getVectorValue(v: RendezvousVectorPreview, dim: string): number {
  switch (dim) {
    case "conversation_temperature": return v.conversation_temperature;
    case "distance_need": return v.distance_need;
    case "depth_speed": return v.depth_speed;
    case "stability_need": return v.stability_need;
    case "stimulation_need": return v.stimulation_need;
    case "initiative": return v.initiative;
    case "emotional_openness": return v.emotional_openness;
    case "conflict_directness": return v.conflict_directness;
    case "social_energy": return v.social_energy;
    case "structure_preference": return v.structure_preference;
    default: return 0.5;
  }
}
