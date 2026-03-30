// lib/stargazer/depthPhaseController.ts
// ──────────────────────────────────────────────────────────────────────
// Stargazer v4 — 4フェーズ深度コントローラー
//
// ユーザーの観測日数と行動データから現在の深度フェーズを決定し、
// 各 v4 機能の解放状態・制限・次のアンロック条件を返す。
//
// フェーズ:
//   surface   (Day 1-7)   … 表層観測期。最小限の機能で信頼構築
//   awakening (Day 8-30)  … 覚醒期。コア機能が解放され始める
//   maturity  (Day 31-90) … 成熟期。深層機能が解放、精度が向上
//   deep      (Day 91+)   … 深層期。全機能解放、最高精度
// ──────────────────────────────────────────────────────────────────────

// ═══ Types ═══

export type DepthPhase = "surface" | "awakening" | "maturity" | "deep";

export type V4Feature =
  | "blind_spot"
  | "prophecy"
  | "inner_weather"
  | "unseen_map"
  | "alter"
  | "decision_oracle"
  | "ghost_resonance"
  | "psyche_signature"
  | "values_discovery"
  | "core_wound"
  | "parts_dialogue"
  | "transformation"
  | "life_events"
  | "micro_ema"
  | "act_hexaflex"
  | "transform_simulation"
  | "dream_journal"
  | "circadian_rhythm";

export type FeatureAccess = "locked" | "limited" | "full";

export interface FeatureState {
  feature: V4Feature;
  access: FeatureAccess;
  /** アクセス不可・制限中の場合の理由（日本語） */
  reason?: string;
  /** 機能固有の制限値（例: alter の最大ターン数） */
  limits?: Record<string, number>;
  /** 次のアンロック条件（日本語） */
  unlockHint?: string;
}

export interface PhaseState {
  phase: DepthPhase;
  daysSinceFirstObservation: number;
  totalObservations: number;
  /** フェーズ内の進行度 0.0-1.0 */
  phaseProgress: number;
  /** 次のフェーズ名（deep なら undefined） */
  nextPhase?: DepthPhase;
  /** 次のフェーズまでの残り日数（推定） */
  daysToNextPhase?: number;
  /** 各機能の解放状態 */
  features: FeatureState[];
  /** フェーズに合わせた挨拶メッセージ */
  phaseMessage: string;
}

export interface PhaseInput {
  /** 初回観測日（ISO string or Date） */
  firstObservationDate: string | Date;
  /** 累計観測セッション数 */
  totalObservations: number;
  /** 直近7日間のアクティブ日数 */
  recentActiveDays?: number;
  /** 予言の累計精度（0-1, undefined = 未検証） */
  prophecyAccuracy?: number;
  /** Alter セッション回数 */
  alterSessionCount?: number;
  /** サブスクリプション（true = 有料ユーザー） */
  isPremium?: boolean;
  /** ベータテスター: true の場合、全機能を deep フェーズ・full アクセスで解放 */
  forceFullAccess?: boolean;
}

// ═══ Phase Thresholds ═══

/**
 * フェーズ閾値の科学的根拠:
 *
 * - surface → awakening (8日, 5観測):
 *   1週間以上の継続エンゲージメントはコミットしたユーザーをフィルタする。
 *   最低5観測で各主要軸に初期データが確保される (Goldberg, 1999)。
 *
 * - awakening → maturity (31日, 20観測):
 *   1ヶ月時点でテスト-再テスト信頼性が許容水準に達する
 *   (Roberts & DelVecchio, 2000)。
 *
 * - maturity → deep (91日, 60観測):
 *   3ヶ月の縦断的閾値。性格評価文献において、特性レベルのパターンとは
 *   区別される状態レベルの変動を検出するための最低期間
 *   (Fleeson, 2001)。
 */
const PHASE_THRESHOLDS: { phase: DepthPhase; minDays: number; minObs: number }[] = [
  { phase: "deep", minDays: 91, minObs: 60 },
  { phase: "maturity", minDays: 31, minObs: 20 },
  { phase: "awakening", minDays: 8, minObs: 5 },
  { phase: "surface", minDays: 0, minObs: 0 },
];

// ═══ Feature Access Rules ═══

interface FeatureRule {
  feature: V4Feature;
  /** 解放される最低フェーズ */
  minPhase: DepthPhase;
  /** limited → full に昇格するフェーズ */
  fullPhase: DepthPhase;
  /** 最低観測数（minPhase でも最低これだけ必要） */
  minObservations: number;
  /** limited 時の制限 */
  limitedLimits?: Record<string, number>;
  /** ロック時のヒント */
  lockHint: string;
  /** limited 時の理由 */
  limitedReason?: string;
  /** limited → full へのヒント */
  upgradeHint?: string;
}

const PHASE_ORDER: Record<DepthPhase, number> = {
  surface: 0,
  awakening: 1,
  maturity: 2,
  deep: 3,
};

const FEATURE_RULES: FeatureRule[] = [
  // ── Day 1 から利用可能 ──
  {
    feature: "inner_weather",
    minPhase: "surface",
    fullPhase: "surface",
    minObservations: 0,
    lockHint: "",
  },
  // ── Day 3+ から利用可能 ──
  {
    feature: "blind_spot",
    minPhase: "surface",
    fullPhase: "awakening",
    minObservations: 3,
    limitedLimits: { maxIntensity: 3, tonesAvailable: 1 }, // warm only
    lockHint: "あと少し観測すると「自分では見えない自分」が見えてくるよ",
    limitedReason: "まだお互いを知ってる途中。やさしめのトーンだけね",
    upgradeHint: "観測を続けると、もっと鋭い気づきが出てくるよ",
  },

  // ── Day 8+ から利用可能 ──
  {
    feature: "prophecy",
    minPhase: "awakening",
    fullPhase: "maturity",
    minObservations: 5,
    limitedLimits: { maxCategories: 3, maxConfidence: 60 },
    lockHint: "8日間観測すると、あなたの行動を予測できるようになるよ",
    limitedReason: "まだデータを集めてるところ。予測のジャンルと精度に制限があるよ",
    upgradeHint: "31日間の観測で全ジャンルの予測が使えるようになるよ",
  },
  {
    feature: "unseen_map",
    minPhase: "awakening",
    fullPhase: "awakening",
    minObservations: 5,
    lockHint: "8日間の観測で、まだ知らない自分の地図が見えてくるよ",
  },
  {
    feature: "ghost_resonance",
    minPhase: "awakening",
    fullPhase: "maturity",
    minObservations: 8,
    limitedLimits: { maxEntries: 3, maxCategories: 2 },
    lockHint: "8日間＋8回以上の観測で、似たパターンの人が見えてくるよ",
    limitedReason: "まだパターンを集めてるところ。似た人は3件まで",
    upgradeHint: "31日間の観測で全ジャンルの共鳴が見えるようになるよ",
  },

  // ── Day 14+ から利用可能 ──
  {
    feature: "alter",
    minPhase: "awakening",
    fullPhase: "maturity",
    minObservations: 10,
    limitedLimits: { maxTurnsPerSession: 5, modesAvailable: 1 }, // warm only
    lockHint: "10回以上の観測で、もうひとりの自分と話せるようになるよ",
    limitedReason: "まだお互いを知ってる途中。1回の対話は5ターンまでだよ",
    upgradeHint: "31日間の観測で、もっと本音に切り込むモードが使えるよ",
  },

  // ── Day 31+ から利用可能 ──
  {
    feature: "decision_oracle",
    minPhase: "maturity",
    fullPhase: "deep",
    minObservations: 20,
    limitedLimits: { maxQueriesPerDay: 3 },
    lockHint: "31日間＋20回以上の観測で、あなたの選択を予測できるようになるよ",
    limitedReason: "精度を上げてるところ。1日3回まで使えるよ",
    upgradeHint: "91日間の観測で回数制限なしで使えるようになるよ",
  },
  {
    feature: "psyche_signature",
    minPhase: "maturity",
    fullPhase: "maturity",
    minObservations: 20,
    lockHint: "31日間の観測で、あなただけの心の指紋が完成するよ",
  },

  // ── 6層フレームワーク追加機能 ──

  // L5: 価値観の発見 (awakening)
  {
    feature: "values_discovery",
    minPhase: "awakening",
    fullPhase: "awakening",
    minObservations: 5,
    lockHint: "8日間の観測で、あなたの価値観が見えてくるよ",
  },
  // L5: Micro-EMA (awakening)
  {
    feature: "micro_ema",
    minPhase: "awakening",
    fullPhase: "awakening",
    minObservations: 5,
    lockHint: "8日間の観測で、瞬間的な気分の記録ができるようになるよ",
  },
  // Life events (awakening)
  {
    feature: "life_events",
    minPhase: "awakening",
    fullPhase: "awakening",
    minObservations: 5,
    lockHint: "8日間の観測で、人生の出来事を記録できるようになるよ",
  },
  // L4: 核心的な傷 (maturity)
  {
    feature: "core_wound",
    minPhase: "maturity",
    fullPhase: "maturity",
    minObservations: 20,
    lockHint: "31日間の観測で、心の奥にある大事なテーマに向き合えるよ",
  },
  // L4: パーツ対話 (maturity)
  {
    feature: "parts_dialogue",
    minPhase: "maturity",
    fullPhase: "deep",
    minObservations: 20,
    limitedLimits: { maxParts: 3 },
    lockHint: "31日間の観測で、自分の中のいろんな声と対話できるよ",
    limitedReason: "まだ信頼を築いてるところ。3つの声まで話せるよ",
    upgradeHint: "91日間の観測で全部の声と話せるようになるよ",
  },
  // L6: 変容の意図 (deep)
  {
    feature: "transformation",
    minPhase: "deep",
    fullPhase: "deep",
    minObservations: 60,
    lockHint: "91日間の観測を経て、なりたい自分を宣言できるようになるよ",
  },

  // ── Phase 6 追加機能 ──
  {
    feature: "act_hexaflex",
    minPhase: "awakening",
    fullPhase: "maturity",
    minObservations: 10,
    lockHint: "10回以上の観測で、心のしなやかさを測れるようになるよ",
  },
  {
    feature: "transform_simulation",
    minPhase: "maturity",
    fullPhase: "deep",
    minObservations: 20,
    lockHint: "31日間の観測で「もし自分が変わったら」をシミュレーションできるよ",
  },
  {
    feature: "dream_journal",
    minPhase: "awakening",
    fullPhase: "awakening",
    minObservations: 5,
    lockHint: "8日間の観測で、夢の記録ができるようになるよ",
  },
  {
    feature: "circadian_rhythm",
    minPhase: "maturity",
    fullPhase: "maturity",
    minObservations: 20,
    lockHint: "気分の記録が増えると、1日のリズムが分析できるようになるよ",
  },
];

// ═══ Phase Messages ═══

const PHASE_MESSAGES: Record<DepthPhase, string[]> = {
  surface: [
    "観測が始まったばかり。まずはあなたのことを知っていくね。",
    "少しずつ、あなたの輪郭が見えてきてるよ。",
    "最初の数日はお互いを知る時間。焦らなくて大丈夫。",
  ],
  awakening: [
    "あなたのパターンが見え始めた。面白いものが隠れてるよ。",
    "表面の下で何かが動いてる。一緒に見ていこう。",
    "データが語り始めてる。あなたが気づいてない「あなた」が。",
  ],
  maturity: [
    "あなたの全体像がかなりはっきりしてきた。深いところへようこそ。",
    "矛盾や揺れの中に、あなたらしさが浮かび上がってきてる。",
    "予言の精度が上がるほど、あなた自身の理解が深まってる証拠だよ。",
  ],
  deep: [
    "ここまで自分を知ろうとした人は少ない。すごいことだよ。",
    "あなたの深いところにあるもの、ちゃんと見えてきてる。",
    "自分に隠してたもの、そろそろ最後の一枚が見えてくるかも。",
  ],
};

// ═══ Main Function ═══

export function resolvePhaseState(input: PhaseInput): PhaseState {
  // ベータテスター: 全機能を deep フェーズ・full アクセスで即時解放
  if (input.forceFullAccess) {
    const allFeaturesFull: import("./depthPhaseController").FeatureState[] =
      FEATURE_RULES.map((rule) => ({
        feature: rule.feature,
        access: "full" as const,
      }));
    const messages = PHASE_MESSAGES["deep"];
    const seed = hashDateStr(new Date().toISOString().slice(0, 10));
    return {
      phase: "deep",
      daysSinceFirstObservation: 999,
      totalObservations: 999,
      phaseProgress: 1.0,
      features: allFeaturesFull,
      phaseMessage: messages[seed % messages.length],
    };
  }

  const now = new Date();
  const firstDate = new Date(input.firstObservationDate);
  const daysSince = Math.max(
    0,
    Math.floor((now.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  // ── フェーズ判定 ──
  let phase: DepthPhase = "surface";
  for (const t of PHASE_THRESHOLDS) {
    if (daysSince >= t.minDays && input.totalObservations >= t.minObs) {
      phase = t.phase;
      break;
    }
  }

  // ── フェーズ内進行度 ──
  const phaseProgress = calculatePhaseProgress(phase, daysSince, input.totalObservations);

  // ── 次のフェーズ ──
  const nextPhase = getNextPhase(phase);
  const daysToNextPhase = nextPhase
    ? estimateDaysToNextPhase(phase, daysSince, input.totalObservations, input.recentActiveDays)
    : undefined;

  // ── 各機能の解放状態 ──
  const features = FEATURE_RULES.map((rule) =>
    resolveFeatureState(rule, phase, daysSince, input)
  );

  // ── フェーズメッセージ ──
  const messages = PHASE_MESSAGES[phase];
  const seed = hashDateStr(now.toISOString().slice(0, 10));
  const phaseMessage = messages[seed % messages.length];

  return {
    phase,
    daysSinceFirstObservation: daysSince,
    totalObservations: input.totalObservations,
    phaseProgress,
    nextPhase,
    daysToNextPhase,
    features,
    phaseMessage,
  };
}

// ═══ Feature Resolution ═══

function resolveFeatureState(
  rule: FeatureRule,
  currentPhase: DepthPhase,
  daysSince: number,
  input: PhaseInput,
): FeatureState {
  const currentOrder = PHASE_ORDER[currentPhase];
  const minOrder = PHASE_ORDER[rule.minPhase];
  const fullOrder = PHASE_ORDER[rule.fullPhase];

  // ── ロック判定 ──
  if (currentOrder < minOrder || input.totalObservations < rule.minObservations) {
    return {
      feature: rule.feature,
      access: "locked",
      reason: rule.lockHint,
      unlockHint: rule.lockHint,
    };
  }

  // ── full 判定 ──
  if (currentOrder >= fullOrder) {
    return {
      feature: rule.feature,
      access: "full",
    };
  }

  // ── limited ──
  return {
    feature: rule.feature,
    access: "limited",
    reason: rule.limitedReason,
    limits: rule.limitedLimits,
    unlockHint: rule.upgradeHint,
  };
}

// ═══ Helpers ═══

function calculatePhaseProgress(
  phase: DepthPhase,
  days: number,
  obs: number,
): number {
  switch (phase) {
    case "surface": {
      // Day 0-7, obs 0-5
      const dayProg = Math.min(1, days / 7);
      const obsProg = Math.min(1, obs / 5);
      return (dayProg * 0.6 + obsProg * 0.4);
    }
    case "awakening": {
      // Day 8-30, obs 5-20
      const dayProg = Math.min(1, (days - 8) / 22);
      const obsProg = Math.min(1, (obs - 5) / 15);
      return (dayProg * 0.5 + obsProg * 0.5);
    }
    case "maturity": {
      // Day 31-90, obs 20-60
      const dayProg = Math.min(1, (days - 31) / 59);
      const obsProg = Math.min(1, (obs - 20) / 40);
      return (dayProg * 0.5 + obsProg * 0.5);
    }
    case "deep": {
      // Day 91+, obs 60+ — no ceiling, asymptotic
      const extraDays = days - 91;
      const extraObs = Math.max(0, obs - 60);
      return Math.min(1, (extraDays + extraObs) / 200);
    }
  }
}

function getNextPhase(current: DepthPhase): DepthPhase | undefined {
  const order: DepthPhase[] = ["surface", "awakening", "maturity", "deep"];
  const idx = order.indexOf(current);
  return idx < order.length - 1 ? order[idx + 1] : undefined;
}

function estimateDaysToNextPhase(
  phase: DepthPhase,
  daysSince: number,
  totalObs: number,
  recentActiveDays?: number,
): number {
  const next = PHASE_THRESHOLDS.find(
    (t) => PHASE_ORDER[t.phase] === PHASE_ORDER[phase] + 1
  );
  if (!next) return 0;

  const daysNeeded = Math.max(0, next.minDays - daysSince);

  // 観測ペースから推定
  const avgObsPerDay = recentActiveDays
    ? totalObs / Math.max(1, daysSince) * (recentActiveDays / 7)
    : totalObs / Math.max(1, daysSince);
  const obsNeeded = Math.max(0, next.minObs - totalObs);
  const daysForObs = avgObsPerDay > 0 ? Math.ceil(obsNeeded / avgObsPerDay) : obsNeeded;

  return Math.max(daysNeeded, daysForObs);
}

function hashDateStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ═══ Utility: Check single feature ═══

export function isFeatureAvailable(
  feature: V4Feature,
  input: PhaseInput,
): boolean {
  const state = resolvePhaseState(input);
  const f = state.features.find((s) => s.feature === feature);
  return f ? f.access !== "locked" : false;
}

export function getFeatureAccess(
  feature: V4Feature,
  input: PhaseInput,
): FeatureState {
  const state = resolvePhaseState(input);
  const f = state.features.find((s) => s.feature === feature);
  return f ?? { feature, access: "locked", reason: "不明な機能です" };
}

// ═══ Phase Transition Detection ═══

export interface PhaseTransition {
  from: DepthPhase;
  to: DepthPhase;
  message: string;
  icon: string;
}

const PHASE_TRANSITION_MESSAGES: Record<string, PhaseTransition> = {
  "surface→awakening": {
    from: "surface",
    to: "awakening",
    message: "覚醒期に入った。質問が深層に変わり、あなたのパターンが見え始める。",
    icon: "🌅",
  },
  "awakening→maturity": {
    from: "awakening",
    to: "maturity",
    message: "成熟期へ。矛盾も揺れも含めて、あなたの全体像がはっきりしてきた。",
    icon: "🌟",
  },
  "maturity→deep": {
    from: "maturity",
    to: "deep",
    message: "深層期。ここまで自分を知ろうとした人は稀。最深部の扉が開く。",
    icon: "🌌",
  },
};

/**
 * フェーズ遷移が発生したか検知する。
 * localStorageに前回フェーズを保存し、変化があればTransitionを返す。
 */
const PHASE_STORE_KEY = "stargazer_depth_phase_v1";

export function detectPhaseTransition(currentPhase: DepthPhase): PhaseTransition | null {
  if (typeof window === "undefined") return null;
  try {
    const prev = localStorage.getItem(PHASE_STORE_KEY) as DepthPhase | null;
    localStorage.setItem(PHASE_STORE_KEY, currentPhase);
    if (!prev || prev === currentPhase) return null;
    const key = `${prev}→${currentPhase}`;
    return PHASE_TRANSITION_MESSAGES[key] ?? null;
  } catch {
    return null;
  }
}

/** 深度フェーズの色 */
export const DEPTH_PHASE_COLORS: Record<DepthPhase, string> = {
  surface: "rgba(74,222,128,0.5)",    // 緑
  awakening: "rgba(168,85,247,0.5)",  // 紫
  maturity: "rgba(201,169,110,0.6)",  // 金
  deep: "rgba(59,130,246,0.6)",       // 青
};
