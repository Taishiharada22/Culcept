"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import dynamic from "next/dynamic";

const DailyProphecySection = dynamic(() => import("./DailyProphecySection"), { ssr: false });
const WeeklyReportBanner = dynamic(() => import("./WeeklyReportBanner"), { ssr: false });
const WhisperCard = dynamic(() => import("./WhisperCard"), { ssr: false });

type Props = {
  prophecy: any;
  onVerifyProphecy?: (result: string) => Promise<any>;
  innerWeather: {
    emoji?: string;
    label?: string;
    recorded?: boolean;
    needsInput?: boolean;
  } | null;
  sgData: {
    observationCount?: number;
    confidence?: number;
  } | null;
  axisScores?: Record<string, number>;
  streakDays?: number;
  implicitProfile?: any;
  instrumentUsedToday?: Record<string, boolean>;
};

export default function DailyLoopSection({
  prophecy,
  onVerifyProphecy,
  innerWeather,
  sgData,
  axisScores = {},
  streakDays = 0,
  implicitProfile,
  instrumentUsedToday = {},
}: Props) {
  const obsCount = sgData?.observationCount ?? 0;

  return (
    <section className="px-4 pb-4">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3 mt-2">
        <span className="text-[9px] font-mono tracking-wider text-text4">DAILY LOOP</span>
        <div className="flex-1 h-px bg-black/[0.04]" />
        <span className="text-[9px] text-text4">毎日の積み重ね</span>
      </div>

      <div className="space-y-2.5">
        {/* Hero: Stargazer 今日の1問 — full-width, prominent */}
        <Link
          href="/stargazer"
          className="block rounded-2xl p-4 transition-all active:scale-[0.98] relative overflow-hidden"
          style={{
            background: instrumentUsedToday.stargazer
              ? "rgba(99,102,241,0.03)"
              : "linear-gradient(150deg, rgba(99,102,241,0.1), rgba(139,92,246,0.06), rgba(255,255,255,0.9))",
            border: instrumentUsedToday.stargazer
              ? "1px solid rgba(99,102,241,0.08)"
              : "1.5px solid rgba(99,102,241,0.18)",
            boxShadow: instrumentUsedToday.stargazer
              ? "none"
              : "0 3px 16px rgba(99,102,241,0.08), 0 1px 4px rgba(0,0,0,0.02)",
          }}
        >
          {/* Pulse dot when not done */}
          {!instrumentUsedToday.stargazer && (
            <span
              className="absolute top-3 right-3 w-2 h-2 rounded-full"
              style={{
                background: "#6366F1",
                boxShadow: "0 0 6px rgba(99,102,241,0.5)",
                animation: "orbit-pulse 2s ease-in-out infinite",
              }}
            />
          )}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: instrumentUsedToday.stargazer
                  ? "rgba(99,102,241,0.06)"
                  : "rgba(99,102,241,0.12)",
              }}
            >
              <span className="text-xl">🧠</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-text1">今日の1問</span>
                {instrumentUsedToday.stargazer && (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.08)", color: "#6366F1" }}>
                    完了 ✓
                  </span>
                )}
              </div>
              <p className="text-[10px] text-text3 mt-0.5">
                {instrumentUsedToday.stargazer
                  ? "今日の観測が反映されています"
                  : "1問答えるだけで、あなたのSyncが更新される"}
              </p>
            </div>
            {!instrumentUsedToday.stargazer && (
              <span className="text-[12px] flex-shrink-0 font-medium" style={{ color: "#6366F1" }}>→</span>
            )}
          </div>
        </Link>

        {/* Sub actions row: Inner Weather + Origin */}
        <div className="flex gap-2">
          {/* Inner Weather */}
          <Link
            href="/stargazer"
            className="flex-1 rounded-xl p-3 transition-all active:scale-[0.97]"
            style={{
              background: innerWeather?.recorded
                ? "rgba(34,197,94,0.04)"
                : "rgba(255,255,255,0.7)",
              border: innerWeather?.recorded
                ? "1px solid rgba(34,197,94,0.12)"
                : "1px solid rgba(0,0,0,0.05)",
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">{innerWeather?.emoji ?? "🌤"}</span>
              <span className="text-[10px] font-semibold text-text1">今日の気分</span>
              {innerWeather?.recorded && (
                <span className="text-[8px] text-green-600 ml-auto">✓</span>
              )}
            </div>
            <p className="text-[9px] text-text3">
              {innerWeather?.recorded
                ? innerWeather.label ?? "記録済み"
                : "気分を記録"}
            </p>
          </Link>

          {/* Origin quick record */}
          <Link
            href="/origin"
            className="flex-1 rounded-xl p-3 transition-all active:scale-[0.97]"
            style={{
              background: instrumentUsedToday.origin
                ? "rgba(234,179,8,0.04)"
                : "rgba(255,255,255,0.65)",
              border: instrumentUsedToday.origin
                ? "1px solid rgba(234,179,8,0.1)"
                : "1px solid rgba(0,0,0,0.04)",
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">📝</span>
              <span className="text-[10px] font-semibold text-text1">Origin</span>
              {instrumentUsedToday.origin && (
                <span className="text-[8px] text-amber-600 ml-auto">✓</span>
              )}
            </div>
            <p className="text-[9px] text-text3 truncate">
              {instrumentUsedToday.origin ? "記録済み" : "今日を一言で"}
            </p>
          </Link>
        </div>

        {/* Prophecy */}
        {obsCount >= 10 && (
          <DailyProphecySection
            prophecy={prophecy}
            onVerify={onVerifyProphecy}
          />
        )}

        {/* Weekly Report */}
        {obsCount >= 7 && (
          <WeeklyReportBanner
            axisScores={axisScores}
            observationCount={obsCount}
            streakDays={streakDays}
          />
        )}

        {/* Whisper */}
        <WhisperCard
          observationCount={obsCount}
          streakDays={streakDays}
          implicitSignalMessage={
            implicitProfile?.signalQuality > 0.5 && implicitProfile?.impliedTraits?.length > 0
              ? `操作パターンに${implicitProfile.impliedTraits[0]?.trait === "impulsivity" ? "直感的な判断の傾向" : implicitProfile.impliedTraits[0]?.trait === "perfectionism" ? "慎重さの兆候" : "特徴的なリズム"}が観測された。`
              : null
          }
        />
      </div>
    </section>
  );
}
