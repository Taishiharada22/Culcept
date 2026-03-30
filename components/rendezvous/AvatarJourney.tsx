"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FadeInView } from "@/components/ui/glassmorphism-design";
import { RV_COLORS, RvCard } from "@/components/ui/rendezvous-design";
import type { NarrativeEntry } from "@/lib/rendezvous/avatarNarrative";

// =============================================================================
// AvatarJourney — ライトテーマ版
// 分身の生命感 - アバターの活動タイムラインをホワイトカードで表示
// =============================================================================

export default function AvatarJourney() {
  const [entries, setEntries] = useState<NarrativeEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/rendezvous/avatar-journey", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.ok && d.entries?.length > 0) {
          setEntries(d.entries);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true));
  }, []);

  if (error || !entries || entries.length === 0) return null;

  return (
    <RvCard elevated>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">{"\u{1F47B}"}</span>
        <h3
          className="text-sm font-bold tracking-wide"
          style={{ color: RV_COLORS.text }}
        >
          分身の一日
        </h3>
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
          style={{
            background: RV_COLORS.secondarySoft,
            color: RV_COLORS.secondary,
          }}
        >
          24h
        </span>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Connecting line */}
        <div
          className="absolute left-[15px] top-2 bottom-2 w-[2px]"
          style={{
            background: `linear-gradient(180deg, ${RV_COLORS.secondary}30 0%, ${RV_COLORS.secondary}08 100%)`,
          }}
        />

        <div className="flex flex-col gap-3">
          {entries.map((entry, index) => (
            <FadeInView key={`${entry.time}-${index}`} delay={index * 0.08}>
              <div className="relative flex items-start gap-3">
                {/* Time dot */}
                <div className="relative z-10 shrink-0 flex flex-col items-center">
                  <motion.div
                    className="w-[30px] h-[30px] rounded-full flex items-center justify-center"
                    style={{
                      background: RV_COLORS.surfaceMuted,
                      border: `1px solid ${RV_COLORS.border}`,
                      boxShadow: `0 2px 8px ${RV_COLORS.shadow}`,
                    }}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: index * 0.1, duration: 0.3 }}
                  >
                    <span className="text-sm">{entry.icon}</span>
                  </motion.div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-1">
                  <p
                    className="text-[10px] font-semibold uppercase tracking-widest mb-1"
                    style={{ color: RV_COLORS.textMuted }}
                  >
                    {entry.time}
                  </p>
                  <p
                    className="text-sm leading-relaxed"
                    style={{
                      color: RV_COLORS.textSub,
                      fontFamily: "'Noto Serif JP', serif",
                    }}
                  >
                    {entry.text}
                  </p>
                </div>
              </div>
            </FadeInView>
          ))}
        </div>
      </div>
    </RvCard>
  );
}
