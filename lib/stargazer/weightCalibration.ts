// lib/stargazer/weightCalibration.ts
// 重みキャリブレーション — 手動設定の重みを実データで補正
//
// 3つのフィードバックシグナルを使用:
// 1. テスト-リテスト相関: 再観測で同じ軸の一致度
// 2. メタ合意率: ユーザーが結果を「当たっている」と感じる率
// 3. 予測精度: 軸スコアが将来の行動を予測できる度合い
//
// 週次 cron ジョブで実行し、結果をキャッシュ。
// スコアリング時にはキャッシュから読み取り、証拠精度に反映。

// ── 型定義 ──

export interface CalibrationSignal {
  /** 再観測時の一致度 (0〜1) — 高い = 安定 */
  testRetestCorrelation: number;
  /** ユーザーが「当たっている」と答えた割合 (0〜1) */
  metaAgreementRate: number;
  /** 予測精度 (0〜1) — 軸スコアが行動を予測できる度合い */
  predictionAccuracy: number;
  /** このキャリブレーションのサンプル数 */
  sampleCount: number;
}

export interface CalibrationResult {
  /** 軸ごとの補正済み重み乗数 (0.3〜1.5) */
  axisWeightMultiplier: number;
  /** この補正の信頼度 (0〜1) */
  calibrationConfidence: number;
  /** 使用されたシグナル */
  signals: CalibrationSignal;
}

// ── 定数 ──

/** キャリブレーションが有効になる最低サンプル数 */
const MIN_SAMPLES = 30;

/** デフォルト乗数（データ不足時） */
const DEFAULT_MULTIPLIER = 1.0;

// ── メイン関数 ──

/**
 * キャリブレーションシグナルから重み補正値を算出
 *
 * @param signal 3つのフィードバックシグナル
 * @returns CalibrationResult
 */
export function computeCalibration(signal: CalibrationSignal): CalibrationResult {
  if (signal.sampleCount < MIN_SAMPLES) {
    return {
      axisWeightMultiplier: DEFAULT_MULTIPLIER,
      calibrationConfidence: 0,
      signals: signal,
    };
  }

  // ── テスト-リテスト ──
  // 相関が低い → 質問/軸の測定が不安定 → 重みを下げる
  // 0.0 → 0.5, 0.5 → 0.75, 1.0 → 1.0
  const retestFactor = 0.5 + 0.5 * signal.testRetestCorrelation;

  // ── メタ合意率 ──
  // 「当たっている」率が低い → この軸の測定が現実と乖離 → 重みを下げる
  // 0.0 → 0.7, 0.5 → 0.85, 1.0 → 1.0
  const agreementFactor = 0.7 + 0.3 * signal.metaAgreementRate;

  // ── 予測精度 ──
  // 予測が当たる → この軸は有用 → 重みを維持/上げる
  // 0.0 → 0.8, 0.5 → 0.9, 1.0 → 1.0
  const predictionFactor = 0.8 + 0.2 * signal.predictionAccuracy;

  // ── 合成 ──
  const rawMultiplier = retestFactor * agreementFactor * predictionFactor;
  const axisWeightMultiplier = Math.max(0.3, Math.min(1.5, rawMultiplier));

  // 信頼度: サンプル数に基づく（100で0.6、300で0.9）
  const calibrationConfidence = 1 - Math.exp(-signal.sampleCount / 150);

  return { axisWeightMultiplier, calibrationConfidence, signals: signal };
}

/**
 * キャリブレーション結果をデフォルトとブレンド
 * calibrationConfidence に応じて段階的に empirical に移行
 */
export function blendCalibration(result: CalibrationResult): number {
  return (
    result.calibrationConfidence * result.axisWeightMultiplier +
    (1 - result.calibrationConfidence) * DEFAULT_MULTIPLIER
  );
}

// ── キャッシュ管理 ──

/** インメモリキャッシュ（週次更新） */
let calibrationCache: Map<string, CalibrationResult> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7日

/**
 * 軸のキャリブレーション済み重み乗数を取得
 * キャッシュがない場合はデフォルト 1.0 を返す
 */
export function getCalibrationMultiplier(axisId: string): number {
  if (!calibrationCache || Date.now() - cacheTimestamp > CACHE_TTL_MS) {
    return DEFAULT_MULTIPLIER;
  }
  const result = calibrationCache.get(axisId);
  if (!result) return DEFAULT_MULTIPLIER;
  return blendCalibration(result);
}

/**
 * キャッシュを更新（cron ジョブから呼ばれる）
 */
export function updateCalibrationCache(
  calibrations: Map<string, CalibrationResult>,
): void {
  calibrationCache = calibrations;
  cacheTimestamp = Date.now();
}
