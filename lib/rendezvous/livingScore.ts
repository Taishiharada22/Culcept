/**
 * Living Score Engine
 * マッチスコアを静的な数値から「生きるスコア」に変換
 * Orbiterシグナル + チャットマイルストーン + アクティビティ結果から日次再計算
 */

export type ScoreSignal = {
  type: "chat_milestone" | "activity_result" | "orbiter_signal" | "nudge_feedback";
  value: number; // -0.05..+0.05 per signal
  timestamp: string;
};

export type TrajectoryDirection = "rising" | "stable" | "cooling";

export type TrajectoryInfo = {
  /** 最新の生きるスコア (0..100) */
  livingScore: number;
  /** 変化方向 */
  direction: TrajectoryDirection;
  /** 直近7日分のスコア履歴 (スパークライン用) */
  sparkline: number[];
  /** 方向のラベル */
  directionLabel: string;
};

/**
 * 元スコア + シグナル群 → 生きるスコア
 * - 各シグナルは小さな調整値を持つ
 * - 元スコアからの変動は ±15% に制限
 * - 時間減衰: 古いシグナルほど影響が小さい
 */
export function computeLivingScore(
  baseScore: number, // 0..1 (元のoverall_score)
  signals: ScoreSignal[],
): number {
  if (signals.length === 0) return Math.round(baseScore * 100);

  const now = Date.now();
  let adjustment = 0;

  for (const signal of signals) {
    const ageMs = now - new Date(signal.timestamp).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    // 半減期: 14日
    const decay = Math.pow(0.5, ageDays / 14);
    adjustment += signal.value * decay;
  }

  // 元スコアからの変動上限: ±15%
  const maxDelta = 0.15;
  const clampedAdj = Math.max(-maxDelta, Math.min(maxDelta, adjustment));

  const raw = baseScore + clampedAdj;
  return Math.round(Math.max(0, Math.min(1, raw)) * 100);
}

/**
 * スコア履歴から軌道方向を判定
 */
export function computeTrajectoryDirection(
  history: { score: number; computed_at: string }[],
): TrajectoryDirection {
  if (history.length < 2) return "stable";

  // 直近3日と前の3日の平均を比較
  const sorted = [...history].sort(
    (a, b) => new Date(b.computed_at).getTime() - new Date(a.computed_at).getTime(),
  );

  const recent = sorted.slice(0, 3);
  const older = sorted.slice(3, 6);

  if (older.length === 0) return "stable";

  const recentAvg = recent.reduce((s, r) => s + r.score, 0) / recent.length;
  const olderAvg = older.reduce((s, r) => s + r.score, 0) / older.length;
  const delta = recentAvg - olderAvg;

  if (delta > 0.02) return "rising";
  if (delta < -0.02) return "cooling";
  return "stable";
}

const DIRECTION_LABELS: Record<TrajectoryDirection, string> = {
  rising: "成長中",
  stable: "安定",
  cooling: "冷却中",
};

/**
 * 完全なTrajectoryInfoを構築
 */
export function buildTrajectoryInfo(
  baseScore: number,
  signals: ScoreSignal[],
  history: { score: number; computed_at: string }[],
): TrajectoryInfo {
  const livingScore = computeLivingScore(baseScore, signals);
  const direction = computeTrajectoryDirection(history);

  // スパークライン: 直近7日分のスコア (0-100)
  const sparkline = history
    .sort((a, b) => new Date(a.computed_at).getTime() - new Date(b.computed_at).getTime())
    .slice(-7)
    .map((h) => Math.round(h.score * 100));

  // 現在のlivingScoreを末尾に追加
  if (sparkline.length === 0 || sparkline[sparkline.length - 1] !== livingScore) {
    sparkline.push(livingScore);
  }

  return {
    livingScore,
    direction,
    sparkline,
    directionLabel: DIRECTION_LABELS[direction],
  };
}

/**
 * チャットマイルストーンからシグナルを生成
 */
export function milestoneToSignal(
  milestoneType: string,
  reachedAt: string,
): ScoreSignal {
  const signalValues: Record<string, number> = {
    first_reply: 0.02,
    ten_messages: 0.03,
    first_voice: 0.04,
    three_day_streak: 0.03,
    first_activity: 0.02,
    mutual_activity: 0.04,
  };

  return {
    type: "chat_milestone",
    value: signalValues[milestoneType] ?? 0.01,
    timestamp: reachedAt,
  };
}

/**
 * ナッジフィードバックからシグナルを生成
 */
export function nudgeFeedbackToSignal(
  feedback: "helpful" | "not_relevant",
  createdAt: string,
): ScoreSignal {
  return {
    type: "nudge_feedback",
    value: feedback === "helpful" ? 0.01 : -0.005,
    timestamp: createdAt,
  };
}
