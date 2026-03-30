"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DailyOrbitStore } from "@/lib/origin/dailyOrbit/types";
import { loadOrbitStoreWithSync, todayKey } from "@/lib/origin/dailyOrbit/store";
import LifeProfileSection from "./LifeProfileSection";
import LawLibrary from "./LawLibrary";
import StargazerBridgeCard from "./StargazerBridgeCard";
import FormationLog from "./FormationLog";
import MemoryCrystals from "./MemoryCrystals";
import LifeProfileInsight from "./LifeProfileInsight";

// Category metadata for Life Profile — 例文付き
const CATEGORY_META: Record<string, { emoji: string; label: string; hint: string }> = {
  skills: { emoji: "🛠", label: "スキル", hint: "例: デザイン、料理、英語" },
  family: { emoji: "🏠", label: "家族", hint: "例: 妻と2人の子供" },
  pets: { emoji: "🐾", label: "ペット", hint: "例: 猫（ミケ）3歳" },
  romantic: { emoji: "💫", label: "恋愛", hint: "例: パートナーと5年目" },
  friendships: { emoji: "🤝", label: "友人", hint: "例: 大学からの親友が2人" },
  passions: { emoji: "🔥", label: "情熱", hint: "例: 映画、登山、読書" },
  life_events: { emoji: "⚡", label: "人生", hint: "例: 転職、引越し、出産" },
  career: { emoji: "💼", label: "仕事", hint: "例: エンジニア 6年目" },
  living: { emoji: "🌏", label: "住まい", hint: "例: 東京 → 福岡に移住" },
  values: { emoji: "🌟", label: "価値観", hint: "例: 自由、誠実さ、成長" },
};

type Section =
  | "main"
  | "life-profile"
  | "formation-log"
  | "memory-crystals"
  | "life-insight";

const SECTION_TRANSITION = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.25 },
};

export default function ProfileSection({
  onStartMemoryExploration,
  onStartMemoryDive,
}: {
  onStartMemoryExploration?: () => void;
  onStartMemoryDive?: () => void;
}) {
  const [store, setStore] = useState<DailyOrbitStore | null>(null);
  const [section, setSection] = useState<Section>("main");
  const [journalStats, setJournalStats] = useState<{
    totalEntries: number;
    avgPerWeek: number;
    topTags: string[];
  } | null>(null);

  const today = todayKey();

  // Load orbit store for stats
  useEffect(() => {
    (async () => {
      const loaded = await loadOrbitStoreWithSync();
      if (loaded) {
        setStore(loaded);
      }
    })();
  }, [today]);

  // Load journal stats
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/origin/journal?days=90");
        const data = await res.json();
        if (data.ok && data.entries) {
          const entries = data.entries as { emotion_tags: string[]; date: string }[];
          const tagCounts: Record<string, number> = {};
          for (const e of entries) {
            for (const tag of e.emotion_tags ?? []) {
              tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
            }
          }
          const topTags = Object.entries(tagCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([tag]) => tag);
          const weeks = Math.max(1, Math.ceil(entries.length > 0
            ? (Date.now() - new Date(entries[entries.length - 1].date).getTime()) / (7 * 24 * 3600 * 1000)
            : 1));
          setJournalStats({
            totalEntries: entries.length,
            avgPerWeek: Math.round((entries.length / weeks) * 10) / 10,
            topTags,
          });
        }
      } catch { /* fallback to empty state */ }
    })();
  }, []);

  // Task stats
  const taskStats = useMemo(() => {
    if (!store) return null;
    const now = new Date();
    const entries = Object.values(store.entries).filter((e) => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    if (entries.length === 0) return null;
    let total = 0, completed = 0, carried = 0;
    for (const e of entries) {
      total += e.tasks.length;
      completed += e.tasks.filter((t) => t.completed).length;
      carried += e.tasks.filter((t) => (t.carryCount ?? 0) > 0).length;
    }
    return {
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      carryRate: total > 0 ? Math.round((carried / total) * 100) : 0,
      totalTasks: total,
      totalDays: entries.length,
    };
  }, [store]);

  // Back button for sub-sections
  const backButton = (
    <button
      onClick={() => setSection("main")}
      className="mb-2 ml-4 mt-4 text-xs text-gray-400 hover:text-gray-600"
    >
      ← プロフィール
    </button>
  );

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={section}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.25 }}
        className={section !== "main" ? "h-full overflow-y-auto" : undefined}
      >
      {section === "life-profile" && (
        <>
          {backButton}
          <LifeProfileSection />
        </>
      )}

      {section === "formation-log" && (
        <>
          {backButton}
          <FormationLog />
        </>
      )}

      {section === "memory-crystals" && (
        <>
          {backButton}
          <MemoryCrystals onStartNewDive={onStartMemoryDive} />
        </>
      )}

      {section === "life-insight" && (
        <>
          {backButton}
          <LifeProfileInsight store={store} taskStats={taskStats} journalStats={journalStats} />
        </>
      )}

      {section === "main" && (
        <div>
          <div className="mx-auto max-w-lg overflow-y-auto px-4 py-4">

            {/* ── Growth Summary Hero ── ファーストビューの主役 */}
            <div className="mb-4 rounded-2xl bg-gradient-to-br from-white/70 to-slate-50/60 p-4 shadow-sm">
              <h2 className="mb-1 text-sm font-semibold text-gray-700">あなたのプロフィール</h2>
              <p className="mb-3 text-[11px] text-gray-400">日々の記録から、あなたの傾向が浮かび上がります</p>

              {(taskStats || (journalStats && journalStats.totalEntries > 0)) ? (
                <div className="grid grid-cols-2 gap-2">
                  {taskStats && (
                    <>
                      <div className="rounded-xl bg-white/60 px-3 py-2.5 text-center">
                        <p className="text-lg font-bold text-gray-700">{taskStats.completionRate}%</p>
                        <p className="text-[10px] text-gray-400">今月の完了率</p>
                      </div>
                      <div className="rounded-xl bg-white/60 px-3 py-2.5 text-center">
                        <p className="text-lg font-bold text-gray-700">{taskStats.totalDays}<span className="text-xs font-normal text-gray-400">日</span></p>
                        <p className="text-[10px] text-gray-400">記録した日数</p>
                      </div>
                    </>
                  )}
                  {journalStats && journalStats.totalEntries > 0 && (
                    <>
                      <div className="rounded-xl bg-white/60 px-3 py-2.5 text-center">
                        <p className="text-lg font-bold text-gray-700">{journalStats.totalEntries}<span className="text-xs font-normal text-gray-400">件</span></p>
                        <p className="text-[10px] text-gray-400">ジャーナル記録</p>
                      </div>
                      {journalStats.topTags.length > 0 && (
                        <div className="rounded-xl bg-white/60 px-3 py-2.5 text-center">
                          <p className="text-sm font-medium text-gray-600 truncate">{journalStats.topTags[0]}</p>
                          <p className="text-[10px] text-gray-400">よく感じること</p>
                        </div>
                      )}
                    </>
                  )}
                  {taskStats && taskStats.carryRate > 0 && (
                    <div className="col-span-2 rounded-xl bg-amber-50/40 px-3 py-2 text-center">
                      <p className="text-xs text-amber-600/80">持ち越し率 {taskStats.carryRate}% — 先送りの傾向もデータになります</p>
                    </div>
                  )}
                </div>
              ) : (
                /* Empty state */
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "—%", label: "完了率" },
                      { value: "0日", label: "記録日数" },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl bg-white/40 px-3 py-2.5 text-center">
                        <p className="text-lg font-bold text-gray-300">{item.value}</p>
                        <p className="text-[10px] text-gray-300">{item.label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-center text-[10px] text-gray-400">
                    To DoやJournalを使い始めると、ここに数字が現れます
                  </p>
                </div>
              )}
            </div>

            {/* ── Behavioral Insights ── 法則・接点 */}
            <div className="mb-4 rounded-2xl bg-white/50 p-4">
              <p className="mb-3 text-xs font-medium text-gray-500">日々から見えてきたこと</p>
              <LawLibrary />
              <StargazerBridgeCard />
              {!taskStats && !journalStats && (
                <div className="space-y-1.5">
                  {[
                    { emoji: "🌱", text: "あなたは内心天気が「晴れ」の日、完了率が30%高い" },
                    { emoji: "🔁", text: "月曜に先送りしたタスクの72%は水曜までに完了する" },
                  ].map((example, i) => (
                    <div key={i} className="relative overflow-hidden rounded-xl">
                      <div className="pointer-events-none select-none blur-[1px]">
                        <div className="rounded-xl bg-gradient-to-r from-emerald-50/60 to-green-50/40 px-3 py-2 opacity-40">
                          <div className="flex items-start gap-2">
                            <span className="text-xs">{example.emoji}</span>
                            <p className="text-[11px] leading-relaxed text-gray-700">{example.text}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <p className="text-center text-[10px] text-gray-400 pt-1">14日分のデータで法則が見つかります</p>
                </div>
              )}
            </div>

            {/* ── わたしについて ── コンパクト1行チップ */}
            <div className="mb-4 rounded-2xl bg-white/50 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500">わたしについて</p>
                <button
                  onClick={() => setSection("life-profile")}
                  className="text-[10px] text-gray-400 hover:text-gray-600"
                >
                  編集 →
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(CATEGORY_META).map(([key, meta]) => (
                  <button
                    key={key}
                    onClick={() => setSection("life-profile")}
                    className="rounded-full bg-white/60 px-2.5 py-1 text-[11px] text-gray-500 transition-colors hover:bg-white/80"
                  >
                    {meta.emoji} {meta.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Deep archives ── */}
            <div className="rounded-2xl bg-white/50 p-4">
              <p className="mb-2 text-xs font-medium text-gray-500">深層の記録</p>
              <div className="space-y-1.5">
                {[
                  { icon: "📖", label: "過去の記憶を探索する", action: () => onStartMemoryExploration?.() },
                  { icon: "🔗", label: "形成ログ", action: () => setSection("formation-log") },
                  { icon: "💎", label: "記憶の結晶", action: () => setSection("memory-crystals") },
                  { icon: "💡", label: "Life Profile Insight", action: () => setSection("life-insight") },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="flex w-full items-center gap-2 rounded-xl bg-white/50 px-3 py-2 text-left text-xs text-gray-500 transition-colors hover:bg-white/70"
                  >
                    <span>{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    <span className="text-gray-300">→</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      </motion.div>
    </AnimatePresence>
  );
}
