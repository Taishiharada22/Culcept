"use client";

/**
 * VoiceRecorder
 * 長押し録音UI + 波形表示 + 再生
 * MediaRecorder API (Opus/WebM)
 */

import { useState, useRef, useCallback, useEffect } from "react";

type Props = {
  onRecordComplete: (blob: Blob, durationMs: number) => void;
  maxDurationMs?: number;
};

export default function VoiceRecorder({ onRecordComplete, maxDurationMs = 60000 }: Props) {
  const [recording, setRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [levels, setLevels] = useState<number[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      // Audio analysis for waveform
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close();
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const duration = Date.now() - startTimeRef.current;
        onRecordComplete(blob, duration);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // 100ms timeslice
      startTimeRef.current = Date.now();
      setRecording(true);
      setDurationMs(0);

      // Timer
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        setDurationMs(elapsed);
        if (elapsed >= maxDurationMs) {
          stopRecording();
        }
      }, 100);

      // Waveform animation
      const updateLevels = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const bars = Array.from({ length: 12 }, (_, i) => {
          const idx = Math.floor((i / 12) * data.length);
          return data[idx] / 255;
        });
        setLevels(bars);
        animFrameRef.current = requestAnimationFrame(updateLevels);
      };
      updateLevels();
    } catch (err) {
      console.error("[VoiceRecorder] error:", err);
    }
  }, [onRecordComplete, maxDurationMs]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setRecording(false);
    setLevels([]);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {recording && (
        <>
          {/* Waveform */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, height: 24 }}>
            {levels.map((level, i) => (
              <div
                key={i}
                style={{
                  width: 3,
                  height: Math.max(3, level * 24),
                  borderRadius: 2,
                  background: `rgba(239,68,68,${0.4 + level * 0.6})`,
                  transition: "height 0.1s",
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 11, color: "#EF4444", fontWeight: 600, minWidth: 36 }}>
            {formatTime(durationMs)}
          </span>
        </>
      )}

      <button
        onMouseDown={!recording ? startRecording : undefined}
        onMouseUp={recording ? stopRecording : undefined}
        onTouchStart={!recording ? startRecording : undefined}
        onTouchEnd={recording ? stopRecording : undefined}
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "none",
          background: recording
            ? "rgba(239,68,68,0.15)"
            : "rgba(99,102,241,0.08)",
          color: recording ? "#EF4444" : "rgba(30,30,60,0.4)",
          fontSize: 18,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s",
        }}
      >
        {recording ? "⏹" : "🎤"}
      </button>
    </div>
  );
}
