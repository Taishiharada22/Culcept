"use client";

import type { DayData } from "../_lib/types";

/* ── 週間天気ナラティブ生成 ── */
function generateWeekNarrative(weekDays: DayData[]): string {
  const weathers = weekDays.map(d => d.weather_daily).filter(Boolean);
  if (weathers.length === 0) return "";

  const maxTemps = weathers.map(w => w!.temp_max).filter((t): t is number => t != null);
  const avgTemp = maxTemps.length > 0 ? Math.round(maxTemps.reduce((a, b) => a + b, 0) / maxTemps.length) : null;

  const rainDayIndices = weekDays
    .map((d, i) => (d.weather_daily?.weather_icon === "rain" || d.weather_daily?.outfit_tag === "rain") ? i : -1)
    .filter(i => i >= 0);

  const dayLabels = ["月", "火", "水", "木", "金", "土", "日"];
  const tempTrend = maxTemps.length >= 3
    ? maxTemps[maxTemps.length - 1] - maxTemps[0] >= 5 ? "上昇傾向"
      : maxTemps[0] - maxTemps[maxTemps.length - 1] >= 5 ? "下降傾向"
      : "安定"
    : "安定";

  const parts: string[] = [];

  if (avgTemp !== null) {
    if (avgTemp >= 28) parts.push("暑さが続く1週間");
    else if (avgTemp >= 22) parts.push("穏やかな陽気が続きます");
    else if (avgTemp >= 15) parts.push("過ごしやすい気温です");
    else if (avgTemp >= 8) parts.push("肌寒さを感じる1週間");
    else parts.push("しっかり防寒が必要です");
  }

  if (rainDayIndices.length > 0 && rainDayIndices.length <= 3) {
    const rainLabels = rainDayIndices.map(i => dayLabels[i] ?? `${i + 1}日目`);
    parts.push(`${rainLabels.join("・")}曜は雨模様に`);
  } else if (rainDayIndices.length > 3) {
    parts.push("雨が多い1週間、傘必須です");
  }

  if (tempTrend === "上昇傾向") parts.push("後半に向けて暖かくなります");
  else if (tempTrend === "下降傾向") parts.push("週末に向けて冷え込みます");

  return parts.join("。") || "今週の天気をチェック";
}

interface WeekAtmosphereBarProps {
  weekDays: DayData[];
}

export default function WeekAtmosphereBar({ weekDays }: WeekAtmosphereBarProps) {
  const temps = weekDays
    .map(d => d.weather_daily)
    .filter(Boolean)
    .map(w => ({ min: w!.temp_min, max: w!.temp_max }))
    .filter(t => t.min != null || t.max != null);

  if (temps.length === 0) return null;

  const allMaxes = temps.map(t => t.max ?? t.min ?? 0);
  const allMins = temps.map(t => t.min ?? t.max ?? 0);
  const weekAvg = allMaxes.length > 0 ? Math.round(allMaxes.reduce((a, b) => a + b, 0) / allMaxes.length) : null;
  const weekMin = Math.min(...allMins);
  const weekMax = Math.max(...allMaxes);
  const range = weekMax - weekMin || 1;

  // スタイル傾向を推定
  const styleTendency = weekAvg !== null
    ? weekAvg >= 25 ? "軽装ベース" : weekAvg >= 15 ? "薄手レイヤード" : weekAvg >= 5 ? "重ね着ベース" : "最大防寒"
    : "—";

  const rainDays = weekDays.filter(d =>
    d.weather_daily?.outfit_tag === "rain" || d.weather_daily?.weather_icon === "rain"
  ).length;

  return (
    <div className="rounded-2xl bg-white/30 backdrop-blur-xl border border-white/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-bold tracking-widest text-gray-400 uppercase">Week Atmosphere</span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-semibold text-violet-500 bg-violet-50/60 rounded-full px-2 py-0.5 border border-violet-200/30">
            {styleTendency}
          </span>
          {rainDays > 0 && (
            <span className="text-[9px] font-semibold text-blue-500 bg-blue-50/60 rounded-full px-2 py-0.5 border border-blue-200/30">
              ☔ {rainDays}日
            </span>
          )}
        </div>
      </div>

      {/* ナラティブ */}
      {(() => {
        const narrative = generateWeekNarrative(weekDays);
        return narrative ? (
          <p className="text-[9px] text-gray-500 leading-relaxed mb-2">{narrative}</p>
        ) : null;
      })()}

      {/* ミニ気温チャート */}
      <div className="flex items-end gap-1 h-10">
        {weekDays.map((wd, i) => {
          const w = wd.weather_daily;
          if (!w || (w.temp_max == null && w.temp_min == null)) {
            return <div key={i} className="flex-1 flex items-end justify-center"><div className="w-1.5 h-1.5 rounded-full bg-gray-200" /></div>;
          }
          const max = w.temp_max ?? w.temp_min ?? 0;
          const min = w.temp_min ?? w.temp_max ?? 0;
          const maxH = ((max - weekMin) / range) * 28 + 4;
          const minH = ((min - weekMin) / range) * 28 + 4;
          const isRain = w.outfit_tag === "rain" || w.weather_icon === "rain";

          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="relative flex items-end justify-center" style={{ height: 32 }}>
                <div
                  className={`w-2 rounded-full ${isRain ? "bg-blue-400/60" : "bg-gradient-to-t from-orange-300/60 to-red-300/60"}`}
                  style={{ height: maxH }}
                />
                <div
                  className="w-1.5 rounded-full bg-cyan-300/40 absolute bottom-0"
                  style={{ height: minH }}
                />
              </div>
              <span className="text-[7px] text-gray-400">{max}°</span>
            </div>
          );
        })}
      </div>

      {/* 底部ラベル */}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[8px] text-gray-400">
          {weekAvg !== null ? `平均 ${weekAvg}°` : ""}
        </span>
        <span className="text-[8px] text-gray-400">
          {weekMin}° 〜 {weekMax}°
        </span>
      </div>
    </div>
  );
}
