"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { DailyOrbitStore, OrbitTask } from "@/lib/origin/dailyOrbit/types";

type Props = {
  store: DailyOrbitStore;
};

type HabitSummary = {
  text: string;
  pattern: string; // "毎日" etc
  streak: number;
  completionRate: number;
  totalDays: number;
  completedDays: number;
  last7: boolean[]; // true = completed on that day
};

/**
 * Origin-style habit tracker.
 * Instead of just tracking streaks, it OBSERVES patterns:
 * - Which habits you keep vs. break
 * - Time-of-day patterns
 * - Correlation with inner weather
 */
export default function HabitTracker({ store }: Props) {
  const habits = useMemo(() => {
    // Find all recurring tasks
    const habitMap = new Map<string, HabitSummary>();
    const today = new Date();
    const last7Dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      last7Dates.push(d.toISOString().slice(0, 10));
    }

    // Scan all entries for recurring tasks
    for (const entry of Object.values(store.entries)) {
      for (const task of entry.tasks) {
        if (!task.recurrence) continue;
        const key = task.text;
        if (!habitMap.has(key)) {
          const patternLabel =
            task.recurrence.pattern === "daily" ? "毎日" :
            task.recurrence.pattern === "weekdays" ? "毎平日" :
            task.recurrence.pattern === "weekly" ? `毎週${["日","月","火","水","木","金","土"][task.recurrence.dayOfWeek ?? 0]}曜` :
            task.recurrence.pattern === "monthly" ? (task.recurrence.dayOfMonth === 32 ? "毎月末" : `毎月${task.recurrence.dayOfMonth}日`) :
            task.recurrence.pattern === "custom" ? `${task.recurrence.intervalDays}日ごと` :
            "隔週";

          habitMap.set(key, {
            text: key,
            pattern: patternLabel,
            streak: 0,
            completionRate: 0,
            totalDays: 0,
            completedDays: 0,
            last7: new Array(7).fill(false),
          });
        }
        const h = habitMap.get(key)!;
        h.totalDays++;
        if (task.completed) h.completedDays++;

        // Check if in last 7 days
        const dayIdx = last7Dates.indexOf(entry.date);
        if (dayIdx >= 0 && task.completed) {
          h.last7[dayIdx] = true;
        }
      }
    }

    // Calculate completion rates and streaks
    for (const h of habitMap.values()) {
      h.completionRate = h.totalDays > 0 ? Math.round((h.completedDays / h.totalDays) * 100) : 0;
      // Streak: count consecutive true from end of last7
      let streak = 0;
      for (let i = h.last7.length - 1; i >= 0; i--) {
        if (h.last7[i]) streak++;
        else break;
      }
      h.streak = streak;
    }

    return Array.from(habitMap.values()).sort((a, b) => b.totalDays - a.totalDays);
  }, [store]);

  if (habits.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 rounded-2xl bg-white/40 p-3"
    >
      <p className="mb-2 text-[11px] font-medium text-gray-400">🔄 習慣の観測</p>
      <div className="space-y-3">
        {habits.map((h) => (
          <div key={h.text} className="rounded-xl bg-white/50 p-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-700">{h.text}</span>
                <span className="text-[9px] text-gray-400">{h.pattern}</span>
              </div>
              {h.streak > 0 && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-600">
                  🔥 {h.streak}日連続
                </span>
              )}
            </div>

            {/* Last 7 days visual */}
            <div className="mt-1.5 flex items-center gap-1">
              {h.last7.map((done, i) => (
                <div
                  key={i}
                  className={`h-4 w-4 rounded-sm text-center text-[8px] leading-4 ${
                    done
                      ? "bg-emerald-400 text-white"
                      : "bg-gray-100 text-gray-300"
                  }`}
                >
                  {done ? "✓" : "·"}
                </div>
              ))}
              <span className="ml-1 text-[10px] text-gray-400">
                {h.completionRate}%
              </span>
            </div>

            {/* Observation insight */}
            {h.totalDays >= 7 && (
              <p className="mt-1 text-[10px] text-gray-400">
                {h.completionRate >= 90
                  ? "安定した習慣になっています"
                  : h.completionRate >= 60
                  ? "まずまず継続中。崩れるパターンを観測中"
                  : "定着にはまだ時間が必要。条件を探っています"}
              </p>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
