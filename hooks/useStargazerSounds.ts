// hooks/useStargazerSounds.ts
// Web Audio API による Stargazer サウンドデザイン
// 外部オーディオファイル不要 — オシレーターで全て生成
// v2: リバーブ・ディレイ・フィルター・ハーモニクスを追加し温かみのある音響に
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHaptics, type HapticPatternName } from "./useHaptics";

const LS_KEY = "sg_sound_enabled";
const LS_VOLUME_KEY = "sg_sound_volume";

// ---------------------------------------------------------------------------
// Note frequencies (Hz)
// ---------------------------------------------------------------------------

const NOTE = {
  C2: 65.41,
  A2: 110.0,
  C3: 130.81,
  E3: 164.81,
  G3: 196.0,
  C4: 261.63,
  Db4: 277.18,
  E4: 329.63,
  G4: 392.0,
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  C6: 1046.5,
  Cs6: 1108.73,
} as const;

// ---------------------------------------------------------------------------
// Reverb: programmatic impulse response
// ---------------------------------------------------------------------------

function createReverbImpulse(
  ctx: AudioContext,
  duration: number,
  decay: number,
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

// ---------------------------------------------------------------------------
// Helper: create output chain with optional reverb and delay
// ---------------------------------------------------------------------------

interface OutputChainOptions {
  ctx: AudioContext;
  masterGain: GainNode;
  reverbMix?: number; // 0-1 wet/dry, default 0 (no reverb)
  reverbDuration?: number; // seconds
  reverbDecay?: number;
  delayTime?: number; // seconds, 0 = no delay
  delayFeedback?: number; // 0-1
  filterFreq?: number; // Hz, 0 = no filter
  filterType?: BiquadFilterType;
}

function createOutputChain({
  ctx,
  masterGain,
  reverbMix = 0,
  reverbDuration = 0.5,
  reverbDecay = 2.5,
  delayTime = 0,
  delayFeedback = 0.2,
  filterFreq = 0,
  filterType = "lowpass",
}: OutputChainOptions): {
  input: AudioNode;
  connect: (source: AudioNode) => void;
} {
  let chainHead: AudioNode = masterGain;
  const nodesToConnect: AudioNode[] = [];

  // Low-pass filter for warmth
  if (filterFreq > 0) {
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.7;
    nodesToConnect.push(filter);
  }

  // Build dry path and wet path
  if (reverbMix > 0) {
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    dryGain.gain.value = 1 - reverbMix;
    wetGain.gain.value = reverbMix;

    const convolver = ctx.createConvolver();
    convolver.buffer = createReverbImpulse(ctx, reverbDuration, reverbDecay);

    // Dry path
    dryGain.connect(masterGain);
    // Wet path
    convolver.connect(wetGain);
    wetGain.connect(masterGain);

    if (delayTime > 0) {
      const delay = ctx.createDelay(2);
      delay.delayTime.value = delayTime;
      const feedback = ctx.createGain();
      feedback.gain.value = delayFeedback;
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(convolver);

      const splitter = ctx.createGain();
      splitter.connect(dryGain);
      splitter.connect(delay);
      splitter.connect(convolver); // direct wet too

      if (nodesToConnect.length > 0) {
        const filter = nodesToConnect[0];
        filter.connect(splitter);
        return {
          input: filter,
          connect: (source: AudioNode) => source.connect(filter),
        };
      }
      return {
        input: splitter,
        connect: (source: AudioNode) => source.connect(splitter),
      };
    }

    // No delay, just reverb
    const splitter = ctx.createGain();
    splitter.connect(dryGain);
    splitter.connect(convolver);

    if (nodesToConnect.length > 0) {
      const filter = nodesToConnect[0];
      filter.connect(splitter);
      return {
        input: filter,
        connect: (source: AudioNode) => source.connect(filter),
      };
    }
    return {
      input: splitter,
      connect: (source: AudioNode) => source.connect(splitter),
    };
  }

  // No reverb — simple chain
  if (nodesToConnect.length > 0) {
    const filter = nodesToConnect[0];
    filter.connect(masterGain);
    return {
      input: filter,
      connect: (source: AudioNode) => source.connect(filter),
    };
  }
  return {
    input: masterGain,
    connect: (source: AudioNode) => source.connect(masterGain),
  };
}

// ---------------------------------------------------------------------------
// Helper: create a one-shot oscillator with envelope
// ---------------------------------------------------------------------------

interface ToneParams {
  ctx: AudioContext;
  frequency: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  sustain?: number;
  release?: number;
  detune?: number;
  destination: AudioNode;
  startOffset?: number; // seconds from now
}

function playTone({
  ctx,
  frequency,
  type = "sine",
  gain = 0.1,
  attack = 0.02,
  sustain = 0.3,
  release = 0.3,
  detune = 0,
  destination,
  startOffset = 0,
}: ToneParams): OscillatorNode {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = type;
  osc.frequency.value = frequency;
  osc.detune.value = detune;

  const now = ctx.currentTime + startOffset;
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + attack);
  env.gain.setValueAtTime(gain, now + attack + sustain);
  env.gain.exponentialRampToValueAtTime(
    0.001,
    now + attack + sustain + release,
  );

  osc.connect(env);
  env.connect(destination);

  osc.start(now);
  osc.stop(now + attack + sustain + release + 0.05);
  return osc;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sound event type — サウンドイベントの全種類を型安全に列挙
// ---------------------------------------------------------------------------

export type SoundEvent =
  | "insight_reveal"
  | "star_born"
  | "depth_dive"
  | "contradiction"
  | "alter_voice"
  | "streak_milestone"
  | "decay"
  | "morning_chime"
  | "vanish_warning"
  | "verification_correct"
  | "verification_wrong"
  | "weekly_reveal"
  // v2 新規イベント
  | "prediction_verified"
  | "insight_appeared"
  | "contradiction_found"
  | "alter_typing";

export interface StargazerSounds {
  playInsightReveal: () => void;
  playStarBorn: () => void;
  playDepthDive: () => void;
  playContradiction: () => void;
  playAlterVoice: () => void;
  playStreakMilestone: () => void;
  playDecay: () => void;
  playMorningChime: () => void;
  playVanishWarning: () => void;
  playVerificationResult: (correct: boolean) => void;
  playWeeklyReveal: () => void;
  /** v2: 予測検証完了 — 的中時の輝くアルペジオ */
  playPredictionVerified: () => void;
  /** v2: インサイト出現 — 静かな発見の音 */
  playInsightAppeared: () => void;
  /** v2: 矛盾発見 — 不協和音のパルス */
  playContradictionFound: () => void;
  /** v2: Alter タイピング — 囁くようなリズム */
  playAlterTyping: () => void;
  /** v3: 選択肢タップ — 軽いタッチ音 */
  playOptionSelect: () => void;
  /** v3: 質問確定 — 送信音 */
  playQuestionConfirm: () => void;
  /** v3: ミステリーティーズ — 好奇心を煽る音 */
  playMysteryTease: () => void;
  /** v2: イベント名で再生（haptics 連携込み） */
  playEvent: (event: SoundEvent) => void;
  setEnabled: (enabled: boolean) => void;
  isEnabled: boolean;
  setVolume: (level: number) => void;
  getVolume: () => number;
}

// ---------------------------------------------------------------------------
// Sound → Haptic mapping — 各サウンドイベントに連携する触覚パターン
// ---------------------------------------------------------------------------

const SOUND_HAPTIC_MAP: Partial<Record<SoundEvent, HapticPatternName>> = {
  insight_reveal: "insight_appeared",
  star_born: "heavy",
  depth_dive: "depth_dive",
  contradiction: "contradiction_found",
  alter_voice: "medium",
  streak_milestone: "streak_milestone",
  decay: "warning",
  morning_chime: "morning_chime",
  vanish_warning: "vanish_warning",
  verification_correct: "prediction_verified",
  verification_wrong: "warning",
  weekly_reveal: "heavy",
  prediction_verified: "prediction_verified",
  insight_appeared: "insight_appeared",
  contradiction_found: "contradiction_found",
  alter_typing: "alter_typing",
};

export function useStargazerSounds(): StargazerSounds {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const [isEnabled, setIsEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const stored = localStorage.getItem(LS_KEY);
      return stored !== "false";
    } catch { return true; }
  });
  const volumeRef = useRef((() => {
    if (typeof window === "undefined") return 0.8;
    try {
      const vol = localStorage.getItem(LS_VOLUME_KEY);
      if (vol !== null) {
        const parsed = parseFloat(vol);
        if (!isNaN(parsed)) return Math.max(0, Math.min(1, parsed));
      }
    } catch { /* ignore */ }
    return 0.8;
  })());
  const haptics = useHaptics();

  // Lazily initialise AudioContext on first user interaction
  const getCtx = useCallback((): {
    ctx: AudioContext;
    master: GainNode;
  } | null => {
    if (!isEnabled) return null;
    if (ctxRef.current && masterGainRef.current) {
      // Update master gain to current volume
      masterGainRef.current.gain.value = volumeRef.current;
      return { ctx: ctxRef.current, master: masterGainRef.current };
    }
    try {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = volumeRef.current;
      master.connect(ctx.destination);
      ctxRef.current = ctx;
      masterGainRef.current = master;
      return { ctx, master };
    } catch {
      return null;
    }
  }, [isEnabled]);

  const setEnabled = useCallback((enabled: boolean) => {
    setIsEnabled(enabled);
    try {
      localStorage.setItem(LS_KEY, String(enabled));
    } catch {
      // ignore
    }
    if (!enabled && ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
      masterGainRef.current = null;
    }
  }, []);

  const setVolume = useCallback((level: number) => {
    const clamped = Math.max(0, Math.min(1, level));
    volumeRef.current = clamped;
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = clamped;
    }
    try {
      localStorage.setItem(LS_VOLUME_KEY, String(clamped));
    } catch {
      // ignore
    }
  }, []);

  const getVolume = useCallback(() => volumeRef.current, []);

  // ── Sound functions ──

  // Insight Reveal: soft pad (C3+E3+G3) underneath, chime (C5+E5) on top, 0.5s reverb
  const playInsightReveal = useCallback(() => {
    const pair = getCtx();
    if (!pair) return;
    const { ctx, master } = pair;

    const chain = createOutputChain({
      ctx,
      masterGain: master,
      reverbMix: 0.35,
      reverbDuration: 0.5,
      reverbDecay: 2.0,
      delayTime: 0.15,
      delayFeedback: 0.15,
      filterFreq: 4000,
    });

    // Soft pad underneath — very low volume, slow attack
    playTone({
      ctx,
      frequency: NOTE.C3,
      gain: 0.025,
      attack: 0.15,
      sustain: 0.6,
      release: 0.5,
      destination: chain.input,
    });
    playTone({
      ctx,
      frequency: NOTE.E3,
      gain: 0.02,
      attack: 0.18,
      sustain: 0.6,
      release: 0.5,
      destination: chain.input,
    });
    playTone({
      ctx,
      frequency: NOTE.G3,
      gain: 0.02,
      attack: 0.2,
      sustain: 0.6,
      release: 0.5,
      destination: chain.input,
    });

    // Chime on top
    playTone({
      ctx,
      frequency: NOTE.C5,
      gain: 0.08,
      attack: 0.05,
      sustain: 0.5,
      release: 0.4,
      destination: chain.input,
    });
    playTone({
      ctx,
      frequency: NOTE.E5,
      gain: 0.06,
      attack: 0.08,
      sustain: 0.5,
      release: 0.4,
      destination: chain.input,
    });
  }, [getCtx]);

  // Star Born: ascending arpeggio with shimmer (rapid C6/C#6 oscillation)
  const playStarBorn = useCallback(() => {
    const pair = getCtx();
    if (!pair) return;
    const { ctx, master } = pair;

    const chain = createOutputChain({
      ctx,
      masterGain: master,
      reverbMix: 0.3,
      reverbDuration: 0.6,
      reverbDecay: 2.5,
      filterFreq: 6000,
    });

    // Main arpeggio C5 -> E5 -> G5
    const notes = [NOTE.C5, NOTE.E5, NOTE.G5];
    notes.forEach((freq, i) => {
      playTone({
        ctx,
        frequency: freq,
        gain: 0.07,
        attack: 0.01,
        sustain: 0.06,
        release: 0.3,
        destination: chain.input,
        startOffset: i * 0.1,
      });
    });

    // Shimmer: rapid alternation between C6 and C#6 at very low volume
    const shimmerDuration = 0.6;
    const shimmerOsc = ctx.createOscillator();
    const shimmerEnv = ctx.createGain();
    const shimmerLfo = ctx.createOscillator();
    const shimmerLfoGain = ctx.createGain();

    shimmerOsc.type = "sine";
    shimmerOsc.frequency.value = (NOTE.C6 + NOTE.Cs6) / 2;

    // LFO modulates frequency between C6 and C#6
    shimmerLfo.type = "sine";
    shimmerLfo.frequency.value = 12; // 12 Hz oscillation for sparkle
    shimmerLfoGain.gain.value = (NOTE.Cs6 - NOTE.C6) / 2;
    shimmerLfo.connect(shimmerLfoGain);
    shimmerLfoGain.connect(shimmerOsc.frequency);

    const now = ctx.currentTime;
    shimmerEnv.gain.setValueAtTime(0, now);
    shimmerEnv.gain.linearRampToValueAtTime(0.015, now + 0.05);
    shimmerEnv.gain.setValueAtTime(0.015, now + shimmerDuration * 0.6);
    shimmerEnv.gain.exponentialRampToValueAtTime(
      0.001,
      now + shimmerDuration,
    );

    shimmerOsc.connect(shimmerEnv);
    shimmerEnv.connect(chain.input);

    shimmerLfo.start(now);
    shimmerOsc.start(now);
    shimmerOsc.stop(now + shimmerDuration + 0.05);
    shimmerLfo.stop(now + shimmerDuration + 0.05);
  }, [getCtx]);

  // Depth Dive: two detuned oscillators (C2 + C2+5cents) with slow filter sweep
  const playDepthDive = useCallback(() => {
    const pair = getCtx();
    if (!pair) return;
    const { ctx, master } = pair;

    const now = ctx.currentTime;

    // BiquadFilter with slow frequency sweep 800Hz -> 200Hz over 1.5s
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 1.5);
    filter.Q.value = 1.5;
    filter.connect(master);

    // Oscillator 1: C2
    const osc1 = ctx.createOscillator();
    const env1 = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.value = NOTE.C2;

    // LFO: slow tremolo
    lfo.type = "sine";
    lfo.frequency.value = 2;
    lfoGain.gain.value = 6;
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);

    env1.gain.setValueAtTime(0, now);
    env1.gain.linearRampToValueAtTime(0.1, now + 0.1);
    env1.gain.setValueAtTime(0.1, now + 0.7);
    env1.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

    osc1.connect(env1);
    env1.connect(filter);

    // Oscillator 2: C2 + 5 cents (detuned for richness)
    const osc2 = ctx.createOscillator();
    const env2 = ctx.createGain();

    osc2.type = "sine";
    osc2.frequency.value = NOTE.C2;
    osc2.detune.value = 5;

    env2.gain.setValueAtTime(0, now);
    env2.gain.linearRampToValueAtTime(0.08, now + 0.12);
    env2.gain.setValueAtTime(0.08, now + 0.7);
    env2.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

    osc2.connect(env2);
    env2.connect(filter);

    lfo.start(now);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 1.55);
    osc2.stop(now + 1.55);
    lfo.stop(now + 1.55);
  }, [getCtx]);

  // Contradiction: brief silence (20ms), dissonant hit, quick filter sweep down
  const playContradiction = useCallback(() => {
    const pair = getCtx();
    if (!pair) return;
    const { ctx, master } = pair;

    const now = ctx.currentTime;
    const hitStart = 0.02; // 20ms silence before the hit

    // Filter sweep: 2000Hz -> 400Hz quickly after the hit
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2000, now + hitStart);
    filter.frequency.exponentialRampToValueAtTime(400, now + hitStart + 0.4);
    filter.Q.value = 1.0;
    filter.connect(master);

    // C4 + Db4 minor second
    playTone({
      ctx,
      frequency: NOTE.C4,
      gain: 0.07,
      attack: 0.01,
      sustain: 0.2,
      release: 0.35,
      destination: filter,
      startOffset: hitStart,
    });
    playTone({
      ctx,
      frequency: NOTE.Db4,
      gain: 0.06,
      attack: 0.01,
      sustain: 0.2,
      release: 0.35,
      destination: filter,
      startOffset: hitStart,
    });
  }, [getCtx]);

  // Alter Voice: 3 detuned oscillators (A2, A2+7cents, A2-5cents) with different envelopes
  const playAlterVoice = useCallback(() => {
    const pair = getCtx();
    if (!pair) return;
    const { ctx, master } = pair;

    const chain = createOutputChain({
      ctx,
      masterGain: master,
      reverbMix: 0.3,
      reverbDuration: 0.8,
      reverbDecay: 3.0,
      filterFreq: 1200,
    });

    const now = ctx.currentTime;

    // Oscillator 1: A2, sustains longest — the anchor
    const osc1 = ctx.createOscillator();
    const env1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.value = NOTE.A2;
    env1.gain.setValueAtTime(0, now);
    env1.gain.linearRampToValueAtTime(0.08, now + 0.08);
    env1.gain.setValueAtTime(0.08, now + 0.5);
    env1.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    osc1.connect(env1);
    env1.connect(chain.input);
    osc1.start(now);
    osc1.stop(now + 1.05);

    // Oscillator 2: A2 + 7 cents, fades earlier
    const osc2 = ctx.createOscillator();
    const env2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.value = NOTE.A2;
    osc2.detune.value = 7;
    env2.gain.setValueAtTime(0, now);
    env2.gain.linearRampToValueAtTime(0.06, now + 0.05);
    env2.gain.setValueAtTime(0.06, now + 0.25);
    env2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(env2);
    env2.connect(chain.input);
    osc2.start(now);
    osc2.stop(now + 0.65);

    // Oscillator 3: A2 - 5 cents, different attack, medium sustain
    const osc3 = ctx.createOscillator();
    const env3 = ctx.createGain();
    osc3.type = "sine";
    osc3.frequency.value = NOTE.A2;
    osc3.detune.value = -5;
    env3.gain.setValueAtTime(0, now);
    env3.gain.linearRampToValueAtTime(0.05, now + 0.12);
    env3.gain.setValueAtTime(0.05, now + 0.35);
    env3.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    osc3.connect(env3);
    env3.connect(chain.input);
    osc3.start(now);
    osc3.stop(now + 0.8);

    // Tremolo LFO on the sustaining oscillator
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 5;
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(env1.gain);
    lfo.start(now);
    lfo.stop(now + 1.05);
  }, [getCtx]);

  // Streak Milestone: ascending arpeggio with harmonic overtones (octave at 1/3 volume)
  const playStreakMilestone = useCallback(() => {
    const pair = getCtx();
    if (!pair) return;
    const { ctx, master } = pair;

    const chain = createOutputChain({
      ctx,
      masterGain: master,
      reverbMix: 0.25,
      reverbDuration: 0.6,
      reverbDecay: 2.0,
    });

    const notes = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6];
    const noteGap = 0.08;
    const baseGain = 0.09;

    notes.forEach((freq, i) => {
      // Fundamental with slight portamento feel via quick attack
      playTone({
        ctx,
        frequency: freq,
        gain: baseGain,
        attack: 0.015,
        sustain: 0.08,
        release: 0.25,
        destination: chain.input,
        startOffset: i * noteGap,
      });

      // Harmonic overtone: octave above at 1/3 volume
      playTone({
        ctx,
        frequency: freq * 2,
        gain: baseGain / 3,
        attack: 0.02,
        sustain: 0.06,
        release: 0.2,
        destination: chain.input,
        startOffset: i * noteGap,
      });
    });
  }, [getCtx]);

  // Decay: slower descending notes (200ms each) with tremolo, melancholic feel
  const playDecay = useCallback(() => {
    const pair = getCtx();
    if (!pair) return;
    const { ctx, master } = pair;

    const chain = createOutputChain({
      ctx,
      masterGain: master,
      reverbMix: 0.3,
      reverbDuration: 0.6,
      reverbDecay: 2.5,
      filterFreq: 2000,
    });

    const notes = [NOTE.G4, NOTE.E4, NOTE.C4];
    const noteGap = 0.2; // 200ms between notes (slower, more melancholic)
    const now = ctx.currentTime;

    notes.forEach((freq, i) => {
      const offset = i * noteGap;

      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const tremoloLfo = ctx.createOscillator();
      const tremoloGain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = freq;

      // Tremolo effect
      tremoloLfo.type = "sine";
      tremoloLfo.frequency.value = 6; // 6 Hz tremolo
      tremoloGain.gain.value = 0.02;
      tremoloLfo.connect(tremoloGain);
      tremoloGain.connect(env.gain);

      const t = now + offset;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.05, t + 0.03);
      env.gain.setValueAtTime(0.05, t + 0.15);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc.connect(env);
      env.connect(chain.input);

      tremoloLfo.start(t);
      osc.start(t);
      osc.stop(t + 0.5);
      tremoloLfo.stop(t + 0.5);
    });
  }, [getCtx]);

  // Morning Chime: gentle C4->E4->G4->C5 with soft pad, 2s total
  const playMorningChime = useCallback(() => {
    const pair = getCtx();
    if (!pair) return;
    const { ctx, master } = pair;

    const chain = createOutputChain({
      ctx,
      masterGain: master,
      reverbMix: 0.4,
      reverbDuration: 1.0,
      reverbDecay: 2.0,
      filterFreq: 3500,
    });

    // Soft pad (C3+E3+G3) background
    playTone({
      ctx,
      frequency: NOTE.C3,
      gain: 0.02,
      attack: 0.3,
      sustain: 1.4,
      release: 0.5,
      destination: chain.input,
    });
    playTone({
      ctx,
      frequency: NOTE.E3,
      gain: 0.015,
      attack: 0.35,
      sustain: 1.4,
      release: 0.5,
      destination: chain.input,
    });

    // Gentle arpeggio on top
    const notes = [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5];
    notes.forEach((freq, i) => {
      playTone({
        ctx,
        frequency: freq,
        gain: 0.06,
        attack: 0.05,
        sustain: 0.2,
        release: 0.3,
        destination: chain.input,
        startOffset: i * 0.35,
      });
    });
  }, [getCtx]);

  // Vanish Warning: ticking sound that speeds up
  const playVanishWarning = useCallback(() => {
    const pair = getCtx();
    if (!pair) return;
    const { ctx, master } = pair;

    const now = ctx.currentTime;
    // Accelerating ticks: gaps shrink from 200ms to 80ms
    const gaps = [0, 0.2, 0.38, 0.52, 0.63, 0.72, 0.79, 0.85, 0.9, 0.94];

    gaps.forEach((offset) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = 880; // A5 — sharp tick

      const t = now + offset;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.06, t + 0.005);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

      osc.connect(env);
      env.connect(master);

      osc.start(t);
      osc.stop(t + 0.05);
    });
  }, [getCtx]);

  // Verification Result: different sounds for correct vs wrong
  const playVerificationResult = useCallback(
    (correct: boolean) => {
      if (correct) {
        // Bright ascending fifth: C5 -> G5
        const pair = getCtx();
        if (!pair) return;
        const { ctx, master } = pair;

        const chain = createOutputChain({
          ctx,
          masterGain: master,
          reverbMix: 0.2,
          reverbDuration: 0.4,
          reverbDecay: 2.0,
        });

        playTone({
          ctx,
          frequency: NOTE.C5,
          gain: 0.08,
          attack: 0.01,
          sustain: 0.1,
          release: 0.25,
          destination: chain.input,
        });
        playTone({
          ctx,
          frequency: NOTE.G5,
          gain: 0.07,
          attack: 0.01,
          sustain: 0.1,
          release: 0.25,
          destination: chain.input,
          startOffset: 0.08,
        });
      } else {
        // Descending minor second: Db4 -> C4, muted
        const pair = getCtx();
        if (!pair) return;
        const { ctx, master } = pair;

        const chain = createOutputChain({
          ctx,
          masterGain: master,
          filterFreq: 1500,
        });

        playTone({
          ctx,
          frequency: NOTE.Db4,
          gain: 0.05,
          attack: 0.01,
          sustain: 0.12,
          release: 0.3,
          destination: chain.input,
        });
        playTone({
          ctx,
          frequency: NOTE.C4,
          gain: 0.04,
          attack: 0.01,
          sustain: 0.12,
          release: 0.3,
          destination: chain.input,
          startOffset: 0.12,
        });
      }
    },
    [getCtx],
  );

  // Weekly Reveal: grand reveal — pad swell + ascending arpeggio + shimmer
  const playWeeklyReveal = useCallback(() => {
    const pair = getCtx();
    if (!pair) return;
    const { ctx, master } = pair;

    const chain = createOutputChain({
      ctx,
      masterGain: master,
      reverbMix: 0.4,
      reverbDuration: 1.2,
      reverbDecay: 2.5,
      delayTime: 0.2,
      delayFeedback: 0.15,
      filterFreq: 5000,
    });

    // Low pad swell
    playTone({
      ctx,
      frequency: NOTE.C3,
      gain: 0.03,
      attack: 0.4,
      sustain: 1.5,
      release: 0.8,
      destination: chain.input,
    });
    playTone({
      ctx,
      frequency: NOTE.G3,
      gain: 0.025,
      attack: 0.5,
      sustain: 1.5,
      release: 0.8,
      destination: chain.input,
    });

    // Grand ascending arpeggio with harmonic overtones
    const notes = [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5, NOTE.E5, NOTE.G5];
    notes.forEach((freq, i) => {
      playTone({
        ctx,
        frequency: freq,
        gain: 0.06 + i * 0.005,
        attack: 0.02,
        sustain: 0.12,
        release: 0.35,
        destination: chain.input,
        startOffset: 0.3 + i * 0.12,
      });
      // Overtone
      playTone({
        ctx,
        frequency: freq * 2,
        gain: 0.02,
        attack: 0.03,
        sustain: 0.08,
        release: 0.25,
        destination: chain.input,
        startOffset: 0.3 + i * 0.12,
      });
    });

    // Final shimmer
    const now = ctx.currentTime;
    const shimmerOsc = ctx.createOscillator();
    const shimmerEnv = ctx.createGain();
    const shimmerLfo = ctx.createOscillator();
    const shimmerLfoGain = ctx.createGain();

    shimmerOsc.type = "sine";
    shimmerOsc.frequency.value = (NOTE.C6 + NOTE.Cs6) / 2;
    shimmerLfo.type = "sine";
    shimmerLfo.frequency.value = 10;
    shimmerLfoGain.gain.value = (NOTE.Cs6 - NOTE.C6) / 2;
    shimmerLfo.connect(shimmerLfoGain);
    shimmerLfoGain.connect(shimmerOsc.frequency);

    const shimmerStart = now + 1.0;
    shimmerEnv.gain.setValueAtTime(0, shimmerStart);
    shimmerEnv.gain.linearRampToValueAtTime(0.012, shimmerStart + 0.1);
    shimmerEnv.gain.setValueAtTime(0.012, shimmerStart + 0.6);
    shimmerEnv.gain.exponentialRampToValueAtTime(0.001, shimmerStart + 1.0);

    shimmerOsc.connect(shimmerEnv);
    shimmerEnv.connect(chain.input);
    shimmerLfo.start(shimmerStart);
    shimmerOsc.start(shimmerStart);
    shimmerOsc.stop(shimmerStart + 1.05);
    shimmerLfo.stop(shimmerStart + 1.05);
  }, [getCtx]);

  // ── v2: Haptics 連携ヘルパー ──

  const triggerHaptic = useCallback(
    (event: SoundEvent) => {
      const pattern = SOUND_HAPTIC_MAP[event];
      if (pattern) haptics.playPattern(pattern);
    },
    [haptics],
  );

  // ── v2: Prediction Verified — 的中時の輝くアルペジオ + シマー ──
  const playPredictionVerified = useCallback(() => {
    triggerHaptic("prediction_verified");
    const pair = getCtx();
    if (!pair) return;
    const { ctx, master } = pair;

    const chain = createOutputChain({
      ctx,
      masterGain: master,
      reverbMix: 0.35,
      reverbDuration: 0.6,
      reverbDecay: 2.0,
      filterFreq: 5000,
    });

    // 上昇アルペジオ: C5 -> E5 -> G5 -> C6 (的中の達成感)
    const notes = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6];
    notes.forEach((freq, i) => {
      playTone({
        ctx,
        frequency: freq,
        gain: 0.07 + i * 0.008,
        attack: 0.01,
        sustain: 0.1,
        release: 0.3,
        destination: chain.input,
        startOffset: i * 0.09,
      });
    });

    // 最後にシマー
    const now = ctx.currentTime;
    const shimmerOsc = ctx.createOscillator();
    const shimmerEnv = ctx.createGain();
    shimmerOsc.type = "sine";
    shimmerOsc.frequency.value = NOTE.C6;

    const shimmerStart = now + 0.4;
    shimmerEnv.gain.setValueAtTime(0, shimmerStart);
    shimmerEnv.gain.linearRampToValueAtTime(0.015, shimmerStart + 0.05);
    shimmerEnv.gain.exponentialRampToValueAtTime(0.001, shimmerStart + 0.5);

    shimmerOsc.connect(shimmerEnv);
    shimmerEnv.connect(chain.input);
    shimmerOsc.start(shimmerStart);
    shimmerOsc.stop(shimmerStart + 0.55);
  }, [getCtx, triggerHaptic]);

  // ── v2: Insight Appeared — 静かな発見の音 ──
  const playInsightAppeared = useCallback(() => {
    triggerHaptic("insight_appeared");
    const pair = getCtx();
    if (!pair) return;
    const { ctx, master } = pair;

    const chain = createOutputChain({
      ctx,
      masterGain: master,
      reverbMix: 0.4,
      reverbDuration: 0.5,
      reverbDecay: 2.5,
      filterFreq: 3000,
    });

    // 柔らかいベルトーン: E5 のみ、長めのサステイン
    playTone({
      ctx,
      frequency: NOTE.E5,
      gain: 0.06,
      attack: 0.08,
      sustain: 0.5,
      release: 0.6,
      destination: chain.input,
    });
    // ハーモニクス: オクターブ上を小さく
    playTone({
      ctx,
      frequency: NOTE.E5 * 2,
      gain: 0.015,
      attack: 0.1,
      sustain: 0.3,
      release: 0.4,
      destination: chain.input,
    });
  }, [getCtx, triggerHaptic]);

  // ── v2: Contradiction Found — 不協和音のパルス ──
  const playContradictionFound = useCallback(() => {
    triggerHaptic("contradiction_found");
    const pair = getCtx();
    if (!pair) return;
    const { ctx, master } = pair;

    const now = ctx.currentTime;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2500, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.5);
    filter.Q.value = 1.2;
    filter.connect(master);

    // 2回の不協和パルス（C4+Db4 を短く2度繰り返す）
    [0, 0.18].forEach((offset) => {
      playTone({
        ctx,
        frequency: NOTE.C4,
        gain: 0.06,
        attack: 0.005,
        sustain: 0.08,
        release: 0.15,
        destination: filter,
        startOffset: offset,
      });
      playTone({
        ctx,
        frequency: NOTE.Db4,
        gain: 0.05,
        attack: 0.005,
        sustain: 0.08,
        release: 0.15,
        destination: filter,
        startOffset: offset,
      });
    });
  }, [getCtx, triggerHaptic]);

  // ── v2: Alter Typing — 囁くようなリズム ──
  const playAlterTyping = useCallback(() => {
    triggerHaptic("alter_typing");
    const pair = getCtx();
    if (!pair) return;
    const { ctx, master } = pair;

    const chain = createOutputChain({
      ctx,
      masterGain: master,
      reverbMix: 0.2,
      reverbDuration: 0.3,
      reverbDecay: 2.0,
      filterFreq: 1500,
    });

    // 3つの極めて小さなタップ音（ランダム風のタイミング）
    const offsets = [0, 0.12, 0.22];
    const freqs = [NOTE.A2, NOTE.C3, NOTE.A2];

    offsets.forEach((offset, i) => {
      playTone({
        ctx,
        frequency: freqs[i],
        gain: 0.025,
        attack: 0.005,
        sustain: 0.03,
        release: 0.1,
        destination: chain.input,
        startOffset: offset,
      });
    });
  }, [getCtx, triggerHaptic]);

  // ── v2: playEvent — イベント名で統一的に再生 ──
  const playEvent = useCallback(
    (event: SoundEvent) => {
      switch (event) {
        case "insight_reveal":
          playInsightReveal();
          break;
        case "star_born":
          playStarBorn();
          break;
        case "depth_dive":
          playDepthDive();
          break;
        case "contradiction":
          playContradiction();
          break;
        case "alter_voice":
          playAlterVoice();
          break;
        case "streak_milestone":
          playStreakMilestone();
          break;
        case "decay":
          playDecay();
          break;
        case "morning_chime":
          playMorningChime();
          break;
        case "vanish_warning":
          playVanishWarning();
          break;
        case "verification_correct":
          playVerificationResult(true);
          break;
        case "verification_wrong":
          playVerificationResult(false);
          break;
        case "weekly_reveal":
          playWeeklyReveal();
          break;
        case "prediction_verified":
          playPredictionVerified();
          break;
        case "insight_appeared":
          playInsightAppeared();
          break;
        case "contradiction_found":
          playContradictionFound();
          break;
        case "alter_typing":
          playAlterTyping();
          break;
      }
      // triggerHaptic は各関数内で呼ばれるが、既存関数にも連携を追加
      // (既存関数は playEvent 経由でなくても直接呼べるよう後方互換維持)
    },
    [
      playInsightReveal,
      playStarBorn,
      playDepthDive,
      playContradiction,
      playAlterVoice,
      playStreakMilestone,
      playDecay,
      playMorningChime,
      playVanishWarning,
      playVerificationResult,
      playWeeklyReveal,
      playPredictionVerified,
      playInsightAppeared,
      playContradictionFound,
      playAlterTyping,
    ],
  );

  // ── 観測フロー v6 追加サウンド ──

  /** 選択肢タップ時の短い chirp (C5, 50ms) */
  const playOptionSelect = useCallback(() => {
    const pair = getCtx();
    if (!pair) return;
    const { ctx, master } = pair;
    const chain = createOutputChain({ ctx, masterGain: master });
    playTone({ ctx, frequency: NOTE.C5, type: "sine", gain: 0.04, attack: 0.005, sustain: 0.03, release: 0.05, destination: chain.input });
  }, [getCtx]);

  /** 確定時の上昇2音 (E4→G4) */
  const playQuestionConfirm = useCallback(() => {
    const pair = getCtx();
    if (!pair) return;
    const { ctx, master } = pair;
    const chain = createOutputChain({ ctx, masterGain: master });
    playTone({ ctx, frequency: NOTE.E4, type: "sine", gain: 0.06, attack: 0.01, sustain: 0.08, release: 0.1, destination: chain.input });
    playTone({ ctx, frequency: NOTE.G4, type: "sine", gain: 0.06, attack: 0.01, sustain: 0.08, release: 0.15, destination: chain.input, startOffset: 0.1 });
  }, [getCtx]);

  /** ミステリーティーズ時の低音＋高音ピン */
  const playMysteryTease = useCallback(() => {
    const pair = getCtx();
    if (!pair) return;
    const { ctx, master } = pair;
    const chain = createOutputChain({ ctx, masterGain: master, reverbMix: 0.3, reverbDuration: 0.8, reverbDecay: 1.5 });
    playTone({ ctx, frequency: NOTE.C3, type: "sine", gain: 0.03, attack: 0.05, sustain: 0.2, release: 0.3, destination: chain.input });
    playTone({ ctx, frequency: NOTE.C6, type: "sine", gain: 0.02, attack: 0.01, sustain: 0.05, release: 0.2, destination: chain.input, startOffset: 0.15 });
  }, [getCtx]);

  return {
    playInsightReveal,
    playStarBorn,
    playDepthDive,
    playContradiction,
    playAlterVoice,
    playStreakMilestone,
    playDecay,
    playMorningChime,
    playVanishWarning,
    playVerificationResult,
    playWeeklyReveal,
    playPredictionVerified,
    playInsightAppeared,
    playContradictionFound,
    playAlterTyping,
    playOptionSelect,
    playQuestionConfirm,
    playMysteryTease,
    playEvent,
    setEnabled,
    isEnabled,
    setVolume,
    getVolume,
  };
}
