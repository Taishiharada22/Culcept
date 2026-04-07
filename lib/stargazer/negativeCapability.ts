/**
 * Negative Capability & Prediction Crash Alert — HDM v1 P1
 *
 * Negative Capability（Bion/Keats）:
 *   不確実さの中に留まる力。高精度でも断定しない、
 *   当たっていても固定しない、深く理解しても未完了性を保つ。
 *
 * Prediction Crash Alert:
 *   予測的中率が閾値以下に落ちた時のアラートと自動Phase降格。
 *   予測精度が上がりすぎた場合の overfitting 警戒も含む。
 *
 * @see docs/heart-dynamics-model-v1.md §3.3, §6.1, §6.2
 */
import "server-only";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type CrashSeverity = "warning" | "critical" | "none";
export type OverfitSeverity = "warning" | "none";

export interface PredictionCrashAlert {
  /** 暴落深刻度 */
  severity: CrashSeverity;
  /** 現在の的中率 */
  currentRate: number;
  /** トレンド */
  trend: "improving" | "stable" | "declining";
  /** Phase 降格推奨 */
  phaseDemotion: boolean;
  /** LLM プロンプト注入ブロック */
  promptBlock: string | null;
}

export interface OverfitAlert {
  /** 過学習警戒度 */
  severity: OverfitSeverity;
  /** 現在の的中率 */
  currentRate: number;
  /** LLM プロンプト注入ブロック */
  promptBlock: string | null;
}

export interface NegativeCapabilityState {
  /** 予測暴落アラート */
  crash: PredictionCrashAlert;
  /** 過学習警戒 */
  overfit: OverfitAlert;
  /** 仮説揺さぶりが必要か */
  hypothesisShakeNeeded: boolean;
  /** 不確実性を明示すべき領域 */
  uncertainDomains: string[];
  /** 統合プロンプトブロック */
  promptBlock: string | null;
}

export interface NegativeCapabilityInput {
  /** 全体的な予測的中率 (0-1) */
  overallPredictionRate: number;
  /** 予測トレンド */
  predictionTrend: "improving" | "stable" | "declining";
  /** カテゴリ別精度（低精度カテゴリを検出） */
  categoryAccuracies: Array<{ category: string; rate: number; attempts: number }>;
  /** 直近N回のフィードバックでの連続外し数 */
  recentMissStreak: number;
  /** 仮説の平均 staleness（日数） */
  avgHypothesisStaleness: number;
  /** 確定済み（confidence > 0.8）の仮説の割合 */
  highConfidenceRatio: number;
  /** セッション数 */
  sessionCount: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Thresholds
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 的中率がこの値以下で warning */
const CRASH_WARNING_THRESHOLD = 0.35;
/** 的中率がこの値以下で critical */
const CRASH_CRITICAL_THRESHOLD = 0.2;
/** 連続外しがこの回数以上で warning */
const MISS_STREAK_WARNING = 3;
/** 連続外しがこの回数以上で critical */
const MISS_STREAK_CRITICAL = 5;

/** 的中率がこの値以上で overfitting 警戒 */
const OVERFIT_THRESHOLD = 0.85;
/** 高確信仮説がこの割合以上で overfitting 警戒 */
const HIGH_CONFIDENCE_OVERFIT = 0.8;

/** 仮説の平均 staleness がこの日数以上で揺さぶり推奨 */
const STALENESS_SHAKE_THRESHOLD = 14;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prediction Crash Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectPredictionCrash(
  rate: number,
  trend: "improving" | "stable" | "declining",
  missStreak: number,
): PredictionCrashAlert {
  const none: PredictionCrashAlert = {
    severity: "none",
    currentRate: rate,
    trend,
    phaseDemotion: false,
    promptBlock: null,
  };

  // Critical: 精度が非常に低い OR 連続外し
  if (rate < CRASH_CRITICAL_THRESHOLD || missStreak >= MISS_STREAK_CRITICAL) {
    return {
      severity: "critical",
      currentRate: rate,
      trend,
      phaseDemotion: true,
      promptBlock:
        `\n## 🚨 予測精度暴落アラート（critical）\n` +
        `現在の予測的中率: ${Math.round(rate * 100)}%（直近${missStreak}回連続外し）\n` +
        `あなたのユーザー理解モデルが大幅にズレている可能性が高いです。\n\n` +
        `### 緊急指示\n` +
        `- 一切の断定的な洞察を停止すること\n` +
        `- 「最近の僕の理解がズレているかもしれない」と正直に伝えること\n` +
        `- ユーザーに「今の僕は君をちゃんと分かっているか？」と聞くこと\n` +
        `- 過去の仮説を全て「要検証」として扱うこと\n` +
        `- 新しい情報を偏見なしに集めることに専念すること`,
    };
  }

  // Warning: 精度が低め + 下降傾向
  if (
    (rate < CRASH_WARNING_THRESHOLD && trend === "declining") ||
    missStreak >= MISS_STREAK_WARNING
  ) {
    return {
      severity: "warning",
      currentRate: rate,
      trend,
      phaseDemotion: false,
      promptBlock:
        `\n## ⚠ 予測精度低下注意\n` +
        `現在の予測的中率: ${Math.round(rate * 100)}%（${trend === "declining" ? "低下傾向" : "横ばい"}）\n` +
        `- 断定的な分析を控えめにすること\n` +
        `- 仮説を提示する際は「〜かもしれない」等の留保を付けること\n` +
        `- ユーザーの反応を注意深く観察し、ズレがあれば即座に修正すること`,
    };
  }

  return none;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Overfitting Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectOverfit(
  rate: number,
  highConfidenceRatio: number,
  sessionCount: number,
): OverfitAlert {
  const none: OverfitAlert = { severity: "none", currentRate: rate, promptBlock: null };

  // 十分なセッション数がないと overfitting 判定は意味がない
  if (sessionCount < 10) return none;

  if (rate > OVERFIT_THRESHOLD || highConfidenceRatio > HIGH_CONFIDENCE_OVERFIT) {
    return {
      severity: "warning",
      currentRate: rate,
      promptBlock:
        `\n## ⚠ 過学習警戒\n` +
        `予測的中率が非常に高い（${Math.round(rate * 100)}%）か、` +
        `確定済み仮説の割合が高い（${Math.round(highConfidenceRatio * 100)}%）状態です。\n` +
        `ユーザーの慣性に合わせすぎている可能性があります。\n\n` +
        `- 今までの仮説と矛盾する可能性を積極的に探すこと\n` +
        `- 「もし逆だったら？」と自問すること\n` +
        `- ユーザーの「変化」を見逃していないか注意すること\n` +
        `- 安易な同意・追認を避けること`,
    };
  }

  return none;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hypothesis Shake
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function shouldShakeHypotheses(
  avgStaleness: number,
  highConfidenceRatio: number,
): boolean {
  // 仮説が古い + 確信度が高い → 揺さぶり推奨
  return avgStaleness > STALENESS_SHAKE_THRESHOLD && highConfidenceRatio > 0.6;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Evaluation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Negative Capability 全体評価。
 *
 * 予測暴落 + 過学習 + 仮説揺さぶり + 不確実領域を一括評価し、
 * 統合プロンプトブロックを返す。
 */
export function evaluateNegativeCapability(
  input: NegativeCapabilityInput,
): NegativeCapabilityState {
  const crash = detectPredictionCrash(
    input.overallPredictionRate,
    input.predictionTrend,
    input.recentMissStreak,
  );

  const overfit = detectOverfit(
    input.overallPredictionRate,
    input.highConfidenceRatio,
    input.sessionCount,
  );

  const hypothesisShakeNeeded = shouldShakeHypotheses(
    input.avgHypothesisStaleness,
    input.highConfidenceRatio,
  );

  // 低精度ドメイン検出
  const uncertainDomains = input.categoryAccuracies
    .filter(c => c.attempts >= 3 && c.rate < 0.3)
    .map(c => c.category);

  // 統合プロンプトブロック
  const blocks: string[] = [];
  if (crash.promptBlock) blocks.push(crash.promptBlock);
  if (overfit.promptBlock) blocks.push(overfit.promptBlock);

  if (hypothesisShakeNeeded) {
    blocks.push(
      `\n## 仮説再検証推奨\n` +
      `仮説が古くなっています（平均${Math.round(input.avgHypothesisStaleness)}日未更新）。\n` +
      `- 「これはまだ正しいか？」と自問すること\n` +
      `- ユーザーの最近の変化を見逃していないか確認すること\n` +
      `- 確定的な表現を避け、再確認の姿勢を見せること`,
    );
  }

  if (uncertainDomains.length > 0) {
    blocks.push(
      `\n## 不確実な領域\n` +
      `以下の領域では予測精度が低いため、断定を避けてください:\n` +
      uncertainDomains.map(d => `- ${d}`).join("\n"),
    );
  }

  return {
    crash,
    overfit,
    hypothesisShakeNeeded,
    uncertainDomains,
    promptBlock: blocks.length > 0 ? blocks.join("\n") : null,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildNegativeCapabilityAnalytics(
  state: NegativeCapabilityState,
): Record<string, unknown> {
  return {
    prediction_crash_severity: state.crash.severity,
    prediction_crash_rate: state.crash.currentRate,
    prediction_crash_trend: state.crash.trend,
    overfit_severity: state.overfit.severity,
    hypothesis_shake_needed: state.hypothesisShakeNeeded,
    uncertain_domains: state.uncertainDomains,
    phase_demotion_recommended: state.crash.phaseDemotion,
  };
}
