"use client";
// components/ui/SemanticAnimations.tsx
// 全13イベントのCSS keyframe定義 + アニメーショントリガーコンポーネント

/** Haptic feedback utility — triggers device vibration for important interactions */
export function executeHaptic(type: "light" | "medium" | "heavy" = "light") {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  const patterns: Record<string, number | number[]> = {
    light: 10,
    medium: 25,
    heavy: [30, 10, 30],
  };
  try {
    navigator.vibrate(patterns[type]);
  } catch { /* vibration not supported */ }
}

export function SemanticAnimationStyles() {
  return (
    <style>{`
      @keyframes contradiction-crack {
        0% { filter: none; transform: scale(1); }
        15% { filter: brightness(1.3); transform: scale(1.02); }
        30% { filter: brightness(0.9) hue-rotate(10deg); transform: scale(0.99); }
        60% { filter: brightness(1.05); transform: scale(1.01); }
        100% { filter: none; transform: scale(1); }
      }
      @keyframes prediction-star {
        0% { box-shadow: none; }
        30% { box-shadow: 0 0 24px rgba(234,179,8,0.5), 0 0 48px rgba(234,179,8,0.2); }
        100% { box-shadow: 0 0 8px rgba(234,179,8,0.15); }
      }
      @keyframes prediction-ripple {
        0% { box-shadow: 0 0 0 0 rgba(99,102,241,0.3); }
        100% { box-shadow: 0 0 0 20px rgba(99,102,241,0); }
      }
      @keyframes fog-clear {
        0% { backdrop-filter: blur(8px); opacity: 0.4; }
        50% { backdrop-filter: blur(4px); opacity: 0.7; }
        100% { backdrop-filter: blur(0px); opacity: 1; }
      }
      @keyframes streak-fire {
        0% { text-shadow: none; transform: scale(1); }
        50% { text-shadow: 0 0 12px rgba(249,115,22,0.5); transform: scale(1.08); }
        100% { text-shadow: 0 0 4px rgba(249,115,22,0.2); transform: scale(1); }
      }
      @keyframes level-dive {
        0% { filter: none; transform: translateY(0) scale(1); }
        30% { filter: blur(2px) brightness(0.8); transform: translateY(10px) scale(0.98); }
        60% { filter: blur(4px) brightness(0.6); transform: translateY(20px) scale(0.96); }
        80% { filter: blur(2px) brightness(0.9); transform: translateY(5px) scale(0.99); }
        100% { filter: none; transform: translateY(0) scale(1); }
      }
      @keyframes insight-glow {
        0% { box-shadow: none; }
        50% { box-shadow: 0 0 16px rgba(139,92,246,0.2), inset 0 0 8px rgba(139,92,246,0.05); }
        100% { box-shadow: 0 0 6px rgba(139,92,246,0.1); }
      }
      @keyframes crystal-form {
        0% { opacity: 0; filter: blur(4px); transform: scale(0.9); }
        60% { opacity: 0.8; filter: blur(1px); transform: scale(1.02); }
        100% { opacity: 1; filter: blur(0); transform: scale(1); text-shadow: 0 0 12px rgba(139,92,246,0.2); }
      }
      @keyframes answer-confirm {
        0% { transform: scale(1); background-color: transparent; }
        50% { transform: scale(1.02); background-color: rgba(59,130,246,0.05); }
        100% { transform: scale(1); background-color: transparent; }
      }
      @keyframes session-done {
        0% { transform: scale(1); }
        40% { transform: scale(1.06); }
        70% { transform: scale(0.98); }
        100% { transform: scale(1); }
      }
      @keyframes constellation-connect {
        0% { opacity: 0.5; filter: blur(2px); }
        50% { opacity: 1; filter: blur(0); box-shadow: 0 0 20px rgba(236,72,153,0.3); }
        100% { opacity: 1; filter: none; box-shadow: 0 0 8px rgba(236,72,153,0.1); }
      }
      @keyframes vanish-tick {
        0% { opacity: 1; }
        50% { opacity: 0.6; transform: scale(0.98); }
        100% { opacity: 1; transform: scale(1); }
      }
      @keyframes primaryActionPulse {
        0%, 100% { box-shadow: 0 8px 32px rgba(99,102,241,0.2), 0 2px 8px rgba(0,0,0,0.12); }
        50% { box-shadow: 0 8px 48px rgba(99,102,241,0.35), 0 4px 16px rgba(0,0,0,0.15); }
      }
    `}</style>
  );
}
