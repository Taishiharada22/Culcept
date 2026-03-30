// lib/stargazer/atmosphereConfig.ts
// 心理的雰囲気設定 — カテゴリ/テーマごとの視覚環境
// ユーザーの心理状態に影響を与える色・動き・テンポの定義
// 原則: 速い回答者を減速させ、内省的な状態に導く

import type { Stage1Category } from "./stage1Questions";
import type { ProbeContext } from "./stage2Probes";

export interface AtmosphereConfig {
  /** 主要アクセントカラー (CSS rgba) */
  primaryColor: string;
  /** グロウカラー (CSS rgba, 低opacity) */
  glowColor: string;
  /** 背景グラデーション — 質問カード背後に配置 */
  backgroundGradient: string;
  /** 呼吸リズムの周期 (ms) */
  breathingCycleMs: number;
  /** 感情的深度 0-1 — 深いほどUIが暗く親密に */
  emotionalDepth: number;
  /** 心理的安全プライム — カテゴリ開始時に表示する言葉 */
  safetyPrime: string;
}

// ── Stage 1 カテゴリ雰囲気 ──
// 浅い自己認識から深い関係性・境界線へ段階的に深まる

export const STAGE1_ATMOSPHERE: Record<Stage1Category, AtmosphereConfig> = {
  self_core: {
    primaryColor: "rgba(139,92,246,0.8)",
    glowColor: "rgba(139,92,246,0.12)",
    backgroundGradient:
      "radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.06) 0%, transparent 70%)",
    breathingCycleMs: 6000,
    emotionalDepth: 0.2,
    safetyPrime: "正解はありません。浮かんだまま選んでください",
  },
  emotional_pattern: {
    primaryColor: "rgba(59,130,246,0.8)",
    glowColor: "rgba(59,130,246,0.10)",
    backgroundGradient:
      "radial-gradient(ellipse at 50% 30%, rgba(59,130,246,0.05) 0%, transparent 70%)",
    breathingCycleMs: 5000,
    emotionalDepth: 0.35,
    safetyPrime: "感じたことをそのまま。考えすぎなくて大丈夫です",
  },
  social_style: {
    primaryColor: "rgba(251,191,36,0.8)",
    glowColor: "rgba(251,191,36,0.10)",
    backgroundGradient:
      "radial-gradient(ellipse at 50% 20%, rgba(251,191,36,0.05) 0%, transparent 70%)",
    breathingCycleMs: 4500,
    emotionalDepth: 0.3,
    safetyPrime: "人との距離に正しい形はありません",
  },
  relationship_mode: {
    primaryColor: "rgba(236,72,153,0.8)",
    glowColor: "rgba(236,72,153,0.10)",
    backgroundGradient:
      "radial-gradient(ellipse at 50% 40%, rgba(236,72,153,0.04) 0%, transparent 70%)",
    breathingCycleMs: 5500,
    emotionalDepth: 0.45,
    safetyPrime: "関係性のスタイルに優劣はありません",
  },
  boundary_safety: {
    primaryColor: "rgba(20,184,166,0.8)",
    glowColor: "rgba(20,184,166,0.10)",
    backgroundGradient:
      "radial-gradient(ellipse at 50% 50%, rgba(20,184,166,0.04) 0%, transparent 70%)",
    breathingCycleMs: 6500,
    emotionalDepth: 0.55,
    safetyPrime: "自分の感覚を大切にしてください",
  },
  style_identity: {
    primaryColor: "rgba(251,146,60,0.8)",
    glowColor: "rgba(251,146,60,0.10)",
    backgroundGradient:
      "radial-gradient(ellipse at 50% 30%, rgba(251,146,60,0.04) 0%, transparent 70%)",
    breathingCycleMs: 4000,
    emotionalDepth: 0.25,
    safetyPrime: "あなたらしさに正解はありません",
  },
};

// ── Stage 2 プローブ雰囲気 ──
// Stage 1 より深い・親密な視覚環境

export const STAGE2_ATMOSPHERE: Record<ProbeContext, AtmosphereConfig> = {
  friends: {
    primaryColor: "rgba(74,222,128,0.8)",
    glowColor: "rgba(74,222,128,0.08)",
    backgroundGradient:
      "radial-gradient(ellipse at 50% 40%, rgba(74,222,128,0.04) 0%, transparent 70%)",
    breathingCycleMs: 5000,
    emotionalDepth: 0.5,
    safetyPrime: "友人との関係に唯一の正解はありません",
  },
  romance: {
    primaryColor: "rgba(244,114,182,0.8)",
    glowColor: "rgba(244,114,182,0.08)",
    backgroundGradient:
      "radial-gradient(ellipse at 50% 40%, rgba(244,114,182,0.04) 0%, transparent 70%)",
    breathingCycleMs: 6000,
    emotionalDepth: 0.65,
    safetyPrime: "どの選択肢も自然な反応です",
  },
  long_term: {
    primaryColor: "rgba(251,191,36,0.8)",
    glowColor: "rgba(251,191,36,0.08)",
    backgroundGradient:
      "radial-gradient(ellipse at 50% 40%, rgba(251,191,36,0.04) 0%, transparent 70%)",
    breathingCycleMs: 7000,
    emotionalDepth: 0.7,
    safetyPrime: "長期的な変化は自然なことです",
  },
  collab: {
    primaryColor: "rgba(59,130,246,0.8)",
    glowColor: "rgba(59,130,246,0.08)",
    backgroundGradient:
      "radial-gradient(ellipse at 50% 40%, rgba(59,130,246,0.04) 0%, transparent 70%)",
    breathingCycleMs: 5000,
    emotionalDepth: 0.45,
    safetyPrime: "協力のスタイルに優劣はありません",
  },
  cross_gender_friendship: {
    primaryColor: "rgba(168,85,247,0.8)",
    glowColor: "rgba(168,85,247,0.08)",
    backgroundGradient:
      "radial-gradient(ellipse at 50% 40%, rgba(168,85,247,0.04) 0%, transparent 70%)",
    breathingCycleMs: 6500,
    emotionalDepth: 0.6,
    safetyPrime: "自分の感覚を信じてください",
  },
};

// ── Stage 2 深度レベル ──
// 5ステップで視覚的に「深く潜っていく」感覚

export const PROBE_DEPTH_LEVELS = [
  { opacity: 0.88, blur: 8, labelJa: "表層", depthFactor: 0.0 },
  { opacity: 0.82, blur: 12, labelJa: "理由", depthFactor: 0.25 },
  { opacity: 0.76, blur: 16, labelJa: "変化", depthFactor: 0.5 },
  { opacity: 0.70, blur: 20, labelJa: "逆転", depthFactor: 0.75 },
  { opacity: 0.64, blur: 24, labelJa: "深層", depthFactor: 1.0 },
] as const;

// ── 適応的呼吸間隔 ──

/**
 * 応答時間から適応的な呼吸間の長さを計算
 * 速い回答 → 長い呼吸（考える間を与える）
 * 遅い回答 → 短い呼吸（すでに考えたので待たせない）
 */
export function getAdaptiveBreathingMs(responseTimeMs: number): number {
  if (responseTimeMs < 2000) return 3200;
  if (responseTimeMs < 4000) return 2600;
  if (responseTimeMs < 8000) return 1800;
  if (responseTimeMs < 15000) return 1200;
  return 800;
}

// ── ためらい検出 ──

export interface HesitationSignal {
  /** 選択変更回数 */
  selectionChanges: number;
  /** 最初の選択までの時間 (ms) */
  timeToFirstSelection: number;
  /** 確定までの総時間 (ms) */
  totalResponseTimeMs: number;
  /** ためらいが検出されたか */
  detected: boolean;
}

/**
 * ためらいが意味のあるシグナルかどうか判定
 */
export function isSignificantHesitation(signal: HesitationSignal): boolean {
  // 選択を2回以上変更した
  if (signal.selectionChanges >= 2) return true;
  // 最初の選択まで10秒以上かかった
  if (signal.timeToFirstSelection > 10000) return true;
  // 選択変更 + 総時間が長い
  if (signal.selectionChanges >= 1 && signal.totalResponseTimeMs > 12000)
    return true;
  return false;
}
