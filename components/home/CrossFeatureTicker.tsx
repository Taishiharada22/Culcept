"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

interface CalendarDay {
  weather_daily?: {
    tempMax?: number;
    tempMin?: number;
    icon?: string;
  } | null;
  outfit?: {
    style_notes?: string;
  } | null;
}

interface Props {
  /** 今日の Calendar データ（Wave3 から） */
  todayCalendar?: CalendarDay | null;
  /** 今日の Prophecy テキスト（Wave2 から） */
  prophecyText?: string | null;
  /** ロード中か */
  loading?: boolean;
}

const WEATHER_ICONS: Record<string, string> = {
  sun: "☀️", cloud: "☁️", rain: "🌧️", snow: "❄️", storm: "⛈️", fog: "🌫️",
};

function TickerRow({
  icon,
  text,
  href,
  delay,
}: {
  icon: string;
  text: string;
  href: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.35 }}
    >
      <Link
        href={href}
        className="flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors"
        style={{ background: "rgba(255,255,255,0.5)", border: "1px solid rgba(0,0,0,0.04)" }}
      >
        <span className="text-base flex-shrink-0">{icon}</span>
        <span className="text-xs text-slate-600 leading-snug truncate flex-1">
          {text}
        </span>
        <svg className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </motion.div>
  );
}

export default function CrossFeatureTicker({ todayCalendar, prophecyText, loading }: Props) {
  const [rendezvousSummary, setRendezvousSummary] = useState<string | null>(null);

  // Rendezvous は遅延読み込み
  useEffect(() => {
    let active = true;
    fetch("/api/rendezvous/home", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        if (d?.activeRelationships?.length > 0) {
          setRendezvousSummary(`${d.activeRelationships.length}人との接続が進行中`);
        } else if (d?.stories?.length > 0) {
          setRendezvousSummary("分身が活動中");
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Calendar 行テキスト
  let calendarText = "天気予報を見るために、まず地域を設定しよう";
  if (todayCalendar?.weather_daily) {
    const w = todayCalendar.weather_daily;
    const icon = WEATHER_ICONS[w.icon ?? ""] ?? "🌤️";
    const temp = typeof w.tempMax === "number" ? `${w.tempMax}°C` : "";
    const note = todayCalendar.outfit?.style_notes ?? "";
    calendarText = [icon, temp, note].filter(Boolean).join(" ").trim() || "今日のコーデを確認";
  }

  // Prophecy 行テキスト
  const prophecy = prophecyText ?? "観測を続けると予測が始まります";

  // Rendezvous 行テキスト
  const rendezvous = rendezvousSummary ?? "分身がまだ活動を始めていません";

  if (loading) {
    return (
      <div className="px-4 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 rounded-xl bg-white/40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="px-4 space-y-1.5">
      <TickerRow icon="📅" text={calendarText} href="/calendar" delay={0.3} />
      <TickerRow icon="🔮" text={prophecy} href="/stargazer" delay={0.4} />
      <TickerRow icon="💬" text={rendezvous} href="/rendezvous" delay={0.5} />
    </div>
  );
}
