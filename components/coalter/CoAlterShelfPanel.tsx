"use client";

/**
 * CoAlter Shelf Panel — 「これからの予定」
 *
 * Phase 1.5.2 — 採用済みプランを Talk 上部に表示する。
 *
 * 仕様（CEO確定、変更不可）:
 * - 表示条件: targetDate >= today のアイテムが 1件以上（内部で filterUpcoming）
 *   過去アイテムは絶対に描画しない。過去は📅履歴のみ。
 * - Single source of truth: items 生配列を受け取り、内部で buildDateRefs + filterUpcoming
 *   → summary / list / groups 全部が同じ refs を使う（Count と描画の乖離を防ぐ）
 * - 閉じた状態:
 *     ✦ これからの予定        今日 X件 / 週内 Y件
 *     · 最新タイトル断片1（28文字クランプ）· 👤
 *     · 最新タイトル断片2
 *     · +N件
 * - 採用者マーカー: 自分採用 = coalter色、相手採用 = pulse色（参加感の可視化）
 * - タイトルまたは場所をタップ → 親の onOpenItem が発火（ボトムシート）
 * - CoAlter セッションの active/completed に依存しない
 */

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PlanItem } from "@/lib/coalter/planShelf";
import {
  buildDateRefs,
  countShelfSummary,
  filterUpcoming,
  groupByDateBuckets,
} from "@/lib/coalter/planShelfFilters";
import { groupByDayTimeline } from "@/lib/coalter/planTimeline";
import { CoAlterPlanTimelineDay } from "@/components/coalter/CoAlterPlanTimelineDay";

const C = {
  coalter: "#6366F1",
  pulse: "#EC4899",
  s1: "#ffffff",
  s2: "#f5f6fa",
  t1: "#1a1a2e",
  t2: "#4a4a68",
  t3: "#8888a0",
  t4: "#c8c8dc",
};

interface Props {
  /** planItems 生配列。フィルタはパネル内部が唯一の責任 */
  items: PlanItem[];
  /** 採用者マーカー用 */
  currentUserId: string | null;
  onOpenItem: (item: PlanItem) => void;
  onOpenCalendar: () => void;
}

function clampTitle(title: string, max = 28): string {
  if (title.length <= max) return title;
  return `${title.slice(0, max)}…`;
}

function formatDateLabel(date: string, todayStr: string, tomorrowStr: string): string {
  if (date === todayStr) return "今日";
  if (date === tomorrowStr) return "明日";
  const [, m, d] = date.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

export function CoAlterShelfPanel({
  items: rawItems,
  currentUserId,
  onOpenItem,
  onOpenCalendar,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  // Single source of truth ─ 全派生値を同じ refs から導出
  const { items, refs, summary, latestTwo, remainingCount, groups } = useMemo(() => {
    const refs = buildDateRefs();
    const items = filterUpcoming(rawItems, refs);
    const summary = countShelfSummary(items, refs);
    const sorted = [...items].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    const latestTwo = sorted.slice(0, 2);
    const remainingCount = Math.max(0, items.length - latestTwo.length);
    const groups = groupByDateBuckets(items, refs);
    return { items, refs, summary, latestTwo, remainingCount, groups };
  }, [rawItems]);

  if (items.length === 0) return null;

  const { todayStr, tomorrowStr } = refs;
  const { todayCount, weekCount } = summary;

  const groupSections: { label: string; list: PlanItem[] }[] = [
    { label: "今日", list: groups.today },
    { label: "明日", list: groups.tomorrow },
    { label: "今週", list: groups.thisWeek },
    { label: "来週", list: groups.nextWeek },
  ];

  return (
    <div
      className="max-w-lg mx-auto px-4"
      style={{
        borderBottom: `1px solid ${C.s2}`,
        background: `linear-gradient(180deg, ${C.coalter}04, transparent)`,
      }}
    >
      {/* ── 閉じた状態 ── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left py-2.5"
        aria-label="これからの予定を開く"
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* 2人で決めてる可視化: 二重ドット */}
            <div className="flex items-center gap-0.5" aria-hidden>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: C.coalter,
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: C.pulse,
                  display: "inline-block",
                  marginLeft: -2,
                }}
              />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>
              これからの予定
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 10, color: C.t3 }}>
              今日 {todayCount}件 / 週内 {weekCount}件
            </span>
            <span style={{ fontSize: 10, color: C.t4 }} aria-hidden>
              {expanded ? "▲" : "▼"}
            </span>
          </div>
        </div>
        {/* 最新タイトル断片 */}
        <div className="mt-1.5 space-y-0.5">
          {latestTwo.map((item) => {
            const isMine = currentUserId && item.createdBy === currentUserId;
            const markerColor = isMine ? C.coalter : C.pulse;
            return (
              <div
                key={item.id}
                className="flex items-center gap-1.5 truncate"
                style={{ fontSize: 11, color: C.t2 }}
              >
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: markerColor,
                    flexShrink: 0,
                  }}
                  aria-hidden
                />
                <span className="truncate">{clampTitle(item.title)}</span>
              </div>
            );
          })}
          {remainingCount > 0 && (
            <div style={{ fontSize: 10, color: C.t3, marginLeft: 10 }}>
              +{remainingCount}件
            </div>
          )}
        </div>
      </button>

      {/* ── 展開状態 ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pb-3 space-y-3">
              {groupSections.map(({ label, list }) => {
                if (list.length === 0) return null;
                // 日別サブグルーピング + 時刻順ソート
                const days = groupByDayTimeline(list);
                return (
                  <div key={label}>
                    <p
                      style={{
                        fontSize: 10,
                        color: C.coalter,
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                        marginBottom: 6,
                      }}
                    >
                      {label}
                    </p>
                    <div className="space-y-2">
                      {days.map((day) => (
                        <div key={day.date}>
                          {/* 複数日に跨るバケット（今週/来週）では日ラベルを付ける */}
                          {days.length > 1 && (
                            <p
                              style={{
                                fontSize: 9,
                                color: C.t3,
                                marginBottom: 3,
                              }}
                            >
                              {formatDateLabel(day.date, todayStr, tomorrowStr)}
                            </p>
                          )}
                          {day.items.length >= 2 ? (
                            // 2件以上 → 時系列タイムライン
                            <CoAlterPlanTimelineDay
                              items={day.items}
                              currentUserId={currentUserId}
                              onOpenItem={onOpenItem}
                            />
                          ) : (
                            // 1件 → 従来の行
                            day.items.map((item) => (
                              <ShelfItemRow
                                key={item.id}
                                item={item}
                                currentUserId={currentUserId}
                                todayStr={todayStr}
                                tomorrowStr={tomorrowStr}
                                onOpen={() => onOpenItem(item)}
                              />
                            ))
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {/* later グループがある場合は履歴誘導 */}
              <div className="pt-1 flex items-center justify-between">
                <button
                  onClick={onOpenCalendar}
                  className="text-left"
                  style={{ fontSize: 11, color: C.coalter, fontWeight: 500 }}
                >
                  全履歴を開く →
                </button>
                <button
                  onClick={() => setExpanded(false)}
                  style={{ fontSize: 11, color: C.t3 }}
                  aria-label="閉じる"
                >
                  閉じる
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ShelfItemRow({
  item,
  currentUserId,
  todayStr,
  tomorrowStr,
  onOpen,
}: {
  item: PlanItem;
  currentUserId: string | null;
  todayStr: string;
  tomorrowStr: string;
  onOpen: () => void;
}) {
  const dateLabel = formatDateLabel(item.targetDate, todayStr, tomorrowStr);
  const isMine = currentUserId && item.createdBy === currentUserId;
  const markerColor = isMine ? C.coalter : C.pulse;
  const adopterHint = isMine ? "あなた" : "相手";

  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-lg px-2.5 py-2 flex items-start gap-2 transition-colors"
      style={{
        background: `${C.coalter}06`,
        border: `1px solid ${C.coalter}14`,
      }}
      aria-label={`${item.title} の詳細を開く`}
    >
      {/* 採用者ドット */}
      <div
        className="shrink-0 mt-1"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: markerColor,
        }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            style={{
              fontSize: 9,
              color: C.coalter,
              background: `${C.coalter}12`,
              padding: "1px 5px",
              borderRadius: 3,
              fontWeight: 500,
            }}
          >
            {dateLabel}
          </span>
          {item.timeSlot && (
            <span style={{ fontSize: 9, color: C.t3 }}>{item.timeSlot}</span>
          )}
          <span
            style={{
              fontSize: 8,
              color: markerColor,
              marginLeft: "auto",
              fontWeight: 500,
            }}
          >
            {adopterHint}採用
          </span>
        </div>
        <div style={{ marginTop: 3 }}>
          <span style={{ fontSize: 12, color: C.t1, fontWeight: 500 }}>
            {item.title}
          </span>
        </div>
        {item.practicalInfo && (
          <p
            className="truncate"
            style={{ fontSize: 10, color: C.t3, marginTop: 2 }}
          >
            {item.practicalInfo}
          </p>
        )}
      </div>
      <span style={{ fontSize: 10, color: C.t4 }} aria-hidden>
        ›
      </span>
    </button>
  );
}
