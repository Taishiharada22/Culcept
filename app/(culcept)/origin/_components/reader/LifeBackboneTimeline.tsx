"use client";

import { motion } from "framer-motion";
import type { LifeBackbone } from "@/lib/origin/v7/formationReader";

type Props = {
  backbone: LifeBackbone;
};

export default function LifeBackboneTimeline({ backbone }: Props) {
  if (backbone.periods.length === 0) return null;

  return (
    <section className="mb-2">
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <span className="text-sm">🦴</span>
        <h3 className="text-xs font-semibold text-gray-700">生活骨格</h3>
      </div>

      <div className="relative pl-4">
        {/* Vertical line */}
        <div
          className="absolute left-[0.45rem] top-1 bottom-1 w-[1.5px]"
          style={{
            background:
              "linear-gradient(to bottom, rgba(212,160,64,0.1), rgba(212,160,64,0.25) 15%, rgba(212,160,64,0.25) 85%, rgba(212,160,64,0.1))",
          }}
        />

        <div className="flex flex-col gap-1.5">
          {backbone.periods.map((bp, i) => (
            <motion.div
              key={bp.period}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="relative flex items-start gap-2.5"
            >
              {/* Node dot */}
              <div className="relative z-10 mt-1.5 flex h-3 w-3 shrink-0 items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-amber-300/60" />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 rounded-lg bg-white/40 px-2.5 py-1.5">
                <p className="text-[11px] font-medium text-gray-700">
                  {bp.periodLabel}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                  {bp.location && (
                    <span className="text-[10px] text-gray-400">
                      📍 {bp.location}
                    </span>
                  )}
                  {bp.lifeCenter && (
                    <span className="text-[10px] text-gray-400">
                      ⭐ {bp.lifeCenter}
                    </span>
                  )}
                  {bp.role && (
                    <span className="text-[10px] text-gray-400">
                      👤 {bp.role}
                    </span>
                  )}
                </div>
                {bp.mainActivities.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {bp.mainActivities.slice(0, 3).map((act) => (
                      <span
                        key={act}
                        className="rounded-full bg-amber-50/60 px-1.5 py-0.5 text-[9px] text-amber-600/70"
                      >
                        {act}
                      </span>
                    ))}
                  </div>
                )}
                {bp.turningPoints.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {bp.turningPoints.slice(0, 2).map((tp) => (
                      <span
                        key={tp}
                        className="rounded-full bg-orange-50/60 px-1.5 py-0.5 text-[9px] text-orange-500/70"
                      >
                        ⚡ {tp}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
