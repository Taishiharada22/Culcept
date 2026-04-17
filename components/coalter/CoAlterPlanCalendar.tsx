"use client";

/**
 * CoAlter Plan Calendar — プラン履歴
 *
 * Phase 1.5.1 — 全期間のプランをカレンダーで閲覧できるモーダル。
 *
 * 仕様（CEO確定、変更不可）:
 * - 月ビュー（前月/次月切替）
 * - 日付セル: プラン数に応じて●印（1件=●、2件以上=● + 数字）
 * - 今日はハイライト
 * - 日付タップ: その日のプラン一覧を下部に展開
 * - プランタップ: 詳細展開（同じモーダル内）
 * - 開いた時に fetchPlanItems を呼ぶ（親側の責任）
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PlanItem } from "@/lib/coalter/planShelf";
import { toDateStr } from "@/lib/coalter/planShelfFilters";

const C = {
  coalter: "#6366F1",
  pulse: "#EC4899",
  bg: "#f8f6f3",
  s1: "#ffffff",
  s2: "#f5f6fa",
  t1: "#1a1a2e",
  t2: "#4a4a68",
  t3: "#8888a0",
  t4: "#c8c8dc",
};

interface Props {
  items: PlanItem[];
  isOpen: boolean;
  onClose: () => void;
  /** アイテムタップで親のボトムシートを開かせる */
  onOpenItem: (item: PlanItem) => void;
  /** モーダル開時に呼ばれる任意フック（rehydrate用） */
  onOpen?: () => void;
}

/**
 * 月のカレンダーグリッド（日曜開始、6行固定）を生成。
 */
function buildMonthGrid(year: number, month: number): { date: Date; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const firstWeekday = first.getDay(); // 0=日
  const gridStart = new Date(first);
  gridStart.setDate(gridStart.getDate() - firstWeekday);

  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    cells.push({ date: d, inMonth: d.getMonth() === month });
  }
  return cells;
}

export function CoAlterPlanCalendar({ items, isOpen, onClose, onOpenItem, onOpen }: Props) {
  const today = new Date();
  const [cursorYear, setCursorYear] = useState(today.getFullYear());
  const [cursorMonth, setCursorMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 開いた瞬間に rehydrate 通知 + 今月にリセット
  useEffect(() => {
    if (isOpen) {
      setCursorYear(today.getFullYear());
      setCursorMonth(today.getMonth());
      setSelectedDate(null);
      onOpen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // date → count マップ
  const countByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      map[item.targetDate] = (map[item.targetDate] ?? 0) + 1;
    }
    return map;
  }, [items]);

  const grid = useMemo(
    () => buildMonthGrid(cursorYear, cursorMonth),
    [cursorYear, cursorMonth],
  );

  const todayStr = toDateStr(today);

  const goPrev = () => {
    if (cursorMonth === 0) {
      setCursorYear((y) => y - 1);
      setCursorMonth(11);
    } else {
      setCursorMonth((m) => m - 1);
    }
  };
  const goNext = () => {
    if (cursorMonth === 11) {
      setCursorYear((y) => y + 1);
      setCursorMonth(0);
    } else {
      setCursorMonth((m) => m + 1);
    }
  };

  const selectedItems = selectedDate
    ? items
        .filter((i) => i.targetDate === selectedDate)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-40 flex items-start justify-center px-4 py-8 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* 背景 */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
          />
          {/* モーダル本体 */}
          <motion.div
            className="relative w-full max-w-md rounded-2xl overflow-hidden"
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            style={{ background: C.s1, boxShadow: `0 10px 40px rgba(0,0,0,0.15)` }}
          >
            {/* ヘッダー */}
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{
                background: `linear-gradient(135deg, ${C.coalter}08, ${C.pulse}04)`,
                borderBottom: `1px solid ${C.coalter}14`,
              }}
            >
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 15 }}>🗓</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.coalter }}>
                  プラン履歴
                </span>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: C.s2, color: C.t3, fontSize: 13 }}
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>

            {/* 月ナビゲーション */}
            <div className="px-4 py-3 flex items-center justify-between">
              <button
                onClick={goPrev}
                className="px-2 py-1 rounded"
                style={{ color: C.t2, fontSize: 13 }}
                aria-label="前の月"
              >
                ←
              </button>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>
                {cursorYear}年 {cursorMonth + 1}月
              </p>
              <button
                onClick={goNext}
                className="px-2 py-1 rounded"
                style={{ color: C.t2, fontSize: 13 }}
                aria-label="次の月"
              >
                →
              </button>
            </div>

            {/* 曜日ヘッダー */}
            <div className="px-3 grid grid-cols-7 gap-1 mb-1">
              {["日", "月", "火", "水", "木", "金", "土"].map((w, i) => (
                <div
                  key={w}
                  className="text-center"
                  style={{
                    fontSize: 10,
                    color: i === 0 ? C.pulse : i === 6 ? C.coalter : C.t3,
                  }}
                >
                  {w}
                </div>
              ))}
            </div>

            {/* カレンダーグリッド */}
            <div className="px-3 grid grid-cols-7 gap-1">
              {grid.map(({ date, inMonth }) => {
                const ds = toDateStr(date);
                const count = countByDate[ds] ?? 0;
                const isToday = ds === todayStr;
                const isSelected = ds === selectedDate;
                return (
                  <button
                    key={ds}
                    onClick={() => setSelectedDate(ds)}
                    disabled={!inMonth}
                    className="aspect-square rounded-md flex flex-col items-center justify-center"
                    style={{
                      background: isSelected
                        ? `${C.coalter}18`
                        : isToday
                        ? `${C.coalter}08`
                        : "transparent",
                      border: isSelected
                        ? `1px solid ${C.coalter}40`
                        : isToday
                        ? `1px solid ${C.coalter}20`
                        : "1px solid transparent",
                      opacity: inMonth ? 1 : 0.25,
                      cursor: inMonth ? "pointer" : "default",
                    }}
                    aria-label={`${date.getMonth() + 1}/${date.getDate()}${count > 0 ? ` プラン${count}件` : ""}`}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: isToday ? C.coalter : C.t1,
                        fontWeight: isToday ? 600 : 400,
                        lineHeight: 1,
                      }}
                    >
                      {date.getDate()}
                    </span>
                    {count > 0 && (
                      <span
                        className="flex items-center gap-0.5"
                        style={{ marginTop: 2, lineHeight: 1 }}
                      >
                        <span
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: "50%",
                            background: C.coalter,
                          }}
                        />
                        {count > 1 && (
                          <span style={{ fontSize: 8, color: C.coalter, fontWeight: 600 }}>
                            {count}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* 選択日のプラン一覧 */}
            <div
              className="mt-3 px-4 py-3"
              style={{ borderTop: `1px solid ${C.s2}`, minHeight: 80 }}
            >
              {selectedDate ? (
                selectedItems.length > 0 ? (
                  <div className="space-y-2">
                    <p style={{ fontSize: 10, color: C.t3, fontWeight: 500 }}>
                      {selectedDate.replace(/-/g, "/")} のプラン
                    </p>
                    {selectedItems.map((item) => (
                      <CalendarItemRow
                        key={item.id}
                        item={item}
                        onOpen={() => onOpenItem(item)}
                      />
                    ))}
                  </div>
                ) : (
                  <p
                    className="text-center py-4"
                    style={{ fontSize: 11, color: C.t3 }}
                  >
                    この日のプランはありません
                  </p>
                )
              ) : (
                <p
                  className="text-center py-4"
                  style={{ fontSize: 11, color: C.t3 }}
                >
                  日付を選んでプランを表示
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CalendarItemRow({
  item,
  onOpen,
}: {
  item: PlanItem;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-lg px-3 py-2 flex items-center justify-between gap-2"
      style={{
        background: `${C.coalter}06`,
        border: `1px solid ${C.coalter}14`,
      }}
      aria-label={`${item.title} の詳細を開く`}
    >
      <div className="flex-1 min-w-0">
        <p
          className="truncate"
          style={{ fontSize: 12, color: C.t1, fontWeight: 500 }}
        >
          {item.title}
        </p>
        {item.timeSlot && (
          <p style={{ fontSize: 9, color: C.t3, marginTop: 2 }}>{item.timeSlot}</p>
        )}
      </div>
      <span style={{ fontSize: 10, color: C.t4 }} aria-hidden>
        ›
      </span>
    </button>
  );
}
