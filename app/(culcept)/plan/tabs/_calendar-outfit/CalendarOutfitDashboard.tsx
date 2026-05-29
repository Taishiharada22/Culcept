"use client";

/**
 * Slice 1 — Calendar Outfit Dashboard (参照画像 6 section の hero、 mock UI)
 *
 * 役割:
 *   - `/plan` Calendar tab の新しい主役。 スケジュール連動型のコーデ提案を縦 1 列で見せる。
 *   - section ①〜⑥: intro / 日付+天気+SYNC / 今日の予定 / おすすめコーデ / 提案理由 / ワードローブ分析。
 *
 * Slice 1 制約 (CEO GO):
 *   - section ③ のみ **実 anchors** から生成。 ②④⑤⑥ は mock VM (useCalendarOutfit)。
 *   - engine / DB / weather 実取得 / AI には触れない。
 *   - 自前の selectedIso state を持ち、 既存 CalendarTab の selectedDate state とは独立
 *     (= additive、 既存 state 機構に影響を与えない)。
 */

import { useState } from "react";

import type { ExternalAnchor } from "@/lib/plan/external-anchor";

import { formatJpDate, isoDate, utcMidnight } from "../_helpers";
import { useCalendarOutfit } from "./useCalendarOutfit";
import { CAL_OUTFIT_PALETTE } from "./_palette";
import { CalendarIntroText } from "./CalendarIntroText";
import { DateWeatherSummaryCard } from "./DateWeatherSummaryCard";
import { TodayScheduleSection } from "./TodayScheduleSection";
import { RecommendedOutfitSection } from "./RecommendedOutfitSection";
import { RecommendationReasonCard } from "./RecommendationReasonCard";
import { WardrobeAnalysisSection } from "./WardrobeAnalysisSection";

export function CalendarOutfitDashboard({
  anchors,
  now,
  onOpenTimeline,
}: {
  anchors: ExternalAnchor[];
  now: Date;
  /** section ③ の「タイムラインで確認」リンク → 既存タイムライン (退避済み) を開く */
  onOpenTimeline?: () => void;
}) {
  const todayIso = isoDate(utcMidnight(now));
  const [selectedIso, setSelectedIso] = useState<string>(todayIso);
  const selectedDayObj = new Date(selectedIso + "T00:00:00.000Z");

  // B-4B: 選択日の予定 + wardrobe + weather を engine へ渡し実コーデ提案を得る。
  // 失敗時は mock / B-1 画像ハイドレートへ自動フォールバック (hook 内で完結、 退化ゼロ)。
  const vm = useCalendarOutfit({ anchors, dayIso: selectedIso });

  return (
    <div
      className={`${CAL_OUTFIT_PALETTE.pageGradient} rounded-3xl p-4 ${CAL_OUTFIT_PALETTE.sectionGap}`}
      data-testid="plan-calendar-outfit-dashboard"
    >
      {/* ① イントロ */}
      <CalendarIntroText text={vm.intro} />

      {/* ② 日付 + 天気 + SYNC + 日付セレクタ */}
      <DateWeatherSummaryCard
        dateLabel={formatJpDate(selectedDayObj)}
        weather={vm.weather}
        sync={vm.sync}
        now={now}
        selectedIso={selectedIso}
        onSelectDay={setSelectedIso}
      />

      {/* ③ 今日の予定 (実 anchors) */}
      <TodayScheduleSection
        anchors={anchors}
        dayObj={selectedDayObj}
        {...(onOpenTimeline ? { onOpenTimeline } : {})}
      />

      {/* ④ おすすめコーデ */}
      <RecommendedOutfitSection proposals={vm.proposals} />

      {/* ⑤ 提案理由 */}
      <RecommendationReasonCard reason={vm.reason} />

      {/* ⑥ ワードローブ分析 */}
      <WardrobeAnalysisSection stats={vm.wardrobeStats} />
    </div>
  );
}
