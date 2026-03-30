"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { WeatherDrift } from "../_lib/types";
import { DAILY_WEATHER_ICONS } from "../_lib/constants";

interface Props {
  drifts: WeatherDrift[];
  onRegenerate: (dates: string[]) => Promise<void>;
}

export default function WeatherDriftBanner({ drifts, onRegenerate }: Props) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (drifts.length === 0 || dismissed) return null;

  const significantDrifts = drifts.filter(d => d.severity === "significant");
  const hasSignificant = significantDrifts.length > 0;

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await onRegenerate(drifts.map(d => d.date));
      setDismissed(true);
    } finally {
      setIsRegenerating(false);
    }
  };

  const fieldLabel = (field: string) => {
    switch (field) {
      case "temp": return "気温";
      case "condition": return "天候";
      case "rain": return "降水確率";
      default: return "天気";
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className={`rounded-2xl border backdrop-blur-sm p-3 ${
          hasSignificant
            ? "bg-amber-50/70 border-amber-200/50"
            : "bg-blue-50/70 border-blue-200/50"
        }`}
      >
        <div className="flex items-start gap-2">
          <span className="text-lg shrink-0">{hasSignificant ? "⚠️" : "🌤️"}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-[11px] font-bold ${hasSignificant ? "text-amber-700" : "text-blue-700"}`}>
              天気予報が変わりました
            </p>
            <div className="mt-1 space-y-1">
              {drifts.slice(0, 3).map(drift => (
                <div key={drift.date} className="flex items-center gap-1.5 text-[9px] text-gray-600">
                  <span className="font-medium">{drift.date.slice(5)}</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-400">{fieldLabel(drift.field)}</span>
                  <span>{DAILY_WEATHER_ICONS[drift.stored.weather_icon] ?? "🌤️"}</span>
                  {drift.stored.temp_max != null && <span>{drift.stored.temp_max}°</span>}
                  <span className="text-gray-400">→</span>
                  <span>{DAILY_WEATHER_ICONS[drift.current.weather_icon] ?? "🌤️"}</span>
                  {drift.current.temp_max != null && <span className="font-bold">{drift.current.temp_max}°</span>}
                </div>
              ))}
              {drifts.length > 3 && (
                <p className="text-[9px] text-gray-400">他{drifts.length - 3}日</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold transition-all ${
              isRegenerating
                ? "bg-gray-200 text-gray-400"
                : hasSignificant
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "bg-blue-500 text-white hover:bg-blue-600"
            }`}
          >
            {isRegenerating ? "更新中…" : "コーデを更新"}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-lg py-1.5 px-3 text-[10px] text-gray-500 hover:bg-gray-100/60 transition-colors"
          >
            後で
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
