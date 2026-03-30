"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import type { SecondSelfPreviewResult, RendezvousVectorPreview } from "@/lib/origin/v7/secondSelfBridge";

type Props = {
  preview: SecondSelfPreviewResult;
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

export default function SecondSelfPreview({ preview }: Props) {
  const [expanded, setExpanded] = useState(false);

  const hasData =
    preview.judgmentPrinciples.length > 0 ||
    preview.fluctuationPattern !== null ||
    preview.rendezvousPreview.derivedDimensions.length > 0;

  if (!hasData) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-2"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="group w-full rounded-2xl border border-indigo-200/40 bg-indigo-50/30 p-3.5 text-left backdrop-blur-sm transition-all hover:border-indigo-300/50 hover:bg-indigo-50/50"
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm">🪞</span>
          <h3 className="text-xs font-semibold text-gray-700">分身プレビュー</h3>
          <span className="ml-auto text-[10px] text-gray-400">
            {preview.rendezvousPreview.derivedDimensions.length}/10次元
          </span>
        </div>
        {!expanded && (
          <p className="text-[11px] text-gray-400">
            {preview.judgmentPrinciples[0]?.principle ?? "Origin データから分身のプロフィールを導出"}
          </p>
        )}
      </button>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-2 space-y-3 px-1"
        >
          {/* 判断原理 */}
          {preview.judgmentPrinciples.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-medium text-indigo-500/70">判断原理</p>
              <div className="space-y-1">
                {preview.judgmentPrinciples.map((jp, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-indigo-100/40 bg-white/40 px-2.5 py-1.5"
                  >
                    <p className="text-[10px] text-indigo-400">{jp.domain}</p>
                    <p className="text-[11px] font-medium text-gray-700">
                      「{jp.principle}」
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 揺れ方 */}
          {preview.fluctuationPattern && (
            <div>
              <p className="mb-1 text-[10px] font-medium text-indigo-500/70">揺れ方</p>
              <div className="flex items-center gap-1.5 rounded-lg border border-indigo-100/40 bg-white/40 px-2.5 py-2">
                <span className="text-[11px] text-gray-600">
                  {preview.fluctuationPattern.trigger}
                </span>
                <span className="text-gray-300">→</span>
                <span className="text-[11px] text-gray-600">
                  {preview.fluctuationPattern.response}
                </span>
                {preview.fluctuationPattern.recovery && (
                  <>
                    <span className="text-emerald-300">→</span>
                    <span className="text-[11px] text-emerald-600">
                      {preview.fluctuationPattern.recovery}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 安全プロファイル */}
          {(preview.safetyProfile.safeConditions.length > 0 ||
            preview.safetyProfile.dangerSignals.length > 0) && (
            <div className="flex gap-2">
              {preview.safetyProfile.safeConditions.length > 0 && (
                <div className="flex-1">
                  <p className="mb-1 text-[10px] font-medium text-emerald-500/70">安全条件</p>
                  {preview.safetyProfile.safeConditions.map((c, i) => (
                    <p key={i} className="text-[10px] text-gray-500">
                      + {c}
                    </p>
                  ))}
                </div>
              )}
              {preview.safetyProfile.dangerSignals.length > 0 && (
                <div className="flex-1">
                  <p className="mb-1 text-[10px] font-medium text-rose-400/70">危険シグナル</p>
                  {preview.safetyProfile.dangerSignals.map((d, i) => (
                    <p key={i} className="text-[10px] text-gray-500">
                      - {d}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Rendezvous ベクトル — SVG レーダーチャート */}
          <div>
            <p className="mb-1.5 text-[10px] font-medium text-indigo-500/70">
              Rendezvous ベクトル
            </p>
            <RadarChart vector={preview.rendezvousPreview} />
          </div>
        </motion.div>
      )}
    </motion.section>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SVG Radar Chart
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function RadarChart({ vector }: { vector: RendezvousVectorPreview }) {
  const dimensions: { key: string; value: number; derived: boolean }[] = [
    { key: "conversation_temperature", value: vector.conversation_temperature, derived: vector.derivedDimensions.includes("conversation_temperature") },
    { key: "distance_need", value: vector.distance_need, derived: vector.derivedDimensions.includes("distance_need") },
    { key: "depth_speed", value: vector.depth_speed, derived: vector.derivedDimensions.includes("depth_speed") },
    { key: "stability_need", value: vector.stability_need, derived: vector.derivedDimensions.includes("stability_need") },
    { key: "stimulation_need", value: vector.stimulation_need, derived: vector.derivedDimensions.includes("stimulation_need") },
    { key: "initiative", value: vector.initiative, derived: vector.derivedDimensions.includes("initiative") },
    { key: "emotional_openness", value: vector.emotional_openness, derived: vector.derivedDimensions.includes("emotional_openness") },
    { key: "conflict_directness", value: vector.conflict_directness, derived: vector.derivedDimensions.includes("conflict_directness") },
    { key: "social_energy", value: vector.social_energy, derived: vector.derivedDimensions.includes("social_energy") },
    { key: "structure_preference", value: vector.structure_preference, derived: vector.derivedDimensions.includes("structure_preference") },
  ];

  const cx = 100;
  const cy = 100;
  const maxR = 70;
  const n = dimensions.length;

  // Grid circles
  const gridCircles = [0.25, 0.5, 0.75, 1.0];

  // Compute points
  const points = dimensions.map((d, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    const r = d.value * maxR;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      labelX: cx + (maxR + 16) * Math.cos(angle),
      labelY: cy + (maxR + 16) * Math.sin(angle),
      ...d,
    };
  });

  const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="flex justify-center">
      <svg viewBox="0 0 200 200" className="h-44 w-44">
        {/* Grid */}
        {gridCircles.map((scale) => (
          <polygon
            key={scale}
            points={dimensions
              .map((_, i) => {
                const angle = (2 * Math.PI * i) / n - Math.PI / 2;
                const r = scale * maxR;
                return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
              })
              .join(" ")}
            fill="none"
            stroke="rgba(200,185,160,0.2)"
            strokeWidth="0.5"
          />
        ))}

        {/* Axis lines */}
        {dimensions.map((_, i) => {
          const angle = (2 * Math.PI * i) / n - Math.PI / 2;
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={cx + maxR * Math.cos(angle)}
              y2={cy + maxR * Math.sin(angle)}
              stroke="rgba(200,185,160,0.15)"
              strokeWidth="0.5"
            />
          );
        })}

        {/* Data polygon */}
        <polygon
          points={polygonPoints}
          fill="rgba(129,140,248,0.15)"
          stroke="rgba(129,140,248,0.6)"
          strokeWidth="1.5"
          strokeDasharray={points.some((p) => !p.derived) ? "4,2" : "none"}
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.derived ? 2.5 : 1.5}
            fill={p.derived ? "rgba(129,140,248,0.8)" : "rgba(200,200,200,0.5)"}
            stroke={p.derived ? "rgba(129,140,248,1)" : "rgba(200,200,200,0.8)"}
            strokeWidth="0.5"
          />
        ))}

        {/* Labels */}
        {points.map((p, i) => (
          <text
            key={i}
            x={p.labelX}
            y={p.labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            className={`text-[5px] ${p.derived ? "fill-gray-500" : "fill-gray-300"}`}
          >
            {DIMENSION_LABELS[p.key] ?? p.key}
          </text>
        ))}
      </svg>
    </div>
  );
}
