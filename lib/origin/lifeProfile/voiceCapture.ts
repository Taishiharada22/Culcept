// lib/origin/lifeProfile/voiceCapture.ts
// 音声メモ: MediaRecorder + Web Speech API
//
// フロー:
//   録音開始 → 音声認識（リアルタイム） → 停止 → テキスト確定
//   ブラウザがSpeechRecognitionをサポートしない場合は録音のみ

export type VoiceCaptureState =
  | "idle"
  | "recording"
  | "processing"
  | "done"
  | "error";

export type VoiceCaptureResult = {
  transcript: string;
  durationMs: number;
  /** 音声blob URL（再生用） */
  audioUrl: string | null;
};

/** SpeechRecognition のブラウザ対応チェック */
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!(
    (window as unknown as Record<string, unknown>).SpeechRecognition ||
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  );
}

/** MediaRecorder 対応チェック */
export function isMediaRecorderSupported(): boolean {
  if (typeof window === "undefined") return false;
  return typeof MediaRecorder !== "undefined";
}

/**
 * 音声キャプチャセッションを開始
 *
 * 返り値:
 *   stop() — 録音停止、結果を返す
 *   onTranscript — リアルタイムの中間テキストコールバック
 *   cancel() — 中断
 */
export async function startVoiceCapture(options?: {
  onInterim?: (text: string) => void;
  lang?: string;
}): Promise<{
  stop: () => Promise<VoiceCaptureResult>;
  cancel: () => void;
}> {
  const lang = options?.lang ?? "ja-JP";
  const startTime = Date.now();

  // ── MediaRecorder (音声録音) ──
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new Error("マイクへのアクセスが許可されませんでした");
  }

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();

  // ── SpeechRecognition (リアルタイムテキスト変換) ──
  let finalTranscript = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recognition: any = null;

  if (isSpeechRecognitionSupported()) {
    const SpeechRecognitionClass =
      (window as unknown as Record<string, any>).SpeechRecognition ??
      (window as unknown as Record<string, any>).webkitSpeechRecognition;

    if (SpeechRecognitionClass) {
      recognition = new SpeechRecognitionClass();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
        options?.onInterim?.(finalTranscript + interim);
      };

      recognition.onerror = () => {
        // エラーは無視（テキストなしで音声だけ返す）
      };

      recognition.start();
    }
  }

  let cancelled = false;

  const cleanup = () => {
    try { recognition?.stop(); } catch { /* */ }
    stream.getTracks().forEach((t) => t.stop());
  };

  return {
    stop: () =>
      new Promise<VoiceCaptureResult>((resolve) => {
        if (cancelled) {
          resolve({ transcript: "", durationMs: 0, audioUrl: null });
          return;
        }

        try { recognition?.stop(); } catch { /* */ }

        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());

          const blob = new Blob(chunks, { type: "audio/webm" });
          const audioUrl = blob.size > 0 ? URL.createObjectURL(blob) : null;

          resolve({
            transcript: finalTranscript.trim(),
            durationMs: Date.now() - startTime,
            audioUrl,
          });
        };

        recorder.stop();
      }),

    cancel: () => {
      cancelled = true;
      try { recorder.stop(); } catch { /* */ }
      cleanup();
    },
  };
}
