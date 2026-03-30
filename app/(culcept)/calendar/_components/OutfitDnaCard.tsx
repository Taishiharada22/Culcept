"use client";

import * as React from "react";
import { motion } from "framer-motion";
import type { OutfitDnaVector } from "../_lib/outfitDna";
import { DNA_LABELS, describeStyleProfile } from "../_lib/outfitDna";

interface OutfitDnaCardProps {
  dna: OutfitDnaVector;
  centroid?: OutfitDnaVector | null;
  adventureScore?: number;
  styleProfile?: string;
}

export default function OutfitDnaCard({ dna, centroid, adventureScore, styleProfile }: OutfitDnaCardProps) {
  const profile = styleProfile ?? describeStyleProfile(dna);

  // レーダーチャート用のパス生成 (6次元に集約して表示)
  const radarDims = [
    { label: "フォーマリティ", value: dna[0] },
    { label: "保温性", value: dna[1] },
    { label: "彩度", value: dna[3] },
    { label: "ボリューム", value: dna[5] },
    { label: "素材感", value: dna[6] },
    { label: "天候適合", value: dna[9] },
  ];

  const centroidDims = centroid ? [
    centroid[0], centroid[1], centroid[3], centroid[5], centroid[6], centroid[9],
  ] : null;

  const cx = 60;
  const cy = 60;
  const r = 45;

  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / radarDims.length - Math.PI / 2;
    return {
      x: cx + r * value * Math.cos(angle),
      y: cy + r * value * Math.sin(angle),
    };
  };

  const dnaPath = radarDims.map((d, i) => {
    const p = getPoint(i, d.value);
    return `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }).join(" ") + " Z";

  const centroidPath = centroidDims
    ? centroidDims.map((v, i) => {
        const p = getPoint(i, v);
        return `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      }).join(" ") + " Z"
    : null;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-white/40 to-violet-50/20 backdrop-blur-xl border border-white/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">🧬</span>
          <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Outfit DNA</span>
        </div>
        {adventureScore != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-gray-400">冒険度</span>
            <span className={`text-xs font-black ${
              adventureScore >= 60 ? "text-orange-500" : adventureScore >= 30 ? "text-violet-500" : "text-gray-500"
            }`}>
              {adventureScore}%
            </span>
          </div>
        )}
      </div>

      {/* スタイルプロファイル */}
      <p className="text-xs font-bold text-gray-700 mb-3">{profile}</p>

      <div className="flex items-center gap-4">
        {/* レーダーチャート */}
        <svg viewBox="0 0 120 120" className="w-28 h-28 shrink-0">
          {/* グリッド線 */}
          {[0.25, 0.5, 0.75, 1.0].map(scale => (
            <polygon
              key={scale}
              points={radarDims.map((_, i) => {
                const p = getPoint(i, scale);
                return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
              }).join(" ")}
              fill="none"
              stroke="rgba(0,0,0,0.06)"
              strokeWidth="0.5"
            />
          ))}
          {/* 軸線 */}
          {radarDims.map((_, i) => {
            const p = getPoint(i, 1);
            return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(0,0,0,0.06)" strokeWidth="0.5" />;
          })}
          {/* centroid (基準線) */}
          {centroidPath && (
            <motion.path
              d={centroidPath}
              fill="rgba(168,85,247,0.08)"
              stroke="rgba(168,85,247,0.3)"
              strokeWidth="1"
              strokeDasharray="3 2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            />
          )}
          {/* DNA (メイン) */}
          <motion.path
            d={dnaPath}
            fill="rgba(99,102,241,0.15)"
            stroke="rgba(99,102,241,0.6)"
            strokeWidth="1.5"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, type: "spring" }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
          {/* ラベル */}
          {radarDims.map((d, i) => {
            const p = getPoint(i, 1.25);
            return (
              <text
                key={i}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[5px] fill-gray-400 font-medium"
              >
                {d.label}
              </text>
            );
          })}
        </svg>

        {/* DNA値リスト (主要な差分のみ) */}
        <div className="flex-1 space-y-1">
          {radarDims.map((d, i) => {
            const pct = Math.round(d.value * 100);
            const centroidPct = centroidDims ? Math.round(centroidDims[i] * 100) : null;
            const diff = centroidPct != null ? pct - centroidPct : 0;
            return (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[8px] text-gray-400 w-16 shrink-0">{d.label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ delay: 0.1 + i * 0.05, duration: 0.4 }}
                  />
                </div>
                <span className="text-[8px] font-bold text-gray-500 w-6 text-right">{pct}</span>
                {diff !== 0 && (
                  <span className={`text-[7px] font-bold w-6 ${diff > 0 ? "text-orange-400" : "text-blue-400"}`}>
                    {diff > 0 ? "+" : ""}{diff}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
