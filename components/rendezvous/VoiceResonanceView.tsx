"use client";

/**
 * VoiceResonanceView
 * 声の共鳴体験UI — 録音・波形・共鳴結果の表示
 *
 * States: prompt → recording → processing → waiting_for_other → reveal
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";
import type {
  VoicePrompt,
  VoiceAnalysis,
  VoiceResonanceResult,
} from "@/lib/rendezvous/voiceResonance";

// ---------- Props ----------

type Props = {
  prompt: VoicePrompt;
  onRecordComplete: (analysis: VoiceAnalysis, audioBlob: Blob) => void;
  result?: VoiceResonanceResult;
  isWaiting?: boolean;
};

type ViewState =
  | "prompt"
  | "recording"
  | "processing"
  | "waiting_for_other"
  | "reveal";

// ---------- 定数 ----------

const WAVEFORM_BARS = 40;
const ANALYSIS_SAMPLE_RATE = 60; // 毎秒60回のサンプリング

// ---------- Component ----------

export default function VoiceResonanceView({
  prompt,
  onRecordComplete,
  result,
  isWaiting,
}: Props) {
  const [state, setState] = useState<ViewState>("prompt");
  const [elapsed, setElapsed] = useState(0);
  const [waveformData, setWaveformData] = useState<number[]>(
    Array(WAVEFORM_BARS).fill(0),
  );

  // 音声分析用の蓄積データ
  const pitchSamples = useRef<number[]>([]);
  const energySamples = useRef<number[]>([]);
  const pauseCount = useRef(0);
  const lastSilentFrame = useRef(false);

  // MediaRecorder / AudioContext refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef(0);

  // result / isWaiting の変更に応じた状態遷移
  useEffect(() => {
    if (result) {
      setState("reveal");
    } else if (isWaiting && state === "processing") {
      setState("waiting_for_other");
    }
  }, [result, isWaiting, state]);

  // ---------- 録音開始 ----------

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const analysis = computeClientAnalysis();
        onRecordComplete(analysis, blob);
        setState("processing");
        cleanup();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);

      // リセット
      pitchSamples.current = [];
      energySamples.current = [];
      pauseCount.current = 0;
      lastSilentFrame.current = false;
      startTimeRef.current = Date.now();
      setElapsed(0);

      setState("recording");

      // タイマー
      timerRef.current = setInterval(() => {
        const sec = (Date.now() - startTimeRef.current) / 1000;
        setElapsed(sec);
        if (sec >= prompt.maxDurationSec) {
          stopRecording();
        }
      }, 100);

      // 波形描画 + サンプリングループ
      const bufferLength = analyser.frequencyBinCount;
      const timeDomainData = new Uint8Array(bufferLength);
      const freqData = new Float32Array(bufferLength);

      let sampleCounter = 0;
      const loop = () => {
        analyser.getByteTimeDomainData(timeDomainData);
        analyser.getFloatFrequencyData(freqData);

        // 波形バー更新
        const barWidth = Math.floor(bufferLength / WAVEFORM_BARS);
        const bars: number[] = [];
        for (let i = 0; i < WAVEFORM_BARS; i++) {
          let sum = 0;
          for (let j = 0; j < barWidth; j++) {
            const v = (timeDomainData[i * barWidth + j] - 128) / 128;
            sum += Math.abs(v);
          }
          bars.push(sum / barWidth);
        }
        setWaveformData(bars);

        // エネルギー / ピッチサンプリング (間引き)
        sampleCounter++;
        if (sampleCounter % (60 / ANALYSIS_SAMPLE_RATE) === 0) {
          const energy = computeRMSEnergy(timeDomainData);
          energySamples.current.push(energy);

          const pitch = estimatePitch(freqData, audioCtx.sampleRate);
          if (pitch > 0) pitchSamples.current.push(pitch);

          // ポーズ検出
          const isSilent = energy < 0.02;
          if (isSilent && !lastSilentFrame.current) {
            pauseCount.current++;
          }
          lastSilentFrame.current = isSilent;
        }

        animFrameRef.current = requestAnimationFrame(loop);
      };
      animFrameRef.current = requestAnimationFrame(loop);
    } catch {
      // マイクアクセス拒否など
      setState("prompt");
    }
  }, [prompt.maxDurationSec, onRecordComplete]);

  // ---------- 録音停止 ----------

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
  }, []);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  // クリーンアップ on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      cleanup();
    };
  }, [stopRecording, cleanup]);

  // ---------- クライアントサイド音声分析 ----------

  function computeClientAnalysis(): VoiceAnalysis {
    const durationSec = (Date.now() - startTimeRef.current) / 1000;
    const pitches = pitchSamples.current;
    const energies = energySamples.current;

    const avgPitch =
      pitches.length > 0
        ? pitches.reduce((s, v) => s + v, 0) / pitches.length
        : 180;
    const pitchVariance =
      pitches.length > 1
        ? Math.sqrt(
            pitches.reduce((s, v) => s + (v - avgPitch) ** 2, 0) /
              pitches.length,
          )
        : 10;

    const avgEnergy =
      energies.length > 0
        ? energies.reduce((s, v) => s + v, 0) / energies.length
        : 0.3;
    const energyLevel = Math.min(1, avgEnergy * 3); // 正規化

    const pauseFrequency =
      durationSec > 0 ? (pauseCount.current / durationSec) * 60 : 0;

    // 発話ペース推定 (非ポーズフレーム数 / 秒 ≈ 音節レート近似)
    const nonSilentFrames = energies.filter((e) => e >= 0.02).length;
    const speakingPace =
      durationSec > 0 ? (nonSilentFrames / energies.length) * 5 : 3;

    // 呼吸パターン推定
    const breathPattern = inferBreathPattern(energyLevel, pitchVariance, pauseFrequency);

    return {
      avgPitch: Math.round(avgPitch),
      pitchVariance: Math.round(pitchVariance * 10) / 10,
      speakingPace: Math.round(speakingPace * 100) / 100,
      pauseFrequency: Math.round(pauseFrequency * 10) / 10,
      energyLevel: Math.round(energyLevel * 1000) / 1000,
      breathPattern,
    };
  }

  // ---------- Render ----------

  return (
    <div className="w-full max-w-md mx-auto">
      <AnimatePresence mode="wait">
        {state === "prompt" && (
          <PromptView
            key="prompt"
            prompt={prompt}
            onStart={startRecording}
          />
        )}
        {state === "recording" && (
          <RecordingView
            key="recording"
            prompt={prompt}
            elapsed={elapsed}
            waveformData={waveformData}
            onStop={stopRecording}
          />
        )}
        {state === "processing" && <ProcessingView key="processing" />}
        {state === "waiting_for_other" && (
          <WaitingView key="waiting" />
        )}
        {state === "reveal" && result && (
          <RevealView key="reveal" result={result} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ================================================================
// Sub-views
// ================================================================

// ---------- PromptView ----------

function PromptView({
  prompt,
  onStart,
}: {
  prompt: VoicePrompt;
  onStart: () => void;
}) {
  const categoryLabel: Record<VoicePrompt["category"], string> = {
    self_reveal: "自己開示",
    emotional: "感情",
    playful: "遊び",
    reflective: "内省",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <GlassCard className="p-6 bg-gradient-to-br from-purple-900/20 to-indigo-900/20 border-purple-500/20">
        {/* カテゴリバッジ */}
        <div className="flex justify-center mb-4">
          <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-medium">
            {categoryLabel[prompt.category]}
          </span>
        </div>

        {/* プロンプト */}
        <h3 className="text-xl font-bold text-center text-white mb-2 leading-relaxed">
          {prompt.prompt}
        </h3>

        <p className="text-center text-white/50 text-sm mb-6">
          最大 {prompt.maxDurationSec} 秒
        </p>

        {/* 録音ボタン */}
        <div className="flex justify-center">
          <GlassButton
            onClick={onStart}
            className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-shadow"
          >
            <MicIcon />
          </GlassButton>
        </div>

        <p className="text-center text-white/40 text-xs mt-4">
          タップして声を録音
        </p>
      </GlassCard>
    </motion.div>
  );
}

// ---------- RecordingView ----------

function RecordingView({
  prompt,
  elapsed,
  waveformData,
  onStop,
}: {
  prompt: VoicePrompt;
  elapsed: number;
  waveformData: number[];
  onStop: () => void;
}) {
  const progress = Math.min(1, elapsed / prompt.maxDurationSec);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <GlassCard className="p-6 bg-gradient-to-br from-purple-900/30 to-indigo-900/30 border-purple-400/30">
        {/* プロンプト（小さめ） */}
        <p className="text-center text-white/70 text-sm mb-4">
          {prompt.prompt}
        </p>

        {/* タイマーリング */}
        <div className="flex justify-center mb-6">
          <div className="relative w-24 h-24">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="rgba(168,85,247,0.15)"
                strokeWidth="4"
              />
              <motion.circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="url(#timerGradient)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 45}
                strokeDashoffset={2 * Math.PI * 45 * (1 - progress)}
              />
              <defs>
                <linearGradient id="timerGradient">
                  <stop offset="0%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white font-mono text-lg">
                {Math.ceil(prompt.maxDurationSec - elapsed)}
              </span>
            </div>
            {/* パルスアニメーション */}
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-purple-400/30"
              animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </div>
        </div>

        {/* 波形 */}
        <div className="flex items-center justify-center gap-[2px] h-16 mb-6">
          {waveformData.map((v, i) => (
            <motion.div
              key={i}
              className="w-1.5 rounded-full bg-gradient-to-t from-purple-500 to-indigo-400"
              animate={{ height: Math.max(4, v * 60) }}
              transition={{ duration: 0.05 }}
            />
          ))}
        </div>

        {/* 停止ボタン */}
        <div className="flex justify-center">
          <GlassButton
            onClick={onStop}
            className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500/80 to-pink-500/80 flex items-center justify-center shadow-lg shadow-red-500/20"
          >
            <StopIcon />
          </GlassButton>
        </div>

        <p className="text-center text-white/40 text-xs mt-3">
          タップして録音終了
        </p>
      </GlassCard>
    </motion.div>
  );
}

// ---------- ProcessingView ----------

function ProcessingView() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <GlassCard className="p-8 bg-gradient-to-br from-purple-900/20 to-indigo-900/20 border-purple-500/20">
        <div className="flex flex-col items-center gap-4">
          <motion.div
            className="w-12 h-12 rounded-full border-2 border-purple-400 border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <p className="text-white/70 text-sm">声を分析しています...</p>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ---------- WaitingView ----------

function WaitingView() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <GlassCard className="p-8 bg-gradient-to-br from-purple-900/20 to-indigo-900/20 border-purple-500/20">
        <div className="flex flex-col items-center gap-4">
          {/* ふたつの波形が近づくアニメーション */}
          <div className="flex items-center gap-4">
            <motion.div
              className="w-8 h-8 rounded-full bg-purple-500/50"
              animate={{ x: [0, 10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <motion.div
              className="w-3 h-3 rounded-full bg-white/30"
              animate={{ opacity: [0.3, 0.8, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <motion.div
              className="w-8 h-8 rounded-full bg-indigo-500/50"
              animate={{ x: [0, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
          <p className="text-white/70 text-sm">
            相手の声を待っています...
          </p>
          <p className="text-white/40 text-xs">
            同じ問いに答えた声を比べます
          </p>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ---------- RevealView ----------

function RevealView({ result }: { result: VoiceResonanceResult }) {
  const typeEmoji: Record<string, string> = {
    rhythmic_sync: "🎵",
    energy_match: "⚡",
    complementary_tone: "🎭",
    emotional_mirror: "🪞",
    peaceful_contrast: "🌊",
    dynamic_spark: "✨",
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <GlassCard className="p-6 bg-gradient-to-br from-purple-900/30 to-indigo-900/30 border-purple-400/20 overflow-hidden relative">
        {/* 背景グロー */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-purple-600/10 via-indigo-600/10 to-purple-600/10"
          animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
          transition={{ duration: 5, repeat: Infinity }}
          style={{ backgroundSize: "200% 200%" }}
        />

        <div className="relative z-10">
          {/* 波形マージアニメーション */}
          <div className="flex justify-center mb-6">
            <MergeWaveformAnimation score={result.resonanceScore} />
          </div>

          {/* スコア */}
          <div className="text-center mb-4">
            <motion.div
              className="text-4xl font-bold bg-gradient-to-r from-purple-300 to-indigo-300 bg-clip-text text-transparent"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {result.resonanceScore}
            </motion.div>
            <p className="text-white/50 text-xs mt-1">声の共鳴スコア</p>
          </div>

          {/* 共鳴タイプ */}
          <motion.div
            className="text-center mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <span className="text-lg">
              {typeEmoji[result.resonanceType] ?? "🎶"}
            </span>
            <p className="text-white/80 text-sm font-medium mt-1">
              {result.resonanceType.replace(/_/g, " ")}
            </p>
          </motion.div>

          {/* インサイト */}
          <motion.p
            className="text-white/70 text-sm text-center leading-relaxed mb-5 px-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            {result.insight}
          </motion.p>

          {/* 共鳴ポイント */}
          <div className="space-y-2 mb-4">
            {result.resonancePoints.map((pt, i) => (
              <motion.div
                key={pt.label}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.9 + i * 0.15 }}
              >
                <div className="flex-1">
                  <p className="text-white/80 text-xs font-medium">
                    {pt.label}
                  </p>
                  <p className="text-white/40 text-[10px]">
                    {pt.description}
                  </p>
                </div>
                <div className="w-12 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-purple-400 to-indigo-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${pt.score}%` }}
                    transition={{ delay: 1 + i * 0.15, duration: 0.5 }}
                  />
                </div>
              </motion.div>
            ))}
          </div>

          {/* ダイナミクスナラティブ */}
          <motion.div
            className="mt-4 px-3 py-3 rounded-lg bg-purple-500/10 border border-purple-500/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
          >
            <p className="text-white/60 text-xs leading-relaxed italic">
              {result.voiceDynamic}
            </p>
          </motion.div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ================================================================
// Sub-components
// ================================================================

/** ふたつの波形がマージするアニメーション */
function MergeWaveformAnimation({ score }: { score: number }) {
  const bars = 20;
  // スコアが高いほど波形が統合される
  const mergeRatio = score / 100;

  return (
    <div className="flex items-center gap-1 h-12">
      {Array.from({ length: bars }).map((_, i) => {
        const phase = (i / bars) * Math.PI * 2;
        const heightA = 0.3 + 0.7 * Math.abs(Math.sin(phase));
        const heightB = 0.3 + 0.7 * Math.abs(Math.sin(phase + 1.2));
        const merged = heightA * mergeRatio + heightB * (1 - mergeRatio);

        return (
          <motion.div
            key={i}
            className="w-1 rounded-full"
            style={{
              background: `linear-gradient(to top, rgba(168,85,247,0.8), rgba(99,102,241,0.8))`,
            }}
            initial={{ height: 4 }}
            animate={{ height: merged * 48 }}
            transition={{
              delay: 0.1 + i * 0.03,
              duration: 0.8,
              ease: "easeOut",
            }}
          />
        );
      })}
    </div>
  );
}

// ================================================================
// Audio Analysis Helpers
// ================================================================

/** RMS エネルギー計算 */
function computeRMSEnergy(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}

/** 簡易ピッチ推定 (周波数スペクトルのピーク検出) */
function estimatePitch(freqData: Float32Array, sampleRate: number): number {
  const binSize = sampleRate / (freqData.length * 2);
  let maxVal = -Infinity;
  let maxIndex = 0;

  // 人声の範囲: 80Hz - 400Hz
  const minBin = Math.floor(80 / binSize);
  const maxBin = Math.min(freqData.length - 1, Math.ceil(400 / binSize));

  for (let i = minBin; i <= maxBin; i++) {
    if (freqData[i] > maxVal) {
      maxVal = freqData[i];
      maxIndex = i;
    }
  }

  // -60dB 以下は無音とみなす
  if (maxVal < -60) return 0;

  return maxIndex * binSize;
}

/** 呼吸パターン推定 */
function inferBreathPattern(
  energy: number,
  pitchVariance: number,
  pauseFreq: number,
): VoiceAnalysis["breathPattern"] {
  if (energy > 0.6 && pitchVariance > 25) return "excited";
  if (energy < 0.25 && pauseFreq > 8) return "hesitant";
  if (energy < 0.35 && pitchVariance < 15) return "calm";
  return "steady";
}

// ================================================================
// Icons (inline SVG)
// ================================================================

function MicIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="white"
      stroke="none"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
