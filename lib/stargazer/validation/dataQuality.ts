import type { TraitAxisKey } from "../traitAxes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DataQualityScore {
  /** 総合品質スコア (0-1) */
  overall: number;
  /** 品質レベル */
  level: "low" | "moderate" | "high" | "excellent";
  /** 品質レベルの日本語ラベル */
  levelLabel: string;
  /** サブ次元 */
  dimensions: {
    /** サンプルサイズの充実度 (0-1) */
    sampleSize: number;
    /** 時間的カバレッジ (0-1) */
    temporalCoverage: number;
    /** 軸カバレッジ (0-1) */
    axisCoverage: number;
    /** 内的整合性 (0-1) */
    internalConsistency: number;
  };
  /** 品質改善アドバイス (日本語) */
  advice: string[];
}

export interface AxisConfidence {
  axisId: TraitAxisKey;
  /** 信頼度 (0-1) */
  confidence: number;
  /** データポイント数 */
  dataPoints: number;
  /** 信頼度ラベル */
  label: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function resolveLevel(overall: number): {
  level: DataQualityScore["level"];
  levelLabel: string;
} {
  if (overall >= 0.75) return { level: "excellent", levelLabel: "十分" };
  if (overall >= 0.50) return { level: "high", levelLabel: "蓄積中" };
  if (overall >= 0.25) return { level: "moderate", levelLabel: "初期段階" };
  return { level: "low", levelLabel: "観測開始直後" };
}

/** 弱い次元に基づいて日本語のアドバイスを最大3つ返す */
function getQualityAdvice(dimensions: DataQualityScore["dimensions"]): string[] {
  const entries: { key: keyof typeof dimensions; score: number }[] = [
    { key: "sampleSize", score: dimensions.sampleSize },
    { key: "temporalCoverage", score: dimensions.temporalCoverage },
    { key: "axisCoverage", score: dimensions.axisCoverage },
    { key: "internalConsistency", score: dimensions.internalConsistency },
  ];

  // 弱い順にソートし、0.7 未満のものだけアドバイス対象にする
  const weak = entries
    .filter((e) => e.score < 0.7)
    .sort((a, b) => a.score - b.score);

  const adviceMap: Record<keyof typeof dimensions, string> = {
    sampleSize:
      "もう少し観測を重ねると、より正確なプロフィールが見えてきます",
    temporalCoverage:
      "日を空けて観測すると、状態による変化も捉えられます",
    axisCoverage:
      "まだ観測されていない領域があります。新しいテーマの質問に挑戦してみましょう",
    internalConsistency:
      "回答にばらつきが見られます。本音で答えると精度が上がります",
  };

  return weak.slice(0, 3).map((e) => adviceMap[e.key]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function computeDataQuality(params: {
  totalObservations: number;
  axisScores: Partial<Record<TraitAxisKey, number>>;
  observedAxesCount: number;
  totalAxes?: number;
  daysSinceFirstObservation: number;
  observationDays?: number;
}): DataQualityScore {
  const {
    totalObservations,
    axisScores,
    observedAxesCount,
    totalAxes = 33,
    daysSinceFirstObservation,
    observationDays,
  } = params;

  // --- サブ次元 ---

  /**
   * サンプルサイズ: 1000 観測で 100% 到達（以前は200だった）。
   * 45軸に対して各軸30回以上の反復観測 + 文脈別データが必要。
   * 臨床心理の標準では週1回×1年（50セッション）で初期評価が安定する。
   * 日次5-8問のアプリでは、信頼できるデータには1000問以上が必要
   * (Nunnally & Bernstein, 1994; 最低30観測/軸の信頼性基準)。
   */
  const sampleSize = clamp01(totalObservations / 1000);

  /**
   * 時間的カバレッジ: 365日で 100%（以前は90日だった）。
   * 性格の安定性は季節変動、ライフイベント、長期ストレスに影響される。
   * 最低でも4季節を通した観測が必要（Roberts et al., 2006）。
   * 90日では夏の自分しか見ていない可能性がある。
   */
  const effectiveDays =
    observationDays ?? Math.min(daysSinceFirstObservation, totalObservations);
  const temporalCoverage = clamp01(effectiveDays / 365);

  /**
   * 軸カバレッジ: 45軸は完全な測定空間を表す。
   * 部分的カバレッジは、推定値が観測ではなく補間に基づく次元を示す。
   */
  const axisCoverage = clamp01(observedAxesCount / totalAxes);

  const scores = Object.values(axisScores) as number[];

  /**
   * 内的整合性: 標準偏差 0.3 が閾値。
   * 正規化された -1〜+1 スケール上で約 1σ に相当。
   * この閾値を超える内的整合性は、測定ノイズではなく
   * 安定した個人差を示す (Costa & McCrae, 1992)。
   */
  const internalConsistency = clamp01(stdDev(scores) / 0.3);

  const dimensions = {
    sampleSize,
    temporalCoverage,
    axisCoverage,
    internalConsistency,
  };

  // --- 総合スコア（加重平均） ---
  const overall =
    sampleSize * 0.3 +
    temporalCoverage * 0.2 +
    axisCoverage * 0.25 +
    internalConsistency * 0.25;

  const { level, levelLabel } = resolveLevel(overall);
  const advice = getQualityAdvice(dimensions);

  return { overall, level, levelLabel, dimensions, advice };
}

export function computeAxisConfidence(params: {
  axisId: TraitAxisKey;
  dataPoints: number;
  scoreVariance?: number;
}): AxisConfidence {
  const { axisId, dataPoints, scoreVariance } = params;

  let confidence = clamp01(dataPoints / 5);

  // 分散が高い場合は信頼度を 20% 減少
  if (scoreVariance !== undefined && scoreVariance > 0.5) {
    confidence *= 0.8;
  }

  /**
   * 信頼度ラベルの閾値根拠:
   * - >= 0.85 "確信": 収束的妥当性が確立。複数の独立した指標が一致
   * - >= 0.60 "信頼": 暫定的だが方向性は信頼できる。主要パターンは安定
   * - >= 0.30 "暫定": パターン検出段階。変化の可能性あり
   * - <  0.30 "推定": 初期推定。データ不足のため観測継続で精度向上
   */
  let label: string;
  if (confidence >= 0.85) {
    label = "確信";
  } else if (confidence >= 0.6) {
    label = "信頼";
  } else if (confidence >= 0.3) {
    label = "暫定";
  } else {
    label = "推定";
  }

  return { axisId, confidence, dataPoints, label };
}
