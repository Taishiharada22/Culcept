"use client";

import type { ExtendedWeatherContext } from "../_lib/materialWeather";

interface MaterialWeatherHintProps {
  extWeather: ExtendedWeatherContext;
}

const CONDITION_EMOJI: Record<string, string> = {
  hot: "🔥", warm: "☀️", mild: "🌤️", cool: "🍃", cold: "❄️", freezing: "🥶",
};

const HUMIDITY_EMOJI: Record<string, string> = {
  dry: "🏜️", normal: "", humid: "💧", very_humid: "💦",
};

const WIND_EMOJI: Record<string, string> = {
  calm: "", breezy: "🍃", windy: "💨", strong: "🌪️",
};

export default function MaterialWeatherHint({ extWeather }: MaterialWeatherHintProps) {
  const tempDiff = extWeather.rawTempMax != null
    ? Math.round(extWeather.feltTemp - ((extWeather.rawTempMax + (extWeather.rawTempMin ?? extWeather.rawTempMax)) / 2))
    : null;

  const hasTempDiff = tempDiff != null && Math.abs(tempDiff) >= 2;
  const hasHumidity = extWeather.humidity !== "normal";
  const hasWind = extWeather.wind !== "calm";

  if (!hasTempDiff && !hasHumidity && !hasWind) return null;

  return (
    <div className="rounded-xl bg-white/30 backdrop-blur-sm border border-white/40 px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[9px] font-bold tracking-widest text-gray-400 uppercase">体感</span>

        {hasTempDiff && (
          <span className={`text-[9px] font-semibold rounded-full px-2 py-0.5 border ${
            tempDiff! < 0
              ? "text-cyan-600 bg-cyan-50/60 border-cyan-200/30"
              : "text-orange-600 bg-orange-50/60 border-orange-200/30"
          }`}>
            {CONDITION_EMOJI[extWeather.condition] ?? ""} 体感{Math.round(extWeather.feltTemp)}°
            ({tempDiff! > 0 ? "+" : ""}{tempDiff}°)
          </span>
        )}

        {hasHumidity && (
          <span className={`text-[9px] font-semibold rounded-full px-2 py-0.5 border ${
            extWeather.humidity === "very_humid" || extWeather.humidity === "humid"
              ? "text-blue-600 bg-blue-50/60 border-blue-200/30"
              : "text-amber-600 bg-amber-50/60 border-amber-200/30"
          }`}>
            {HUMIDITY_EMOJI[extWeather.humidity]}
            {extWeather.humidity === "very_humid" ? "蒸し暑い" :
             extWeather.humidity === "humid" ? "湿度高め" : "乾燥"}
          </span>
        )}

        {hasWind && (
          <span className="text-[9px] font-semibold text-gray-500 bg-gray-50/60 rounded-full px-2 py-0.5 border border-gray-200/30">
            {WIND_EMOJI[extWeather.wind]}
            {extWeather.wind === "strong" ? "強風" :
             extWeather.wind === "windy" ? "風あり" : "微風"}
          </span>
        )}
      </div>
    </div>
  );
}
