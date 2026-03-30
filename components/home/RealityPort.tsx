"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import RendezvousHomeSection from "@/components/rendezvous/RendezvousHomeSection";
import { getConnectionStage } from "@/lib/rendezvous/connectionStages";

type Props = {
  /** 観測数 */
  observationCount?: number;
  /** Sync% */
  syncPercent?: number;
  /** Rendezvous 候補件数 */
  candidateCount?: number;
  /** 進行中の接続があるか */
  hasActiveConnection?: boolean;
  /** ユーザー名 */
  userName?: string;
};

export default function RealityPort({
  observationCount = 0,
  syncPercent = 0,
  candidateCount = 0,
  hasActiveConnection = false,
  userName,
}: Props) {
  const stage = getConnectionStage({
    observationCount,
    candidateCount,
    hasActiveConnection,
    userName,
  });

  const hasAxes = stage.axes.length > 0 && stage.axes.some((a) => a.fill > 0);
  const hasChips = stage.chips.length > 0;

  return (
    <section className="pb-3">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="rounded-2xl mx-4 overflow-hidden relative"
        style={{
          background: "linear-gradient(165deg, rgba(168,85,247,0.12), rgba(236,72,153,0.07), rgba(255,255,255,0.90))",
          border: "1.5px solid rgba(168,85,247,0.22)",
          boxShadow: "0 4px 16px rgba(168,85,247,0.10), 0 1px 4px rgba(0,0,0,0.03)",
        }}
      >
        {/* Section label */}
        <div className="px-4 pt-3.5 pb-0.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div
              className="w-[3px] h-3 rounded-full"
              style={{ background: "linear-gradient(180deg, #A855F7, #EC4899)" }}
            />
            <span className="text-[12px] font-black tracking-wide" style={{ color: "#7C3AED" }}>
              {stage.title}
            </span>
          </div>
          <span className="text-[8px] text-text3">
            観測が出会いになる
          </span>
        </div>

        {/* Headline + body + chips + axis bars */}
        <div className="px-4 pb-2 pt-1">
          <p className="text-[12px] font-bold text-text1 leading-snug mb-1">
            {stage.headline}
          </p>

          {/* Chips: わかってきたこと */}
          {hasChips && (
            <div className="flex flex-wrap gap-1 mb-2">
              {stage.chips.map((chip) => (
                <span
                  key={chip}
                  className="text-[8px] font-medium px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(168,85,247,0.06)",
                    color: "#7C3AED",
                    border: "1px solid rgba(168,85,247,0.10)",
                  }}
                >
                  {chip}
                </span>
              ))}
            </div>
          )}

          {/* Axis understanding bars */}
          {hasAxes && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {stage.axes.map((axis, i) => (
                <div key={axis.name}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[8px] text-text3">{axis.name}</span>
                  </div>
                  <div className="h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(168,85,247,0.06)" }}>
                    <motion.div
                      className="h-full rounded-full relative"
                      initial={{ width: 0 }}
                      animate={{ width: `${axis.fill}%` }}
                      transition={{ delay: 0.4 + i * 0.1, duration: 0.7 }}
                      style={{
                        background: axis.active
                          ? "linear-gradient(90deg, #A855F780, #EC489960)"
                          : "rgba(168,85,247,0.25)",
                      }}
                    >
                      {axis.active && (
                        <motion.div
                          className="absolute inset-0 rounded-full"
                          style={{
                            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
                          }}
                          animate={{ x: ["-100%", "200%"] }}
                          transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.3 }}
                        />
                      )}
                    </motion.div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rendezvous content */}
        <RendezvousHomeSection />

        {/* Context message + CTA */}
        <div className="px-4 pb-3 pt-1.5">
          <p className="text-[10px] text-text3 leading-relaxed">
            {stage.body}
          </p>
          {stage.cta && (
            <Link
              href={stage.cta.href}
              className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all active:scale-[0.97]"
              style={{
                background: "rgba(168,85,247,0.05)",
                border: "1px solid rgba(168,85,247,0.10)",
              }}
            >
              <span className="text-xs">{stage.cta.icon}</span>
              <span className="text-[10px] font-medium flex-1" style={{ color: "#7C3AED" }}>
                {stage.cta.label}
              </span>
              <span className="text-[10px]" style={{ color: "#A855F7", opacity: 0.5 }}>→</span>
            </Link>
          )}
        </div>
      </motion.div>
    </section>
  );
}
