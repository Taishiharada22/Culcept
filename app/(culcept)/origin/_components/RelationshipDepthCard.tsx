"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import type { RelationshipDepthProfile } from "@/lib/origin/v7/secondSelfBridge";

type Props = {
  profile: RelationshipDepthProfile;
};

const CONFLICT_STYLE_META: Record<string, { label: string; icon: string; color: string }> = {
  avoid: { label: "衝突回避", icon: "🌫️", color: "text-gray-500" },
  confront: { label: "直接対峙", icon: "⚡", color: "text-amber-600" },
  mediate: { label: "調整・仲裁", icon: "🤝", color: "text-emerald-600" },
  withdraw: { label: "静かに撤退", icon: "🚶", color: "text-indigo-500" },
};

export default function RelationshipDepthCard({ profile }: Props) {
  const [expanded, setExpanded] = useState(false);

  const hasData =
    profile.trustBreakers.length > 0 ||
    profile.conflictStyle !== null ||
    profile.evidenceSources.length > 0;

  if (!hasData) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-2"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="group w-full rounded-2xl border border-rose-200/30 bg-rose-50/20 p-3 text-left backdrop-blur-sm transition-all hover:border-rose-200/50 hover:bg-rose-50/30"
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm">💎</span>
          <h3 className="text-xs font-semibold text-gray-700">信頼・親密度</h3>
          <span className="ml-auto text-[10px] text-gray-400">
            {expanded ? "閉じる" : "詳細"}
          </span>
        </div>
        {!expanded && (
          <div className="flex items-center gap-3">
            <MiniTrustMeter value={profile.trustBuildSpeed} label="構築速度" />
            <MiniTrustMeter value={profile.intimacyComfort} label="親密度" />
            {profile.conflictStyle && (
              <span className="text-[10px] text-gray-400">
                {CONFLICT_STYLE_META[profile.conflictStyle]?.icon}{" "}
                {CONFLICT_STYLE_META[profile.conflictStyle]?.label}
              </span>
            )}
          </div>
        )}
      </button>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-2 space-y-3 px-1"
        >
          {/* Trust build speed */}
          <div>
            <p className="mb-1.5 text-[10px] font-medium text-rose-400/70">
              信頼構築速度
            </p>
            <TrustSpeedArc value={profile.trustBuildSpeed} />
          </div>

          {/* Intimacy comfort */}
          <div>
            <p className="mb-1.5 text-[10px] font-medium text-rose-400/70">
              親密度の快適圏
            </p>
            <IntimacyBar value={profile.intimacyComfort} />
          </div>

          {/* Trust breakers */}
          {profile.trustBreakers.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-medium text-rose-400/70">
                信頼崩壊トリガー
              </p>
              <div className="flex flex-wrap gap-1">
                {profile.trustBreakers.map((tb, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-rose-200/40 bg-rose-50/30 px-2 py-0.5 text-[9px] text-rose-500"
                  >
                    {tb}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recovery pattern */}
          {profile.recoveryPattern && (
            <div>
              <p className="mb-1 text-[10px] font-medium text-emerald-500/70">
                回復パターン
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-emerald-100/40 bg-emerald-50/20 px-2.5 py-1.5">
                <span className="text-xs">🌱</span>
                <span className="text-[11px] text-gray-600">
                  {profile.recoveryPattern}
                </span>
              </div>
            </div>
          )}

          {/* Conflict style */}
          {profile.conflictStyle && (
            <div>
              <p className="mb-1 text-[10px] font-medium text-rose-400/70">
                衝突スタイル
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-gray-100/40 bg-white/30 px-2.5 py-2">
                <span className="text-base">
                  {CONFLICT_STYLE_META[profile.conflictStyle].icon}
                </span>
                <div>
                  <p className={`text-[11px] font-medium ${CONFLICT_STYLE_META[profile.conflictStyle].color}`}>
                    {CONFLICT_STYLE_META[profile.conflictStyle].label}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Evidence */}
          {profile.evidenceSources.length > 0 && (
            <div className="border-t border-gray-100/30 pt-2">
              <p className="mb-1 text-[9px] text-gray-400">根拠</p>
              <div className="space-y-0.5">
                {profile.evidenceSources.map((src, i) => (
                  <p key={i} className="text-[9px] text-gray-400">
                    · {src}
                  </p>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </motion.section>
  );
}

/* ━━━ MiniTrustMeter (summary view) ━━━ */

function MiniTrustMeter({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] text-gray-400">{label}</span>
      <div className="h-1 w-12 rounded-full bg-gray-100/50">
        <div
          className="h-1 rounded-full bg-rose-300/60"
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}

/* ━━━ TrustSpeedArc ━━━ */

function TrustSpeedArc({ value }: { value: number }) {
  const angle = value * 180; // 0 = very slow, 180 = very fast
  const labels = ["慎重", "普通", "速い"];
  const labelIdx = value < 0.35 ? 0 : value < 0.65 ? 1 : 2;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 70" className="h-14 w-28">
        {/* Background arc */}
        <path
          d="M 10 60 A 50 50 0 0 1 110 60"
          fill="none"
          stroke="rgba(200,185,160,0.15)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d="M 10 60 A 50 50 0 0 1 110 60"
          fill="none"
          stroke="rgba(244,63,94,0.4)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${value * 157} 157`}
        />
        {/* Needle */}
        <line
          x1="60"
          y1="60"
          x2={60 + 35 * Math.cos(((180 - angle) * Math.PI) / 180)}
          y2={60 - 35 * Math.sin(((180 - angle) * Math.PI) / 180)}
          stroke="rgba(100,100,100,0.4)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="60" cy="60" r="3" fill="rgba(100,100,100,0.3)" />
      </svg>
      <span className="text-[10px] text-gray-500">{labels[labelIdx]}</span>
    </div>
  );
}

/* ━━━ IntimacyBar ━━━ */

function IntimacyBar({ value }: { value: number }) {
  return (
    <div className="space-y-1">
      <div className="relative h-3 w-full rounded-full bg-gradient-to-r from-gray-100 via-rose-100/50 to-rose-200/50">
        <motion.div
          initial={{ left: "0%" }}
          animate={{ left: `${value * 100}%` }}
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
        >
          <div className="h-4 w-4 rounded-full border-2 border-white bg-rose-400 shadow-sm" />
        </motion.div>
      </div>
      <div className="flex justify-between text-[8px] text-gray-400">
        <span>控えめ</span>
        <span>開放的</span>
      </div>
    </div>
  );
}
