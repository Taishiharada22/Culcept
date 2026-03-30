// app/stargazer/weather/WeatherClient.tsx
// Inner Weather — 心の天気を1タップで記録し、美しく可視化する
"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trackFeatureView, trackInteraction } from "@/lib/stargazer/trackClient";
import Link from "next/link";
import {
  GlassCard,
  GlassButton,
  GlassBadge,
  FadeInView,
  Skeleton,
} from "@/components/ui/glassmorphism-design";
import type {
  WeatherType,
  EmotionalTone,
  InnerWeather,
  DefenseDetection,
  PressureMap,
  PressurePoint,
} from "@/lib/stargazer/innerWeather";
import {
  getWeatherEmoji,
  getWeatherLabel,
  getEmotionalToneLabel,
  getDefenseLabel,
  getPressureSourceLabel,
} from "@/lib/stargazer/innerWeather";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants & Mappings
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const WEATHER_GRADIENTS: Record<WeatherType, string> = {
  sunny:
    "linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(253,224,71,0.12) 40%, rgba(254,249,195,0.08) 100%)",
  windy:
    "linear-gradient(135deg, rgba(20,184,166,0.15) 0%, rgba(134,239,172,0.10) 40%, rgba(236,253,245,0.06) 100%)",
  cloudy:
    "linear-gradient(135deg, rgba(148,163,184,0.15) 0%, rgba(168,162,186,0.10) 40%, rgba(226,232,240,0.08) 100%)",
  rainy:
    "linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(129,140,248,0.10) 40%, rgba(224,231,255,0.06) 100%)",
  stormy:
    "linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(220,38,38,0.10) 40%, rgba(253,164,175,0.06) 100%)",
  foggy:
    "linear-gradient(135deg, rgba(226,232,240,0.20) 0%, rgba(203,213,225,0.12) 40%, rgba(241,245,249,0.08) 100%)",
  aurora:
    "linear-gradient(135deg, rgba(236,72,153,0.12) 0%, rgba(168,85,247,0.12) 30%, rgba(6,182,212,0.12) 60%, rgba(34,197,94,0.08) 100%)",
  snow:
    "linear-gradient(135deg, rgba(100,116,180,0.15) 0%, rgba(148,163,184,0.10) 40%, rgba(226,232,240,0.06) 100%)",
};

const WEATHER_GLOW_COLORS: Record<WeatherType, string> = {
  sunny: "rgba(251,191,36,0.35)",
  windy: "rgba(20,184,166,0.30)",
  cloudy: "rgba(148,163,184,0.25)",
  rainy: "rgba(99,102,241,0.30)",
  stormy: "rgba(139,92,246,0.35)",
  foggy: "rgba(203,213,225,0.25)",
  aurora: "rgba(168,85,247,0.30)",
  snow: "rgba(100,116,180,0.25)",
};

const TONE_CHIPS: { value: EmotionalTone; label: string; emoji: string }[] = [
  { value: "calm", label: "穏やか", emoji: "\uD83C\uDF3F" },
  { value: "anxious", label: "不安", emoji: "\uD83C\uDF00" },
  { value: "excited", label: "高揚", emoji: "\u2728" },
  { value: "melancholic", label: "憂鬱", emoji: "\uD83C\uDF19" },
  { value: "conflicted", label: "葛藤", emoji: "\u26A1" },
  { value: "joyful", label: "喜び", emoji: "\u2600\uFE0F" },
  { value: "numb", label: "無感覚", emoji: "\uD83E\uDDA2" },
];

/** Pressure orb color based on intensity */


const directionLabel: Record<PressurePoint["direction"], string> = {
  building: "蓄積中",
  releasing: "解放中",
  stable: "安定",
};
const directionIcon: Record<PressurePoint["direction"], string> = {
  building: "\u2191",
  releasing: "\u2193",
  stable: "\u2194",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SVG Weather Animations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SunnyAnimation() {
  return (
    <svg width="180" height="180" viewBox="0 0 180 180" className="mx-auto">
      {/* Central sun */}
      <motion.circle
        cx="90" cy="90" r="30"
        fill="rgba(251,191,36,0.9)"
        animate={{ r: [30, 33, 30] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Inner glow */}
      <motion.circle
        cx="90" cy="90" r="40"
        fill="none"
        stroke="rgba(253,224,71,0.3)"
        strokeWidth="2"
        animate={{ r: [40, 48, 40], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Sun rays */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i * 45 * Math.PI) / 180;
        const x1 = 90 + Math.cos(angle) * 50;
        const y1 = 90 + Math.sin(angle) * 50;
        const x2 = 90 + Math.cos(angle) * 70;
        const y2 = 90 + Math.sin(angle) * 70;
        return (
          <motion.line
            key={i}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="rgba(251,191,36,0.6)"
            strokeWidth="2.5"
            strokeLinecap="round"
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 2, delay: i * 0.25, repeat: Infinity, ease: "easeInOut" }}
          />
        );
      })}
      {/* Warmth particles */}
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.circle
          key={`p${i}`}
          cx={60 + i * 30} cy={140}
          r="2"
          fill="rgba(253,224,71,0.5)"
          animate={{
            cy: [140, 50, 140],
            opacity: [0, 0.7, 0],
            cx: [60 + i * 30, 65 + i * 28, 60 + i * 30],
          }}
          transition={{ duration: 5 + i * 0.8, delay: i * 1.2, repeat: Infinity }}
        />
      ))}
    </svg>
  );
}

function CalmWindAnimation() {
  return (
    <svg width="180" height="180" viewBox="0 0 180 180" className="mx-auto">
      {/* Flowing wind lines */}
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.path
          key={i}
          d={`M ${10 + i * 5} ${50 + i * 25} Q ${60 + i * 10} ${35 + i * 25}, ${110 + i * 5} ${50 + i * 25} T ${170 - i * 3} ${50 + i * 25}`}
          fill="none"
          stroke={`rgba(20,184,166,${0.15 + i * 0.08})`}
          strokeWidth={1.5 + i * 0.3}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{
            pathLength: [0, 1, 1, 0],
            opacity: [0, 0.7, 0.7, 0],
            pathOffset: [0, 0, 0.3, 0.6],
          }}
          transition={{
            duration: 4 + i * 0.5,
            delay: i * 0.6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
      {/* Floating leaves */}
      {[0, 1, 2].map((i) => (
        <motion.ellipse
          key={`leaf${i}`}
          rx="4" ry="2"
          fill={`rgba(134,239,172,${0.4 + i * 0.1})`}
          animate={{
            cx: [20 + i * 50, 160 - i * 20],
            cy: [70 + i * 30, 80 + i * 25],
            rotate: [0, 360],
          }}
          transition={{
            duration: 6 + i * 2,
            delay: i * 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </svg>
  );
}

function CloudyAnimation() {
  return (
    <svg width="180" height="180" viewBox="0 0 180 180" className="mx-auto">
      {/* Cloud 1 - large, slow */}
      <motion.g
        animate={{ x: [-5, 8, -5] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      >
        <ellipse cx="90" cy="75" rx="45" ry="22" fill="rgba(148,163,184,0.25)" />
        <ellipse cx="70" cy="70" rx="30" ry="18" fill="rgba(168,162,186,0.2)" />
        <ellipse cx="115" cy="72" rx="28" ry="16" fill="rgba(148,163,184,0.2)" />
      </motion.g>
      {/* Cloud 2 - smaller, faster */}
      <motion.g
        animate={{ x: [5, -10, 5] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        <ellipse cx="55" cy="105" rx="35" ry="16" fill="rgba(168,162,186,0.18)" />
        <ellipse cx="40" cy="102" rx="22" ry="12" fill="rgba(148,163,184,0.15)" />
      </motion.g>
      {/* Cloud 3 */}
      <motion.g
        animate={{ x: [-3, 6, -3] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      >
        <ellipse cx="130" cy="115" rx="30" ry="14" fill="rgba(203,213,225,0.15)" />
      </motion.g>
      {/* Dim sun behind clouds */}
      <motion.circle
        cx="130" cy="55" r="18"
        fill="rgba(251,191,36,0.08)"
        animate={{ opacity: [0.05, 0.12, 0.05] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}

function RainyAnimation() {
  return (
    <svg width="180" height="180" viewBox="0 0 180 180" className="mx-auto">
      {/* Rain cloud */}
      <motion.g
        animate={{ y: [-2, 2, -2] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      >
        <ellipse cx="90" cy="55" rx="50" ry="22" fill="rgba(99,102,241,0.2)" />
        <ellipse cx="65" cy="50" rx="30" ry="18" fill="rgba(129,140,248,0.18)" />
        <ellipse cx="120" cy="52" rx="30" ry="16" fill="rgba(99,102,241,0.15)" />
      </motion.g>
      {/* Raindrops - staggered falling animation */}
      {Array.from({ length: 12 }).map((_, i) => {
        const x = 40 + (i % 6) * 20 + (Math.floor(i / 6) * 10);
        return (
          <motion.line
            key={i}
            x1={x} y1={80} x2={x - 2} y2={92}
            stroke="rgba(129,140,248,0.5)"
            strokeWidth="1.5"
            strokeLinecap="round"
            animate={{
              y1: [80, 170],
              y2: [92, 180],
              opacity: [0.6, 0],
            }}
            transition={{
              duration: 1.2 + (i % 3) * 0.3,
              delay: i * 0.15,
              repeat: Infinity,
              ease: "easeIn",
            }}
          />
        );
      })}
      {/* Splash ripples at bottom */}
      {[0, 1, 2].map((i) => (
        <motion.ellipse
          key={`splash${i}`}
          cx={50 + i * 40} cy={168}
          rx="0" ry="0"
          fill="none"
          stroke="rgba(129,140,248,0.3)"
          strokeWidth="1"
          animate={{
            rx: [0, 8, 12],
            ry: [0, 2, 3],
            opacity: [0.5, 0.2, 0],
          }}
          transition={{
            duration: 1.5,
            delay: i * 0.5 + 0.8,
            repeat: Infinity,
          }}
        />
      ))}
    </svg>
  );
}

function StormyAnimation() {
  return (
    <svg width="180" height="180" viewBox="0 0 180 180" className="mx-auto">
      {/* Dark storm clouds */}
      <motion.g
        animate={{ x: [-8, 8, -8] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <ellipse cx="90" cy="50" rx="55" ry="25" fill="rgba(139,92,246,0.25)" />
        <ellipse cx="60" cy="45" rx="35" ry="20" fill="rgba(88,28,135,0.2)" />
        <ellipse cx="125" cy="48" rx="32" ry="18" fill="rgba(139,92,246,0.2)" />
      </motion.g>
      {/* Lightning bolt */}
      <motion.path
        d="M 95 70 L 82 100 L 95 100 L 78 140"
        fill="none"
        stroke="rgba(250,204,21,0.9)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        animate={{ opacity: [0, 0, 1, 0, 0, 0, 0.8, 0, 0, 0] }}
        transition={{ duration: 4, repeat: Infinity }}
      />
      {/* Flash effect */}
      <motion.rect
        x="0" y="0" width="180" height="180"
        fill="rgba(250,204,21,0.05)"
        animate={{ opacity: [0, 0, 0.15, 0, 0, 0, 0.1, 0, 0, 0] }}
        transition={{ duration: 4, repeat: Infinity }}
      />
      {/* Heavy rain */}
      {Array.from({ length: 16 }).map((_, i) => {
        const x = 25 + (i % 8) * 18;
        return (
          <motion.line
            key={i}
            x1={x} y1={75} x2={x - 6} y2={95}
            stroke="rgba(139,92,246,0.4)"
            strokeWidth="1.5"
            strokeLinecap="round"
            animate={{
              y1: [75, 175],
              y2: [95, 180],
              opacity: [0.5, 0],
            }}
            transition={{
              duration: 0.7 + (i % 4) * 0.15,
              delay: i * 0.08,
              repeat: Infinity,
              ease: "easeIn",
            }}
          />
        );
      })}
    </svg>
  );
}

function FoggyAnimation() {
  return (
    <svg width="180" height="180" viewBox="0 0 180 180" className="mx-auto">
      {/* Layered fog bands */}
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.rect
          key={i}
          x="0" y={40 + i * 28}
          width="180" height={18 - i * 2}
          rx="9"
          fill={`rgba(203,213,225,${0.12 - i * 0.015})`}
          animate={{
            x: [i % 2 === 0 ? -15 : 10, i % 2 === 0 ? 10 : -15],
            opacity: [0.1 + i * 0.03, 0.2 + i * 0.02, 0.1 + i * 0.03],
          }}
          transition={{
            duration: 6 + i * 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
      {/* Subtle particles floating in fog */}
      {[0, 1, 2, 3].map((i) => (
        <motion.circle
          key={`fp${i}`}
          cx={40 + i * 35} cy={90}
          r="2"
          fill="rgba(226,232,240,0.3)"
          animate={{
            cx: [40 + i * 35, 50 + i * 30, 40 + i * 35],
            cy: [70 + i * 15, 100 + i * 10, 70 + i * 15],
            opacity: [0.1, 0.35, 0.1],
          }}
          transition={{ duration: 8 + i * 2, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </svg>
  );
}

function AuroraAnimation() {
  return (
    <svg width="180" height="180" viewBox="0 0 180 180" className="mx-auto">
      <defs>
        <linearGradient id="aurora1" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(236,72,153,0.4)" />
          <stop offset="33%" stopColor="rgba(168,85,247,0.5)" />
          <stop offset="66%" stopColor="rgba(6,182,212,0.4)" />
          <stop offset="100%" stopColor="rgba(34,197,94,0.3)" />
        </linearGradient>
        <linearGradient id="aurora2" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(34,197,94,0.3)" />
          <stop offset="50%" stopColor="rgba(168,85,247,0.4)" />
          <stop offset="100%" stopColor="rgba(236,72,153,0.3)" />
        </linearGradient>
      </defs>
      {/* Aurora curtain 1 */}
      <motion.path
        d="M 0 120 Q 30 40, 60 80 T 120 60 T 180 90"
        fill="none"
        stroke="url(#aurora1)"
        strokeWidth="20"
        strokeLinecap="round"
        opacity="0.5"
        animate={{
          d: [
            "M 0 120 Q 30 40, 60 80 T 120 60 T 180 90",
            "M 0 100 Q 40 50, 70 70 T 130 50 T 180 80",
            "M 0 120 Q 30 40, 60 80 T 120 60 T 180 90",
          ],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Aurora curtain 2 */}
      <motion.path
        d="M 0 140 Q 45 60, 90 100 T 180 70"
        fill="none"
        stroke="url(#aurora2)"
        strokeWidth="16"
        strokeLinecap="round"
        opacity="0.35"
        animate={{
          d: [
            "M 0 140 Q 45 60, 90 100 T 180 70",
            "M 0 130 Q 50 70, 95 90 T 180 60",
            "M 0 140 Q 45 60, 90 100 T 180 70",
          ],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Stars */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <motion.circle
          key={i}
          cx={20 + i * 30} cy={25 + (i % 3) * 15}
          r="1.5"
          fill="rgba(255,255,255,0.7)"
          animate={{ opacity: [0.3, 0.9, 0.3] }}
          transition={{ duration: 2 + i * 0.5, delay: i * 0.4, repeat: Infinity }}
        />
      ))}
    </svg>
  );
}

function SnowAnimation() {
  return (
    <svg width="180" height="180" viewBox="0 0 180 180" className="mx-auto">
      {/* Soft winter clouds */}
      <motion.g
        animate={{ x: [-3, 3, -3] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      >
        <ellipse cx="90" cy="40" rx="50" ry="18" fill="rgba(100,116,180,0.12)" />
        <ellipse cx="60" cy="38" rx="30" ry="14" fill="rgba(148,163,184,0.1)" />
      </motion.g>
      {/* Snowflakes - gentle falling */}
      {Array.from({ length: 14 }).map((_, i) => {
        const x = 15 + (i % 7) * 22;
        const size = 2 + (i % 3);
        return (
          <motion.circle
            key={i}
            cx={x} cy={55}
            r={size}
            fill="rgba(226,232,240,0.6)"
            animate={{
              cy: [55, 175],
              cx: [x, x + Math.sin(i) * 15],
              opacity: [0.7, 0.1],
            }}
            transition={{
              duration: 4 + (i % 4) * 1.5,
              delay: i * 0.4,
              repeat: Infinity,
              ease: "easeIn",
            }}
          />
        );
      })}
      {/* Snow accumulation at bottom */}
      <motion.path
        d="M 0 170 Q 30 162, 60 168 T 120 164 T 180 170 L 180 180 L 0 180 Z"
        fill="rgba(226,232,240,0.2)"
        animate={{
          d: [
            "M 0 170 Q 30 162, 60 168 T 120 164 T 180 170 L 180 180 L 0 180 Z",
            "M 0 168 Q 30 160, 60 166 T 120 162 T 180 168 L 180 180 L 0 180 Z",
          ],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}

const WEATHER_ANIMATION: Record<WeatherType, React.FC> = {
  sunny: SunnyAnimation,
  windy: CalmWindAnimation,
  cloudy: CloudyAnimation,
  rainy: RainyAnimation,
  stormy: StormyAnimation,
  foggy: FoggyAnimation,
  aurora: AuroraAnimation,
  snow: SnowAnimation,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Weather History Timeline
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface HistoryEntry {
  date: string;
  weatherType: WeatherType;
  emoji: string;
  label: string;
  energy: number;
  stress: number;
}

const HISTORY_KEY = "aneurasync_weather_history_v1";
const HOME_INNER_WEATHER_BRIDGE_KEY = "aneurasync_home_inner_weather_v1";
const HOME_INNER_WEATHER_UPDATED_EVENT = "aneurasync:inner-weather-updated";

function jstDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(date);
}

function writeHomeInnerWeatherBridge(weather: InnerWeather, recordedAt?: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HOME_INNER_WEATHER_BRIDGE_KEY, JSON.stringify({
      date: jstDateKey(),
      recordedAt: recordedAt ?? new Date().toISOString(),
      weather,
    }));
    window.dispatchEvent(new CustomEvent(HOME_INNER_WEATHER_UPDATED_EVENT));
  } catch {}
}

function clearHomeInnerWeatherBridge(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(HOME_INNER_WEATHER_BRIDGE_KEY);
  } catch {}
}

function normalizeApiWeather(input: any): InnerWeather | null {
  if (!input) return null;
  const weatherType = input.weatherType as WeatherType | undefined;
  if (!weatherType) return null;

  const forecast =
    typeof input.forecast === "string"
      ? input.forecast
      : typeof input?.forecast?.text === "string"
        ? input.forecast.text
        : "";

  return {
    weatherType,
    label: input.label ?? input.weatherLabel ?? getWeatherLabel(weatherType),
    emoji: input.emoji ?? input.weatherEmoji ?? getWeatherEmoji(weatherType),
    description: input.description ?? input.weatherReport ?? "",
    energyLevel: typeof input.energyLevel === "number" ? input.energyLevel : 0,
    stressLevel: typeof input.stressLevel === "number" ? input.stressLevel : 0.3,
    emotionalTone: input.emotionalTone ?? "calm",
    socialBattery: typeof input.socialBattery === "number" ? input.socialBattery : 0.5,
    stability: typeof input.stability === "number" ? input.stability : 0.5,
    forecast,
  };
}

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch { return []; }
}

/** Local-time date key (YYYY-MM-DD) */
function localDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function saveToHistory(weather: InnerWeather): void {
  if (typeof window === "undefined") return;
  const today = localDateKey();
  const existing = loadHistory();
  // Replace today's entry if exists
  const filtered = existing.filter(e => e.date !== today);
  filtered.unshift({
    date: today,
    weatherType: weather.weatherType,
    emoji: weather.emoji,
    label: weather.label,
    energy: weather.energyLevel,
    stress: weather.stressLevel,
  });
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered.slice(0, 30)));
  } catch {
    // QuotaExceededError – ignore; history is best-effort
  }
}

function WeatherTimeline({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) return null;

  const entries = history.slice(0, 7);

  return (
    <FadeInView delay={0.3}>
      <div className="space-y-3">
        <p
          className="font-display text-sm font-semibold"
          style={{ color: "rgba(30,35,55,0.7)" }}
        >
          最近の天気
        </p>
        <div className="relative">
          {/* Timeline line */}
          <div
            className="absolute left-[18px] top-3 bottom-3 w-px"
            style={{ background: "linear-gradient(to bottom, rgba(148,163,184,0.3), rgba(148,163,184,0.05))" }}
          />
          <div className="space-y-0.5">
            {entries.map((entry, i) => {
              const isToday = i === 0;
              const dateLabel = isToday
                ? "今日"
                : i === 1
                  ? "昨日"
                  : new Date(entry.date).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });

              return (
                <motion.div
                  key={entry.date}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.08 }}
                  className="flex items-center gap-3 py-1.5 pl-1"
                >
                  {/* Weather dot */}
                  <motion.div
                    className="relative z-10 w-[38px] h-[38px] rounded-full flex items-center justify-center shrink-0"
                    style={{
                      background: isToday
                        ? WEATHER_GRADIENTS[entry.weatherType]
                        : "rgba(255,255,255,0.6)",
                      boxShadow: isToday
                        ? `0 0 12px ${WEATHER_GLOW_COLORS[entry.weatherType]}`
                        : "none",
                      border: isToday
                        ? "none"
                        : "1px solid rgba(148,163,184,0.2)",
                    }}
                    animate={isToday ? { scale: [1, 1.05, 1] } : {}}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <span className="text-lg">{entry.emoji}</span>
                  </motion.div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm font-medium"
                        style={{ color: isToday ? "rgba(30,35,55,0.88)" : "rgba(30,35,55,0.6)" }}
                      >
                        {entry.label}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono-sg">
                        {dateLabel}
                      </span>
                    </div>
                  </div>

                  {/* Mini energy/stress bar */}
                  <div className="flex gap-1 items-center shrink-0">
                    <div className="w-8 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(5, ((entry.energy + 1) / 2) * 100)}%`,
                          background: "linear-gradient(90deg, #94a3b8, #22c55e)",
                        }}
                      />
                    </div>
                    <div className="w-8 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(5, entry.stress * 100)}%`,
                          background: "linear-gradient(90deg, #86efac, #ef4444)",
                        }}
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </FadeInView>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Weather Pattern Insight
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function WeatherPatternInsight({ history }: { history: HistoryEntry[] }) {
  if (history.length < 2) return null;

  // Detect dominant weather
  const weatherCounts: Partial<Record<WeatherType, number>> = {};
  history.slice(0, 7).forEach(e => {
    weatherCounts[e.weatherType] = (weatherCounts[e.weatherType] ?? 0) + 1;
  });
  const sorted = Object.entries(weatherCounts).sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0]?.[0] as WeatherType | undefined;
  const dominantCount = sorted[0]?.[1] ?? 0;
  const total = history.slice(0, 7).length;

  // Detect trend
  const recentStress = history.slice(0, 3).reduce((s, e) => s + e.stress, 0) / 3;
  const olderStress = history.slice(3, 6).length > 0
    ? history.slice(3, 6).reduce((s, e) => s + e.stress, 0) / history.slice(3, 6).length
    : recentStress;
  const stressTrend = recentStress - olderStress;

  const insights: string[] = [];

  if (dominant && dominantCount >= 3) {
    insights.push(`最近7日のうち${dominantCount}日が「${getWeatherLabel(dominant)}」。あなたの心の気候が見えてきた。`);
  }

  if (stressTrend > 0.15) {
    insights.push("ストレスが上昇傾向にある。身体が先にサインを出しているかもしれない。");
  } else if (stressTrend < -0.15) {
    insights.push("ストレスが緩和傾向にある。何かが変わり始めている証拠だ。");
  }

  if (insights.length === 0) return null;

  return (
    <FadeInView delay={0.5}>
      <GlassCard variant="bordered" padding="md" className="border-indigo-100/50">
        <div className="flex items-start gap-2.5">
          <motion.div
            className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center shrink-0 mt-0.5"
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 4, repeat: Infinity }}
          >
            <span className="text-sm">&#x1F52E;</span>
          </motion.div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-indigo-600">天気のパターン</p>
            {insights.map((ins, i) => (
              <motion.p
                key={i}
                className="text-sm text-slate-600 leading-relaxed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 + i * 0.3 }}
              >
                {ins}
              </motion.p>
            ))}
          </div>
        </div>
      </GlassCard>
    </FadeInView>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function WeatherClient() {
  // Analytics
  useEffect(() => { trackFeatureView("inner_weather"); }, []);

  // Input state
  const [energy, setEnergy] = useState(0.5);
  const [stress, setStress] = useState(0.3);
  const [tone, setTone] = useState<EmotionalTone>("calm");
  const [socialBattery, setSocialBattery] = useState(0.5);
  // Body snapshot (optional somatic layer)
  const [bodyHead, setBodyHead] = useState<"heavy" | "light" | "foggy" | null>(null);
  const [bodyChest, setBodyChest] = useState<"tight" | "open" | "normal" | null>(null);
  const [showBodySection, setShowBodySection] = useState(false);

  // Result state
  const [weather, setWeather] = useState<InnerWeather | null>(null);
  const [defense, setDefense] = useState<DefenseDetection | null>(null);
  const [pressureMap, setPressureMap] = useState<PressureMap | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // History
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);

  // Check if already recorded today — load existing weather from API
  useEffect(() => {
    setHistoryEntries(loadHistory());

    (async () => {
      try {
        const res = await fetch("/api/stargazer/inner-weather", { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.hasRecord && data.weather) {
          const normalized = normalizeApiWeather(data.weather);
          if (normalized) {
            setWeather(normalized);
            setDefense(data.defense ?? null);
            setPressureMap(data.pressureMap ?? null);
            setSubmitted(true);
            setSubmitError(null);
            writeHomeInnerWeatherBridge(normalized, data.recordedAt);
            saveToHistory(normalized);
            setHistoryEntries(loadHistory());
          }
        } else {
          clearHomeInnerWeatherBridge();
          setSubmitError(null);
          setSubmitted(false);
        }
      } catch { /* use local-only history as best effort */ }
    })();
  }, []);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/stargazer/inner-weather", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          energy,
          stress,
          emotionalTone: tone,
          socialBattery,
          bodySnapshot: (bodyHead || bodyChest) ? {
            ...(bodyHead ? { head: bodyHead } : {}),
            ...(bodyChest ? { chest: bodyChest } : {}),
          } : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const normalizedWeather = normalizeApiWeather(data.weather);
        setWeather(normalizedWeather);
        setDefense(data.defense ?? null);
        setPressureMap(data.pressureMap ?? null);
        setSubmitted(true);
        if (normalizedWeather) {
          writeHomeInnerWeatherBridge(normalizedWeather, data.recordedAt);
        }
        // Bridge defense data to localStorage for Alter context
        if (data.defense) {
          try {
            localStorage.setItem("stargazer_inner_weather_latest_v1", JSON.stringify({
              activeDefenses: data.defense.active ? [data.defense.type].filter(Boolean) : [],
              timestamp: new Date().toISOString(),
            }));
          } catch {}
        }
        if (normalizedWeather) {
          saveToHistory(normalizedWeather);
          setHistoryEntries(loadHistory());
        }
        trackInteraction("inner_weather", "weather_observed", { weatherType: data.weather?.weatherType });
      } else {
        setSubmitError("保存に失敗しました。通信状態を確認して、もう一度お試しください。");
      }
    } catch {
      setSubmitError("保存に失敗しました。通信状態を確認して、もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }, [energy, stress, tone, socialBattery]);

  return (
    <div className="relative z-10 min-h-screen pb-32">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/40 border-b border-slate-200/30">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-4 py-3">
          <Link
            href="/stargazer"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            深層観測
          </Link>
          <span className="text-slate-300">/</span>
          <h1
            className="font-display text-lg font-semibold"
            style={{ color: "rgba(30,35,55,0.88)" }}
          >
            心の天気
          </h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">
        <AnimatePresence mode="wait">
          {!submitted ? (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-6"
            >
              <InputSection
                energy={energy}
                setEnergy={setEnergy}
                stress={stress}
                setStress={setStress}
                tone={tone}
                setTone={setTone}
                socialBattery={socialBattery}
                setSocialBattery={setSocialBattery}
                submitting={submitting}
                submitError={submitError}
                onSubmit={handleSubmit}
              />
              {/* Body snapshot (optional somatic layer) */}
              <FadeInView delay={0.22}>
                <button
                  onClick={() => setShowBodySection(!showBodySection)}
                  className="w-full text-left"
                >
                  <GlassCard variant="default" padding="sm">
                    <p className="text-xs text-slate-500">
                      {showBodySection ? "▾" : "▸"} からだの感覚（任意）
                    </p>
                  </GlassCard>
                </button>
                <AnimatePresence>
                  {showBodySection && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <GlassCard variant="default" padding="md" className="mt-2">
                        <div className="space-y-3">
                          <div>
                            <p className="mb-1.5 text-xs font-medium text-slate-600">🧠 頭</p>
                            <div className="flex gap-2">
                              {([["heavy", "🪨", "重い"], ["light", "🪶", "軽い"], ["foggy", "🌫", "ぼんやり"]] as const).map(([val, emoji, label]) => (
                                <button
                                  key={val}
                                  onClick={() => setBodyHead(bodyHead === val ? null : val)}
                                  className={`flex-1 rounded-xl py-2 text-xs transition-all ${
                                    bodyHead === val
                                      ? "bg-slate-900 text-white"
                                      : "bg-white/60 text-slate-500 hover:bg-white/80"
                                  }`}
                                >
                                  {emoji} {label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="mb-1.5 text-xs font-medium text-slate-600">💫 胸</p>
                            <div className="flex gap-2">
                              {([["tight", "😤", "詰まる"], ["open", "😌", "開いている"], ["normal", "😐", "普通"]] as const).map(([val, emoji, label]) => (
                                <button
                                  key={val}
                                  onClick={() => setBodyChest(bodyChest === val ? null : val)}
                                  className={`flex-1 rounded-xl py-2 text-xs transition-all ${
                                    bodyChest === val
                                      ? "bg-slate-900 text-white"
                                      : "bg-white/60 text-slate-500 hover:bg-white/80"
                                  }`}
                                >
                                  {emoji} {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </GlassCard>
                    </motion.div>
                  )}
                </AnimatePresence>
              </FadeInView>
              {/* History timeline on input screen */}
              <WeatherTimeline history={historyEntries} />
              <WeatherPatternInsight history={historyEntries} />
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-6"
            >
              {weather ? (
                <>
                  <WeatherDisplay weather={weather} />
                  {defense?.active && <DefenseAlert defense={defense} />}
                  {pressureMap &&
                    pressureMap.points.length > 0 && (
                      <PressureMapSection pressureMap={pressureMap} />
                    )}
                  <WeatherTimeline history={historyEntries} />
                  <WeatherPatternInsight history={historyEntries} />
                  <div className="pt-2 space-y-2">
                    <Link href="/stargazer">
                      <GlassButton
                        variant="primary"
                        size="sm"
                        fullWidth
                      >
                        深層観測に戻る
                      </GlassButton>
                    </Link>
                  </div>
                </>
              ) : (
                <LoadingSkeleton />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 1: Input
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function InputSection({
  energy,
  setEnergy,
  stress,
  setStress,
  tone,
  setTone,
  socialBattery,
  setSocialBattery,
  submitting,
  submitError,
  onSubmit,
}: {
  energy: number;
  setEnergy: (v: number) => void;
  stress: number;
  setStress: (v: number) => void;
  tone: EmotionalTone;
  setTone: (v: EmotionalTone) => void;
  socialBattery: number;
  setSocialBattery: (v: number) => void;
  submitting: boolean;
  submitError: string | null;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-5">
      <FadeInView delay={0}>
        <div className="text-center space-y-1">
          <p
            className="font-display text-2xl font-semibold"
            style={{ color: "rgba(30,35,55,0.88)" }}
          >
            今の状態
          </p>
          <p className="text-sm text-slate-500">
            5秒で記録。正解はない。今の感覚をそのまま。
          </p>
        </div>
      </FadeInView>

      <FadeInView delay={0.08}>
        <GlassCard variant="elevated" padding="lg">
          <div className="space-y-6">
            <SliderRow
              emoji={energyEmoji(energy)}
              label="エネルギー"
              value={energy}
              onChange={setEnergy}
              trackGradient="linear-gradient(90deg, #94a3b8, #22c55e, #eab308)"
            />
            <SliderRow
              emoji={stressEmoji(stress)}
              label="ストレス"
              value={stress}
              onChange={setStress}
              trackGradient="linear-gradient(90deg, #86efac, #fbbf24, #ef4444)"
            />
            <SliderRow
              emoji={socialEmoji(socialBattery)}
              label="社交バッテリー"
              value={socialBattery}
              onChange={setSocialBattery}
              trackGradient="linear-gradient(90deg, #c4b5fd, #818cf8, #6366f1)"
            />
          </div>
        </GlassCard>
      </FadeInView>

      <FadeInView delay={0.14}>
        <GlassCard variant="default" padding="md">
          <p className="text-sm font-medium text-slate-600 mb-3">感情トーン</p>
          <div className="flex flex-wrap gap-2">
            {TONE_CHIPS.map((chip) => (
              <motion.button
                key={chip.value}
                onClick={() => setTone(chip.value)}
                className={`
                  inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium
                  transition-all duration-200 border
                  ${
                    tone === chip.value
                      ? "bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-900/20"
                      : "bg-white/70 text-slate-600 border-slate-200/60 hover:bg-white hover:border-slate-300"
                  }
                `}
                whileTap={{ scale: 0.95 }}
              >
                <span>{chip.emoji}</span>
                <span>{chip.label}</span>
              </motion.button>
            ))}
          </div>
        </GlassCard>
      </FadeInView>

      {submitError && (
        <FadeInView delay={0.18}>
          <GlassCard variant="bordered" padding="md" className="border-rose-200/70">
            <p className="text-sm font-medium text-rose-600">{submitError}</p>
          </GlassCard>
        </FadeInView>
      )}

      <FadeInView delay={0.2}>
        <GlassButton
          variant="gradient"
          size="lg"
          fullWidth
          loading={submitting}
          onClick={onSubmit}
        >
          天気を観測する
        </GlassButton>
      </FadeInView>
    </div>
  );
}

function SliderRow({
  emoji,
  label,
  value,
  onChange,
  trackGradient,
}: {
  emoji: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  trackGradient: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <span className="text-lg" role="img">{emoji}</span>
      </div>
      <div className="relative h-8 flex items-center">
        <div
          className="absolute inset-x-0 h-2 rounded-full"
          style={{ background: trackGradient, opacity: 0.35 }}
        />
        <div
          className="absolute left-0 h-2 rounded-full transition-all duration-150"
          style={{ width: `${value * 100}%`, background: trackGradient, opacity: 0.7 }}
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-x-0 w-full h-8 appearance-none bg-transparent cursor-pointer z-10
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:shadow-slate-400/30 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-slate-300
            [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125
            [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5
            [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-md
            [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-slate-300"
        />
      </div>
    </div>
  );
}

function energyEmoji(v: number): string {
  if (v > 0.75) return "\uD83D\uDD0B";
  if (v > 0.5) return "\uD83D\uDFE2";
  if (v > 0.25) return "\uD83D\uDFE1";
  return "\uD83D\uDEAB";
}
function stressEmoji(v: number): string {
  if (v > 0.75) return "\u26A1";
  if (v > 0.5) return "\uD83D\uDD25";
  if (v > 0.25) return "\uD83C\uDF2A\uFE0F";
  return "\uD83C\uDF3F";
}
function socialEmoji(v: number): string {
  if (v > 0.75) return "\uD83E\uDD73";
  if (v > 0.5) return "\uD83D\uDE0A";
  if (v > 0.25) return "\uD83D\uDE36";
  return "\uD83E\uDDA2";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 2: Weather Display with SVG Animation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function WeatherDisplay({ weather }: { weather: InnerWeather }) {
  const gradient = WEATHER_GRADIENTS[weather.weatherType];
  const glowColor = WEATHER_GLOW_COLORS[weather.weatherType];
  const WeatherAnim = WEATHER_ANIMATION[weather.weatherType];

  return (
    <FadeInView delay={0}>
      <div className="relative overflow-hidden rounded-3xl">
        {/* Background gradient layer */}
        <div className="absolute inset-0 z-0" style={{ background: gradient }} />

        {/* Animated glow orb */}
        <motion.div
          className="absolute z-0"
          style={{
            top: "15%",
            left: "50%",
            width: 220,
            height: 220,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
            filter: "blur(50px)",
            transform: "translateX(-50%)",
          }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Content */}
        <div className="relative z-10 p-6 pt-4 text-center space-y-3">
          {/* SVG Weather Animation */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 150, damping: 18, delay: 0.1 }}
          >
            <WeatherAnim />
          </motion.div>

          {/* Label */}
          <motion.p
            className="font-display text-3xl font-bold"
            style={{ color: "rgba(30,35,55,0.92)" }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {weather.label}
          </motion.p>

          {/* Poetic report */}
          <motion.p
            className="text-sm leading-relaxed max-w-xs mx-auto"
            style={{ color: "rgba(60,65,85,0.75)" }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
          >
            {weather.description}
          </motion.p>

          {/* Metrics row */}
          <motion.div
            className="flex items-center justify-center gap-3 flex-wrap pt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <MetricChip label="エネルギー" value={weather.energyLevel} format="signed" />
            <MetricChip label="ストレス" value={weather.stressLevel} />
            <MetricChip label="感情" text={getEmotionalToneLabel(weather.emotionalTone)} />
            <MetricChip label="社交" value={weather.socialBattery} />
            <MetricChip label="安定度" value={weather.stability} />
          </motion.div>

          {/* Forecast */}
          {weather.forecast && (
            <motion.div
              className="pt-4 border-t border-slate-200/40"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.75 }}
            >
              <p className="text-xs font-medium text-slate-500 mb-1">明日の見通し</p>
              <p
                className="text-sm italic leading-relaxed"
                style={{ color: "rgba(60,65,85,0.7)" }}
              >
                {weather.forecast}
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </FadeInView>
  );
}

function MetricChip({
  label,
  value,
  text,
  format,
}: {
  label: string;
  value?: number;
  text?: string;
  format?: "signed";
}) {
  const display =
    text ??
    (format === "signed"
      ? (value! >= 0 ? "+" : "") + (value! * 100).toFixed(0)
      : Math.round((value ?? 0) * 100).toString());

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/50 backdrop-blur-sm border border-white/60 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-700">{display}</span>
    </span>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Defense Alert
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DefenseAlert({ defense }: { defense: DefenseDetection }) {
  if (!defense.active || !defense.type) return null;

  const info = getDefenseLabel(defense.type);

  return (
    <FadeInView delay={0.3}>
      <GlassCard
        variant="bordered"
        padding="md"
        className="border-amber-200/60 bg-amber-50/30"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-amber-600 text-lg">{"\uD83D\uDD2E"}</span>
            <p className="text-sm font-semibold text-amber-800">
              {info.label}の気配
            </p>
            <GlassBadge variant="warning" size="sm">
              {Math.round(defense.confidence * 100)}%
            </GlassBadge>
          </div>
          <p className="text-sm text-amber-700/80 leading-relaxed">
            {defense.message || info.description}
          </p>
          {defense.trigger && (
            <p className="text-xs text-amber-600/60 italic">
              {defense.trigger}
            </p>
          )}
        </div>
      </GlassCard>
    </FadeInView>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pressure Map
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pressure Map — Narrative-driven atmospheric design
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ソース × レベル × 方向 → 感情的な一文 */
function pressureNarrative(point: PressurePoint): string {
  const p = point.pressure;
  const src = point.source;
  const dir = point.direction;

  if (src === "internal_conflict") {
    if (p > 0.7) return dir === "building"
      ? "「こうしたい自分」と「こうあるべき自分」が、激しくぶつかり合っています。どちらも本当のあなたです。"
      : "強い葛藤を経験しましたが、少しずつ二つの自分が歩み寄り始めています。";
    if (p > 0.4) return "二つの気持ちの間で、静かな綱引きが起きています。この揺れ自体が、あなたが真剣に向き合っている証拠かもしれません。";
    return "この領域では、自分の中の異なる声がうまく調和しています。";
  }
  if (src === "suppression") {
    if (p > 0.7) return dir === "building"
      ? "本当に感じていることを、かなり深くまで押し込めているようです。その息苦しさは、心が限界を教えてくれているサインです。"
      : "長く抑えていたものが、少しずつ水面に浮かび上がってきています。それは回復の始まりです。";
    if (p > 0.4) return "言葉にしきれない何かを、胸の奥にしまっている感覚があるかもしれません。";
    return "自然体でいられている領域です。無理に何かを隠す必要がない状態。";
  }
  if (src === "overextension") {
    if (p > 0.7) return dir === "building"
      ? "全力を出し続けて、心のバッテリーが残りわずかです。手を緩めても、あなたの価値は何も変わりません。"
      : "力の入れすぎに気づき始めています。「少し休もう」と思えたこと自体が、大きな一歩です。";
    if (p > 0.4) return "もう少しだけ力を抜いてもいいのかもしれません。完璧でなくても、大丈夫です。";
    return "頑張りと休息のバランスが、ちょうどよく保てています。";
  }
  // environmental
  if (p > 0.7) return dir === "building"
    ? "周囲からの期待や空気が、じわじわと重くのしかかっています。あなた自身のペースに戻る時間が必要かもしれません。"
    : "外からの圧力が、少しずつ和らいできています。自分の呼吸を取り戻しつつあります。";
  if (p > 0.4) return "環境からの影響を、いつもより敏感に受け取っているようです。";
  return "外部の影響に左右されず、自分のリズムで過ごせています。";
}

/** 圧力の色（グラデーション用） */
const PRESSURE_PALETTE = {
  high:    { from: "#ef4444", to: "#dc2626", bg: "rgba(239,68,68,0.06)",  accent: "rgba(239,68,68,0.12)" },
  mid:     { from: "#f59e0b", to: "#d97706", bg: "rgba(245,158,11,0.05)", accent: "rgba(245,158,11,0.10)" },
  low:     { from: "#22c55e", to: "#16a34a", bg: "rgba(34,197,94,0.04)",  accent: "rgba(34,197,94,0.08)"  },
  calm:    { from: "#94a3b8", to: "#64748b", bg: "rgba(148,163,184,0.03)",accent: "rgba(148,163,184,0.06)"},
} as const;

function getPalette(pressure: number) {
  if (pressure > 0.7) return PRESSURE_PALETTE.high;
  if (pressure > 0.5) return PRESSURE_PALETTE.mid;
  if (pressure > 0.3) return PRESSURE_PALETTE.low;
  return PRESSURE_PALETTE.calm;
}

/** ソースごとのビジュアル表現 */
const SOURCE_VISUAL: Record<PressurePoint["source"], { icon: string; color: string }> = {
  internal_conflict: { icon: "◈", color: "#a855f7" },  // 紫 — 内なる二面性
  suppression:       { icon: "◇", color: "#3b82f6" },  // 青 — 深く沈めた感情
  overextension:     { icon: "△", color: "#f59e0b" },  // 橙 — 燃え尽き
  environmental:     { icon: "○", color: "#64748b" },  // 灰 — 外部の風
};

function PressureMapSection({ pressureMap }: { pressureMap: PressureMap }) {
  const topPoints = useMemo(
    () => pressureMap.points.slice(0, 5),
    [pressureMap.points]
  );
  const p = pressureMap.overallPressure;
  const palette = getPalette(p);

  // 全体のナラティブ
  const overallNarrative = p > 0.7
    ? "心に大きな負荷がかかっています。少し立ち止まって、自分に優しくする時間をとってください。"
    : p > 0.4
    ? "いくつかの領域で、心のエネルギーに偏りが出ています。気になるところを眺めてみてください。"
    : "全体的に穏やかな状態です。今のあなたは、良いバランスを保てています。";

  // 高圧ポイントと低圧ポイントを分離
  const tensionPoints = topPoints.filter(pt => pt.pressure > 0.4);
  const calmPoints = topPoints.filter(pt => pt.pressure <= 0.4);

  return (
    <FadeInView delay={0.15}>
      <div className="space-y-5">
        {/* ── ヒーロー: 大気圏のメタファー ── */}
        <div
          className="relative rounded-3xl overflow-hidden"
          style={{
            background: `linear-gradient(160deg, rgba(15,23,42,0.02) 0%, ${palette.bg} 40%, rgba(15,23,42,0.01) 100%)`,
            border: `1px solid ${palette.accent}`,
          }}
        >
          {/* 装飾: 呼吸するオーブ */}
          <motion.div
            className="absolute -top-8 -right-8 w-48 h-48 rounded-full"
            style={{
              background: `radial-gradient(circle, ${palette.from}08 0%, transparent 65%)`,
              filter: "blur(30px)",
            }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute -bottom-12 -left-12 w-36 h-36 rounded-full"
            style={{
              background: `radial-gradient(circle, ${palette.to}06 0%, transparent 60%)`,
              filter: "blur(24px)",
            }}
            animate={{ scale: [1.1, 1, 1.1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="relative z-10 p-5 pb-4">
            <p className="font-display text-base font-semibold" style={{ color: "rgba(30,35,55,0.85)" }}>
              心の気圧
            </p>
            <p className="text-[13px] text-slate-600 mt-2 leading-[1.8]">
              {overallNarrative}
            </p>

            {/* 気圧ゲージ: セグメント型 */}
            <div className="mt-4 mb-1">
              <div className="flex gap-[3px]">
                {Array.from({ length: 20 }).map((_, i) => {
                  const threshold = (i + 1) / 20;
                  const filled = p >= threshold;
                  const segColor = threshold > 0.7
                    ? "#ef4444"
                    : threshold > 0.5
                    ? "#f59e0b"
                    : threshold > 0.3
                    ? "#22c55e"
                    : "#94a3b8";
                  return (
                    <motion.div
                      key={i}
                      className="flex-1 rounded-full"
                      style={{
                        height: 6,
                        background: filled ? segColor : "rgba(0,0,0,0.04)",
                        opacity: filled ? (0.5 + (i / 20) * 0.5) : 1,
                      }}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ delay: 0.3 + i * 0.02, duration: 0.3 }}
                    />
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-slate-400">穏やか</span>
                <span className="text-[10px] text-slate-400">高負荷</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 緊張が見られる領域 ── */}
        {tensionPoints.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-slate-400 tracking-wider px-1">
              緊張が見られる領域
            </p>
            <div className="space-y-2">
              {tensionPoints.map((point, i) => (
                <motion.div
                  key={point.axisKey}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.08, ease: "easeOut" }}
                >
                  <PressureNarrativeCard point={point} elevated />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ── 安定している領域 ── */}
        {calmPoints.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-slate-400 tracking-wider px-1">
              安定している領域
            </p>
            <div className="space-y-1.5">
              {calmPoints.map((point, i) => (
                <motion.div
                  key={point.axisKey}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.06, ease: "easeOut" }}
                >
                  <PressureNarrativeCard point={point} />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ── 解放のヒント ── */}
        {pressureMap.releaseRecommendation && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(139,92,246,0.04) 0%, rgba(99,102,241,0.03) 100%)",
              border: "1px solid rgba(139,92,246,0.10)",
            }}
          >
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm"
                  style={{ background: "rgba(139,92,246,0.08)" }}
                >
                  <span style={{ color: "#8b5cf6" }}>✦</span>
                </div>
                <div>
                  <p className="text-xs font-medium" style={{ color: "rgba(139,92,246,0.7)" }}>
                    心を軽くするヒント
                  </p>
                  <p className="text-[13px] text-slate-600 leading-relaxed mt-1">
                    {pressureMap.releaseRecommendation}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </FadeInView>
  );
}

function PressureNarrativeCard({ point, elevated }: { point: PressurePoint; elevated?: boolean }) {
  const palette = getPalette(point.pressure);
  const sv = SOURCE_VISUAL[point.source];
  const narrative = pressureNarrative(point);

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: elevated
          ? `linear-gradient(135deg, rgba(255,255,255,0.9) 0%, ${palette.bg} 100%)`
          : "rgba(255,255,255,0.5)",
        border: elevated
          ? `1px solid ${palette.accent}`
          : "1px solid rgba(0,0,0,0.03)",
      }}
    >
      {/* 微細なグロー（緊張ポイントのみ） */}
      {elevated && (
        <motion.div
          className="absolute -top-4 -right-4 w-24 h-24 rounded-full"
          style={{
            background: `radial-gradient(circle, ${palette.from}10 0%, transparent 70%)`,
            filter: "blur(16px)",
          }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <div className="relative z-10 p-4">
        <div className="flex items-start gap-3.5">
          {/* ソース記号 */}
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              background: elevated ? `${sv.color}08` : "rgba(0,0,0,0.02)",
              border: `1px solid ${elevated ? `${sv.color}15` : "rgba(0,0,0,0.03)"}`,
            }}
          >
            <span
              className="text-base font-light"
              style={{ color: elevated ? sv.color : "#94a3b8" }}
            >
              {sv.icon}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            {/* 軸名 */}
            <p className="text-sm font-medium text-slate-800 leading-snug">
              {point.axisLabel}
            </p>

            {/* ナラティブ */}
            <p className="text-[13px] text-slate-500 leading-[1.75] mt-1.5">
              {narrative}
            </p>

            {/* フッター: ソース + 方向 */}
            <div className="flex items-center gap-3 mt-2.5">
              <GlassBadge
                variant={
                  point.source === "internal_conflict"
                    ? "danger"
                    : point.source === "suppression"
                    ? "warning"
                    : point.source === "overextension"
                    ? "info"
                    : "secondary"
                }
                size="sm"
              >
                {getPressureSourceLabel(point.source)}
              </GlassBadge>
              <span className="text-[11px] text-slate-400">
                {directionIcon[point.direction]} {directionLabel[point.direction]}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Loading skeleton
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton variant="rectangular" height={280} className="w-full" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton variant="rectangular" height={100} />
        <Skeleton variant="rectangular" height={100} />
        <Skeleton variant="rectangular" height={100} />
        <Skeleton variant="rectangular" height={100} />
      </div>
    </div>
  );
}
