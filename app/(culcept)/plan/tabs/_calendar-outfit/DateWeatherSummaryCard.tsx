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
      className={`${CAL_OUTFIT_PALETTE.card} overflow-hidden p-3.5`}
      data-testid="plan-calendar-outfit-summary"
    >
      {/* 理想画像準拠: 左に当日の要約（日付・天気・降水・SYNC）、 右に日付ストリップ（横並び 1 行）。 */}
      <div className="flex items-stretch gap-3">
        {/* 左: 当日の要約 */}
        <div className="min-w-0 shrink-0">
          <p className={`text-base font-bold leading-tight tracking-tight ${CAL_OUTFIT_PALETTE.heading}`}>
            {dateLabel}
          </p>
          {/* 天気 + 最高/最低 + 降水 を 1 行に（「降水」の文言は不要、 傘 + % のみ） */}
          <div className="mt-1 flex items-center gap-2 text-[13px]">
            <span className="leading-none" aria-hidden="true">
              {weather.icon}
            </span>
            <span>
              <span className="font-semibold text-slate-700">{weather.tempMax}°</span>
              <span className="text-slate-400">/{weather.tempMin}°</span>
            </span>
            <span className="text-slate-400">☂ {weather.pop}%</span>
          </div>
          {/* SYNC ピル (小さめ) */}
          <span
            className={`${CAL_OUTFIT_PALETTE.syncPill} mt-1.5 px-2 py-0.5 text-xs font-medium`}
            data-testid="plan-calendar-outfit-sync-pill"
          >
            <span className="text-[10px] tracking-wide text-violet-500">SYNC</span>
            <span className="text-sm font-bold text-violet-700">{sync.score}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${band.pill}`}>
              {sync.bandLabel}
            </span>
          </span>
        </div>

        {/* 区切り線 */}
        <div className="w-px shrink-0 self-stretch bg-violet-100/70" aria-hidden="true" />

        {/* 右: 日付セレクタ (当日中心、 横スクロール) */}
        <div className="flex min-w-0 flex-1 items-center">
          <DaySelectorStrip now={now} selectedIso={selectedIso} onSelect={onSelectDay} />
        </div>
      </div>
    </section>
  );
}
