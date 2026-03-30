// lib/stargazer/adaptiveObservationTargeting.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Adaptive Observation Targeting（適応的観測照準）
//
// 脳科学的根拠:
// ドーパミンは「予測誤差」に発火する（Schultz, 1997）。
// 安定した軸を繰り返し聞いても予測誤差ゼロ＝ドーパミン発火なし＝退屈。
// 揺らぎと矛盾がある軸だけを狙い撃つことで、
// 毎回の質問が予測誤差を最大化する。
//
// 設計思想: Duolingoのスペースドリピティションを自己発見に応用
//   安定した軸（σ < 0.1）→ 間隔を広げる（2週に1回）
//   揺らいでいる軸（σ > 0.3）→ 頻度を上げる（毎日）
//   矛盾が検出された軸 → 別角度から再質問（3日以内）
//   予測が外れた軸 → 即座に深堀り質問を投入
//
// 統合ポイント:
//   dailyOrchestrator.ts の computeAdaptivePriorities() を拡張する
//   resonanceNetwork.ts の共鳴信号を活用する
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "./traitAxes";
import type { AxisDistribution } from "./fluctuationEngine";
import type { ContradictionEntry } from "./contradictionMap";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 軸の観測スケジュール状態 */
export type ObservationScheduleState =
  | "overdue"        // 予定日を過ぎている → 最優先
  | "due_today"      // 今日が観測予定日
  | "upcoming"       // 近日中に観測予定
  | "dormant"        // 安定しているため休眠中
  | "urgent_probe";  // 矛盾/予測誤差により緊急深堀り

/** 軸の適応的スケジューリング情報 */
export interface AxisObservationSchedule {
  axisId: TraitAxisKey;
  /** 現在のスケジュール状態 */
  state: ObservationScheduleState;
  /** 推奨観測間隔（日数） */
  intervalDays: number;
  /** 次回観測推奨日（ISO date） */
  nextObservationDate: string;
  /** 優先度スコア（0-1、高いほど優先） */
  priority: number;
  /** この優先度の理由（日本語、UI/ログ用） */
  reason: string;
  /** 推奨する質問アプローチ */
  approach: QuestionApproach;
  /** 予測されるドーパミン発火強度（0-1） */
  expectedDopamineSignal: number;
}

/** 質問アプローチ — どういう角度から聞くか */
export type QuestionApproach =
  | "standard"             // 通常の質問
  | "reobservation"        // 同じ質問を再度（揺らぎ検出）
  | "opposite_frame"       // 逆フレーミング（フレーミング効果検出）
  | "condition_probe"      // 特定条件下で再質問（条件依存性検出）
  | "deep_follow_up"       // 深堀りフォローアップ（矛盾の核心に迫る）
  | "shadow_confrontation" // もうひとりの自分と対峙する質問
  | "prediction_verify";   // 予測検証質問（予測が外れた軸を確認）

/** 適応的観測計画の全体像 */
export interface AdaptiveObservationPlan {
  /** 今日観測すべき軸（優先度順、最大8軸） */
  targetAxes: AxisObservationSchedule[];
  /** 今日は休ませる軸 */
  dormantAxes: AxisObservationSchedule[];
  /** 全体の観測効率スコア（0-1） */
  observationEfficiency: number;
  /** 計画の説明（日本語） */
  planNarrative: string;
  /** 総予測ドーパミン発火量（今日の質問セット全体） */
  totalExpectedDopamine: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Interval Computation — スペースドリピティション
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 軸の安定度に基づいて最適な観測間隔を計算
 *
 * Duolingoの忘却曲線アルゴリズムの自己発見版:
 * - 安定 → 間隔を広げる（退屈防止 → ドーパミン枯渇回避）
 * - 不安定 → 間隔を狭める（変化追跡 → 予測誤差最大化）
 * - 矛盾 → 即座に再質問（ACC興奮を利用）
 */
function computeOptimalInterval(
  stability: number,
  hasContradiction: boolean,
  hasPredictionError: boolean,
  observationCount: number,
): { intervalDays: number; reason: string } {
  // 矛盾検出 → 最短間隔（3日以内）
  if (hasContradiction) {
    return {
      intervalDays: Math.min(3, Math.max(1, Math.floor(stability * 3))),
      reason: "矛盾が検出された軸。別角度からの再質問が必要",
    };
  }

  // 予測誤差 → 短い間隔（2日以内）
  if (hasPredictionError) {
    return {
      intervalDays: Math.min(2, Math.max(1, Math.floor(stability * 2))),
      reason: "予測が外れた軸。内面の変化を追跡中",
    };
  }

  // データ不足 → 毎日
  if (observationCount < 5) {
    return {
      intervalDays: 1,
      reason: "まだデータが少ない。基盤構築のため毎日観測",
    };
  }

  // 安定度に基づくスペースドインターバル
  if (stability >= 0.8) {
    // 非常に安定 → 2週間に1回
    return {
      intervalDays: 14,
      reason: "この軸は安定している。変化が起きるまで休眠",
    };
  }
  if (stability >= 0.6) {
    // やや安定 → 1週間に1回
    return {
      intervalDays: 7,
      reason: "この軸は比較的安定。週1回の確認で十分",
    };
  }
  if (stability >= 0.4) {
    // 中間 → 3-4日に1回
    return {
      intervalDays: Math.round(3 + stability * 2),
      reason: "やや揺らぎがある。定期的な追跡が有効",
    };
  }
  if (stability >= 0.2) {
    // 不安定 → 2日に1回
    return {
      intervalDays: 2,
      reason: "揺らぎが大きい。変化の方向を特定中",
    };
  }
  // 非常に不安定 → 毎日
  return {
    intervalDays: 1,
    reason: "大きな揺らぎを検出。毎日の追跡で変化のパターンを掴む",
  };
}

/**
 * 軸に対する最適な質問アプローチを選定
 *
 * 脳科学: 同じ軸でも異なるアプローチで聞くことで
 * 予測誤差が発生し、ドーパミンが発火する
 */
function selectApproach(
  stability: number,
  hasContradiction: boolean,
  hasPredictionError: boolean,
  contradictionMeaning: string | undefined,
  observationCount: number,
  daysSinceLastObservation: number,
): QuestionApproach {
  // 予測が外れた → 検証質問
  if (hasPredictionError) {
    return "prediction_verify";
  }

  // 矛盾あり → 矛盾の種類に応じたアプローチ
  if (hasContradiction) {
    switch (contradictionMeaning) {
      case "ideal_gap":
      case "adaptation_mask":
        return "shadow_confrontation";
      case "contextual_self":
        return "condition_probe";
      case "unconscious_value":
      case "protective_pattern":
        return "deep_follow_up";
      default:
        return "opposite_frame";
    }
  }

  // データ不足 → 通常質問
  if (observationCount < 5) {
    return "standard";
  }

  // 安定しているが久しぶり → 再観測（変化したか確認）
  if (stability >= 0.6 && daysSinceLastObservation >= 7) {
    return "reobservation";
  }

  // 不安定 → 条件を変えて聞く
  if (stability < 0.3) {
    return "condition_probe";
  }

  return "standard";
}

/**
 * 予測されるドーパミン発火強度を計算
 *
 * ドーパミンは「予測と結果のギャップ」に発火する。
 * - 安定軸の標準質問 → ギャップ小 → 低ドーパミン
 * - 不安定軸の別角度質問 → ギャップ大 → 高ドーパミン
 * - 矛盾軸の深堀り → ギャップ最大 → 最高ドーパミン
 */
function estimateDopamineSignal(
  stability: number,
  approach: QuestionApproach,
  hasContradiction: boolean,
  hasPredictionError: boolean,
): number {
  let base = 0;

  // 不安定性が高いほど予測誤差が大きい
  base += (1 - stability) * 0.3;

  // アプローチによるボーナス
  const approachBonus: Record<QuestionApproach, number> = {
    standard: 0,
    reobservation: 0.15,
    opposite_frame: 0.25,
    condition_probe: 0.2,
    deep_follow_up: 0.3,
    shadow_confrontation: 0.35,
    prediction_verify: 0.4,
  };
  base += approachBonus[approach];

  // 矛盾・予測誤差ボーナス
  if (hasContradiction) base += 0.2;
  if (hasPredictionError) base += 0.25;

  return Math.min(1, base);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Plan Generation — 適応的観測計画の生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AdaptiveTargetingInput {
  /** 揺らぎエンジンの分布データ */
  distributions: AxisDistribution[];
  /** 矛盾マップのエントリ */
  contradictions: ContradictionEntry[];
  /** 予測が外れた軸のリスト */
  predictionErrorAxes: TraitAxisKey[];
  /** 各軸の最終観測日 */
  lastObservationDates: Partial<Record<TraitAxisKey, string>>;
  /** 各軸の総観測回数 */
  observationCounts: Partial<Record<TraitAxisKey, number>>;
  /** 今日の日付（ISO） */
  today: string;
}

/**
 * 適応的観測計画を生成
 *
 * これがAdaptive Observation Targetingの核心関数。
 * dailyOrchestrator の computeAdaptivePriorities() を置換/拡張する。
 */
export function generateAdaptiveObservationPlan(
  input: AdaptiveTargetingInput,
): AdaptiveObservationPlan {
  const todayMs = new Date(input.today).getTime();
  const contradictionMap = new Map<TraitAxisKey, ContradictionEntry>();
  for (const c of input.contradictions) {
    contradictionMap.set(c.axisId, c);
  }
  const predictionErrorSet = new Set(input.predictionErrorAxes);

  // 全軸のスケジュールを計算
  const allSchedules: AxisObservationSchedule[] = [];

  for (const dist of input.distributions) {
    const axisId = dist.axis;
    const stability = dist.stability;
    const contradiction = contradictionMap.get(axisId);
    const hasContradiction = !!contradiction && contradiction.magnitude >= 0.3;
    const hasPredictionError = predictionErrorSet.has(axisId);
    const observationCount = input.observationCounts[axisId] ?? 0;
    const lastObsDate = input.lastObservationDates[axisId];
    const daysSinceLast = lastObsDate
      ? Math.max(0, (todayMs - new Date(lastObsDate).getTime()) / 86400000)
      : Infinity;

    // スペースドインターバル計算
    const { intervalDays, reason } = computeOptimalInterval(
      stability,
      hasContradiction,
      hasPredictionError,
      observationCount,
    );

    // 次回観測予定日
    const nextObsDate = lastObsDate
      ? new Date(new Date(lastObsDate).getTime() + intervalDays * 86400000)
          .toISOString()
          .slice(0, 10)
      : input.today; // 未観測なら今日

    // スケジュール状態の判定
    let state: ObservationScheduleState;
    if (hasContradiction || hasPredictionError) {
      state = "urgent_probe";
    } else if (nextObsDate < input.today) {
      state = "overdue";
    } else if (nextObsDate === input.today) {
      state = "due_today";
    } else if (intervalDays >= 14 && daysSinceLast < intervalDays * 0.7) {
      state = "dormant";
    } else {
      state = "upcoming";
    }

    // 質問アプローチ選定
    const approach = selectApproach(
      stability,
      hasContradiction,
      hasPredictionError,
      contradiction?.meaning,
      observationCount,
      daysSinceLast,
    );

    // ドーパミン発火強度推定
    const expectedDopamine = estimateDopamineSignal(
      stability,
      approach,
      hasContradiction,
      hasPredictionError,
    );

    // 優先度スコア計算（多要素合成）
    let priority = 0;

    // P1: 矛盾/予測誤差 → 最高優先度
    if (state === "urgent_probe") priority += 0.4;

    // P2: 期限超過度
    if (state === "overdue") {
      const overdueRatio = Math.min(1, daysSinceLast / (intervalDays * 2));
      priority += overdueRatio * 0.25;
    }

    // P3: 不安定性（揺らぎ追跡）
    priority += (1 - stability) * 0.2;

    // P4: データ不足
    if (observationCount < 5) {
      priority += (1 - observationCount / 5) * 0.1;
    }

    // P5: 予測ドーパミン（高いほど興味深い質問 → 優先）
    priority += expectedDopamine * 0.05;

    // 休眠中は優先度を大幅に下げる
    if (state === "dormant") priority *= 0.1;

    allSchedules.push({
      axisId,
      state,
      intervalDays,
      nextObservationDate: nextObsDate,
      priority: Math.min(1, priority),
      reason,
      approach,
      expectedDopamineSignal: expectedDopamine,
    });
  }

  // 優先度でソート
  allSchedules.sort((a, b) => b.priority - a.priority);

  // 上位8軸を今日のターゲット、残りは休眠
  const targetAxes = allSchedules.filter((s) => s.state !== "dormant").slice(0, 8);
  const dormantAxes = allSchedules.filter((s) => s.state === "dormant");

  // 全体の観測効率（ドーパミン密度）
  const totalExpectedDopamine = targetAxes.reduce(
    (s, a) => s + a.expectedDopamineSignal,
    0,
  );
  const observationEfficiency =
    targetAxes.length > 0 ? totalExpectedDopamine / targetAxes.length : 0;

  // 計画ナラティブ
  const planNarrative = generatePlanNarrative(targetAxes, dormantAxes, observationEfficiency);

  return {
    targetAxes,
    dormantAxes,
    observationEfficiency,
    planNarrative,
    totalExpectedDopamine,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Integration: Enhanced Priority Map for dailyOrchestrator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * dailyOrchestrator の computeAdaptivePriorities() に注入する
 * 追加優先度マップを生成
 *
 * 使用法（dailyOrchestrator内で）:
 * ```
 * const basePriorities = computeAdaptivePriorities(history);
 * const adaptiveBoost = getAdaptiveBoostMap(distributions, contradictions, ...);
 * // basePriorities に adaptiveBoost を加算
 * ```
 */
export function getAdaptiveBoostMap(
  plan: AdaptiveObservationPlan,
): Map<TraitAxisKey, { boost: number; approach: QuestionApproach; reason: string }> {
  const boostMap = new Map<
    TraitAxisKey,
    { boost: number; approach: QuestionApproach; reason: string }
  >();

  for (const schedule of plan.targetAxes) {
    boostMap.set(schedule.axisId, {
      boost: schedule.priority,
      approach: schedule.approach,
      reason: schedule.reason,
    });
  }

  // 休眠軸は負のブースト（優先度を下げる）
  for (const schedule of plan.dormantAxes) {
    boostMap.set(schedule.axisId, {
      boost: -0.3,
      approach: "standard",
      reason: schedule.reason,
    });
  }

  return boostMap;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Internal Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generatePlanNarrative(
  targets: AxisObservationSchedule[],
  dormant: AxisObservationSchedule[],
  efficiency: number,
): string {
  const parts: string[] = [];

  const urgentCount = targets.filter((t) => t.state === "urgent_probe").length;
  const overdueCount = targets.filter((t) => t.state === "overdue").length;

  if (urgentCount > 0) {
    parts.push(`${urgentCount}軸で緊急深堀りが必要（矛盾/予測誤差を検出）`);
  }
  if (overdueCount > 0) {
    parts.push(`${overdueCount}軸が観測予定を過ぎている`);
  }
  if (dormant.length > 0) {
    parts.push(`${dormant.length}軸は安定のため休眠中`);
  }

  if (efficiency >= 0.6) {
    parts.push("今日の質問セットは高い発見確率が期待できる");
  } else if (efficiency >= 0.3) {
    parts.push("今日の観測は安定した知見の蓄積が期待できる");
  }

  return parts.length > 0
    ? parts.join("。") + "。"
    : "全軸が安定。新しい刺激が必要な時期かもしれない。";
}
