// ============================================================
// Phase 7: サウンドデザインシステム
// Web Audio APIベースの手続き的アンビエントサウンド
// デフォルトOFF、opt-in設計
// ============================================================

export type SoundEvent =
  | "candidate_reveal"   // 新しい候補の表示
  | "mutual_like"        // 相互いいね成立
  | "message_sent"       // メッセージ送信
  | "message_received"   // メッセージ受信
  | "absence_start"      // 不在期間開始
  | "reunion"            // 不在からの復帰
  | "ceremony"           // セレモニー（初接続など）
  | "nudge"              // 成長ナッジ
  | "diary_entry";       // 分身日記エントリ

export type SoundOptions = {
  volume?: number; // 0-1, default 0.3
  duration?: number; // ms
};

/**
 * 各サウンドイベントの音響パラメータ
 * Web Audio APIのOscillatorNodeで合成するためのレシピ
 */
export const SOUND_RECIPES: Record<SoundEvent, SoundRecipe> = {
  candidate_reveal: {
    type: "sine",
    frequencies: [440, 554, 659], // A4, C#5, E5 (A major chord)
    durations: [200, 200, 400],
    gains: [0.15, 0.12, 0.10],
    delay: 100,
  },
  mutual_like: {
    type: "sine",
    frequencies: [523, 659, 784, 1047], // C5, E5, G5, C6 (rising arpeggio)
    durations: [150, 150, 150, 500],
    gains: [0.12, 0.14, 0.16, 0.20],
    delay: 80,
  },
  message_sent: {
    type: "sine",
    frequencies: [587, 740],
    durations: [80, 120],
    gains: [0.08, 0.06],
    delay: 0,
  },
  message_received: {
    type: "triangle",
    frequencies: [784, 659],
    durations: [100, 150],
    gains: [0.10, 0.08],
    delay: 0,
  },
  absence_start: {
    type: "sine",
    frequencies: [440, 392, 349],
    durations: [300, 300, 600],
    gains: [0.10, 0.08, 0.05],
    delay: 200,
  },
  reunion: {
    type: "sine",
    frequencies: [349, 440, 523, 659],
    durations: [200, 200, 200, 500],
    gains: [0.08, 0.10, 0.12, 0.15],
    delay: 100,
  },
  ceremony: {
    type: "sine",
    frequencies: [262, 330, 392, 523, 659, 784],
    durations: [300, 300, 300, 300, 300, 800],
    gains: [0.10, 0.12, 0.14, 0.16, 0.18, 0.20],
    delay: 150,
  },
  nudge: {
    type: "triangle",
    frequencies: [523, 659],
    durations: [100, 200],
    gains: [0.06, 0.05],
    delay: 0,
  },
  diary_entry: {
    type: "sine",
    frequencies: [392, 494, 587],
    durations: [200, 200, 400],
    gains: [0.08, 0.08, 0.06],
    delay: 100,
  },
};

type SoundRecipe = {
  type: OscillatorType;
  frequencies: number[];
  durations: number[];  // ms per note
  gains: number[];      // volume per note
  delay: number;        // ms between notes
};

/**
 * サウンドを再生（ブラウザ環境のみ）
 *
 * 使用例:
 * ```
 * const ctx = new AudioContext();
 * playRendezvousSound(ctx, "mutual_like", { volume: 0.5 });
 * ```
 */
export function playRendezvousSound(
  audioContext: AudioContext,
  event: SoundEvent,
  options?: SoundOptions,
): void {
  const recipe = SOUND_RECIPES[event];
  if (!recipe) return;

  const masterVolume = options?.volume ?? 0.3;
  let currentTime = audioContext.currentTime;

  for (let i = 0; i < recipe.frequencies.length; i++) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = recipe.type;
    oscillator.frequency.value = recipe.frequencies[i];

    const noteGain = recipe.gains[i] * masterVolume;
    const noteDuration = recipe.durations[i] / 1000; // ms→s
    const noteDelay = (recipe.delay * i) / 1000;     // ms→s

    const startTime = currentTime + noteDelay;
    const endTime = startTime + noteDuration;

    // フェードイン・フェードアウト（クリック音防止）
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(noteGain, startTime + 0.01);
    gainNode.gain.setValueAtTime(noteGain, endTime - 0.05);
    gainNode.gain.linearRampToValueAtTime(0, endTime);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(startTime);
    oscillator.stop(endTime);
  }
}

/**
 * サウンド設定の型
 */
export type SoundSettings = {
  enabled: boolean;
  volume: number; // 0-1
  /** 各イベントの個別ON/OFF */
  eventSettings: Partial<Record<SoundEvent, boolean>>;
};

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: false, // デフォルトOFF
  volume: 0.3,
  eventSettings: {},
};
