// hooks/useHaptics.ts
// 触覚フィードバック — navigator.vibrate() API
// 非対応デバイスでは no-op にフォールバック
// v2: パターン振動・連続シーケンス・名前付きパターンプリセット追加
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const LS_KEY = "sg_haptics_enabled";

function canVibrate(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  );
}

function vibrate(pattern: number | number[]): void {
  if (canVibrate()) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Silently ignore — some browsers throw on denied permission
    }
  }
}

// ---------------------------------------------------------------------------
// Named haptic pattern type — サウンドイベントとの連携用
// ---------------------------------------------------------------------------

export type HapticPatternName =
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "warning"
  | "notification"
  | "streak_milestone"
  | "prediction_verified"
  | "insight_appeared"
  | "contradiction_found"
  | "alter_typing"
  | "depth_dive"
  | "vanish_warning"
  | "morning_chime"
  | "question_confirm"
  | "peak_moment";

/** 各パターン名に対応する振動パターン定義 */
const HAPTIC_PATTERNS: Record<HapticPatternName, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [30, 50, 30, 50, 80],
  warning: [100, 30, 100],
  notification: [15, 50, 15],
  // 新規パターン
  streak_milestone: [20, 40, 20, 40, 20, 40, 60, 80, 120],
  prediction_verified: [40, 60, 80],
  insight_appeared: [10, 30, 10, 30, 50],
  contradiction_found: [80, 20, 80, 20, 40],
  alter_typing: [8, 60, 8, 60, 8],
  depth_dive: [15, 20, 25, 20, 35, 20, 50],
  vanish_warning: [30, 15, 30, 15, 30, 15, 30, 15, 30],
  morning_chime: [10, 80, 10, 80, 20],
  // 観測フロー v6 追加
  question_confirm: [15, 30, 25],
  peak_moment: [10, 20, 10, 20, 40],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface HapticsAPI {
  /** Light tap — ボタン押下、選択肢タップ */
  light: () => void;
  /** Medium impact — 回答確定、インサイト表示 */
  medium: () => void;
  /** Heavy impact — マイルストーン達成、啓示の瞬間 */
  heavy: () => void;
  /** Success pattern — 予測的中、ストリーク達成 */
  success: () => void;
  /** Warning pattern — 精度低下、矛盾検知 */
  warning: () => void;
  /** Notification pattern — 新インサイト、Alter メッセージ */
  notification: () => void;
  /** 名前付きパターンを実行 */
  playPattern: (name: HapticPatternName) => void;
  /** 連続パターンシーケンスを実行（間隔 ms 指定） */
  playSequence: (patterns: HapticPatternName[], intervalMs?: number) => void;
  /** 実行中のシーケンスをキャンセル */
  cancelSequence: () => void;
  /** Enable or disable haptics */
  setEnabled: (enabled: boolean) => void;
  /** Current enabled state */
  isEnabled: boolean;
}

export function useHaptics(): HapticsAPI {
  const [isEnabled, setIsEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const stored = localStorage.getItem(LS_KEY);
      return stored !== null ? stored !== "false" : canVibrate();
    } catch {
      return canVibrate();
    }
  });
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sequenceTimerRef.current.forEach(clearTimeout);
    };
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    setIsEnabled(enabled);
    try {
      localStorage.setItem(LS_KEY, String(enabled));
    } catch {
      // ignore
    }
  }, []);

  const guard = useCallback(
    (fn: () => void) => {
      if (isEnabled) fn();
    },
    [isEnabled],
  );

  // 基本パターン
  const light = useCallback(() => guard(() => vibrate(HAPTIC_PATTERNS.light)), [guard]);
  const medium = useCallback(() => guard(() => vibrate(HAPTIC_PATTERNS.medium)), [guard]);
  const heavy = useCallback(() => guard(() => vibrate(HAPTIC_PATTERNS.heavy)), [guard]);
  const success = useCallback(
    () => guard(() => vibrate(HAPTIC_PATTERNS.success)),
    [guard],
  );
  const warning = useCallback(
    () => guard(() => vibrate(HAPTIC_PATTERNS.warning)),
    [guard],
  );
  const notification = useCallback(
    () => guard(() => vibrate(HAPTIC_PATTERNS.notification)),
    [guard],
  );

  // 名前付きパターン実行
  const playPattern = useCallback(
    (name: HapticPatternName) => {
      const pattern = HAPTIC_PATTERNS[name];
      if (pattern !== undefined) {
        guard(() => vibrate(pattern));
      }
    },
    [guard],
  );

  // パターンの合計時間を算出（振動+休止の合計 ms）
  const getPatternDuration = useCallback((name: HapticPatternName): number => {
    const pattern = HAPTIC_PATTERNS[name];
    if (typeof pattern === "number") return pattern;
    return pattern.reduce((sum, v) => sum + v, 0);
  }, []);

  // 連続シーケンス実行
  const cancelSequence = useCallback(() => {
    sequenceTimerRef.current.forEach(clearTimeout);
    sequenceTimerRef.current = [];
    // 実行中の振動も停止
    if (canVibrate()) {
      try {
        navigator.vibrate(0);
      } catch {
        // ignore
      }
    }
  }, []);

  const playSequence = useCallback(
    (patterns: HapticPatternName[], intervalMs = 100) => {
      cancelSequence();
      let cumulativeDelay = 0;

      patterns.forEach((name, idx) => {
        const timer = setTimeout(() => {
          playPattern(name);
        }, cumulativeDelay);
        sequenceTimerRef.current.push(timer);

        // 次のパターンまでの待ち時間 = 現パターン長 + インターバル
        cumulativeDelay += getPatternDuration(name) + (idx < patterns.length - 1 ? intervalMs : 0);
      });
    },
    [cancelSequence, playPattern, getPatternDuration],
  );

  return {
    light,
    medium,
    heavy,
    success,
    warning,
    notification,
    playPattern,
    playSequence,
    cancelSequence,
    setEnabled,
    isEnabled,
  };
}
