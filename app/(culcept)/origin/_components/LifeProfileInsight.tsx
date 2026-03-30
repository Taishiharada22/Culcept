"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { DailyOrbitStore, OrbitLaw } from "@/lib/origin/dailyOrbit/types";
import { detectWeatherDrift } from "@/lib/origin/dailyOrbit/weatherLoop";

type TaskStats = {
  completionRate: number;
  carryRate: number;
  totalTasks: number;
  totalDays: number;
} | null;

type JournalStats = {
  totalEntries: number;
  avgPerWeek: number;
  topTags: string[];
} | null;

type ProfileInsight = {
  text: string;
  source: "law_summary" | "behavior_pattern" | "journal_pattern" | "growth";
  emoji: string;
};

type Props = {
  store: DailyOrbitStore | null;
  taskStats: TaskStats;
  journalStats: JournalStats;
};

export default function LifeProfileInsight({ store, taskStats, journalStats }: Props) {
  const insights = useMemo(
    () => generateInsights(store, taskStats, journalStats),
    [store, taskStats, journalStats],
  );

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">💡 Life Profile Insight</h2>
      <p className="mb-4 text-xs text-gray-400">
        データから見えてきた、あなたの統合的な姿
      </p>

      {insights.length === 0 ? (
        <div className="rounded-2xl bg-white/50 p-6 text-center">
          <p className="text-2xl">💡</p>
          <p className="mt-2 text-xs text-gray-400">
            Life Profileと日々のデータが増えると、ここに統合的な発見が現れます
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {insights.map((insight, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.25 }}
              className="rounded-2xl bg-white/50 p-4"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-sm">{insight.emoji}</span>
                <p className="text-xs leading-relaxed text-gray-600">{insight.text}</p>
              </div>
            </motion.div>
          ))}

          {/* Meta info */}
          <p className="mt-2 text-center text-[10px] text-gray-300">
            データの蓄積とともに、インサイトの精度が上がります
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insight generation — client-side, no AI
// ---------------------------------------------------------------------------

function generateInsights(
  store: DailyOrbitStore | null,
  taskStats: TaskStats,
  journalStats: JournalStats,
): ProfileInsight[] {
  const results: ProfileInsight[] = [];

  if (!store) return results;

  const laws = store.orbitLaws ?? [];
  const dayCount = store.firstUsedAt
    ? Math.floor((Date.now() - new Date(store.firstUsedAt).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0;

  // 1. Law summary — most confident law
  if (laws.length > 0) {
    const bestLaw = [...laws].sort((a, b) => b.confidence - a.confidence)[0];
    if (bestLaw.confidence >= 0.75) {
      results.push({
        text: `${laws.length}件の法則が見つかっています。中でも最も確信度が高いのは「${truncate(bestLaw.text, 40)}」（確信度${Math.round(bestLaw.confidence * 100)}%）です。`,
        source: "law_summary",
        emoji: "📖",
      });
    }
  }

  // 2. Completion pattern
  if (taskStats && taskStats.totalDays >= 7) {
    if (taskStats.completionRate >= 80) {
      results.push({
        text: `今月の完了率は${taskStats.completionRate}%。高い実行力が安定して現れています。`,
        source: "behavior_pattern",
        emoji: "📊",
      });
    } else if (taskStats.carryRate >= 30) {
      results.push({
        text: `持ち越し率が${taskStats.carryRate}%あります。本当にやりたいことと義務の間で揺れているのかもしれません。`,
        source: "behavior_pattern",
        emoji: "🔄",
      });
    }
  }

  // 3. Journal emotion pattern
  if (journalStats && journalStats.topTags.length >= 2) {
    const tags = journalStats.topTags.slice(0, 3).join("、");
    results.push({
      text: `ジャーナルでよく記録する感情は「${tags}」。あなたの感情の基調音が見えてきています。`,
      source: "journal_pattern",
      emoji: "📝",
    });
  }

  // 4. Growth observation
  if (dayCount >= 14) {
    const streakInfo = store.currentStreak >= 7
      ? `${store.currentStreak}日連続で記録を続けています。`
      : "";
    const lawGrowth = laws.length >= 3
      ? `${laws.length}件の法則が育っています。`
      : "";

    if (streakInfo || lawGrowth) {
      results.push({
        text: `${streakInfo}${lawGrowth}あなたの取扱説明書は${dayCount}日かけて形作られてきました。`,
        source: "growth",
        emoji: "🌳",
      });
    }
  } else if (dayCount >= 3) {
    results.push({
      text: `${dayCount}日目。あと${Math.max(0, 14 - dayCount)}日で最初の本格的なインサイトが生まれます。`,
      source: "growth",
      emoji: "🌱",
    });
  }

  // 5. Weather drift
  const weatherDrift = detectWeatherDrift(14);
  if (weatherDrift.type !== "none" && weatherDrift.narrative) {
    results.push({
      text: weatherDrift.narrative,
      source: "behavior_pattern",
      emoji: weatherDrift.type === "stagnation" ? "🌫" : "🌊",
    });
  }

  // 6. Texture pattern
  if (taskStats && taskStats.totalDays >= 10) {
    const entries = Object.values(store.entries);
    let satisfying = 0, relieved = 0, justDone = 0;
    for (const e of entries) {
      for (const t of e.tasks) {
        if (!t.completed) continue;
        if (t.texture === "satisfying") satisfying++;
        else if (t.texture === "relieved") relieved++;
        else justDone++;
      }
    }
    const total = satisfying + relieved + justDone;
    if (total >= 10) {
      const satPct = Math.round((satisfying / total) * 100);
      if (satPct >= 50) {
        results.push({
          text: `完了したタスクの${satPct}%に達成感を感じています。あなたは「やりがい」を大事にするタイプかもしれません。`,
          source: "behavior_pattern",
          emoji: "✨",
        });
      } else if (satPct <= 20) {
        results.push({
          text: `達成感のある完了は${satPct}%。義務的なタスクが多い時期なのかもしれません。`,
          source: "behavior_pattern",
          emoji: "🌤",
        });
      }
    }
  }

  return results.slice(0, 4); // Max 4 insights
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
