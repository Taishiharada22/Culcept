// hooks/useClickSound.ts
// 質問回答時のクリック音 — Netflix風の短い「カチッ」
// Web Audio API でオシレーター生成。外部ファイル不要。
// マナーモード / ミュート時は haptics のみにフォールバック。
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHaptics } from "./useHaptics";

const LS_KEY = "sg_click_sound_enabled";

// ---------------------------------------------------------------------------
// Sound synthesis — 50-80ms の短いクリック
// ---------------------------------------------------------------------------

function playClick(ctx: AudioContext, masterGain: GainNode): void {
  const now = ctx.currentTime;

  // Layer 1: 高域のアタック音（クリックの「カチッ」部分）
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = "square";
  osc1.frequency.setValueAtTime(1800, now);
  osc1.frequency.exponentialRampToValueAtTime(600, now + 0.04);
  gain1.gain.setValueAtTime(0.12, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  osc1.connect(gain1).connect(masterGain);
  osc1.start(now);
  osc1.stop(now + 0.06);

  // Layer 2: 低域の「コッ」感（ボディ感を出す）
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(400, now);
  osc2.frequency.exponentialRampToValueAtTime(150, now + 0.05);
  gain2.gain.setValueAtTime(0.08, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  osc2.connect(gain2).connect(masterGain);
  osc2.start(now);
  osc2.stop(now + 0.05);

  // Layer 3: ノイズバースト（質感）
  const bufferSize = Math.floor(ctx.sampleRate * 0.03); // 30ms
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
  }
  const noiseSrc = ctx.createBufferSource();
  const noiseGain = ctx.createGain();
  const noiseFilter = ctx.createBiquadFilter();
  noiseSrc.buffer = noiseBuffer;
  noiseFilter.type = "highpass";
  noiseFilter.frequency.value = 2000;
  noiseGain.gain.setValueAtTime(0.04, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  noiseSrc.connect(noiseFilter).connect(noiseGain).connect(masterGain);
  noiseSrc.start(now);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface ClickSoundAPI {
  /** クリック音を鳴らす（ミュート時はhapticsのみ） */
  play: () => void;
  /** 音のON/OFF */
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}

export function useClickSound(): ClickSoundAPI {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const haptics = useHaptics();

  const [enabled, setEnabledState] = useState(true);

  // localStorage から復元
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored !== null) setEnabledState(stored === "true");
    } catch {
      // SSR or private browsing
    }
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try {
      localStorage.setItem(LS_KEY, String(v));
    } catch {
      // ignore
    }
  }, []);

  // AudioContext の lazy init（ユーザージェスチャー起点で作る）
  const ensureContext = useCallback((): {
    ctx: AudioContext;
    masterGain: GainNode;
  } | null => {
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      // suspended なら resume（iOS Safari 対策）
      if (ctxRef.current.state === "suspended") {
        ctxRef.current.resume();
      }
      return { ctx: ctxRef.current, masterGain: masterGainRef.current! };
    }
    try {
      const ctx = new AudioContext();
      const masterGain = ctx.createGain();
      // システム音量の 30-40% に抑える
      masterGain.gain.value = 0.35;
      masterGain.connect(ctx.destination);
      ctxRef.current = ctx;
      masterGainRef.current = masterGain;
      return { ctx, masterGain };
    } catch {
      return null;
    }
  }, []);

  const play = useCallback(() => {
    // 常に haptics は鳴らす（マナーモードでもフィードバックになる）
    haptics.playPattern("question_confirm");

    if (!enabled) return;

    const audio = ensureContext();
    if (!audio) return;

    playClick(audio.ctx, audio.masterGain);
  }, [enabled, ensureContext, haptics]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (ctxRef.current && ctxRef.current.state !== "closed") {
        ctxRef.current.close();
      }
    };
  }, []);

  return { play, enabled, setEnabled };
}
