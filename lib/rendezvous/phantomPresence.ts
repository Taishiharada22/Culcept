// ============================================================
// Phantom Presence — 共鳴する誰かの気配
// 「近くに共鳴する誰かがいる」という微かな認知を生むシグナル
// 片想い非表示原則を完全に遵守しつつ、期待感を創出する
// ============================================================

import type { RendezvousCategory } from "./types";

// ---------- Types ----------

export type ResonanceHint = "deep" | "warm" | "electric" | "calm";

export type PhantomSignal = {
  /** 強度: 0..1 (近い共鳴ほど強い) */
  intensity: number;
  /** ぼかされた共鳴カテゴリ */
  resonanceHint: ResonanceHint;
  /** 時間帯の重なり */
  temporalOverlap: boolean;
  /** ポエティックなメッセージ */
  message: string;
  /** 生成時刻 */
  generatedAt: string;
  /** 有効期限 (30分) */
  expiresAt: string;
};

// ---------- Constants ----------

const PHANTOM_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MIN_RESONANCE_SCORE = 60;
const MAX_SIGNALS_PER_DAY = 3;

/** Resonance hint thresholds: score → hint */
const HINT_THRESHOLDS: { min: number; hint: ResonanceHint }[] = [
  { min: 85, hint: "deep" },
  { min: 75, hint: "electric" },
  { min: 65, hint: "warm" },
  { min: 0, hint: "calm" },
];

/** Message templates by hint + time-of-day band */
const MESSAGE_TEMPLATES: Record<ResonanceHint, Record<"night" | "dawn" | "day" | "evening", string[]>> = {
  deep: {
    night: [
      "深い共鳴が、静かな夜に鳴り響いています",
      "夜の奥で、あなたと同じ音を出す誰かがいます",
    ],
    dawn: [
      "朝の光の中に、深い共鳴が揺れています",
      "目覚めの瞬間に、深い波動を感じてください",
    ],
    day: [
      "深い共鳴が、近くで鳴っています",
      "今この瞬間、深い響きが交差しています",
    ],
    evening: [
      "夕暮れの中で、深い共鳴が近づいています",
      "日が沈む頃、深い何かが重なりました",
    ],
  },
  warm: {
    night: [
      "温かい気配が、夜の静けさに溶けています",
      "眠りにつく前に、温かい光を感じてください",
    ],
    dawn: [
      "朝露のように、温かい気配が漂っています",
      "新しい一日に、温かい光が差し込んでいます",
    ],
    day: [
      "温かい気配が、ここにいます",
      "穏やかな温もりが、今この場所に存在しています",
    ],
    evening: [
      "温かい余韻が、夕空に残っています",
      "一日の終わりに、温かい誰かの気配がしました",
    ],
  },
  electric: {
    night: [
      "夜の帳の向こうで、電流のような何かが走っています",
      "静寂を貫く、刺激的な波長が近くにあります",
    ],
    dawn: [
      "朝の空気に、電撃のような共鳴が混じっています",
      "新しい始まりに、刺激的な何かが待っています",
    ],
    day: [
      "刺激的な何かが、交差しようとしています",
      "今、あなたの近くで電流が走りました",
    ],
    evening: [
      "夕暮れの風に、刺激的な予感が混じっています",
      "日没とともに、スパークのような何かを感じました",
    ],
  },
  calm: {
    night: [
      "穏やかな波長が、夜の底で重なっています",
      "深夜の静寂に、穏やかな共鳴が溶けています",
    ],
    dawn: [
      "朝の光と共に、穏やかな波長が広がっています",
      "目覚めの瞬間、穏やかなシンクロが始まっています",
    ],
    day: [
      "穏やかな波長が、重なっています",
      "静かな共鳴が、あなたの近くで生まれています",
    ],
    evening: [
      "穏やかな気配が、夕空に溶けていきます",
      "一日の終わりに、穏やかな波が届いています",
    ],
  },
};

// ---------- Helpers ----------

function getTimeBand(hour: number): "night" | "dawn" | "day" | "evening" {
  if (hour >= 0 && hour < 5) return "night";
  if (hour >= 5 && hour < 9) return "dawn";
  if (hour >= 9 && hour < 17) return "day";
  if (hour >= 17 && hour < 21) return "evening";
  return "night"; // 21-24
}

/**
 * Map resonance score (60..100) → intensity (0.3..1.0)
 */
function scoreToIntensity(score: number): number {
  const clamped = Math.max(MIN_RESONANCE_SCORE, Math.min(100, score));
  // Linear interpolation: 60 → 0.3, 100 → 1.0
  return 0.3 + ((clamped - 60) / 40) * 0.7;
}

/**
 * Determine resonance hint from score
 */
function scoreToHint(score: number): ResonanceHint {
  for (const { min, hint } of HINT_THRESHOLDS) {
    if (score >= min) return hint;
  }
  return "calm";
}

/**
 * Simple deterministic hash for message selection
 * (repeatable for same inputs within a time window)
 */
function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ---------- Main API ----------

/**
 * Generate a phantom signal from nearby resonant users.
 * IMPORTANT: Never reveals identity, count, or specifics.
 *
 * @param resonantCount  Number of resonant users currently active
 * @param topResonanceScore  Highest resonance score with any active user
 * @param _category  Rendezvous category (reserved for future category-specific messages)
 * @param timeOfDay  Current hour (0-23)
 * @param signalsSentToday  How many signals already sent today for this user
 * @returns PhantomSignal or null if conditions are not met
 */
export function generatePhantomSignal(
  resonantCount: number,
  topResonanceScore: number,
  _category: RendezvousCategory,
  timeOfDay: number,
  signalsSentToday: number = 0,
): PhantomSignal | null {
  // Gate: no signal if nobody is resonant enough
  if (resonantCount <= 0 || topResonanceScore < MIN_RESONANCE_SCORE) {
    return null;
  }

  // Gate: max 3 signals per day
  if (signalsSentToday >= MAX_SIGNALS_PER_DAY) {
    return null;
  }

  const now = new Date();
  const intensity = scoreToIntensity(topResonanceScore);
  const resonanceHint = scoreToHint(topResonanceScore);
  const timeBand = getTimeBand(timeOfDay);

  // Determine temporal overlap (resonant user active in same time band → true)
  const temporalOverlap = resonantCount > 0;

  // Pick message deterministically based on time + hint
  const candidates = MESSAGE_TEMPLATES[resonanceHint][timeBand];
  const seed = simpleHash(`${now.toISOString().slice(0, 13)}-${resonanceHint}`);
  const message = candidates[seed % candidates.length];

  const generatedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + PHANTOM_TTL_MS).toISOString();

  return {
    intensity,
    resonanceHint,
    temporalOverlap,
    message,
    generatedAt,
    expiresAt,
  };
}

/**
 * Check if a phantom signal is still valid (not expired)
 */
export function isPhantomSignalActive(signal: PhantomSignal): boolean {
  return new Date(signal.expiresAt).getTime() > Date.now();
}

/**
 * Get the color associated with a resonance hint
 */
export function getPhantomColor(hint: ResonanceHint): string {
  const colors: Record<ResonanceHint, string> = {
    deep: "#6366F1",
    warm: "#F59E0B",
    electric: "#EC4899",
    calm: "#06B6D4",
  };
  return colors[hint];
}
