"use client";

import Image, { type ImageLoader } from "next/image";
import { motion } from "framer-motion";
import type { DayData, SyncScore } from "../_lib/types";
import { DAILY_WEATHER_ICONS, SYNC_BAND_COLORS } from "../_lib/constants";

const passthroughLoader: ImageLoader = ({ src }) => src;

interface DayCellProps {
  day: DayData;
  isToday: boolean;
  sync: SyncScore | null;
  onClick: () => void;
}

export default function DayCell({ day, isToday, sync, onClick }: DayCellProps) {
  const dayNum = parseInt(day.date.split("-")[2], 10);
  const hasOutfit = !!day.outfit?.is_worn;
  const hasEvent = day.events.length > 0;
  const daily = day.weather_daily ?? null;
  const weatherEmoji = daily ? DAILY_WEATHER_ICONS[daily.weather_icon] ?? "🌤️" : null;
  const tempLabel = daily && (daily.temp_min != null || daily.temp_max != null)
    ? `${daily.temp_min ?? "-"}°/${daily.temp_max ?? "-"}°` : null;
  const isRainOutfit = daily?.outfit_tag === "rain";
  const isSunday = day.dayOfWeek === 0;
  const isSaturday = day.dayOfWeek === 6;

  return (
    <motion.button
      onClick={onClick}
      className={`relative w-full aspect-square rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all ${
        isToday
          ? "bg-gradient-to-br from-violet-500/15 to-indigo-500/15 border-[1.5px] border-violet-400/60 shadow-sm shadow-violet-500/10"
          : hasOutfit
          ? "bg-white/60 backdrop-blur-sm border border-white/70 shadow-sm hover:bg-white/80"
          : "bg-white/25 backdrop-blur-sm border border-white/30 hover:bg-white/50"
      }`}
      whileHover={{ scale: 1.06, y: -2 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <span className={`text-[13px] font-bold leading-none ${
        isToday ? "text-violet-600" : isSunday ? "text-rose-400" : isSaturday ? "text-blue-400" : "text-gray-600"
      }`}>{dayNum}</span>

      {weatherEmoji && <span className="text-[11px] leading-none">{weatherEmoji}</span>}
      {/* 小画面では気温非表示 */}
      {tempLabel && <span className="text-[8px] text-gray-400 leading-none hidden min-[400px]:block">{tempLabel}</span>}

      {/* SYNCバッジ */}
      {sync && sync.total > 0 && (
        <div className="mt-0.5">
          <div className={`text-[9px] font-bold rounded-full px-1.5 py-0 ${SYNC_BAND_COLORS[sync.band].bg} ${SYNC_BAND_COLORS[sync.band].text}`}>
            {sync.total}
          </div>
        </div>
      )}

      {/* アウトフィットサムネイル */}
      {hasOutfit && !sync && day.outfit!.outfit_items.length > 0 && (
        <div className="flex -space-x-1.5 mt-0.5">
          {day.outfit!.outfit_items.slice(0, 3).map((item, i) => (
            <div key={i} className="w-3.5 h-3.5 rounded-full bg-gray-100 border border-white overflow-hidden shadow-sm">
              {item.image_url ? (
                <Image src={item.image_url} alt="" width={14} height={14} className="w-full h-full object-cover" loader={passthroughLoader} unoptimized />
              ) : (
                <div className="w-full h-full bg-gray-200 flex items-center justify-center text-[6px] text-gray-400">👕</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* バッジ */}
      {day.outfit?.is_worn && (
        <div className="absolute -bottom-0.5 -right-0.5 text-[8px] bg-emerald-500 text-white rounded-full w-4 h-4 flex items-center justify-center shadow-sm">✓</div>
      )}
      {hasEvent && <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-pink-400 rounded-full" />}
      {isRainOutfit && <div className="absolute bottom-0.5 left-0.5 text-[7px]">☔</div>}
    </motion.button>
  );
}
