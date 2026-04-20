"use client";

/**
 * OutfitCalendarEntry — プラン＆コーデの日付入口
 *
 * Alter 画面のヘッダーに配置する小さなカレンダーアイコン。
 * タップで中央配置の日付選択パネルが開き、
 * 日付選択で Plan + Outfit の Viewer Panel を表示する。
 *
 * 設計原則:
 *   - プランが主体、コーデは従属
 *   - 会話ログには混ぜない（retrieval ≠ conversation）
 *   - Sheet と Viewer は別責務（Sheet = 日付選択、Viewer = 内容表示）
 */

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── 日付ユーティリティ ──

function getJSTToday(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function getWeekDates(): string[] {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(jst);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function getDow(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return DOW_LABELS[date.getDay()];
}

// ── 状態チェック（localStorage のプラン/コーデ有無）──

const COMMITTED_PREFIX = "culcept_outfit_committed_";
const DRAFT_PREFIX = "culcept_outfit_draft_";
const PLAN_SESSION_KEY = "aneurasync_morning_session_v1";

function hasCommittedOutfit(date: string): boolean {
  try { return !!localStorage.getItem(`${COMMITTED_PREFIX}${date}`); } catch { return false; }
}

function hasDraftOutfit(date: string): boolean {
  try { return !!localStorage.getItem(`${DRAFT_PREFIX}${date}`); } catch { return false; }
}

function hasPlanForDate(date: string): boolean {
  try {
    const raw = localStorage.getItem(PLAN_SESSION_KEY);
    if (!raw) return false;
    const session = JSON.parse(raw);
    return session?.plan?.date === date && session?.plan?.confirmed === true;
  } catch { return false; }
}

// ── コンポーネント ──

interface OutfitCalendarEntryProps {
  onDateSelect: (date: string) => void;
}

export default function OutfitCalendarEntry({ onDateSelect }: OutfitCalendarEntryProps) {
  const [isOpen, setIsOpen] = useState(false);

  const today = useMemo(() => getJSTToday(), []);
  const weekDates = useMemo(() => getWeekDates(), []);

  const handleDateTap = useCallback((date: string) => {
    setIsOpen(false);
    onDateSelect(date);
  }, [onDateSelect]);

  return (
    <>
      {/* 入口アイコン — 最小限 */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg transition-all hover:bg-purple-50/50 active:scale-95"
        aria-label="プラン＆コーデ"
      >
        <span className="text-[11px]">📅</span>
        <span className="text-[9px] font-mono" style={{ color: "#6366F1", opacity: 0.6 }}>
          {parseInt(today.slice(8))}
        </span>
      </button>

      {/* 日付選択パネル（中央 popup） */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 z-50"
              onClick={() => setIsOpen(false)}
            />

            {/* Center Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
              className="fixed left-4 right-4 top-[120px] z-50 rounded-2xl bg-white/95 backdrop-blur-xl border border-white/60 shadow-[0_12px_48px_-12px_rgba(0,0,0,0.2)]"
            >
              {/* Title */}
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <h3 className="text-[13px] font-bold text-gray-800">
                  📋 予定とコーデ
                </h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-[12px] hover:bg-gray-200 transition-colors"
                >
                  ×
                </button>
              </div>

              {/* Week Grid */}
              <div className="px-4 pb-4">
                <div className="grid grid-cols-7 gap-1">
                  {weekDates.map((date) => {
                    const isToday = date === today;
                    const dow = getDow(date);
                    const dayNum = parseInt(date.slice(8));
                    const hasPlan = hasPlanForDate(date);
                    const hasCommitted = hasCommittedOutfit(date);
                    const hasDraft = !hasCommitted && hasDraftOutfit(date);
                    const isSunday = dow === "日";
                    const isSaturday = dow === "土";

                    return (
                      <button
                        key={date}
                        onClick={() => handleDateTap(date)}
                        className={`flex flex-col items-center py-2.5 rounded-xl transition-all active:scale-95 ${
                          isToday
                            ? "bg-purple-50/80 border border-purple-200/50 shadow-sm"
                            : "hover:bg-gray-50/80"
                        }`}
                      >
                        {/* 曜日 */}
                        <span className={`text-[9px] font-medium ${
                          isSunday ? "text-red-400" :
                          isSaturday ? "text-blue-400" :
                          "text-gray-400"
                        }`}>
                          {dow}
                        </span>
                        {/* 日付 */}
                        <span className={`text-[15px] font-bold mt-0.5 ${
                          isToday ? "text-purple-600" : "text-gray-700"
                        }`}>
                          {dayNum}
                        </span>
                        {/* 状態ドット（プラン + コーデ） */}
                        <div className="flex items-center gap-[3px] mt-1 h-[6px]">
                          {hasPlan && (
                            <div className="w-[5px] h-[5px] rounded-full bg-blue-400" title="プランあり" />
                          )}
                          {hasCommitted && (
                            <div className="w-[5px] h-[5px] rounded-full bg-emerald-400" title="コーデ確定" />
                          )}
                          {hasDraft && (
                            <div className="w-[5px] h-[5px] rounded-full bg-purple-300" title="コーデ編集中" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* 凡例 */}
                <div className="flex items-center gap-3 mt-3 justify-center">
                  <div className="flex items-center gap-1">
                    <div className="w-[5px] h-[5px] rounded-full bg-blue-400" />
                    <span className="text-[9px] text-gray-400">プラン</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-[5px] h-[5px] rounded-full bg-emerald-400" />
                    <span className="text-[9px] text-gray-400">コーデ確定</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-[5px] h-[5px] rounded-full bg-purple-300" />
                    <span className="text-[9px] text-gray-400">編集中</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
