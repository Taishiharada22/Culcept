"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DailyOrbitStore } from "@/lib/origin/dailyOrbit/types";
import type { JournalEntry } from "./JournalPastList";

type Props = {
  store: DailyOrbitStore;
  journalEntries: JournalEntry[];
  onClose: () => void;
  onDateJump?: (date: string, target: "todo" | "journal") => void;
};

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export default function CalendarView({ store, journalEntries, onClose, onDateJump }: Props) {
  const [offset, setOffset] = useState(0); // 0 = this month, -1 = last month, etc.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { year, month, days, todayStr } = useMemo(() => {
    const now = new Date();
    now.setMonth(now.getMonth() + offset);
    const y = now.getFullYear();
    const m = now.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    return { year: y, month: m + 1, days: cells, todayStr: todayKey };
  }, [offset]);

  // Build date → data maps
  const todoDateSet = useMemo(() => {
    const s = new Set<string>();
    for (const [date, entry] of Object.entries(store.entries)) {
      if (entry.tasks.length > 0) s.add(date);
    }
    return s;
  }, [store]);

  const journalDateSet = useMemo(() => {
    const s = new Set<string>();
    for (const entry of journalEntries) {
      s.add(entry.date);
    }
    return s;
  }, [journalEntries]);

  const journalMap = useMemo(() => {
    const m = new Map<string, JournalEntry>();
    for (const e of journalEntries) m.set(e.date, e);
    return m;
  }, [journalEntries]);

  function dateKey(day: number): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const selectedEntry = selectedDate ? store.entries[selectedDate] : null;
  const selectedJournal = selectedDate ? journalMap.get(selectedDate) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="mb-4 rounded-2xl bg-white/60 p-4 shadow-sm backdrop-blur-sm"
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => setOffset(offset - 1)} className="px-2 text-gray-400 hover:text-gray-600">&lt;</button>
        <span className="text-sm font-medium text-gray-700">{year}年{month}月</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setOffset(offset + 1)} className="px-2 text-gray-400 hover:text-gray-600">&gt;</button>
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
        </div>
      </div>

      {/* Day headers */}
      <div className="mb-1 grid grid-cols-7 text-center text-[10px] text-gray-400">
        {DAY_LABELS.map((d) => <span key={d}>{d}</span>)}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const dk = dateKey(day);
          const hasTodo = todoDateSet.has(dk);
          const hasJournal = journalDateSet.has(dk);
          const isToday = dk === todayStr;
          const isSelected = dk === selectedDate;

          return (
            <button
              key={dk}
              onClick={() => setSelectedDate(isSelected ? null : dk)}
              className={`relative flex h-9 flex-col items-center justify-center rounded-lg text-xs transition-all ${
                isSelected ? "bg-violet-100 text-violet-700" :
                isToday ? "bg-sky-50 font-medium text-sky-600" :
                "text-gray-600 hover:bg-white/60"
              }`}
            >
              {day}
              {(hasTodo || hasJournal) && (
                <div className="absolute bottom-1 flex gap-0.5">
                  {hasTodo && <span className="h-1 w-1 rounded-full bg-sky-400" />}
                  {hasJournal && <span className="h-1 w-1 rounded-full bg-violet-400" />}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" />Todo</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" />Journal</span>
      </div>

      {/* Selected date detail */}
      <AnimatePresence>
        {selectedDate && (selectedEntry || selectedJournal) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 overflow-hidden rounded-xl bg-white/40 p-3"
          >
            <p className="mb-1.5 text-[10px] font-medium text-gray-400">
              {new Date(selectedDate).toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })}
            </p>
            {selectedEntry && selectedEntry.tasks.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-sky-500">Todo</p>
                  {onDateJump && (
                    <button
                      onClick={() => onDateJump(selectedDate!, "todo")}
                      className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] text-sky-500 transition-colors hover:bg-sky-100"
                    >
                      この日のTodoを開く →
                    </button>
                  )}
                </div>
                {selectedEntry.tasks.slice(0, 5).map((t) => (
                  <p key={t.id} className="text-xs text-gray-500">
                    {t.completed ? "✓" : "☐"} {t.text}
                  </p>
                ))}
                {selectedEntry.tasks.length > 5 && (
                  <p className="text-[10px] text-gray-400">...他{selectedEntry.tasks.length - 5}件</p>
                )}
              </div>
            )}
            {selectedJournal && (
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-violet-500">Journal</p>
                  {onDateJump && (
                    <button
                      onClick={() => onDateJump(selectedDate!, "journal")}
                      className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-500 transition-colors hover:bg-violet-100"
                    >
                      ジャーナルを開く →
                    </button>
                  )}
                </div>
                {selectedJournal.title && (
                  <p className="text-xs font-medium text-gray-600">{selectedJournal.title}</p>
                )}
                <p className="text-xs text-gray-500">{selectedJournal.body?.slice(0, 80) || "（本文なし）"}</p>
                {selectedJournal.emotion_tags.length > 0 && (
                  <p className="mt-0.5 text-[10px] text-gray-400">{selectedJournal.emotion_tags.join(" ")}</p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
