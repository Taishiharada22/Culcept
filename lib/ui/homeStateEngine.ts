/**
 * Home State Engine — 全シグナルを統合してHomeの「モード」を決定する
 *
 * 入力: 観測データ、内面天気、ナラティブフェーズ、概日リズム、暗黙的シグナル
 * 出力: HomeState（depth, heroMoment, atmosphereOverrides, zones）
 *
 * これにより Day 1 と Day 90 のユーザーが全く異なるHome体験を得る。
 */

import type { NarrativeChapter } from "@/lib/stargazer/narrativeThreading";
import type { SessionImplicitProfile } from "@/lib/stargazer/implicitSignalCapture";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type UserDepth =
  | "newcomer"   // 0 observations
  | "explorer"   // 1-9
  | "observer"   // 10-29
  | "adept"      // 30-69
  | "master";    // 70+

export type HeroMoment =
  | "first_question"          // newcomer — 最初の観測CTA
  | "milestone_unlocked"      // マイルストーン到達
  | "streak_crisis"           // ストリーク危機
  | "vanishing_insight"       // 消える洞察
  | "contradiction_surfaced"  // 新しい矛盾
  | "prophecy_verify"         // 予言検証
  | "revelation"              // ナラティブ統合洞察
  | "ghost_encounter"         // ゴースト出現
  | "temporal_shift"          // 時間的変化
  | "calm_mirror";            // 穏やかな自己像（デフォルト）

export type ParticleMode = "standard" | "celebration" | "tension" | "stillness";

export type ZoneVisibility = "expanded" | "compact" | "teaser" | "hidden";

export interface AtmosphereOverrides {
  /** 0-1: 矛盾数・ストリーク危機・マイルストーンで上昇 */
  intensity: number;
  /** ナラティブフェーズ別アクセントカラー */
  narrativeColor: string;
  /** パーティクル挙動モード */
  particleMode: ParticleMode;
}

export interface ZoneConfig {
  today: "expanded";
  observe: "expanded" | "compact";
  connect: ZoneVisibility;
  identity: ZoneVisibility;
}

export interface HomeState {
  depth: UserDepth;
  heroMoment: HeroMoment;
  atmosphereOverrides: AtmosphereOverrides;
  zones: ZoneConfig;
  /** 概日フェーズ由来のUI調整ヒント */
  circadianHint: {
    primarySection: string;
    accentColor: string;
    atmosphereHint: string;
    backgroundIntensity: number;
  } | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input Context
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface HomeStateInput {
  // Wave 1: Core
  observationCount: number;
  confidence: number;

  // Wave 2: Daily
  streakDays: number;
  hasNewContradiction: boolean;
  hasVerifiableProphecy: boolean;
  vanishingInsightHoursLeft: number | null;
  predictionAccuracy: number;       // 0-1
  predictionAccuracyPrevWeek: number | null;  // 比較用

  // Narrative
  narrativeChapter: NarrativeChapter | null;
  narrativePhase: "prologue" | "exploration" | "confrontation" | "integration" | "mastery" | null;

  // Circadian
  hour: number;

  // Implicit
  implicitProfile: SessionImplicitProfile | null;

  // Milestones
  todayMilestoneUnlocked: boolean;
  hasNewGhost: boolean;
  hasTemporalShift: boolean;
  hasConvergentInsight: boolean;

  // Today's activity
  observedToday: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Depth Classification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function classifyDepth(observationCount: number): UserDepth {
  if (observationCount === 0) return "newcomer";
  if (observationCount < 10) return "explorer";
  if (observationCount < 30) return "observer";
  if (observationCount < 70) return "adept";
  return "master";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hero Moment Selection (priority order)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function selectHeroMoment(input: HomeStateInput, depth: UserDepth): HeroMoment {
  // Newcomer always sees first question
  if (depth === "newcomer") return "first_question";

  // 1. Milestone celebration (highest priority)
  if (input.todayMilestoneUnlocked) return "milestone_unlocked";

  // 2. Streak crisis (loss aversion)
  if (input.streakDays >= 3 && !input.observedToday) {
    const hour = input.hour;
    // 夕方以降でストリーク危機感を増す
    if (hour >= 18 || hour < 3) return "streak_crisis";
  }

  // 3. Vanishing insight (scarcity)
  if (input.vanishingInsightHoursLeft != null && input.vanishingInsightHoursLeft <= 3) {
    return "vanishing_insight";
  }

  // 4. New contradiction (curiosity gap)
  if (input.hasNewContradiction && depth !== "explorer") {
    return "contradiction_surfaced";
  }

  // 5. Prophecy verification (engagement loop)
  if (input.hasVerifiableProphecy) return "prophecy_verify";

  // 6. Convergent insight / narrative synthesis (revelation)
  if (input.hasConvergentInsight && depth !== "explorer") return "revelation";

  // 7. Ghost encounter (social discovery)
  if (input.hasNewGhost && input.observationCount >= 15) return "ghost_encounter";

  // 8. Temporal shift (self-change awareness)
  if (input.hasTemporalShift && input.observationCount >= 10) return "temporal_shift";

  // 9. Default: calm mirror
  return "calm_mirror";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Atmosphere Overrides
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NARRATIVE_PHASE_COLORS: Record<string, string> = {
  prologue: "#6366F1",       // indigo — 始まり
  exploration: "#3B82F6",    // blue — 探索
  confrontation: "#EF4444",  // red — 対峙
  integration: "#14B8A6",    // teal — 統合
  mastery: "#EAB308",        // gold — 熟達
};

function computeAtmosphereOverrides(
  input: HomeStateInput,
  heroMoment: HeroMoment,
): AtmosphereOverrides {
  let intensity = 0;
  let particleMode: ParticleMode = "standard";

  // 矛盾がある → tension
  if (input.hasNewContradiction) {
    intensity = Math.min(intensity + 0.3, 1);
    particleMode = "tension";
  }

  // ストリーク危機 → tension
  if (heroMoment === "streak_crisis") {
    intensity = Math.min(intensity + 0.4, 1);
    particleMode = "tension";
  }

  // マイルストーン → celebration
  if (heroMoment === "milestone_unlocked") {
    intensity = 0.8;
    particleMode = "celebration";
  }

  // ストリーク好調 → 暖かさ
  if (input.streakDays >= 7 && heroMoment !== "streak_crisis") {
    intensity = Math.min(intensity + 0.15, 1);
  }

  // 予測精度下降 → foggy（intensityはそのまま、particleはstandardのまま）
  if (
    input.predictionAccuracyPrevWeek != null &&
    input.predictionAccuracy < input.predictionAccuracyPrevWeek - 0.1
  ) {
    intensity = Math.min(intensity + 0.2, 1);
  }

  // calm_mirror → stillness
  if (heroMoment === "calm_mirror" && !input.hasNewContradiction) {
    particleMode = "stillness";
    intensity = Math.max(intensity - 0.1, 0);
  }

  // 深夜は常にstillness
  if (input.hour >= 2 && input.hour < 6) {
    particleMode = "stillness";
    intensity = Math.min(intensity, 0.3);
  }

  const narrativeColor =
    NARRATIVE_PHASE_COLORS[input.narrativePhase ?? "prologue"] ?? "#6366F1";

  return { intensity, narrativeColor, particleMode };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Zone Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function computeZones(depth: UserDepth): ZoneConfig {
  switch (depth) {
    case "newcomer":
      return {
        today: "expanded",
        observe: "expanded",
        connect: "hidden",
        identity: "hidden",
      };
    case "explorer":
      return {
        today: "expanded",
        observe: "expanded",
        connect: "hidden",
        identity: "hidden",
      };
    case "observer":
      return {
        today: "expanded",
        observe: "compact",
        connect: "teaser",
        identity: "teaser",
      };
    case "adept":
      return {
        today: "expanded",
        observe: "compact",
        connect: "expanded",
        identity: "expanded",
      };
    case "master":
      return {
        today: "expanded",
        observe: "compact",
        connect: "expanded",
        identity: "expanded",
      };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Circadian UI Hints (delegated to circadianEngagement)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getCircadianHints(hour: number): HomeState["circadianHint"] {
  // Import dynamically to avoid circular deps if needed
  // This is a lightweight computation so inline is fine
  const timeSlot =
    hour >= 6 && hour < 10 ? "morning" :
    hour >= 10 && hour < 14 ? "midday" :
    hour >= 14 && hour < 18 ? "afternoon" :
    hour >= 18 && hour < 22 ? "evening" :
    hour >= 22 || hour < 2 ? "night" : "late_night";

  const hints: Record<string, HomeState["circadianHint"]> = {
    morning: {
      primarySection: "prophecy",
      accentColor: "#F59E0B",
      atmosphereHint: "anticipation",
      backgroundIntensity: 0.6,
    },
    midday: {
      primarySection: "micro_observation",
      accentColor: "#3B82F6",
      atmosphereHint: "active",
      backgroundIntensity: 0.8,
    },
    afternoon: {
      primarySection: "calm_mirror",
      accentColor: "#14B8A6",
      atmosphereHint: "rest",
      backgroundIntensity: 0.4,
    },
    evening: {
      primarySection: "temporal_comparison",
      accentColor: "#8B5CF6",
      atmosphereHint: "reflection",
      backgroundIntensity: 0.7,
    },
    night: {
      primarySection: "vanishing_insight",
      accentColor: "#EF4444",
      atmosphereHint: "loss_aversion",
      backgroundIntensity: 0.5,
    },
    late_night: {
      primarySection: "deep_processing",
      accentColor: "#6366F1",
      atmosphereHint: "stillness",
      backgroundIntensity: 0.3,
    },
  };

  return hints[timeSlot] ?? hints.afternoon;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function computeHomeState(input: HomeStateInput): HomeState {
  const depth = classifyDepth(input.observationCount);
  const heroMoment = selectHeroMoment(input, depth);
  const atmosphereOverrides = computeAtmosphereOverrides(input, heroMoment);
  const zones = computeZones(depth);
  const circadianHint = getCircadianHints(input.hour);

  return {
    depth,
    heroMoment,
    atmosphereOverrides,
    zones,
    circadianHint,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature Unlock Thresholds (used by FeatureUnlockTeaser)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const FEATURE_THRESHOLDS = [
  { observations: 7,  label: "死角検出",           icon: "👁", description: "あなたが見えていない自分の一面" },
  { observations: 10, label: "内面天気図",         icon: "🌤", description: "気分と状況の可視化" },
  { observations: 14, label: "予言",               icon: "🔮", description: "分身が明日を予測する" },
  { observations: 15, label: "ゴーストレゾナンス", icon: "👻", description: "あなたと似た誰かの気配" },
  { observations: 20, label: "もうひとりの自分",   icon: "🪞", description: "影の自分との対話" },
  { observations: 30, label: "心理的署名",         icon: "✧",  description: "あなただけの心の指紋" },
] as const;

export function getNextUnlock(currentObservations: number): typeof FEATURE_THRESHOLDS[number] | null {
  return FEATURE_THRESHOLDS.find(t => t.observations > currentObservations) ?? null;
}

export function getUnlockedFeatures(currentObservations: number): typeof FEATURE_THRESHOLDS[number][] {
  return FEATURE_THRESHOLDS.filter(t => t.observations <= currentObservations);
}
