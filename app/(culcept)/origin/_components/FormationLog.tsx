"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import type { DailyOrbitStore, OrbitLaw, TurningPoint, OrbitThread } from "@/lib/origin/dailyOrbit/types";
import { loadOrbitStoreWithSync } from "@/lib/origin/dailyOrbit/store";
import { generateBehavioralLaws } from "@/lib/origin/dailyOrbit/behavioralLawEngine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormationEvent =
  | { type: "law_discovered"; law: OrbitLaw; date: string }
  | { type: "turning_point"; point: TurningPoint; date: string }
  | { type: "discovery_unlocked"; dayCount: number; date: string }
  | { type: "streak_milestone"; days: number; date: string }
  | { type: "thread_emerged"; thread: OrbitThread; date: string }
  | { type: "origin_start"; date: string };

const EVENT_META: Record<FormationEvent["type"], { emoji: string; color: string }> = {
  law_discovered: { emoji: "📖", color: "bg-amber-400" },
  turning_point: { emoji: "⚡", color: "bg-purple-400" },
  discovery_unlocked: { emoji: "🎉", color: "bg-emerald-400" },
  streak_milestone: { emoji: "🔥", color: "bg-orange-400" },
  thread_emerged: { emoji: "🧵", color: "bg-blue-400" },
  origin_start: { emoji: "🌱", color: "bg-green-400" },
};

const STREAK_MILESTONES = [7, 14, 21, 30, 60, 90];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FormationLog() {
  const [store, setStore] = useState<DailyOrbitStore | null>(null);

  useEffect(() => {
    (async () => {
      const loaded = await loadOrbitStoreWithSync();
      if (loaded) setStore(loaded);
    })();
  }, []);

  const events = useMemo(() => {
    if (!store) return [];

    const all: FormationEvent[] = [];

    // Origin start
    if (store.firstUsedAt) {
      all.push({ type: "origin_start", date: store.firstUsedAt.slice(0, 10) });
    }

    // Law discoveries
    for (const law of store.orbitLaws ?? []) {
      if (law.discoveredAt) {
        all.push({ type: "law_discovered", law, date: law.discoveredAt.slice(0, 10) });
      }
    }

    // Also check behavioral laws for new discoveries
    try {
      const bLaws = generateBehavioralLaws(store);
      for (const gl of bLaws) {
        if (gl.isNew && gl.law.discoveredAt) {
          // Avoid duplicates with orbit laws
          const exists = all.some(
            (e) => e.type === "law_discovered" && (e as { law: OrbitLaw }).law.id === gl.law.id,
          );
          if (!exists) {
            all.push({ type: "law_discovered", law: gl.law, date: gl.law.discoveredAt.slice(0, 10) });
          }
        }
      }
    } catch {}

    // Turning points
    for (const point of store.turningPoints ?? []) {
      all.push({ type: "turning_point", point, date: point.date });
    }

    // Discovery milestones
    for (const [dayStr, dateStr] of Object.entries(store.discoveryUnlocked ?? {})) {
      all.push({ type: "discovery_unlocked", dayCount: Number(dayStr), date: dateStr.slice(0, 10) });
    }

    // Threads
    for (const thread of store.threads ?? []) {
      if (thread.startDate) {
        all.push({ type: "thread_emerged", thread, date: thread.startDate.slice(0, 10) });
      }
    }

    // Streak milestones (derived from entries)
    const sortedDates = Object.keys(store.entries).sort();
    if (sortedDates.length > 0) {
      let streak = 1;
      for (let i = 1; i < sortedDates.length; i++) {
        const prev = new Date(sortedDates[i - 1]);
        const curr = new Date(sortedDates[i]);
        const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        if (diff <= 1.5) {
          streak++;
          if (STREAK_MILESTONES.includes(streak)) {
            all.push({ type: "streak_milestone", days: streak, date: sortedDates[i] });
          }
        } else {
          streak = 1;
        }
      }
    }

    // Sort by date descending (newest first)
    all.sort((a, b) => b.date.localeCompare(a.date));

    return all;
  }, [store]);

  if (!store) {
    return (
      <div className="px-4 py-8 text-center">
        <motion.p
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-xs text-gray-400"
        >
          ···
        </motion.p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8 text-center">
        <p className="text-2xl">🌱</p>
        <p className="mt-2 text-xs text-gray-400">
          まだ記録が始まったばかりです。日々の記録が形成ログに現れます。
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <h2 className="mb-4 text-sm font-semibold text-gray-700">🔗 形成ログ</h2>
      <p className="mb-4 text-xs text-gray-400">あなたの変化の軌跡</p>

      <div className="relative border-l-2 border-gray-100 pl-6">
        {events.map((event, i) => {
          const meta = EVENT_META[event.type];
          return (
            <motion.div
              key={`${event.type}-${event.date}-${i}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.25 }}
              className="relative mb-4 pb-2"
            >
              {/* Timeline dot */}
              <div
                className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full ${meta.color}`}
              />

              {/* Date */}
              <p className="text-[10px] text-gray-400">
                {formatDate(event.date)}
              </p>

              {/* Content */}
              <div className="mt-1">
                {event.type === "origin_start" && (
                  <p className="text-xs text-gray-600">
                    {meta.emoji} Originを開始しました
                  </p>
                )}
                {event.type === "law_discovered" && (
                  <div>
                    <p className="text-xs text-gray-600">
                      {meta.emoji} 新しい法則を発見
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">
                      「{event.law.text.slice(0, 60)}{event.law.text.length > 60 ? "…" : ""}」
                    </p>
                    <span className="text-[9px] text-gray-400">
                      確信度 {Math.round(event.law.confidence * 100)}%
                    </span>
                  </div>
                )}
                {event.type === "turning_point" && (
                  <div>
                    <p className="text-xs text-gray-600">
                      {meta.emoji} 転機
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {event.point.title}
                    </p>
                  </div>
                )}
                {event.type === "discovery_unlocked" && (
                  <p className="text-xs text-gray-600">
                    {meta.emoji} {event.dayCount}日目のマイルストーン達成
                  </p>
                )}
                {event.type === "streak_milestone" && (
                  <p className="text-xs text-gray-600">
                    {meta.emoji} {event.days}日連続記録達成
                  </p>
                )}
                {event.type === "thread_emerged" && (
                  <div>
                    <p className="text-xs text-gray-600">
                      {meta.emoji} テーマが浮上
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      「{event.thread.title}」
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
