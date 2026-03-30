"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DailyOrbitStore, CompletionTexture } from "@/lib/origin/dailyOrbit/types";
import { ORIGIN_MOTION } from "@/lib/origin/dailyOrbit/animations";
import { TEXTURE_META } from "@/lib/origin/dailyOrbit/types";
import { loadOrbitStoreWithSync, todayKey } from "@/lib/origin/dailyOrbit/store";
import { generateBehavioralLaws } from "@/lib/origin/dailyOrbit/behavioralLawEngine";
import {
  generateMonthlyEvolution,
  shouldShowMonthlyReport,
  dismissMonthlyReport,
  type MonthlyEvolution,
} from "@/lib/origin/dailyOrbit/monthlyEvolution";

const TEXTURE_COLORS: Record<CompletionTexture, string> = {
  satisfying: "bg-emerald-400",
  relieved: "bg-blue-400",
  just_done: "bg-gray-300",
};

export default function MonthlyEvolutionCard() {
  const [store, setStore] = useState<DailyOrbitStore | null>(null);
  const [report, setReport] = useState<MonthlyEvolution | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const today = todayKey();

  useEffect(() => {
    (async () => {
      const loaded = await loadOrbitStoreWithSync();
      if (!loaded) return;
      setStore(loaded);

      const monthKey = shouldShowMonthlyReport(loaded, today);
      if (!monthKey) return;

      // Fetch journal emotion tags for the month
      let journalEmotionTags: string[][] = [];
      try {
        const res = await fetch("/api/origin/journal?days=31");
        const data = await res.json();
        if (data.ok && data.entries) {
          const [, monthStr] = monthKey.split("-");
          const monthNum = parseInt(monthStr) - 1;
          journalEmotionTags = data.entries
            .filter((e: { date: string }) => new Date(e.date + "T00:00:00").getMonth() === monthNum)
            .map((e: { emotion_tags?: string[] }) => e.emotion_tags ?? []);
        }
      } catch {}

      const newLaws = generateBehavioralLaws(loaded).filter((l) => l.isNew);
      const evo = generateMonthlyEvolution(loaded, monthKey, journalEmotionTags, newLaws);
      if (evo) setReport(evo);
    })();
  }, [today]);

  const handleDismiss = useCallback(() => {
    if (report) dismissMonthlyReport(report.month);
    setDismissed(true);
  }, [report]);

  if (!report || dismissed) return null;

  return (
    <motion.div
      {...ORIGIN_MOTION.cardEnter}
      className="mb-4 rounded-2xl bg-gradient-to-br from-indigo-50/60 to-purple-50/40 p-4"
    >
      <div className="flex items-center justify-between">
        <button onClick={() => setExpanded(!expanded)} className="flex-1 text-left">
          <p className="text-xs font-medium text-indigo-600">📊 {report.monthLabel}のふりかえり</p>
          {!expanded && report.narrativeLines.length > 0 && (
            <p className="mt-1 text-xs text-gray-500 line-clamp-1">{report.narrativeLines[0]}</p>
          )}
        </button>
        <div className="flex gap-2">
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-gray-400">
            {expanded ? "▲" : "▼"}
          </button>
          <button onClick={handleDismiss} className="text-[10px] text-gray-400">
            閉じる
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            {...ORIGIN_MOTION.collapse}
            className="overflow-hidden"
          >
            {/* Numbers */}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/50 py-2">
                <p className="text-lg font-medium text-indigo-600">{report.stats.completionRate}%</p>
                <p className="text-[9px] text-gray-400">完了率</p>
              </div>
              <div className="rounded-xl bg-white/50 py-2">
                <p className="text-lg font-medium text-gray-600">{report.stats.activeDays}日</p>
                <p className="text-[9px] text-gray-400">記録日数</p>
              </div>
              <div className="rounded-xl bg-white/50 py-2">
                <p className="text-lg font-medium text-gray-600">{report.stats.journalEntries}</p>
                <p className="text-[9px] text-gray-400">日記</p>
              </div>
            </div>

            {/* Texture shift */}
            {report.textureShift.dominant && (
              <div className="mt-3">
                <p className="mb-1 text-[10px] text-gray-400">完了の感触</p>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-white/30">
                  {(["satisfying", "relieved", "just_done"] as CompletionTexture[]).map((tex) => {
                    // Compute from stats
                    const pct = tex === report.textureShift.dominant
                      ? report.textureShift.dominantPct
                      : tex === "satisfying" && report.textureShift.dominant !== "satisfying"
                        ? Math.round((100 - report.textureShift.dominantPct) / 2)
                        : Math.round((100 - report.textureShift.dominantPct) / 2);
                    if (pct <= 0) return null;
                    return (
                      <div key={tex} className={`${TEXTURE_COLORS[tex]} h-full`} style={{ width: `${pct}%` }} />
                    );
                  })}
                </div>
                {report.textureShift.shiftNarrative && (
                  <p className="mt-1 text-[10px] text-gray-500">{report.textureShift.shiftNarrative}</p>
                )}
              </div>
            )}

            {/* Emotion trend */}
            {report.emotionTrend.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-[10px] text-gray-400">感情キーワード</p>
                <div className="flex flex-wrap gap-1.5">
                  {report.emotionTrend.map((e) => (
                    <span
                      key={e.tag}
                      className="rounded-full bg-violet-100/60 px-2 py-0.5 text-[10px] text-violet-600"
                    >
                      {e.tag} ×{e.count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Narrative */}
            <div className="mt-3 space-y-1">
              {report.narrativeLines.map((line, i) => (
                <motion.p
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.12 }}
                  className="text-xs leading-relaxed text-gray-600"
                >
                  {line}
                </motion.p>
              ))}
            </div>

            {/* Next month hint */}
            <div className="mt-3 rounded-xl bg-white/40 px-3 py-2">
              <p className="text-[10px] text-gray-400">来月へ</p>
              <p className="mt-0.5 text-xs text-gray-600">{report.nextMonthHint}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
