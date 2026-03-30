"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { MirrorModeResult } from "@/lib/aneurasync/personaGenome";
import DualRadarOverlay from "./DualRadarOverlay";

interface MirrorTabProps {
  mirror: MirrorModeResult;
}

/** Dummy data for locked preview */
const DUMMY_MIRROR: MirrorModeResult = {
  selfPerception: {
    expressiveness: 0.65,
    boldness: 0.45,
    socialOrientation: 0.7,
    aestheticIntensity: 0.55,
    warmth: 0.6,
    practicality: 0.5,
    consistency: 0.75,
  },
  othersPerception: {
    expressiveness: 0.5,
    boldness: 0.6,
    socialOrientation: 0.55,
    aestheticIntensity: 0.7,
    warmth: 0.45,
    practicality: 0.65,
    consistency: 0.6,
  },
  gaps: [],
  summary: "",
  gapScore: 70,
  hasEnoughData: false,
};

export default function MirrorTab({ mirror }: MirrorTabProps) {
  if (!mirror.hasEnoughData) {
    return <LockedMirror />;
  }

  return (
    <motion.div
      className="space-y-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div
        className="rounded-[32px] border border-white/85 bg-white/76 p-7 shadow-[0_18px_48px_rgba(148,163,184,0.14)] ring-1 ring-slate-200/55 backdrop-blur-xl sm:p-8"
        role="region"
        aria-label="自己認識と他者認識の比較"
      >
        <div
          className="text-center text-xl font-semibold text-slate-900"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          自己認識 vs 他者からの印象
        </div>
        <p className="mt-2 text-center text-sm text-slate-500">
          7つの次元で自分と他者の認識を比較
        </p>

        <div className="mt-5 lg:grid lg:grid-cols-5 lg:gap-8">
          <div className="lg:col-span-3">
            {/* Radar chart */}
            <DualRadarOverlay mirror={mirror} hideGaps />
          </div>
          <div className="mt-5 lg:col-span-2 lg:mt-0">
            {/* Summary */}
            {mirror.summary && (
              <div className="rounded-[28px] border border-white/85 bg-white/76 p-5 text-center shadow-[0_18px_48px_rgba(148,163,184,0.14)] backdrop-blur-xl">
                <div className="text-sm leading-7 text-slate-600">{mirror.summary}</div>
              </div>
            )}

            {/* Gap cards */}
            {mirror.gaps.filter((g) => g.significance !== "low").length > 0 && (
              <div className="mt-4 space-y-2">
                {mirror.gaps
                  .filter((g) => g.significance !== "low")
                  .slice(0, 3)
                  .map((gap) => (
                    <div
                      key={gap.dimension}
                      className="flex items-center gap-3 rounded-2xl bg-amber-50/60 px-5 py-4"
                    >
                      <span className="text-lg">
                        {gap.significance === "high" ? "⚡" : "💡"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-700">
                          {gap.dimensionLabel}
                        </div>
                        <div className="text-xs text-slate-500">{gap.gapLabel}</div>
                      </div>
                      <span className="text-xs font-bold text-amber-600">
                        {Math.abs(Math.round(gap.gap * 100))}pt差
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {/* Gap score summary */}
            <div className="mt-4 text-center">
              <span className="text-xs text-slate-400">
                一致度スコア:{" "}
                <span className="font-bold text-slate-600">{mirror.gapScore}</span>/100
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function LockedMirror() {
  return (
    <div className="space-y-5">
      {/* Blurred preview */}
      <div className="relative rounded-[32px] border border-white/85 bg-white/76 p-6 shadow-[0_18px_48px_rgba(148,163,184,0.14)] ring-1 ring-slate-200/55 backdrop-blur-xl">
        <div className="pointer-events-none select-none blur-md" aria-hidden="true">
          <DualRadarOverlay mirror={DUMMY_MIRROR} />
        </div>

        {/* Frosted glass overlay */}
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[32px] bg-white/60 backdrop-blur-xl" role="status" aria-label="ミラーモードはロック中です">
          <motion.div
            className="relative h-16 w-16"
            animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-200 to-fuchsia-200 opacity-40 blur-xl" />
            <div className="relative grid h-16 w-16 place-items-center rounded-full bg-white/60 backdrop-blur-xl border border-white/80 shadow-lg">
              <span className="text-2xl">🪞</span>
            </div>
          </motion.div>
          <div
            className="mt-4 text-xl font-semibold text-slate-800"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            ミラーモード
          </div>
          <p className="mx-auto mt-2 max-w-[320px] text-center text-sm leading-relaxed text-slate-500">
            他者の目を通した自分自身 — 3件以上のマッチデータで、この鏡が開きます
          </p>
          <Link
            href="/rendezvous"
            className="mt-5 inline-flex items-center justify-center rounded-[18px] bg-slate-900 px-5 py-3 text-sm font-semibold text-white no-underline shadow-[0_12px_30px_rgba(15,23,42,0.18)] transition hover:bg-slate-800"
          >
            マッチを探す
          </Link>
        </div>
      </div>
    </div>
  );
}
