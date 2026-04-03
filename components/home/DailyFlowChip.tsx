"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";

/* ─── Types ─── */
type InstrumentUsage = {
  stargazer: boolean;
  origin: boolean;
  phenotype: boolean;
  calendar: boolean;
  style: boolean;
};

type Props = {
  instrumentUsedToday: InstrumentUsage;
  innerWeatherRecorded: boolean;
  observationCount: number;
};

type FlowCandidate = {
  id: string;
  label: string;
  href: string;
  icon: string;
  priority: number;
};

type TimeSlot = "morning" | "afternoon" | "evening" | "late_night";

/* ─── Helpers ─── */
function getTimeSlot(hour: number): TimeSlot {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 23) return "evening";
  return "late_night";
}

/* ─── Flow definitions ─── */
type FlowDef = {
  id: string;
  /** 時間帯別の行動コピー（機能名ではなく行動で書く） */
  labels: Record<TimeSlot, string>;
  href: string;
  icon: string;
  isDone: (iut: InstrumentUsage, iwRecorded: boolean) => boolean;
  /** 基礎重み */
  baseWeight: number;
  /** 軽さボーナス（所要時間が短いほど高い） */
  lightness: number;
  /** 回答精度への寄与度 */
  accuracyContrib: number;
  /** 時間帯別ボーナス */
  timeBonuses: Record<TimeSlot, number>;
};

const FLOW_DEFS: FlowDef[] = [
  {
    id: "weather",
    labels: {
      morning: "今朝の調子を記録する",
      afternoon: "今の気分を記録する",
      evening: "今日の気分を振り返る",
      late_night: "今の気分を記録する",
    },
    href: "/stargazer/weather",
    icon: "🌤",
    isDone: (_iut, iwRecorded) => iwRecorded,
    baseWeight: 10,
    lightness: 5, // 10秒で完了
    accuracyContrib: 3,
    timeBonuses: { morning: 4, afternoon: 2, evening: 3, late_night: 1 },
  },
  {
    id: "stargazer",
    labels: {
      morning: "1分であなたを知る",
      afternoon: "1分であなたを知る",
      evening: "1分であなたを深く知る",
      late_night: "1分であなたを知る",
    },
    href: "/stargazer",
    icon: "🔭",
    isDone: (iut) => iut.stargazer,
    baseWeight: 8,
    lightness: 3,
    accuracyContrib: 5, // Sync精度への寄与が最大
    timeBonuses: { morning: 2, afternoon: 3, evening: 4, late_night: 2 },
  },
  {
    id: "origin",
    labels: {
      morning: "今日の1日をスタートする",
      afternoon: "今日の記録をつける",
      evening: "今日を振り返る",
      late_night: "ひとこと記録を残す",
    },
    href: "/origin",
    icon: "📓",
    isDone: (iut) => iut.origin,
    baseWeight: 7,
    lightness: 4,
    accuracyContrib: 4,
    timeBonuses: { morning: 5, afternoon: 2, evening: 3, late_night: 1 },
  },
  {
    id: "calendar",
    labels: {
      morning: "今日の服を決める",
      afternoon: "今日のコーデを確認する",
      evening: "明日のコーデを考える",
      late_night: "明日の準備をする",
    },
    href: "/calendar",
    icon: "👔",
    isDone: (iut) => iut.calendar,
    baseWeight: 6,
    lightness: 4,
    accuracyContrib: 2,
    timeBonuses: { morning: 5, afternoon: 3, evening: 1, late_night: 0 },
  },
];

/* ─── Component ─── */
export default function DailyFlowChip({
  instrumentUsedToday,
  innerWeatherRecorded,
  observationCount,
}: Props) {
  const [currentIdx, setCurrentIdx] = useState(0);

  // ── 優先度つき候補リスト（未完了のみ、上位3件） ──
  const candidates = useMemo(() => {
    const hour = new Date().getHours();
    const timeSlot = getTimeSlot(hour);
    // 放置時間の代替: 午後以降はまだやってない工程の緊急度が上がる
    const idleBonus = hour >= 17 ? 3 : hour >= 12 ? 1.5 : 0;

    const scored: FlowCandidate[] = [];
    for (const flow of FLOW_DEFS) {
      // 完了済み → 即除外
      if (flow.isDone(instrumentUsedToday, innerWeatherRecorded)) continue;

      let priority = flow.baseWeight + flow.lightness + flow.accuracyContrib;
      priority += flow.timeBonuses[timeSlot] ?? 0;
      priority += idleBonus;

      // 観測が少ないうちはStargazerを強く推す（精度向上の最短路）
      if (flow.id === "stargazer" && observationCount < 30) priority += 3;

      scored.push({
        id: flow.id,
        label: flow.labels[timeSlot],
        href: flow.href,
        icon: flow.icon,
        priority,
      });
    }

    scored.sort((a, b) => b.priority - a.priority);
    return scored.slice(0, 3);
  }, [instrumentUsedToday, innerWeatherRecorded, observationCount]);

  // 候補数が変わったらインデックスをリセット
  useEffect(() => {
    setCurrentIdx(0);
  }, [candidates.length]);

  // 2件以上 → 7秒ごとに自動切り替え
  useEffect(() => {
    if (candidates.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % candidates.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [candidates.length]);

  // 全完了 or 候補なし → 非表示
  if (candidates.length === 0) return null;

  const current = candidates[currentIdx % candidates.length];
  if (!current) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={current.id}
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -3 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <Link
          href={current.href}
          className="flex items-center gap-1 px-2 py-1 rounded-full transition-all active:scale-95"
          style={{
            background: "rgba(99,102,241,0.06)",
            border: "1px solid rgba(99,102,241,0.12)",
          }}
        >
          <span className="text-[10px] leading-none">{current.icon}</span>
          <span
            className="text-[9px] font-medium whitespace-nowrap"
            style={{ color: "#4338CA" }}
          >
            {current.label}
          </span>
        </Link>
      </motion.div>
    </AnimatePresence>
  );
}
