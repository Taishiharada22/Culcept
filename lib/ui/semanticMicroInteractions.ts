// lib/ui/semanticMicroInteractions.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Semantic Micro-Interactions（意味的マイクロインタラクション）
//
// Linearの原則: 全てのアニメーションに「意味」がある。
// 何かが動くのは「見た目のため」ではなく「意味を伝えるため」。
//
// Aneurasyncの各イベントに、視覚＋音＋触覚の統合体験を定義。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** インタラクションイベントの種類 */
export type InteractionEvent =
  | "contradiction_detected"    // 矛盾検出: ひび割れエフェクト
  | "prediction_hit"            // 予測的中: 星の点灯
  | "prediction_miss"           // 予測外れ: 軌道のズレ
  | "blind_spot_revealed"       // 盲点発見: 霧が晴れる
  | "streak_updated"            // ストリーク更新: 炎のパルス
  | "level_up"                  // レベルアップ: 潜水トランジション
  | "insight_surface"           // 表層洞察: 軽いフェード
  | "insight_deep"              // 深層洞察: 浮上アニメーション
  | "insight_core"              // 核心洞察: 結晶化
  | "answer_submitted"          // 回答送信: 確認パルス
  | "session_complete"          // セッション完了: 達成感
  | "new_match"                 // 新しいマッチ: 星座の接続
  | "vanishing_warning";        // 消える洞察の警告: 点滅

/** マイクロインタラクションの定義 */
export interface MicroInteraction {
  /** イベント種類 */
  event: InteractionEvent;
  /** 視覚エフェクト */
  visual: VisualEffect;
  /** ハプティクスパターン */
  haptic: HapticPattern;
  /** 効果音（キー名） */
  sound: SoundEffect;
  /** 所要時間（ms） */
  durationMs: number;
}

export interface VisualEffect {
  /** エフェクトの種類 */
  type: "pulse" | "ripple" | "crack" | "glow" | "fade" | "shake" | "expand" | "particles" | "none";
  /** CSS animation名（コンポーネント側で定義） */
  animationName: string;
  /** 色 */
  color: string;
  /** 強度（0-1） */
  intensity: number;
  /** スケール変化 */
  scale: [number, number]; // [from, to]
}

export type HapticPattern =
  | "none"
  | "light_tap"      // 軽いタップ（回答送信）
  | "medium_tap"     // 中程度のタップ（洞察表示）
  | "heavy_tap"      // 強いタップ（矛盾検出）
  | "double_tap"     // 二重タップ（予測的中）
  | "long_press"     // 長いプレス（レベルアップ）
  | "pattern_321";   // 3-2-1パターン（セッション完了）

export type SoundEffect =
  | "none"
  | "chime_soft"       // 柔らかいチャイム（表層洞察）
  | "chime_bright"     // 明るいチャイム（予測的中）
  | "resonance_deep"   // 深い共鳴（深層洞察）
  | "crystal_form"     // 結晶化音（核心洞察）
  | "crack_subtle"     // 微かなひび割れ（矛盾検出）
  | "fog_clear"        // 霧が晴れる（盲点発見）
  | "fire_pulse"       // 炎のパルス（ストリーク）
  | "dive_splash"      // 潜水音（レベルアップ）
  | "constellation"    // 星座接続音（マッチ）
  | "warning_tick"     // 警告のティック（消える洞察）
  | "complete_chord";  // 完了の和音（セッション完了）

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Interaction Definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const INTERACTIONS: Record<InteractionEvent, MicroInteraction> = {
  contradiction_detected: {
    event: "contradiction_detected",
    visual: { type: "crack", animationName: "contradiction-crack", color: "rgba(239,68,68,0.3)", intensity: 0.7, scale: [1, 1.02] },
    haptic: "heavy_tap",
    sound: "crack_subtle",
    durationMs: 600,
  },
  prediction_hit: {
    event: "prediction_hit",
    visual: { type: "glow", animationName: "prediction-star", color: "rgba(234,179,8,0.4)", intensity: 0.8, scale: [0.95, 1.05] },
    haptic: "double_tap",
    sound: "chime_bright",
    durationMs: 800,
  },
  prediction_miss: {
    event: "prediction_miss",
    visual: { type: "ripple", animationName: "prediction-ripple", color: "rgba(99,102,241,0.2)", intensity: 0.4, scale: [1, 1.01] },
    haptic: "light_tap",
    sound: "chime_soft",
    durationMs: 500,
  },
  blind_spot_revealed: {
    event: "blind_spot_revealed",
    visual: { type: "fade", animationName: "fog-clear", color: "rgba(255,255,255,0.5)", intensity: 0.6, scale: [1, 1] },
    haptic: "medium_tap",
    sound: "fog_clear",
    durationMs: 1200,
  },
  streak_updated: {
    event: "streak_updated",
    visual: { type: "pulse", animationName: "streak-fire", color: "rgba(249,115,22,0.3)", intensity: 0.5, scale: [1, 1.08] },
    haptic: "light_tap",
    sound: "fire_pulse",
    durationMs: 400,
  },
  level_up: {
    event: "level_up",
    visual: { type: "expand", animationName: "level-dive", color: "rgba(99,102,241,0.4)", intensity: 1.0, scale: [1, 1.5] },
    haptic: "long_press",
    sound: "dive_splash",
    durationMs: 2000,
  },
  insight_surface: {
    event: "insight_surface",
    visual: { type: "none", animationName: "", color: "transparent", intensity: 0, scale: [1, 1] },
    haptic: "none",
    sound: "none",
    durationMs: 200,
  },
  insight_deep: {
    event: "insight_deep",
    visual: { type: "glow", animationName: "insight-glow", color: "rgba(139,92,246,0.15)", intensity: 0.5, scale: [0.98, 1] },
    haptic: "medium_tap",
    sound: "resonance_deep",
    durationMs: 3000,
  },
  insight_core: {
    event: "insight_core",
    visual: { type: "particles", animationName: "crystal-form", color: "rgba(139,92,246,0.3)", intensity: 0.8, scale: [0.95, 1] },
    haptic: "heavy_tap",
    sound: "crystal_form",
    durationMs: 5000,
  },
  answer_submitted: {
    event: "answer_submitted",
    visual: { type: "pulse", animationName: "answer-confirm", color: "rgba(59,130,246,0.15)", intensity: 0.3, scale: [1, 1.02] },
    haptic: "light_tap",
    sound: "none",
    durationMs: 200,
  },
  session_complete: {
    event: "session_complete",
    visual: { type: "expand", animationName: "session-done", color: "rgba(34,197,94,0.2)", intensity: 0.6, scale: [1, 1.1] },
    haptic: "pattern_321",
    sound: "complete_chord",
    durationMs: 1200,
  },
  new_match: {
    event: "new_match",
    visual: { type: "particles", animationName: "constellation-connect", color: "rgba(236,72,153,0.25)", intensity: 0.7, scale: [0.95, 1.05] },
    haptic: "double_tap",
    sound: "constellation",
    durationMs: 1500,
  },
  vanishing_warning: {
    event: "vanishing_warning",
    visual: { type: "pulse", animationName: "vanish-tick", color: "rgba(239,68,68,0.15)", intensity: 0.4, scale: [1, 0.98] },
    haptic: "light_tap",
    sound: "warning_tick",
    durationMs: 300,
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Entry Points
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** イベントのマイクロインタラクション定義を取得 */
export function getInteraction(event: InteractionEvent): MicroInteraction {
  return INTERACTIONS[event];
}

/**
 * ハプティクスを実行
 * Web Vibration API を使用（対応デバイスのみ）
 */
export function triggerHaptic(pattern: HapticPattern): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;

  const patterns: Record<HapticPattern, number[]> = {
    none: [],
    light_tap: [10],
    medium_tap: [25],
    heavy_tap: [50],
    double_tap: [20, 50, 20],
    long_press: [100],
    pattern_321: [30, 40, 20, 40, 10],
  };

  const vibration = patterns[pattern];
  if (vibration.length > 0) {
    try {
      navigator.vibrate(vibration);
    } catch {
      // Safari等、Vibration API非対応
    }
  }
}

/**
 * インタラクションの全効果を実行するヘルパー
 *
 * 使い方:
 * ```tsx
 * import { executeInteraction } from "@/lib/ui/semanticMicroInteractions";
 *
 * // 矛盾検出時:
 * executeInteraction("contradiction_detected", {
 *   onVisual: (effect) => setActiveEffect(effect),
 *   onSound: (sound) => playSound(sound),
 * });
 * ```
 */
export function executeInteraction(
  event: InteractionEvent,
  handlers: {
    onVisual?: (effect: VisualEffect) => void;
    onSound?: (sound: SoundEffect) => void;
  },
): void {
  const interaction = INTERACTIONS[event];

  // ハプティクス（即座に）
  triggerHaptic(interaction.haptic);

  // 視覚エフェクト
  if (interaction.visual.type !== "none" && handlers.onVisual) {
    handlers.onVisual(interaction.visual);
  }

  // 効果音
  if (interaction.sound !== "none" && handlers.onSound) {
    handlers.onSound(interaction.sound);
  }
}
