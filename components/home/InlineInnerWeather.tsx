"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

/**
 * 1-line compact inner weather input for the Home screen.
 * Maps quick emoji presets to API parameters, or links to full weather page.
 */

type Preset = {
  emoji: string;
  label: string;
  params: {
    energy: number;
    stress: number;
    emotionalTone: string;
    socialBattery: number;
  };
};

const QUICK_PRESETS: Preset[] = [
  { emoji: "😌", label: "穏やか", params: { energy: 0.5, stress: 0.1, emotionalTone: "calm", socialBattery: 0.5 } },
  { emoji: "⚡", label: "エネルギッシュ", params: { energy: 0.8, stress: 0.2, emotionalTone: "excited", socialBattery: 0.7 } },
  { emoji: "🌀", label: "モヤモヤ", params: { energy: 0.3, stress: 0.6, emotionalTone: "conflicted", socialBattery: 0.3 } },
  { emoji: "💤", label: "低空飛行", params: { energy: 0.1, stress: 0.3, emotionalTone: "numb", socialBattery: 0.2 } },
  { emoji: "😤", label: "イライラ", params: { energy: 0.6, stress: 0.8, emotionalTone: "anxious", socialBattery: 0.3 } },
];

type Props = {
  innerWeather: {
    emoji?: string;
    label?: string;
    recorded?: boolean;
  } | null;
};

export default function InlineInnerWeather({ innerWeather }: Props) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [justRecorded, setJustRecorded] = useState(false);

  const isRecorded = innerWeather?.recorded || justRecorded;

  const handleQuickRecord = useCallback(async (preset: Preset) => {
    if (submitting) return;
    setSubmitting(preset.emoji);
    try {
      const res = await fetch("/api/stargazer/inner-weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(preset.params),
      });
      if (res.ok) {
        setJustRecorded(true);
        // Notify other components
        window.dispatchEvent(new CustomEvent("aneurasync:inner-weather-updated"));
        // Bridge to localStorage for instant read
        try {
          const data = await res.json();
          const bridgeKey = "aneurasync_home_inner_weather_v1";
          const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
          localStorage.setItem(bridgeKey, JSON.stringify({ date: dateKey, weather: data.weather }));
        } catch { /* noop */ }
      }
    } catch { /* noop */ }
    setSubmitting(null);
  }, [submitting]);

  // Recorded state: show compact result
  if (isRecorded) {
    return (
      <section className="px-4 pb-2">
        <Link
          href="/stargazer/weather"
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl transition-all active:scale-[0.98]"
          style={{
            background: "rgba(59,130,246,0.04)",
            border: "1px solid rgba(59,130,246,0.08)",
          }}
        >
          <span className="text-base leading-none">
            {innerWeather?.emoji ?? "☀️"}
          </span>
          <span className="text-[12px] text-text2 flex-1">
            今の状態: <span className="font-medium text-text1">{innerWeather?.label ?? "記録済み"}</span>
          </span>
          <span className="text-[9px] text-text4">詳しく →</span>
        </Link>
      </section>
    );
  }

  // Input state: 1-line with emoji buttons
  return (
    <section className="px-4 pb-2">
      <div
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
        style={{
          background: "rgba(59,130,246,0.04)",
          border: "1px solid rgba(59,130,246,0.10)",
        }}
      >
        <span className="text-[12px] text-text2 flex-shrink-0 whitespace-nowrap">今の状態は？</span>
        <div className="flex items-center gap-1 flex-1 justify-end">
          {QUICK_PRESETS.map((preset) => (
            <motion.button
              key={preset.emoji}
              whileTap={{ scale: 0.85 }}
              onClick={() => handleQuickRecord(preset)}
              disabled={!!submitting}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{
                background: submitting === preset.emoji
                  ? "rgba(59,130,246,0.15)"
                  : "rgba(255,255,255,0.6)",
                border: "1px solid rgba(0,0,0,0.04)",
                opacity: submitting && submitting !== preset.emoji ? 0.4 : 1,
              }}
              title={preset.label}
            >
              <AnimatePresence mode="wait">
                {submitting === preset.emoji ? (
                  <motion.span
                    key="loading"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent"
                    style={{ animation: "spin 0.6s linear infinite" }}
                  />
                ) : (
                  <motion.span key="emoji" className="text-base leading-none">
                    {preset.emoji}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}
