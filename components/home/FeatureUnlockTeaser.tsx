"use client";

import HomeCard, { CardLabel } from "@/components/ui/HomeCard";
import { getNextUnlock } from "@/lib/ui/homeStateEngine";
import { motion } from "framer-motion";

interface FeatureUnlockTeaserProps {
  currentObservations: number;
}

export default function FeatureUnlockTeaser({ currentObservations }: FeatureUnlockTeaserProps) {
  const next = getNextUnlock(currentObservations);
  if (!next) return null;

  const remaining = next.observations - currentObservations;
  const progress = currentObservations / next.observations;

  return (
    <div className="mx-auto w-full max-w-[780px] px-5">
      <HomeCard tier="supporting" className="relative">
        {/* Subtle blur overlay for "locked" feeling */}
        <div className="pointer-events-none absolute inset-0 rounded-[20px] backdrop-blur-[2px]" />

        <div className="relative z-10">
          <CardLabel>NEXT UNLOCK</CardLabel>

          <div className="mt-2 flex items-center gap-3">
            <span className="text-2xl">{next.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold tracking-tight text-text1">
                あと{remaining}問で「{next.label}」が解放される
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-text3">
                {next.description}
              </p>
            </div>

            {/* Countdown pill */}
            <span className="shrink-0 rounded-full bg-indigo/10 px-2.5 py-1 text-[11px] font-bold text-indigo">
              {remaining}
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/[0.04]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-indigo to-violet"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress * 100, 100)}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </div>
      </HomeCard>
    </div>
  );
}
