// lib/stargazer/fluctuationEngine.ts
// 揺らぎ観測エンジン — 点ではなく「生きた分布」で人を理解する
//
// 既存の軸スコア (single number) の上に、揺らぎ・条件・安定度を積む。
// 入力: stargazer_axis_snapshots の履歴データ
// 出力: AxisDistribution (分布), FluctuationPattern (パターン), CompanionInsight (寄り添い)

import type { TraitAxisKey } from "./traitAxes";
import { getAxisLabels } from "./traitAxes";
import type { TimeOfDay } from "@/lib/shared/timeOfDay";
import {
  computeAxisConfidence,
  type ReobservationPair,
} from "./confidenceEngine";

// ══════════════════════════════════════════════
// § 1. 状態タグ (State Tags)
// ══════════════════════════════════════════════

/** 観測時の状態タグ — 全ての回答に付随する */
export type EnergyLevel = "very_low" | "low" | "moderate" | "high" | "very_high";
export type EmotionalTone = "calm" | "anxious" | "joyful" | "tired" | "frustrated" | "neutral";
export type SocialContext = "alone" | "few_people" | "many_people";

export interface ObservationState {
  energy: EnergyLevel;
  emotion: EmotionalTone;
  social: SocialContext;
  timeOfDay: TimeOfDay;
  timestamp: string; // ISO
}

/** 状態キャプチャのUI選択肢定義 */
export const ENERGY_OPTIONS: { value: EnergyLevel; label: string; icon: string }[] = [
  { value: "very_low", label: "かなり低い", icon: "🔋" },
  { value: "low", label: "低め", icon: "🪫" },
  { value: "moderate", label: "ふつう", icon: "⚡" },
  { value: "high", label: "高め", icon: "✨" },
  { value: "very_high", label: "みなぎってる", icon: "🔥" },
];

export const EMOTION_OPTIONS: { value: EmotionalTone; label: string; icon: string }[] = [
  { value: "calm", label: "穏やか", icon: "🌊" },
  { value: "joyful", label: "うれしい", icon: "☀️" },
  { value: "anxious", label: "不安", icon: "🌀" },
  { value: "tired", label: "疲れ", icon: "🌙" },
  { value: "frustrated", label: "イライラ", icon: "⚡" },
  { value: "neutral", label: "特になし", icon: "・" },
];

export const SOCIAL_OPTIONS: { value: SocialContext; label: string; icon: string }[] = [
  { value: "alone", label: "一人", icon: "🧘" },
  { value: "few_people", label: "少人数", icon: "👥" },
  { value: "many_people", label: "大勢", icon: "🏟️" },
];

// ══════════════════════════════════════════════
// § 2. 生きた軸分布 (Living Axis Distribution)
// ══════════════════════════════════════════════

/** 一つの軸の「生きた」分布 — 点ではなく幅 */
export interface AxisDistribution {
  axis: TraitAxisKey;
  // 中心と幅
  center: number; // 加重平均 (-1 ~ +1)
  range: [number, number]; // [min, max] 観測された最小～最大
  // 安定度
  stability: number; // 0 = 流動的, 1 = 岩盤 (標準偏差の逆数)
  // 条件マップ — 何がこの軸を動かすか
  conditions: ConditionShift[];
  // 長期変化
  trend: number; // 月あたりの変化量 (正=右極へ, 負=左極へ)
  trendLabel: string | null; // "やや外向的に変化中" etc.
  // 確信度
  confidence: number; // 0-1, 観測回数と一貫性に基づく
  observationCount: number;
  lastObserved: string | null; // ISO date
}

/** 条件→軸シフトの記録 */
export interface ConditionShift {
  condition: string; // "low_energy" | "alone" | "tired" | etc.
  conditionLabel: string; // "エネルギー低い時"
  shift: number; // +0.3 = 右極へ寄る
  confidence: number; // 0-1
  sampleCount: number;
}

// ══════════════════════════════════════════════
// § 3. 揺らぎパターン (Fluctuation Patterns)
// ══════════════════════════════════════════════

/** 複数軸が連動する揺らぎパターン */
export interface FluctuationPattern {
  id: string;
  name: string; // "衝突後の引きこもりパターン" etc.
  description: string;
  // どの軸がどう動くか
  axisMovements: { axis: TraitAxisKey; direction: "increase" | "decrease"; magnitude: number }[];
  // トリガー
  triggers: string[]; // ["conflict", "exhaustion", etc.]
  triggerLabel: string;
  // 期間
  estimatedDuration: string; // "24-48h" etc.
  // 信頼度
  occurrences: number;
  confidence: number;
  firstObserved: string; // ISO date
}

// ══════════════════════════════════════════════
// § 4. 再観測 (Re-observation)
// ══════════════════════════════════════════════

/** 再観測の結果比較 */
export interface ReobservationResult {
  questionId: string;
  axis: TraitAxisKey;
  previousAnswer: { optionId: string; score: number; date: string; state?: ObservationState };
  currentAnswer: { optionId: string; score: number; date: string; state?: ObservationState };
  scoreDelta: number; // 差分
  daysBetween: number;
  // 揺らぎ種別
  fluctuationType: "stable" | "minor_shift" | "significant_shift" | "reversal";
  // 状態差分が原因か
  stateExplanation: string | null; // "前回は疲れていた時、今回は元気な時"
}

// ══════════════════════════════════════════════
// § 5. 寄り添いインテリジェンス
// ══════════════════════════════════════════════

export type InsightLevel = "notice" | "pattern" | "prediction";

/** 寄り添いインサイト */
export interface CompanionInsight {
  level: InsightLevel;
  text: string; // 日本語の寄り添いメッセージ
  relatedAxes: TraitAxisKey[];
  relatedPattern?: string; // pattern id
  confidence: number;
}

// ══════════════════════════════════════════════
// § 6. 計算エンジン
// ══════════════════════════════════════════════

/** 軸スナップショット(DBから取得した生データ) */
export interface AxisSnapshot {
  axis_id: TraitAxisKey;
  score: number;
  confidence?: number;
  context?: string | null;
  observation_layer?: string;
  session_date: string;
  // 新規: 状態タグ (JSON in raw_answers or separate column)
  state?: ObservationState | null;
  response_time_ms?: number;
}

/**
 * スナップショット履歴から生きた軸分布を計算
 */
export function computeAxisDistribution(
  axis: TraitAxisKey,
  snapshots: AxisSnapshot[],
  allSnapshots?: AxisSnapshot[] // 全軸のスナップショット（条件マップ用）
): AxisDistribution {
  const relevant = snapshots.filter((s) => s.axis_id === axis);

  if (relevant.length === 0) {
    return {
      axis,
      center: 0,
      range: [0, 0],
      stability: 0,
      conditions: [],
      trend: 0,
      trendLabel: null,
      confidence: 0,
      observationCount: 0,
      lastObserved: null,
    };
  }

  // ── 中心: 最近の観測を重視する加重平均 ──
  const sorted = [...relevant].sort(
    (a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime()
  );
  const now = Date.now();
  let weightedSum = 0;
  let totalWeight = 0;
  for (const snap of sorted) {
    const daysAgo = (now - new Date(snap.session_date).getTime()) / 86400000;
    const recencyWeight = Math.exp(-daysAgo / 180); // 180日半減期 — オンボーディングデータの長期安定性を確保
    const w = recencyWeight * (snap.confidence ?? 0.5);
    weightedSum += snap.score * w;
    totalWeight += w;
  }
  const center = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // ── 幅: 観測された最小～最大 ──
  const scores = relevant.map((s) => s.score);
  const range: [number, number] = [Math.min(...scores), Math.max(...scores)];

  // ── 安定度: 標準偏差の逆数 (0-1にマッピング) ──
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  // stdDev 0 → stability 1.0, stdDev 0.5+ → stability ~0
  const stability = Math.max(0, Math.min(1, 1 - stdDev * 2));

  // ── 条件マップ: 状態タグ別の平均シフト ──
  const conditions = computeConditionShifts(relevant, center);

  // ── 長期変化: 最近2週間 vs それ以前 ──
  const trend = computeTrend(sorted);
  const labels = getAxisLabels(axis);
  let trendLabel: string | null = null;
  if (labels && Math.abs(trend) > 0.01) {
    const direction = trend > 0 ? labels.right : labels.left;
    const intensity = Math.abs(trend) > 0.03 ? "やや" : "わずかに";
    trendLabel = `${intensity}${direction}寄りに変化中`;
  }

  // ── 確信度 (Horizon Function) ──
  // uniqueDays: 異なるsession_dateの数
  const uniqueDays = new Set(relevant.map((s) => s.session_date)).size;

  // reobservationPairs: 同じ文脈(context)で異日のスコアペア
  const reobservationPairs: ReobservationPair[] = [];
  const byDate = new Map<string, typeof relevant[0]>();
  for (const snap of relevant) {
    const key = snap.session_date;
    if (!byDate.has(key)) byDate.set(key, snap);
  }
  const dateEntries = Array.from(byDate.entries());
  for (let i = 0; i < dateEntries.length && reobservationPairs.length < 10; i++) {
    for (let j = i + 1; j < dateEntries.length && reobservationPairs.length < 10; j++) {
      reobservationPairs.push({
        score1: dateEntries[i][1].score,
        score2: dateEntries[j][1].score,
        date1: dateEntries[i][0],
        date2: dateEntries[j][0],
        variantId: axis, // 同軸内の再観測として扱う
      });
    }
  }

  const confidenceResult = computeAxisConfidence({
    axisId: axis,
    observationCount: relevant.length,
    uniqueDays,
    reobservationPairs,
    stdDev,
  });
  const confidence = confidenceResult.confidence;

  return {
    axis,
    center: Math.round(center * 1000) / 1000,
    range: [Math.round(range[0] * 100) / 100, Math.round(range[1] * 100) / 100],
    stability: Math.round(stability * 100) / 100,
    conditions,
    trend: Math.round(trend * 1000) / 1000,
    trendLabel,
    confidence: Math.round(confidence * 100) / 100,
    observationCount: relevant.length,
    lastObserved: sorted[sorted.length - 1]?.session_date ?? null,
  };
}

/**
 * 状態タグ別の軸シフトを計算
 */
function computeConditionShifts(
  snapshots: AxisSnapshot[],
  center: number
): ConditionShift[] {
  const withState = snapshots.filter((s) => s.state);
  if (withState.length < 3) return [];

  const conditionGroups: Record<string, { scores: number[]; label: string }> = {};

  for (const snap of withState) {
    if (!snap.state) continue;

    // エネルギー条件
    const energyKey = `energy_${snap.state.energy}`;
    if (!conditionGroups[energyKey]) {
      conditionGroups[energyKey] = {
        scores: [],
        label: ENERGY_OPTIONS.find((e) => e.value === snap.state!.energy)?.label ?? snap.state.energy,
      };
    }
    conditionGroups[energyKey].scores.push(snap.score);

    // 感情条件
    const emotionKey = `emotion_${snap.state.emotion}`;
    if (!conditionGroups[emotionKey]) {
      conditionGroups[emotionKey] = {
        scores: [],
        label: EMOTION_OPTIONS.find((e) => e.value === snap.state!.emotion)?.label ?? snap.state.emotion,
      };
    }
    conditionGroups[emotionKey].scores.push(snap.score);

    // 社会的文脈
    const socialKey = `social_${snap.state.social}`;
    if (!conditionGroups[socialKey]) {
      conditionGroups[socialKey] = {
        scores: [],
        label: SOCIAL_OPTIONS.find((e) => e.value === snap.state!.social)?.label ?? snap.state.social,
      };
    }
    conditionGroups[socialKey].scores.push(snap.score);

    // 時間帯
    const timeKey = `time_${snap.state.timeOfDay}`;
    const timeLabels: Record<string, string> = {
      morning: "朝", afternoon: "昼", night: "夜",
    };
    if (!conditionGroups[timeKey]) {
      conditionGroups[timeKey] = {
        scores: [],
        label: timeLabels[snap.state.timeOfDay] ?? snap.state.timeOfDay,
      };
    }
    conditionGroups[timeKey].scores.push(snap.score);
  }

  // 各条件のシフトを計算
  const shifts: ConditionShift[] = [];
  for (const [condition, group] of Object.entries(conditionGroups)) {
    if (group.scores.length < 2) continue;
    const avg = group.scores.reduce((a, b) => a + b, 0) / group.scores.length;
    const shift = avg - center;
    if (Math.abs(shift) < 0.05) continue; // 微小な差は無視

    shifts.push({
      condition,
      conditionLabel: group.label,
      shift: Math.round(shift * 100) / 100,
      confidence: Math.min(1, group.scores.length / 5),
      sampleCount: group.scores.length,
    });
  }

  // シフト量でソート
  return shifts.sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift)).slice(0, 6);
}

/**
 * 長期変化トレンドを計算 (最近14日 vs それ以前)
 */
function computeTrend(sorted: AxisSnapshot[]): number {
  if (sorted.length < 4) return 0;

  const now = Date.now();
  const recent: number[] = [];
  const older: number[] = [];

  for (const snap of sorted) {
    const daysAgo = (now - new Date(snap.session_date).getTime()) / 86400000;
    if (daysAgo <= 14) {
      recent.push(snap.score);
    } else {
      older.push(snap.score);
    }
  }

  if (recent.length === 0 || older.length === 0) return 0;

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  return recentAvg - olderAvg;
}

// ══════════════════════════════════════════════
// § 7. 全軸の分布を一括計算
// ══════════════════════════════════════════════

export function computeAllDistributions(
  snapshots: AxisSnapshot[]
): AxisDistribution[] {
  const axisMap = new Map<TraitAxisKey, AxisSnapshot[]>();
  for (const snap of snapshots) {
    const list = axisMap.get(snap.axis_id) ?? [];
    list.push(snap);
    axisMap.set(snap.axis_id, list);
  }

  const distributions: AxisDistribution[] = [];
  for (const [axis, axisSnaps] of axisMap) {
    distributions.push(computeAxisDistribution(axis, axisSnaps, snapshots));
  }

  return distributions.sort((a, b) => b.observationCount - a.observationCount);
}

// ══════════════════════════════════════════════
// § 8. 揺らぎパターン検出
// ══════════════════════════════════════════════

/** 既知のパターンテンプレート */
const PATTERN_TEMPLATES: {
  id: string;
  name: string;
  description: string;
  triggerLabel: string;
  triggers: string[];
  axes: { axis: TraitAxisKey; direction: "increase" | "decrease" }[];
  estimatedDuration: string;
}[] = [
  {
    id: "conflict_withdrawal",
    name: "衝突後の引きこもり",
    description: "衝突の後、境界線が厚くなり内向性が強まる。自分を守るための自然な反応。",
    triggerLabel: "衝突・対立の後",
    triggers: ["emotion_frustrated", "social_alone"],
    axes: [
      { axis: "boundary_awareness", direction: "increase" },
      { axis: "introvert_vs_extrovert", direction: "increase" },
      { axis: "stress_isolation_vs_social", direction: "decrease" },
    ],
    estimatedDuration: "24-48時間",
  },
  {
    id: "trust_opening",
    name: "信頼による解放",
    description: "安心できる人と一緒にいると、境界が緩み素の自分が出やすくなる。",
    triggerLabel: "信頼できる相手との時間",
    triggers: ["social_few_people", "emotion_calm"],
    axes: [
      { axis: "boundary_awareness", direction: "decrease" },
      { axis: "public_private_gap", direction: "decrease" },
      { axis: "direct_vs_diplomatic", direction: "decrease" },
    ],
    estimatedDuration: "数時間〜半日",
  },
  {
    id: "fatigue_intuition",
    name: "疲労時の直感モード",
    description: "疲れた時ほど分析を手放し、直感に頼る。省エネだが本音に近い判断になりやすい。",
    triggerLabel: "エネルギーが低い時",
    triggers: ["energy_low", "energy_very_low"],
    axes: [
      { axis: "analytical_vs_intuitive", direction: "increase" },
      { axis: "plan_vs_spontaneous", direction: "increase" },
    ],
    estimatedDuration: "状態が続く間",
  },
  {
    id: "pre_decision_oscillation",
    name: "決断前の揺れ",
    description: "大きな選択の前に慎重さと大胆さの間で揺れる。重要な判断に真剣に向き合っている証。",
    triggerLabel: "重要な選択の前",
    triggers: ["emotion_anxious"],
    axes: [
      { axis: "cautious_vs_bold", direction: "decrease" },
      { axis: "analytical_vs_intuitive", direction: "decrease" },
    ],
    estimatedDuration: "判断が下るまで",
  },
  {
    id: "recharge_extroversion",
    name: "充電後の外向化",
    description: "十分な一人時間の後、社交性が一時的に上昇する。バランスを取る自然なリズム。",
    triggerLabel: "十分な一人時間の後",
    triggers: ["energy_high", "social_alone"],
    axes: [
      { axis: "social_initiative", direction: "increase" },
      { axis: "introvert_vs_extrovert", direction: "decrease" },
    ],
    estimatedDuration: "数時間",
  },
  {
    id: "emotional_armor",
    name: "感情の鎧",
    description: "不安や疲労を感じると、感情の表出を抑え自己防衛モードに入る。",
    triggerLabel: "不安・疲労時",
    triggers: ["emotion_anxious", "emotion_tired"],
    axes: [
      { axis: "emotional_variability", direction: "decrease" },
      { axis: "public_private_gap", direction: "increase" },
      { axis: "emotional_regulation", direction: "increase" },
    ],
    estimatedDuration: "状態が回復するまで",
  },
];

/**
 * スナップショット履歴からパターンを検出
 */
export function detectFluctuationPatterns(
  snapshots: AxisSnapshot[],
  distributions: AxisDistribution[]
): FluctuationPattern[] {
  const detected: FluctuationPattern[] = [];
  const withState = snapshots.filter((s) => s.state);
  if (withState.length < 5) return [];

  for (const template of PATTERN_TEMPLATES) {
    // このパターンのトリガー条件に合うスナップショットを見つける
    const triggerMatches = withState.filter((s) => {
      if (!s.state) return false;
      return template.triggers.some((t) => {
        const [type, value] = t.split("_", 2);
        if (type === "energy") return s.state!.energy === value || s.state!.energy === t.replace("energy_", "");
        if (type === "emotion") return s.state!.emotion === value || s.state!.emotion === t.replace("emotion_", "");
        if (type === "social") return s.state!.social === value || s.state!.social === t.replace("social_", "");
        return false;
      });
    });

    if (triggerMatches.length < 2) continue;

    // トリガー条件下での軸の動きを確認
    let matchingAxes = 0;
    const movements: FluctuationPattern["axisMovements"] = [];

    for (const axisRule of template.axes) {
      const dist = distributions.find((d) => d.axis === axisRule.axis);
      if (!dist || dist.observationCount < 3) continue;

      // トリガー条件下のスコア平均
      const triggerScores = triggerMatches
        .filter((s) => s.axis_id === axisRule.axis)
        .map((s) => s.score);

      if (triggerScores.length === 0) continue;

      const triggerAvg = triggerScores.reduce((a, b) => a + b, 0) / triggerScores.length;
      const shift = triggerAvg - dist.center;

      const expectedDirection = axisRule.direction === "increase" ? 1 : -1;
      if (shift * expectedDirection > 0.05) {
        matchingAxes++;
        movements.push({
          axis: axisRule.axis,
          direction: axisRule.direction,
          magnitude: Math.abs(shift),
        });
      }
    }

    // 軸の60%以上が一致すればパターンとして検出
    if (matchingAxes >= Math.ceil(template.axes.length * 0.6)) {
      const dates = triggerMatches.map((s) => s.session_date).sort();
      detected.push({
        id: template.id,
        name: template.name,
        description: template.description,
        axisMovements: movements,
        triggers: template.triggers,
        triggerLabel: template.triggerLabel,
        estimatedDuration: template.estimatedDuration,
        occurrences: triggerMatches.length,
        confidence: Math.min(1, matchingAxes / template.axes.length),
        firstObserved: dates[0] ?? "",
      });
    }
  }

  return detected.sort((a, b) => b.confidence - a.confidence);
}

// ══════════════════════════════════════════════
// § 9. 再観測比較
// ══════════════════════════════════════════════

/**
 * 同じ質問の過去回答と比較
 */
export function compareReobservation(
  questionId: string,
  axis: TraitAxisKey,
  previousScore: number,
  currentScore: number,
  previousDate: string,
  currentDate: string,
  previousState?: ObservationState | null,
  currentState?: ObservationState | null
): ReobservationResult {
  const delta = currentScore - previousScore;
  const daysBetween = Math.round(
    (new Date(currentDate).getTime() - new Date(previousDate).getTime()) / 86400000
  );

  // 揺らぎ種別を判定
  let fluctuationType: ReobservationResult["fluctuationType"];
  if (Math.abs(delta) < 0.1) {
    fluctuationType = "stable";
  } else if (Math.abs(delta) < 0.3) {
    fluctuationType = "minor_shift";
  } else if (Math.sign(previousScore) !== Math.sign(currentScore) && Math.abs(delta) > 0.4) {
    fluctuationType = "reversal";
  } else {
    fluctuationType = "significant_shift";
  }

  // 状態差分で説明できるか
  let stateExplanation: string | null = null;
  if (previousState && currentState) {
    const diffs: string[] = [];
    if (previousState.energy !== currentState.energy) {
      const prevE = ENERGY_OPTIONS.find((e) => e.value === previousState.energy)?.label;
      const curE = ENERGY_OPTIONS.find((e) => e.value === currentState.energy)?.label;
      diffs.push(`エネルギー: ${prevE} → ${curE}`);
    }
    if (previousState.emotion !== currentState.emotion) {
      const prevEm = EMOTION_OPTIONS.find((e) => e.value === previousState.emotion)?.label;
      const curEm = EMOTION_OPTIONS.find((e) => e.value === currentState.emotion)?.label;
      diffs.push(`気分: ${prevEm} → ${curEm}`);
    }
    if (previousState.social !== currentState.social) {
      const prevS = SOCIAL_OPTIONS.find((e) => e.value === previousState.social)?.label;
      const curS = SOCIAL_OPTIONS.find((e) => e.value === currentState.social)?.label;
      diffs.push(`環境: ${prevS} → ${curS}`);
    }
    if (diffs.length > 0 && fluctuationType !== "stable") {
      stateExplanation = `前回と今回の状態が違う（${diffs.join("、")}）`;
    }
  }

  return {
    questionId,
    axis,
    previousAnswer: {
      optionId: "",
      score: previousScore,
      date: previousDate,
      state: previousState ?? undefined,
    },
    currentAnswer: {
      optionId: "",
      score: currentScore,
      date: currentDate,
      state: currentState ?? undefined,
    },
    scoreDelta: Math.round(delta * 100) / 100,
    daysBetween,
    fluctuationType,
    stateExplanation,
  };
}

// ══════════════════════════════════════════════
// § 10. 寄り添いインサイト生成
// ══════════════════════════════════════════════

/**
 * 軸分布とパターンから寄り添いインサイトを生成
 */
export function generateCompanionInsights(
  distributions: AxisDistribution[],
  patterns: FluctuationPattern[],
  currentState?: ObservationState | null,
  reobservations?: ReobservationResult[]
): CompanionInsight[] {
  const insights: CompanionInsight[] = [];

  // ── Level 1: 気づき (Notice) ──

  // 最も揺れている軸を見つける
  const mostVolatile = distributions
    .filter((d) => d.observationCount >= 3 && d.stability < 0.5)
    .sort((a, b) => a.stability - b.stability)[0];

  if (mostVolatile) {
    const labels = getAxisLabels(mostVolatile.axis);
    if (labels) {
      insights.push({
        level: "notice",
        text: `「${labels.left}↔${labels.right}」は、あなたの中で最も揺れやすい領域。日によって変わるのは、それだけ多面的だということ。`,
        relatedAxes: [mostVolatile.axis],
        confidence: 0.7,
      });
    }
  }

  // 最も安定した軸（芯）
  const mostStable = distributions
    .filter((d) => d.observationCount >= 5 && d.stability > 0.8)
    .sort((a, b) => b.stability - a.stability)[0];

  if (mostStable) {
    const labels = getAxisLabels(mostStable.axis);
    if (labels) {
      const side = mostStable.center > 0 ? labels.right : labels.left;
      insights.push({
        level: "notice",
        text: `「${side}」は、あなたの芯。どんな日でもここはブレない。`,
        relatedAxes: [mostStable.axis],
        confidence: 0.85,
      });
    }
  }

  // 条件依存の気づき
  for (const dist of distributions.filter((d) => d.conditions.length > 0)) {
    const strongestCondition = dist.conditions[0];
    if (!strongestCondition || Math.abs(strongestCondition.shift) < 0.15) continue;
    const labels = getAxisLabels(dist.axis);
    if (!labels) continue;

    const direction = strongestCondition.shift > 0 ? labels.right : labels.left;
    insights.push({
      level: "notice",
      text: `${strongestCondition.conditionLabel}の時、あなたは「${direction}」寄りになる傾向がある。`,
      relatedAxes: [dist.axis],
      confidence: strongestCondition.confidence,
    });
  }

  // ── Level 2: パターン指摘 (Pattern) ──

  for (const pattern of patterns) {
    insights.push({
      level: "pattern",
      text: pattern.description,
      relatedAxes: pattern.axisMovements.map((m) => m.axis),
      relatedPattern: pattern.id,
      confidence: pattern.confidence,
    });
  }

  // ── Level 3: 先回り理解 (Prediction) ──

  // 現在の状態からアクティブなパターンを推定
  if (currentState && patterns.length > 0) {
    for (const pattern of patterns) {
      const isActive = pattern.triggers.some((t) => {
        const [type, value] = t.split("_", 2);
        if (type === "energy") return currentState.energy === value;
        if (type === "emotion") return currentState.emotion === value;
        if (type === "social") return currentState.social === value;
        return false;
      });

      if (isActive) {
        insights.push({
          level: "prediction",
          text: `今、「${pattern.name}」が働いているかもしれない。${pattern.estimatedDuration}くらい続く傾向がある。でも、それはあなたが自分を整えるための自然なプロセス。`,
          relatedAxes: pattern.axisMovements.map((m) => m.axis),
          relatedPattern: pattern.id,
          confidence: pattern.confidence * 0.8,
        });
      }
    }
  }

  // 再観測からの揺らぎインサイト
  if (reobservations) {
    const reversals = reobservations.filter((r) => r.fluctuationType === "reversal");
    for (const rev of reversals) {
      const labels = getAxisLabels(rev.axis);
      if (!labels) continue;
      insights.push({
        level: "pattern",
        text: `${rev.daysBetween}日前と比べて「${labels.left}↔${labels.right}」が大きく変わった。${rev.stateExplanation ? rev.stateExplanation + "のかもしれない。" : "何かが変化している。"}`,
        relatedAxes: [rev.axis],
        confidence: 0.65,
      });
    }
  }

  // 信頼度順にソートして上位を返す
  return insights
    .sort((a, b) => {
      const levelOrder: Record<InsightLevel, number> = { prediction: 3, pattern: 2, notice: 1 };
      return levelOrder[b.level] - levelOrder[a.level] || b.confidence - a.confidence;
    })
    .slice(0, 5);
}

// ══════════════════════════════════════════════
// § 11. ユーティリティ
// ══════════════════════════════════════════════

/** 揺らぎ種別の日本語ラベル */
export function getFluctuationLabel(type: ReobservationResult["fluctuationType"]): string {
  switch (type) {
    case "stable": return "安定";
    case "minor_shift": return "わずかな変化";
    case "significant_shift": return "大きな変化";
    case "reversal": return "反転";
  }
}

/** 安定度を日本語で */
export function getStabilityLabel(stability: number): string {
  if (stability >= 0.8) return "非常に安定 (芯)";
  if (stability >= 0.6) return "やや安定";
  if (stability >= 0.4) return "揺れがある";
  if (stability >= 0.2) return "かなり揺れる";
  return "流動的";
}

/** InsightLevelを日本語で */
export function getInsightLevelLabel(level: InsightLevel): string {
  switch (level) {
    case "notice": return "気づき";
    case "pattern": return "パターン";
    case "prediction": return "先読み";
  }
}
