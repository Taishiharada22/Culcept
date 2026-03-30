"use client";

import { motion } from "framer-motion";
import type { SyncScore, SyncBreakdown } from "../_lib/types";
import { SYNC_BAND_COLORS, SYNC_BAND_LABELS } from "../_lib/constants";

const BREAKDOWN_LABELS: Record<keyof SyncBreakdown, { label: string; icon: string }> = {
  climate: { label: "気候", icon: "🌡️" },
  tpo: { label: "TPO", icon: "👔" },
  visualHarmony: { label: "調和", icon: "🎨" },
  mobility: { label: "動き", icon: "🏃" },
  personalFit: { label: "好み", icon: "💡" },
};

function MiniRing({ value, max, color, size = 32 }: { value: number; max: number; color: string; size?: number }) {
  const r = (size - 4) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = max > 0 ? value / max : 0;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={3} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={3} strokeLinecap="round"
        initial={{ strokeDasharray: `0 ${circumference}` }}
        animate={{ strokeDasharray: `${progress * circumference} ${circumference}` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </svg>
  );
}

export function SyncScoreBadge({ sync }: { sync: SyncScore }) {
  const colors = SYNC_BAND_COLORS[sync.band];
  return (
    <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold ${colors.bg} ${colors.text} border ${colors.border}`}>
      <span>{sync.total}</span>
      <span className="opacity-60">{SYNC_BAND_LABELS[sync.band]}</span>
    </div>
  );
}

export function SyncScoreRing({ sync, size = 56 }: { sync: SyncScore; size?: number }) {
  const colors = SYNC_BAND_COLORS[sync.band];

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <MiniRing value={sync.total} max={100} color={colors.ring} size={size} />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-sm font-black ${colors.text}`}>{sync.total}</span>
      </div>
    </div>
  );
}

export default function SyncScoreDisplay({ sync }: { sync: SyncScore }) {
  const colors = SYNC_BAND_COLORS[sync.band];

  return (
    <div className={`rounded-2xl ${colors.bg} border ${colors.border} backdrop-blur-sm p-3`}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold tracking-widest text-gray-400 uppercase">SYNC Score</span>
          <span className={`text-[9px] font-bold ${colors.text} ${colors.bg} rounded-full px-2 py-0.5`}>
            {SYNC_BAND_LABELS[sync.band]}
          </span>
        </div>
        <SyncScoreRing sync={sync} size={44} />
      </div>

      {/* 5分割スコア */}
      <div className="grid grid-cols-5 gap-1.5">
        {(Object.keys(BREAKDOWN_LABELS) as Array<keyof SyncBreakdown>).map(key => {
          const { label, icon } = BREAKDOWN_LABELS[key];
          const value = sync.breakdown[key];
          return (
            <div key={key} className="text-center">
              <div className="flex justify-center mb-1">
                <MiniRing value={value} max={25} color={colors.ring} size={30} />
              </div>
              <p className="text-[8px] text-gray-500 leading-none">{icon} {label}</p>
              <p className="text-[10px] font-bold text-gray-600">{value}/25</p>
            </div>
          );
        })}
      </div>

      {/* 理由 */}
      {sync.reasons.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {sync.reasons.map((r, i) => (
            <p key={i} className="text-[9px] text-gray-500 flex items-start gap-1">
              <span className="text-gray-300 shrink-0">·</span>
              {r}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
