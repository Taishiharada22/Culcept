"use client";

/**
 * CalendarViewBody — week strip ⇄ month grid の本体分岐 seam（Plan 月ビュー M3-b）
 *
 * viewMode="month" → MonthGridView を描画。
 * viewMode="week"  → children（CalendarTab 既存 week strip JSX）をそのまま描画。
 *
 * 設計意図:
 *   - week strip JSX を CalendarTab から移動せず children で受ける（外科的・既存不変）。
 *   - 月送り slide（AnimatePresence / motion.div）と selected-day agenda は呼び出し側
 *     （CalendarTab）に残す。本 seam は body の出し分けだけに閉じる。
 *   - presentational のみ（内部 state / fetch / 現在時刻参照なし）。
 *   - jsdom を足さずに「viewMode=month で MonthGridView が出る」を renderToStaticMarkup で
 *     検証できる小さな seam（M3-b test 補正）。
 *
 * 設計: M3-b mini design（2026-06-03 CEO chat 承認）。
 */

import type { ReactNode } from "react";

import type { CalendarViewMode } from "@/lib/plan/calendarViewMode";
import { MonthGridView, type MonthGridViewProps } from "./MonthGridView";

export function CalendarViewBody({
  viewMode,
  monthGridProps,
  children,
}: {
  viewMode: CalendarViewMode;
  /** month mode 時に MonthGridView へ渡す props（既存 CalendarTab state から構築） */
  monthGridProps: MonthGridViewProps;
  /** week mode 時に描画する既存 week strip JSX */
  children: ReactNode;
}) {
  if (viewMode === "month") {
    return <MonthGridView {...monthGridProps} />;
  }
  return <>{children}</>;
}
