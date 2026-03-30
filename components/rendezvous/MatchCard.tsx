"use client";

import { motion } from "framer-motion";
import { RV_COLORS, RV_CATEGORY_COLORS, RvBadge } from "@/components/ui/rendezvous-design";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

// ---------- Types ----------

export type MatchCardCandidate = {
  candidateId: string;
  photoUrl: string | null;
  displayName: string;
  age?: number | null;
  area?: string | null;
  corePhrase: string;
  resonanceLevel: 0 | 1 | 2 | 3;
  avatarHighlight: string | null;
  bridgePrediction: string | null;
  category: RendezvousCategory;
};

// ---------- Resonance Pulse ----------

function ResonancePulse({ level, category }: { level: number; category: RendezvousCategory }) {
  const color = RV_CATEGORY_COLORS[category];
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => {
          const active = i < level;
          return (
            <motion.div
              key={i}
              className="rounded-full"
              style={{
                width: active ? 10 : 6,
                height: active ? 10 : 6,
                backgroundColor: active ? color : RV_COLORS.surfaceMuted,
                boxShadow: active ? `0 0 8px ${color}40` : "none",
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.12, type: "spring", stiffness: 500 }}
            />
          );
        })}
      </div>
      <span
        className="text-[11px] font-medium tracking-wider"
        style={{ color }}
      >
        共鳴
      </span>
    </div>
  );
}

// ---------- MatchCard ----------

interface MatchCardProps {
  candidate: MatchCardCandidate;
  className?: string;
  style?: React.CSSProperties;
}

export default function MatchCard({ candidate, className, style }: MatchCardProps) {
  const catColor = RV_CATEGORY_COLORS[candidate.category];

  return (
    <div
      className={`relative rounded-3xl overflow-hidden select-none ${className ?? ""}`}
      style={{
        width: "100%",
        maxWidth: 360,
        background: RV_COLORS.surface,
        boxShadow: `0 12px 40px ${RV_COLORS.shadowDeep}, 0 0 30px ${catColor}08`,
        border: `1px solid ${RV_COLORS.border}`,
        ...style,
      }}
    >
      {/* ----- Category Badge ----- */}
      <div className="absolute top-4 left-4 z-20">
        <RvBadge category={candidate.category} />
      </div>

      {/* ----- Photo Area (3:4 aspect) ----- */}
      <div className="relative w-full" style={{ aspectRatio: "3/4" }}>
        {candidate.photoUrl ? (
          <img
            src={candidate.photoUrl}
            alt={candidate.displayName}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${catColor}15 0%, ${RV_COLORS.surfaceMuted} 100%)`,
            }}
          >
            <span
              className="text-7xl font-light"
              style={{
                color: `${catColor}50`,
              }}
            >
              {candidate.displayName.charAt(0)}
            </span>
          </div>
        )}

        {/* Gradient overlay — 下半分をホワイトに馴染ませる */}
        <div
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{
            background: `linear-gradient(to top, ${RV_COLORS.surface} 0%, ${RV_COLORS.surface}E0 25%, ${RV_COLORS.surface}80 50%, transparent 100%)`,
          }}
        />

        {/* カテゴリの柔らかな色彩 */}
        <div
          className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at center bottom, ${catColor}10 0%, transparent 70%)`,
          }}
        />

        {/* Core phrase + name over photo */}
        <div className="absolute inset-x-0 bottom-0 px-5 pb-5 z-10">
          {/* Core phrase — ワインレッドの温もり */}
          <p
            className="text-sm font-medium leading-snug mb-2"
            style={{
              color: RV_COLORS.primary,
              fontFamily: '"Noto Serif JP", serif',
            }}
          >
            &ldquo;{candidate.corePhrase}&rdquo;
          </p>
          <div className="flex items-baseline gap-2.5">
            <span
              className="text-2xl font-bold tracking-tight"
              style={{
                color: RV_COLORS.text,
              }}
            >
              {candidate.displayName}
            </span>
            {candidate.age && (
              <span className="text-base" style={{ color: RV_COLORS.textSub }}>
                {candidate.age}
              </span>
            )}
            {candidate.area && (
              <span className="text-xs" style={{ color: RV_COLORS.textMuted }}>
                {candidate.area}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ----- Info Section ----- */}
      <div className="px-5 py-4 space-y-3.5">
        {/* Resonance */}
        <ResonancePulse level={candidate.resonanceLevel} category={candidate.category} />

        {/* Avatar conversation highlight */}
        {candidate.avatarHighlight && (
          <div
            className="rounded-xl px-4 py-3"
            style={{
              backgroundColor: RV_COLORS.surfaceMuted,
              border: `1px solid ${RV_COLORS.border}`,
            }}
          >
            <p
              className="text-[10px] tracking-wider font-semibold uppercase mb-1"
              style={{ color: RV_COLORS.textMuted }}
            >
              アバターの会話から
            </p>
            <p
              className="text-sm line-clamp-2 leading-relaxed"
              style={{
                color: RV_COLORS.textSub,
                fontFamily: '"Noto Serif JP", serif',
              }}
            >
              {candidate.avatarHighlight}
            </p>
          </div>
        )}

        {/* Bridge prediction */}
        {candidate.bridgePrediction && (
          <p
            className="text-xs leading-relaxed truncate"
            style={{ color: RV_COLORS.textMuted }}
          >
            {candidate.bridgePrediction}
          </p>
        )}
      </div>
    </div>
  );
}
