"use client";

import { createContext, useContext, useRef, useCallback, useState, useEffect, type ReactNode } from "react";
import {
  playRendezvousSound,
  DEFAULT_SOUND_SETTINGS,
  type SoundEvent,
  type SoundSettings,
  type SoundOptions,
} from "@/lib/rendezvous/soundDesign";

// =============================================================================
// SoundProvider - サウンドコンテキスト
// Web Audio APIの遅延初期化 + ユーザー設定管理
// デフォルトOFF、opt-in設計
// =============================================================================

type SoundContextValue = {
  /** サウンドを再生 */
  play: (event: SoundEvent, options?: SoundOptions) => void;
  /** サウンド設定 */
  settings: SoundSettings;
  /** サウンドON/OFF切替 */
  toggleEnabled: () => void;
  /** 音量変更 */
  setVolume: (volume: number) => void;
};

const SoundContext = createContext<SoundContextValue>({
  play: () => {},
  settings: DEFAULT_SOUND_SETTINGS,
  toggleEnabled: () => {},
  setVolume: () => {},
});

export const useSoundContext = () => useContext(SoundContext);

const STORAGE_KEY = "rendezvous_sound_settings_v1";

type SoundProviderProps = {
  children: ReactNode;
};

export function SoundProvider({ children }: SoundProviderProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [settings, setSettings] = useState<SoundSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_SOUND_SETTINGS;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored) as SoundSettings;
    } catch { /* ignore */ }
    return DEFAULT_SOUND_SETTINGS;
  });

  // 設定変更時にlocalStorageに保存
  const updateSettings = useCallback((next: SoundSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  // AudioContextの遅延初期化（ユーザー操作後にのみ作成）
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    // suspended状態なら再開
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const play = useCallback(
    (event: SoundEvent, options?: SoundOptions) => {
      if (!settings.enabled) return;

      // イベント個別設定チェック
      const eventEnabled = settings.eventSettings[event];
      if (eventEnabled === false) return;

      try {
        const ctx = getAudioContext();
        playRendezvousSound(ctx, event, {
          volume: (options?.volume ?? 1) * settings.volume,
          ...options,
        });
      } catch {
        // Audio API not available
      }
    },
    [settings, getAudioContext],
  );

  const toggleEnabled = useCallback(() => {
    updateSettings({ ...settings, enabled: !settings.enabled });
  }, [settings, updateSettings]);

  const setVolume = useCallback(
    (volume: number) => {
      updateSettings({ ...settings, volume: Math.max(0, Math.min(1, volume)) });
    },
    [settings, updateSettings],
  );

  return (
    <SoundContext.Provider value={{ play, settings, toggleEnabled, setVolume }}>
      {children}
    </SoundContext.Provider>
  );
}
