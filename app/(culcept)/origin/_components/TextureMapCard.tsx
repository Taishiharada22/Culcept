"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DailyOrbitStore, CompletionTexture } from "@/lib/origin/dailyOrbit/types";
import { TEXTURE_META } from "@/lib/origin/dailyOrbit/types";
import { loadOrbitStoreWithSync, todayKey } from "@/lib/origin/dailyOrbit/store";
import { generateTextureMap, type TextureMapData } from "@/lib/origin/dailyOrbit/textureMap";

const TEXTURE_COLORS: Record<CompletionTexture, string> = {
  satisfying: "bg-emerald-400",
  relieved: "bg-blue-400",
  just_done: "bg-gray-300",
};

const TEXTURE_DOT_COLORS: Record<CompletionTexture, string> = {
  satisfying: "bg-emerald-300",
  relieved: "bg-blue-300",
  just_done: "bg-gray-200",
};

export default function TextureMapCard() {
  const [store, setStore] = useState<DailyOrbitStore | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      const loaded = await loadOrbitStoreWithSync();
      if (loaded) setStore(loaded);
    })();
  }, []);

  const today = todayKey();
  const data = useMemo(
    () => store ? generateTextureMap(store, today) : null,
    [store, today],
  );

  if (!data || data.weeks.length === 0) return null;

  const latestWeek = data.weeks[data.weeks.length - 1];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 rounded-2xl bg-white/50 p-4"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between"
      >
        <p className="text-xs font-medium text-gray-500">🎨 完了の感触マップ</p>
        <span className="text-xs text-gray-400">{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Collapsed: latest week bar */}
      {!expanded && latestWeek && (
        <div className="mt-2">
          <div className="flex h-3 overflow-hidden rounded-full bg-white/30">
            {(["satisfying", "relieved", "just_done"] as CompletionTexture[]).map((tex) => {
              const count = latestWeek.days.reduce((s, d) => s + d[tex], 0);
              const pct = latestWeek.totalTasks > 0 ? (count / latestWeek.totalTasks) * 100 : 0;
              if (pct === 0) return null;
              return (
                <div key={tex} className={`${TEXTURE_COLORS[tex]} h-full`} style={{ width: `${pct}%` }} />
              );
            })}
          </div>
          <p className="mt-1 text-[10px] text-gray-400">今週 · {latestWeek.label}</p>
          {latestWeek.insight && (
            <p className="mt-1 text-[10px] text-gray-500">{latestWeek.insight}</p>
          )}
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {/* Week-by-week grid */}
            <div className="mt-3 space-y-3">
              {data.weeks.map((week) => (
                <div key={week.start}>
                  <p className="mb-1 text-[10px] text-gray-400">{week.label}</p>
                  <div className="grid grid-cols-7 gap-1">
                    {week.days.map((day) => {
                      if (day.total === 0) {
                        return (
                          <div key={day.date} className="flex flex-col items-center gap-0.5">
                            <div className="h-6 w-6 rounded-lg bg-gray-50/50" />
                            <span className="text-[8px] text-gray-300">{day.dowLabel}</span>
                          </div>
                        );
                      }
                      // Dominant texture for this day
                      const dominant = (["satisfying", "relieved", "just_done"] as CompletionTexture[])
                        .reduce((best, tex) => day[tex] > day[best] ? tex : best, "just_done" as CompletionTexture);
                      return (
                        <div key={day.date} className="flex flex-col items-center gap-0.5">
                          <div
                            className={`flex h-6 w-6 items-center justify-center rounded-lg ${TEXTURE_DOT_COLORS[dominant]}`}
                            title={`${TEXTURE_META[dominant].label} (${day.total})`}
                          >
                            <span className="text-[10px]">{TEXTURE_META[dominant].emoji}</span>
                          </div>
                          <span className="text-[8px] text-gray-400">{day.dowLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                  {week.insight && (
                    <p className="mt-1 text-[10px] text-gray-500">{week.insight}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Day-of-week trend */}
            {data.dowTrend.some((d) => d.total >= 2) && (
              <div className="mt-3 border-t border-gray-100/50 pt-3">
                <p className="mb-1.5 text-[10px] text-gray-400">曜日ごとの傾向</p>
                <div className="flex gap-1">
                  {data.dowTrend.map((d) => (
                    <div key={d.dow} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          d.dominant ? TEXTURE_COLORS[d.dominant] : "bg-gray-100"
                        }`}
                      />
                      <span className="text-[9px] text-gray-400">{d.dowLabel}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Global insight */}
            {data.globalInsight && (
              <p className="mt-2 text-[10px] leading-relaxed text-gray-500">{data.globalInsight}</p>
            )}

            {/* Legend */}
            <div className="mt-2 flex justify-center gap-3 text-[9px] text-gray-400">
              <span>✨ すっきり</span>
              <span>😮‍💨 ほっとした</span>
              <span>🤷 こなした</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
