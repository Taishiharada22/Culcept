"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DailyOrbitStore, OrbitLaw, TemporalResponse } from "@/lib/origin/dailyOrbit/types";
import { TEMPORAL_RESPONSE_META } from "@/lib/origin/dailyOrbit/types";
import { loadOrbitStoreWithSync, todayKey } from "@/lib/origin/dailyOrbit/store";
import { discoverOrbitLaws } from "@/lib/origin/dailyOrbit/insightEngine";

type Props = {
  onDismiss: () => void;
};

export default function WeeklyReviewCard({ onDismiss }: Props) {
  const [store, setStore] = useState<DailyOrbitStore | null>(null);
  const [temporalResponse, setTemporalResponse] = useState<TemporalResponse | null>(null);
  const [timeTexture, setTimeTexture] = useState<number | null>(null);
  const today = todayKey();

  useEffect(() => {
    (async () => {
      const loaded = await loadOrbitStoreWithSync();
      if (loaded) setStore(loaded);
    })();
  }, []);

  const weekData = useMemo(() => {
    if (!store) return null;

    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const entries = Object.values(store.entries)
      .filter((e) => new Date(e.date) >= weekAgo && new Date(e.date) <= now)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (entries.length < 3) return null; // Need at least 3 days for meaningful review

    let totalTasks = 0, completedTasks = 0;
    const weatherEmojis: string[] = [];
    const emotionTagCounts: Record<string, number> = {};

    for (const e of entries) {
      totalTasks += e.tasks.length;
      completedTasks += e.tasks.filter((t) => t.completed).length;
    }

    // Fetch journal emotion tags
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Orbit Laws that emerged this week
    const laws = discoverOrbitLaws(store, today);
    const newLaws = laws.filter((l) => {
      const d = new Date(l.discoveredAt);
      return d >= weekAgo;
    });

    return {
      daysRecorded: entries.length,
      completionRate,
      totalTasks,
      completedTasks,
      newLaws,
      startDate: weekAgo.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }),
      endDate: now.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }),
    };
  }, [store, today]);

  if (!weekData) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="mb-4 rounded-2xl bg-gradient-to-br from-indigo-50/80 to-violet-50/60 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-indigo-600">
          🗓 今週のふりかえり（{weekData.startDate}〜{weekData.endDate}）
        </p>
        <button onClick={onDismiss} className="text-xs text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>

      {/* Stats */}
      <div className="mb-3 flex gap-4 text-xs text-gray-500">
        <span>タスク完了: {weekData.completedTasks}/{weekData.totalTasks} ({weekData.completionRate}%)</span>
        <span>{weekData.daysRecorded}日記録</span>
      </div>

      {/* New laws discovered */}
      {weekData.newLaws.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-[11px] font-medium text-indigo-500">── 今週の発見 ──</p>
          {weekData.newLaws.map((law) => (
            <p key={law.id} className="text-xs text-gray-600">
              &quot;{law.userLabel || law.text}&quot;
            </p>
          ))}
        </div>
      )}

      {/* Temporal Dialogue (weekly) */}
      <div className="mb-3">
        <p className="mb-1.5 text-[11px] font-medium text-indigo-500">── 先週の自分から ──</p>
        <p className="mb-2 text-xs text-gray-500">
          「来週の自分へ：{weekData.completionRate >= 70 ? "このペースで大丈夫" : "少し休んでもいい"}」
        </p>
        {!temporalResponse ? (
          <div className="flex gap-2">
            {(Object.entries(TEMPORAL_RESPONSE_META) as [TemporalResponse, { emoji: string; label: string }][]).map(
              ([key, meta]) => (
                <button
                  key={key}
                  onClick={() => setTemporalResponse(key)}
                  className="rounded-full bg-white/60 px-2.5 py-1 text-[11px] text-gray-500 transition-colors hover:bg-white/80"
                >
                  {meta.emoji} {meta.label}
                </button>
              ),
            )}
          </div>
        ) : (
          <p className="text-[11px] text-indigo-400">
            → {TEMPORAL_RESPONSE_META[temporalResponse]?.emoji} {TEMPORAL_RESPONSE_META[temporalResponse]?.label}
          </p>
        )}
      </div>

      {/* Time Texture (weekly) */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-indigo-500">── 時間の感覚 ──</p>
        <p className="mb-2 text-xs text-gray-500">今週はどのくらいの速さで過ぎた？</p>
        {timeTexture === null ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400">あっという間</span>
            <input
              type="range"
              min={0}
              max={100}
              defaultValue={50}
              onChange={(e) => setTimeTexture(Number(e.target.value))}
              className="flex-1 accent-indigo-400"
            />
            <span className="text-[10px] text-gray-400">永遠に感じた</span>
          </div>
        ) : (
          <p className="text-[11px] text-indigo-400">
            → {timeTexture < 30 ? "あっという間だった" : timeTexture < 70 ? "普通のペース" : "じっくり過ぎた"} ({timeTexture})
          </p>
        )}
      </div>
    </motion.div>
  );
}
