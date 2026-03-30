// lib/stargazer/itemDiscrimination.ts
// 質問弁別力（簡易 IRT）エンジン
//
// Item Response Theory の簡易版: 全ユーザーの回答パターンから
// 各質問の「弁別力」を算出し、スコアリングの重みに反映する。
//
// 弁別力が高い質問 = 回答が人によって大きく分かれる → 情報量が多い
// 弁別力が低い質問 = 全員同じように答える → ほぼ無意味
//
// 参考: Embretson & Reise (2000) — Item Response Theory for Psychologists
//       Baker & Kim (2004) — Item Response Theory: Parameter Estimation

// ── 型定義 ──

export interface ItemDiscriminationParams {
  /** この質問の全ユーザー回答分散 (0〜1+) */
  responseVariance: number;
  /** この質問の回答と最終軸スコアの相関係数 (-1〜1) */
  axisCorrelation: number;
  /** この質問が影響する軸の数 */
  axisCount: number;
}

export interface ItemDiscriminationResult {
  /** 弁別力の重み乗数 (0.1〜2.0) */
  weight: number;
  /** 弁別力の信頼度（データ量に基づく） */
  reliability: number;
}

// ── 定数 ──

/** 弁別力が機能し始める最低ユーザー数 */
const MIN_USERS_FOR_EMPIRICAL = 50;

/** デフォルトの弁別力（データ不足時） */
const DEFAULT_DISCRIMINATION = 1.0;

/** 分散の基準値 — これで varianceFactor = 1.0 */
const VARIANCE_REFERENCE = 0.5;

// ── メイン関数 ──

/**
 * 質問の弁別力を算出
 *
 * @param params     弁別力パラメータ
 * @param userCount  この質問に回答したユーザー数
 * @returns ItemDiscriminationResult
 */
export function computeItemDiscrimination(
  params: ItemDiscriminationParams,
  userCount: number,
): ItemDiscriminationResult {
  // データ不足 → デフォルト
  if (userCount < MIN_USERS_FOR_EMPIRICAL) {
    return { weight: DEFAULT_DISCRIMINATION, reliability: 0 };
  }

  // ── 分散ファクター ──
  // 分散が低い（全員同じ答え）→ 弁別力が低い
  // varianceFactor: 0 (全員同じ) → 0.1, VARIANCE_REFERENCE → 1.0
  const varianceFactor = Math.min(1, params.responseVariance / VARIANCE_REFERENCE);

  // ── 相関ファクター ──
  // 軸との相関が高い → その質問はその軸を良く測定している
  const correlationFactor = Math.abs(params.axisCorrelation);

  // ── フォーカスファクター ──
  // 多くの軸に影響する質問は、1軸あたりの焦点がぼやける
  const focusFactor = 1 / Math.sqrt(Math.max(1, params.axisCount));

  // ── 合成 ──
  const rawWeight = varianceFactor * (0.3 + 0.7 * correlationFactor) * focusFactor;
  const weight = Math.max(0.1, Math.min(2.0, rawWeight));

  // 信頼度: ユーザー数に応じて漸増（200人で0.8、500人で0.95）
  const reliability = 1 - Math.exp(-userCount / 200);

  return { weight, reliability };
}

/**
 * 弁別力の重みとデフォルトをブレンド
 * reliability に応じて、empirical weight とデフォルトを補間する
 */
export function blendWithDefault(result: ItemDiscriminationResult): number {
  return result.reliability * result.weight + (1 - result.reliability) * DEFAULT_DISCRIMINATION;
}

// ── バッチ処理用: 質問プールの弁別力を一括計算 ──

export interface QuestionPoolEntry {
  questionId: string;
  responseVariance: number;
  axisCorrelation: number;
  axisCount: number;
  userCount: number;
}

/**
 * 質問プール全体の弁別力マップを生成
 */
export function computeDiscriminationMap(
  pool: QuestionPoolEntry[],
): Map<string, number> {
  const map = new Map<string, number>();

  for (const entry of pool) {
    const result = computeItemDiscrimination(
      {
        responseVariance: entry.responseVariance,
        axisCorrelation: entry.axisCorrelation,
        axisCount: entry.axisCount,
      },
      entry.userCount,
    );
    map.set(entry.questionId, blendWithDefault(result));
  }

  return map;
}
