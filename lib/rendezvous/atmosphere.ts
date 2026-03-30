// ============================================================
// Rendezvous Atmosphere – ライトウォーム大気システム
// 温かみのある白ベースに、ワインレッド〜オレンジの色彩が呼吸する
// ============================================================

import type { TimeSlot } from "./avatarScheduler";

// ---------- Types ----------

export type TimeAtmosphere = {
  timeSlot: TimeSlot;
  bgGradient: string;
  particleColor: string;
  particleOpacity: number;
  particleSpeed: number;
  particleCount: number;
  accentColor: string;
  ambientLabel: string;
};

export type ParticleConfig = {
  count: number;
  sizeRange: [number, number];
  speedRange: [number, number];
  color: string;
  opacity: number;
  glowRadius: number;
};

export type ConstellationMergeConfig = {
  starCountA: number;
  starCountB: number;
  mergeColor: string;
  burstColor: string;
  durationMs: number;
};

// ---------- Time Slot Atmospheres ----------
// dawn (5-7), morning (7-12), midday (12-14),
// afternoon (14-17), evening (17-21), night (21-5)

const ATMOSPHERES: Record<TimeSlot, TimeAtmosphere> = {
  dawn: {
    timeSlot: "dawn",
    bgGradient:
      "linear-gradient(180deg, #FFF8F0 0%, #FFF0E6 30%, #FFE4D6 60%, #FFDAC8 100%)",
    particleColor: "#C2185B",
    particleOpacity: 0.15,
    particleSpeed: 0.2,
    particleCount: 20,
    accentColor: "#C2185B",
    ambientLabel: "夜明けの鼓動",
  },
  morning: {
    timeSlot: "morning",
    bgGradient:
      "linear-gradient(180deg, #FAFAF8 0%, #FFF8F2 30%, #FFF5EC 60%, #FAFAF8 100%)",
    particleColor: "#FF8F00",
    particleOpacity: 0.12,
    particleSpeed: 0.3,
    particleCount: 18,
    accentColor: "#FF8F00",
    ambientLabel: "静かな期待",
  },
  midday: {
    timeSlot: "midday",
    bgGradient:
      "linear-gradient(180deg, #FAFAF8 0%, #F5F3F0 40%, #FAFAF8 100%)",
    particleColor: "#7B61FF",
    particleOpacity: 0.10,
    particleSpeed: 0.4,
    particleCount: 15,
    accentColor: "#7B61FF",
    ambientLabel: "思考の深み",
  },
  afternoon: {
    timeSlot: "afternoon",
    bgGradient:
      "linear-gradient(180deg, #FAFAF8 0%, #FFF5EC 30%, #FFEDE0 60%, #FFF8F2 100%)",
    particleColor: "#E91E63",
    particleOpacity: 0.12,
    particleSpeed: 0.25,
    particleCount: 20,
    accentColor: "#E91E63",
    ambientLabel: "高まる予感",
  },
  evening: {
    timeSlot: "evening",
    bgGradient:
      "linear-gradient(180deg, #FFF5EC 0%, #FFE8DC 25%, #FFD6CC 55%, #F8E8F0 100%)",
    particleColor: "#C2185B",
    particleOpacity: 0.18,
    particleSpeed: 0.15,
    particleCount: 25,
    accentColor: "#C2185B",
    ambientLabel: "温もりの時間",
  },
  night: {
    timeSlot: "night",
    bgGradient:
      "linear-gradient(180deg, #F8E8F0 0%, #F0E4F0 30%, #EBE0F0 60%, #F5F0F8 100%)",
    particleColor: "#7B61FF",
    particleOpacity: 0.15,
    particleSpeed: 0.1,
    particleCount: 22,
    accentColor: "#7B61FF",
    ambientLabel: "穏やかな親密さ",
  },
};

// ---------- Public API ----------

export function getCurrentTimeSlotLocal(): TimeSlot {
  const h = new Date().getHours();
  if (h >= 5 && h < 7) return "dawn";
  if (h >= 7 && h < 12) return "morning";
  if (h >= 12 && h < 14) return "midday";
  if (h >= 14 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

export function getTimeAtmosphere(timeSlot: TimeSlot): TimeAtmosphere {
  return ATMOSPHERES[timeSlot] ?? ATMOSPHERES.morning;
}

export function getParticleConfig(
  timeSlot: TimeSlot,
  scrollProgress: number = 0,
): ParticleConfig {
  const atm = getTimeAtmosphere(timeSlot);
  const scrollBoost = scrollProgress * 0.3;
  return {
    count: atm.particleCount,
    sizeRange: [2, 5],
    speedRange: [
      atm.particleSpeed * 0.5,
      atm.particleSpeed * (1 + scrollBoost),
    ],
    color: atm.particleColor,
    opacity: atm.particleOpacity,
    glowRadius: 6,
  };
}

export function getConstellationMergeConfig(): ConstellationMergeConfig {
  return {
    starCountA: 12,
    starCountB: 12,
    mergeColor: "#FF8F00",
    burstColor: "#C2185B",
    durationMs: 3000,
  };
}

// ============================================================
// Immersive Atmosphere v3 – ライトウォーム6ゾーンシステム
// 温かみのある白ベースに時間帯ごとの柔らかな色変化
// ============================================================

export type TimeZone = "dawn" | "morning" | "noon" | "evening" | "night" | "midnight";

export type AtmosphereTheme = {
  zone: TimeZone;
  label: string;
  bg: string;
  textPrimary: string;
  textSecondary: string;
  cardBg: string;
  cardBorder: string;
  accent: string;
  particleColor: string;
};

const ATMOSPHERE_THEMES: Record<TimeZone, AtmosphereTheme> = {
  dawn: {
    zone: "dawn",
    label: "夜明け",
    // 温かなピーチ色の朝焼け — 新しい出会いの予感
    bg: "linear-gradient(180deg, #FFF8F0 0%, #FFF0E6 30%, #FFE4D6 60%, #FFDAC8 100%)",
    textPrimary: "#1A1025",
    textSecondary: "#6B6580",
    cardBg: "rgba(255,255,255,0.85)",
    cardBorder: "rgba(26,16,37,0.06)",
    accent: "#C2185B",
    particleColor: "#C2185B",
  },
  morning: {
    zone: "morning",
    label: "朝",
    // 明るく澄んだウォームホワイト — 活動的な時間
    bg: "linear-gradient(180deg, #FAFAF8 0%, #FFF8F2 35%, #FFF5EC 70%, #FAFAF8 100%)",
    textPrimary: "#1A1025",
    textSecondary: "#6B6580",
    cardBg: "rgba(255,255,255,0.90)",
    cardBorder: "rgba(26,16,37,0.06)",
    accent: "#FF8F00",
    particleColor: "#FF8F00",
  },
  noon: {
    zone: "noon",
    label: "昼",
    // クリーンなライトベース — 集中と知性の時間
    bg: "linear-gradient(180deg, #FAFAF8 0%, #F5F3F0 40%, #FAFAF8 70%, #F5F3F0 100%)",
    textPrimary: "#1A1025",
    textSecondary: "#6B6580",
    cardBg: "rgba(255,255,255,0.92)",
    cardBorder: "rgba(26,16,37,0.06)",
    accent: "#7B61FF",
    particleColor: "#7B61FF",
  },
  evening: {
    zone: "evening",
    label: "夕方",
    // 柔らかなピンクとオレンジ — 温もりが増す時間帯
    bg: "linear-gradient(180deg, #FFF5EC 0%, #FFE8DC 25%, #FFD6CC 50%, #F8E8F0 80%, #FFF5EC 100%)",
    textPrimary: "#1A1025",
    textSecondary: "#6B6580",
    cardBg: "rgba(255,255,255,0.85)",
    cardBorder: "rgba(26,16,37,0.06)",
    accent: "#C2185B",
    particleColor: "#E91E63",
  },
  night: {
    zone: "night",
    label: "夜",
    // 穏やかなラベンダーとピンク — 親密さが深まる時間
    bg: "linear-gradient(180deg, #F8E8F0 0%, #F0E4F0 25%, #EBE0F0 55%, #F5F0F8 100%)",
    textPrimary: "#1A1025",
    textSecondary: "#6B6580",
    cardBg: "rgba(255,255,255,0.88)",
    cardBorder: "rgba(26,16,37,0.06)",
    accent: "#7B61FF",
    particleColor: "#9B8FFF",
  },
  midnight: {
    zone: "midnight",
    label: "深夜",
    // ライトラベンダーと淡いピンク — 静かな繋がりの時間
    bg: "linear-gradient(180deg, #F5F0F8 0%, #EDE8F5 30%, #F0E4F0 60%, #F8F0F5 100%)",
    textPrimary: "#1A1025",
    textSecondary: "#6B6580",
    cardBg: "rgba(255,255,255,0.85)",
    cardBorder: "rgba(26,16,37,0.06)",
    accent: "#C2185B",
    particleColor: "#E91E63",
  },
};

const GREETINGS: Record<TimeZone, string> = {
  dawn: "夜明けの空気が、新しい出会いの予感を運んでいます",
  morning: "分身は既に動き出しています。誰かがあなたに気づいたかもしれません",
  noon: "分身は活発に探索しています。高まる共鳴を感じていますか",
  evening: "今夜、特別な接続が生まれるかもしれません",
  night: "深い夜。本当の自分が現れる時間です",
  midnight: "深夜の静寂。最も深い繋がりが生まれる特別な時間です",
};

export function getTimeZone(hour?: number): TimeZone {
  const h = hour ?? new Date().getHours();
  if (h >= 5 && h < 7) return "dawn";
  if (h >= 7 && h < 10) return "morning";
  if (h >= 10 && h < 16) return "noon";
  if (h >= 16 && h < 19) return "evening";
  if (h >= 19 && h < 23) return "night";
  return "midnight";
}

export function getAtmosphere(hour?: number): AtmosphereTheme {
  const zone = getTimeZone(hour);
  return ATMOSPHERE_THEMES[zone];
}

export function getGreeting(): string {
  const zone = getTimeZone();
  return GREETINGS[zone];
}
