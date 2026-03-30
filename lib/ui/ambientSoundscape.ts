// lib/ui/ambientSoundscape.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Ambient Soundscape — Inner Weather連動サウンドスケープ
//
// Calmの原則: 音・視覚・触覚の統合が「存在感」を作る。
// アプリを開いた瞬間に「今の自分の音」が聞こえる体験。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { WeatherType } from "./psycheReactiveAtmosphere";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SoundscapeConfig {
  /** 環境音のファイルパス */
  ambientPath: string;
  /** 環境音の基準ボリューム（0-1） */
  ambientVolume: number;
  /** 効果音（オプション、定期的に再生） */
  accentPath: string | null;
  /** 効果音の間隔（ms） */
  accentIntervalMs: number;
  /** 効果音のボリューム */
  accentVolume: number;
  /** フェードイン時間（ms） */
  fadeInMs: number;
  /** フェードアウト時間（ms） */
  fadeOutMs: number;
  /** ループするか */
  loop: boolean;
}

export interface SoundscapeState {
  /** 現在の天候 */
  currentWeather: WeatherType | null;
  /** 再生中か */
  isPlaying: boolean;
  /** ユーザーがミュートしたか */
  isMuted: boolean;
  /** 現在のボリューム */
  volume: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Weather-Sound Mapping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 天候ごとの音の設計
 *
 * 実際の音声ファイルは public/sounds/ に配置。
 * このファイルはロジック（選択・ボリューム制御）のみ。
 */
const WEATHER_SOUNDS: Record<WeatherType, SoundscapeConfig> = {
  sunny: {
    ambientPath: "/sounds/ambient-warm.mp3",
    ambientVolume: 0.15,
    accentPath: "/sounds/accent-birds.mp3",
    accentIntervalMs: 15000,
    accentVolume: 0.1,
    fadeInMs: 2000,
    fadeOutMs: 1500,
    loop: true,
  },
  cloudy: {
    ambientPath: "/sounds/ambient-soft.mp3",
    ambientVolume: 0.12,
    accentPath: null,
    accentIntervalMs: 0,
    accentVolume: 0,
    fadeInMs: 2500,
    fadeOutMs: 2000,
    loop: true,
  },
  rainy: {
    ambientPath: "/sounds/ambient-rain.mp3",
    ambientVolume: 0.2,
    accentPath: "/sounds/accent-piano.mp3",
    accentIntervalMs: 20000,
    accentVolume: 0.08,
    fadeInMs: 3000,
    fadeOutMs: 2000,
    loop: true,
  },
  stormy: {
    ambientPath: "/sounds/ambient-storm.mp3",
    ambientVolume: 0.18,
    accentPath: "/sounds/accent-thunder.mp3",
    accentIntervalMs: 12000,
    accentVolume: 0.15,
    fadeInMs: 1500,
    fadeOutMs: 1000,
    loop: true,
  },
  foggy: {
    ambientPath: "/sounds/ambient-drone.mp3",
    ambientVolume: 0.1,
    accentPath: null,
    accentIntervalMs: 0,
    accentVolume: 0,
    fadeInMs: 4000,
    fadeOutMs: 3000,
    loop: true,
  },
  windy: {
    ambientPath: "/sounds/ambient-wind.mp3",
    ambientVolume: 0.15,
    accentPath: "/sounds/accent-chimes.mp3",
    accentIntervalMs: 18000,
    accentVolume: 0.08,
    fadeInMs: 2000,
    fadeOutMs: 1500,
    loop: true,
  },
  snow: {
    ambientPath: "/sounds/ambient-silence.mp3",
    ambientVolume: 0.08,
    accentPath: "/sounds/accent-crystal.mp3",
    accentIntervalMs: 25000,
    accentVolume: 0.06,
    fadeInMs: 5000,
    fadeOutMs: 4000,
    loop: true,
  },
  aurora: {
    ambientPath: "/sounds/ambient-aurora.mp3",
    ambientVolume: 0.15,
    accentPath: "/sounds/accent-shimmer.mp3",
    accentIntervalMs: 10000,
    accentVolume: 0.1,
    fadeInMs: 3000,
    fadeOutMs: 2000,
    loop: true,
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Entry Points
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 天候からサウンドスケープ設定を取得 */
export function getSoundscapeConfig(weather: WeatherType): SoundscapeConfig {
  return WEATHER_SOUNDS[weather];
}

/** ユーザーのミュート設定を読み込み */
export function loadMutePreference(): boolean {
  if (typeof window === "undefined") return true; // SSRではデフォルトミュート
  try {
    const stored = localStorage.getItem("aneurasync_sound_muted");
    // 未設定の場合はデフォルトミュート（音声アセット未配置時の404回避）
    if (stored === null) return true;
    return stored === "true";
  } catch {
    return true;
  }
}

/** ミュート設定を保存 */
export function saveMutePreference(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("aneurasync_sound_muted", String(muted));
  } catch {}
}

/** ストレスレベルに応じたボリューム調整 */
export function adjustVolumeByStress(
  baseVolume: number,
  stressLevel: number,
): number {
  // ストレスが高いとき: ボリュームを少し下げる（刺激軽減）
  // ストレスが低いとき: 通常ボリューム
  const stressAdjustment = stressLevel > 0.6 ? 0.7 : stressLevel > 0.3 ? 0.85 : 1.0;
  return Math.min(1, baseVolume * stressAdjustment);
}
