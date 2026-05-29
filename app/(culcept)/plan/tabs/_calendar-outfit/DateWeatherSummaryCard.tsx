/**
 * Slice 1 — section ② 日付 + 天気 + SYNC + 日付セレクタ (presentational, hero card)
 *
 * CEO 補正 #2: SYNC は **薄いピル** ("SYNC スコア 84")。 ProgressRing は使わない。
 *   優先度: 画像準拠 > 軽さ・上品さ > 再利用。
 *
 * 構成 (prominent hero):
 *   - 上段 左: 大きな日付 + サブ文 + SYNC ピル (band 色は SYNC_BAND_VM 経由)。
 *   - 上段 右: 天気ブロック (大きな emoji + 気温 + 降水)。
 *   - 下段: DaySelectorStrip (週、各日に天気アイコン)。
 */

import type { CalendarOutfitSyncVM, CalendarOutfitWeatherVM } from "./types";
import { CAL_OUTFIT_PALETTE, SYNC_BAND_VM } from "./_palette";
import { DaySelectorStrip } from "./DaySelectorStrip";

export function DateWeatherSummaryCard({
  dateLabel,
  weather,
  sync,
  now,
  selectedIso,
  onSelectDay,
}: {
  dateLabel: string;
  weather: CalendarOutfitWeatherVM;
  sync: CalendarOutfitSyncVM;
  now: Date;
  selectedIso: string;
  onSelectDay: (iso: string) => void;
}) {
  const band = SYNC_BAND_VM[sync.bandKey];

  return (
    <section
      className={`${CAL_OUTFIT_PALETTE.card} overflow-hidden p-4`}
      data-testid="plan-calendar-outfit-summary"
    >
      {/* 上段: 日付 (左) + 天気 (右) */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-3xl font-bold leading-tight tracking-tight ${CAL_OUTFIT_PALETTE.heading}`}>
            {dateLabel}
          </p>
          <p className={`mt-1.5 text-[13px] ${CAL_OUTFIT_PALETTE.subtle}`}>今日の装いを見てみましょう</p>
          {/* SYNC ピル (薄いピル、 ring ではない) */}
          <span
            className={`${CAL_OUTFIT_PALETTE.syncPill} mt-2.5 text-xs font-medium`}
            data-testid="plan-calendar-outfit-sync-pill"
          >
            <span className="text-[11px] tracking-wide text-violet-500">SYNC スコア</span>
            <span className="text-base font-bold text-violet-700">{sync.score}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${band.pill}`}>
              {sync.bandLabel}
            </span>
          </span>
        </div>

        {/* 天気ブロック */}
        <div className="shrink-0 rounded-2xl bg-gradient-to-br from-violet-50 to-white px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2.5">
            <span className="text-5xl leading-none" aria-hidden="true">
              {weather.icon}
            </span>
            <div className="text-left">
              <p className={`text-sm font-medium ${CAL_OUTFIT_PALETTE.heading}`}>{weather.label}</p>
              <p className="text-xs text-slate-500">
                <span className="text-base font-semibold text-slate-700">{weather.tempMax}°</span>
                {" / "}
                {weather.tempMin}°
              </p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">🌧️ 降水 {weather.pop}%</p>
        </div>
      </div>

      {/* 下段: 日付セレクタ (週、各日に天気アイコン) */}
      <div className="mt-3 border-t border-violet-100/70 pt-3">
        <DaySelectorStrip now={now} selectedIso={selectedIso} onSelect={onSelectDay} />
      </div>
    </section>
  );
}
