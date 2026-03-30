"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DailyOrbitStore, CompletionTexture } from "@/lib/origin/dailyOrbit/types";
import { TEXTURE_META } from "@/lib/origin/dailyOrbit/types";
import { loadOrbitStoreWithSync, todayKey } from "@/lib/origin/dailyOrbit/store";

type WeeklyData = {
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  carriedTasks: number;
  textureCounts: Record<CompletionTexture, number>;
  dominantTexture: CompletionTexture | null;
  busiestDay: string | null;
  quietestDay: string | null;
  daysActive: number;
  avgTasksPerDay: number;
};

const DAY_LABELS: Record<number, string> = {
  0: "日", 1: "月", 2: "火", 3: "水", 4: "木", 5: "金", 6: "土",
};

function getWeekRange(): { start: string; end: string; label: string } {
  const now = new Date();
  const day = now.getDay();
  // Last completed week (Mon-Sun)
  const lastSunday = new Date(now);
  lastSunday.setDate(now.getDate() - day - (day === 0 ? 0 : 0));
  if (day !== 0) lastSunday.setDate(now.getDate() - day);
  const lastMonday = new Date(lastSunday);
  lastMonday.setDate(lastSunday.getDate() - 6);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const label = `${lastMonday.getMonth() + 1}/${lastMonday.getDate()} – ${lastSunday.getMonth() + 1}/${lastSunday.getDate()}`;
  return { start: fmt(lastMonday), end: fmt(lastSunday), label };
}

function computeWeeklyData(store: DailyOrbitStore, start: string, end: string): WeeklyData | null {
  const entries = Object.values(store.entries).filter(
    (e) => e.date >= start && e.date <= end,
  );
  if (entries.length === 0) return null;

  let totalTasks = 0;
  let completedTasks = 0;
  let carriedTasks = 0;
  const textureCounts: Record<CompletionTexture, number> = {
    satisfying: 0,
    relieved: 0,
    just_done: 0,
  };
  const dayTaskCounts: Record<string, number> = {};

  for (const e of entries) {
    totalTasks += e.tasks.length;
    for (const t of e.tasks) {
      if (t.completed) {
        completedTasks++;
        if (t.texture) textureCounts[t.texture]++;
      }
      if ((t.carryCount ?? 0) > 0) carriedTasks++;
    }
    const dayOfWeek = new Date(e.date + "T00:00:00").getDay();
    dayTaskCounts[DAY_LABELS[dayOfWeek]] = (dayTaskCounts[DAY_LABELS[dayOfWeek]] ?? 0) + e.tasks.length;
  }

  const sortedDays = Object.entries(dayTaskCounts).sort(([, a], [, b]) => b - a);
  const dominantTexture = (Object.entries(textureCounts) as [CompletionTexture, number][])
    .sort(([, a], [, b]) => b - a)[0];

  return {
    totalTasks,
    completedTasks,
    completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    carriedTasks,
    textureCounts,
    dominantTexture: dominantTexture && dominantTexture[1] > 0 ? dominantTexture[0] : null,
    busiestDay: sortedDays.length > 0 ? sortedDays[0][0] : null,
    quietestDay: sortedDays.length > 1 ? sortedDays[sortedDays.length - 1][0] : null,
    daysActive: entries.length,
    avgTasksPerDay: entries.length > 0 ? Math.round((totalTasks / entries.length) * 10) / 10 : 0,
  };
}

function generatePortraitLines(data: WeeklyData): string[] {
  const lines: string[] = [];

  // Completion personality
  if (data.completionRate >= 80) {
    lines.push("やると決めたことを着実にやり遂げる週でした");
  } else if (data.completionRate >= 50) {
    lines.push("バランスの取れた一週間。無理せず進めていました");
  } else if (data.completionRate > 0) {
    lines.push("タスクよりも、日々の流れを優先した週でした");
  }

  // Texture personality
  if (data.dominantTexture) {
    const meta = TEXTURE_META[data.dominantTexture];
    if (data.dominantTexture === "satisfying") {
      lines.push(`完了後の気持ちは「${meta.label}」が多め。手応えを感じながら動いていたようです`);
    } else if (data.dominantTexture === "relieved") {
      lines.push(`「${meta.label}」が中心。義務を果たす安心感で動いていた印象`);
    } else {
      lines.push(`「${meta.label}」が多い週。淡々とこなすモードだったかもしれません`);
    }
  }

  // Carry pattern
  if (data.carriedTasks > 0) {
    const carryRate = Math.round((data.carriedTasks / data.totalTasks) * 100);
    if (carryRate > 30) {
      lines.push(`持ち越しが${carryRate}%。手放せないタスクの中に、本当の優先事項が隠れているかも`);
    }
  }

  // Rhythm
  if (data.busiestDay && data.quietestDay && data.busiestDay !== data.quietestDay) {
    lines.push(`${data.busiestDay}曜日に集中し、${data.quietestDay}曜日は穏やか。リズムが見えます`);
  }

  return lines;
}

export default function WeeklySelfPortrait() {
  const [store, setStore] = useState<DailyOrbitStore | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      const loaded = await loadOrbitStoreWithSync();
      if (loaded) setStore(loaded);
    })();
  }, []);

  const weekRange = useMemo(() => getWeekRange(), []);
  const data = useMemo(
    () => store ? computeWeeklyData(store, weekRange.start, weekRange.end) : null,
    [store, weekRange],
  );
  const portraitLines = useMemo(() => data ? generatePortraitLines(data) : [], [data]);

  if (!data || data.daysActive < 3) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 rounded-2xl bg-gradient-to-br from-violet-50/60 to-indigo-50/40 p-4"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between"
      >
        <div>
          <p className="text-[11px] font-medium text-violet-600">🪞 先週の自画像</p>
          <p className="mt-0.5 text-[10px] text-gray-400">{weekRange.label}</p>
        </div>
        <span className="text-xs text-gray-400">{expanded ? "▲" : "▼"}</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {/* Numbers */}
            <div className="mt-3 flex gap-3 text-center">
              <div className="flex-1 rounded-xl bg-white/50 py-2">
                <p className="text-lg font-medium text-violet-600">{data.completionRate}%</p>
                <p className="text-[9px] text-gray-400">完了率</p>
              </div>
              <div className="flex-1 rounded-xl bg-white/50 py-2">
                <p className="text-lg font-medium text-gray-600">{data.completedTasks}/{data.totalTasks}</p>
                <p className="text-[9px] text-gray-400">タスク</p>
              </div>
              <div className="flex-1 rounded-xl bg-white/50 py-2">
                <p className="text-lg font-medium text-gray-600">{data.daysActive}日</p>
                <p className="text-[9px] text-gray-400">記録日数</p>
              </div>
            </div>

            {/* Texture distribution */}
            {(data.textureCounts.satisfying + data.textureCounts.relieved + data.textureCounts.just_done) > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-[10px] text-gray-400">完了の感触</p>
                <div className="flex h-2 overflow-hidden rounded-full bg-white/30">
                  {(["satisfying", "relieved", "just_done"] as CompletionTexture[]).map((tex) => {
                    const total = data.textureCounts.satisfying + data.textureCounts.relieved + data.textureCounts.just_done;
                    const pct = total > 0 ? (data.textureCounts[tex] / total) * 100 : 0;
                    if (pct === 0) return null;
                    const colors: Record<CompletionTexture, string> = {
                      satisfying: "bg-emerald-400",
                      relieved: "bg-blue-400",
                      just_done: "bg-gray-300",
                    };
                    return (
                      <div key={tex} className={`${colors[tex]} h-full`} style={{ width: `${pct}%` }} />
                    );
                  })}
                </div>
                <div className="mt-1 flex justify-between text-[9px] text-gray-400">
                  <span>✨ {data.textureCounts.satisfying}</span>
                  <span>😮‍💨 {data.textureCounts.relieved}</span>
                  <span>🤷 {data.textureCounts.just_done}</span>
                </div>
              </div>
            )}

            {/* Portrait narrative */}
            {portraitLines.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {portraitLines.map((line, i) => (
                  <motion.p
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.15 }}
                    className="text-xs leading-relaxed text-gray-600"
                  >
                    {line}
                  </motion.p>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed preview */}
      {!expanded && portraitLines.length > 0 && (
        <p className="mt-2 text-xs text-gray-500 line-clamp-1">{portraitLines[0]}</p>
      )}
    </motion.div>
  );
}
