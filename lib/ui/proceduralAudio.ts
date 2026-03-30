// lib/ui/proceduralAudio.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Web Audio API ベースのプロシージャルサウンド生成
// 外部ファイル不要 — 全てコードで生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { safeLSSet } from "@/lib/safeLocalStorage";

const MUTE_KEY = "aneurasync_sound_mute_v1";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

/** ミュート状態を取得 */
export function isMuted(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(MUTE_KEY) === "true";
}

/** ミュート状態を設定 */
export function setMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  safeLSSet(MUTE_KEY, String(muted));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Ambient Drone — 持続的な低周波ドローン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DroneHandle {
  /** ドローンを停止（フェードアウト付き） */
  stop: (fadeMs?: number) => void;
  /** ピッチを変更（スムーズ遷移） */
  setPitch: (hz: number, durationMs?: number) => void;
  /** ボリュームを変更 */
  setVolume: (vol: number, durationMs?: number) => void;
}

type DroneType = "warm" | "soft" | "deep";

const DRONE_CONFIG: Record<DroneType, { hz: number; type: OscillatorType; volume: number }> = {
  warm: { hz: 85, type: "sine", volume: 0.06 },
  soft: { hz: 120, type: "sine", volume: 0.04 },
  deep: { hz: 55, type: "sine", volume: 0.05 },
};

/**
 * アンビエントドローンを開始
 * @param type ドローンタイプ
 * @param fadeInMs フェードイン時間（ms）
 * @returns DroneHandle（停止・調整用）
 */
export function startDrone(type: DroneType = "warm", fadeInMs = 2000): DroneHandle | null {
  if (isMuted()) return null;
  const ctx = getAudioContext();
  if (!ctx) return null;

  const config = DRONE_CONFIG[type];
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = config.type;
  osc.frequency.value = config.hz;
  gain.gain.value = 0;

  // Subtle LFO for organic movement
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.15; // Very slow wobble
  lfoGain.gain.value = 2; // ±2Hz wobble
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  lfo.start();

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();

  // Fade in
  gain.gain.linearRampToValueAtTime(config.volume, ctx.currentTime + fadeInMs / 1000);

  return {
    stop(fadeMs = 1500) {
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeMs / 1000);
      setTimeout(() => {
        try {
          osc.stop();
          lfo.stop();
        } catch { /* already stopped */ }
      }, fadeMs + 100);
    },
    setPitch(hz, durationMs = 1000) {
      osc.frequency.linearRampToValueAtTime(hz, ctx.currentTime + durationMs / 1000);
    },
    setVolume(vol, durationMs = 500) {
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + durationMs / 1000);
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Accent Sounds — ワンショット短音
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type AccentType = "crystal" | "bell" | "breath_in" | "breath_out" | "silence";

/**
 * アクセント音を再生（ワンショット）
 */
export function playAccent(type: AccentType): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  switch (type) {
    case "crystal": {
      // 高周波チャイム — 回答タップ時
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880 + Math.random() * 200;
      gain.gain.value = 0.08;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
      break;
    }
    case "bell": {
      // 低めのベル音 — insight表示時
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 440;
      gain.gain.value = 0.1;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      // Frequency sweep down
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1.2);
      break;
    }
    case "breath_in": {
      // フィルタードノイズ（吸う音） — 呼吸フェーズ
      const bufferSize = ctx.sampleRate * 0.8;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.02;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 600;
      filter.Q.value = 2;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.4);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start();
      break;
    }
    case "breath_out": {
      // フィルタードノイズ（吐く音）
      const bufferSize = ctx.sampleRate * 1.0;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.015;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 400;
      const gain = ctx.createGain();
      gain.gain.value = 0.03;
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.0);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start();
      break;
    }
    case "silence":
      // 意図的な無音（パンチライン前のドラマチックポーズ）
      break;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Resume AudioContext (ユーザーインタラクション後に呼ぶ)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function resumeAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume();
  }
}
