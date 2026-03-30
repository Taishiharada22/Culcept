// lib/stargazer/responseTimeEngine.ts
// 回答時間 → 証拠力(confidence multiplier) + 行動シグナル
// 対数正規モデル: 回答時間は右裾の分布なので log スケールで正規化
//
// 参考: Fazio (1990) — response latency as attitude strength indicator
//       Ratcliff & McKoon (2008) — drift-diffusion model of decision speed

// ── 型定義 ──

export interface ResponseTimeSignal {
  /** 回答の証拠力を調整する乗数。0.5〜1.2 */
  confidenceMultiplier: number;
  /** 内的葛藤の強さ。0〜1 (高い = 長考しており葛藤がある) */
  conflictIndicator: number;
  /** 確信の強さ。0〜1 (高い = 考えた上での即断) */
  convictionIndicator: number;
}

// ── 定数 ──

/** ユーザーデータがない場合のデフォルト回答時間 (ms) */
const DEFAULT_BASELINE_MS = 5000;

/** 質問データがない場合のデフォルト中央値 (ms) */
const DEFAULT_QUESTION_MEDIAN_MS = 5000;

/** 最小回答時間 — これ以下はノイズとして扱う */
const MIN_RESPONSE_MS = 300;

/** 最大回答時間 — これ以上は外れ値としてクリップ */
const MAX_RESPONSE_MS = 60_000;

// ── メイン関数 ──

/**
 * 回答時間から証拠力シグナルを算出
 *
 * @param responseTimeMs      回答にかかった時間 (ms)
 * @param userBaselineMs      ユーザー個人の中央値回答時間 (ms, 過去20回答)
 * @param questionMedianMs    この質問の全ユーザー中央値 (ms)
 * @returns ResponseTimeSignal
 */
export function computeResponseTimeSignal(
  responseTimeMs: number | undefined | null,
  userBaselineMs: number = DEFAULT_BASELINE_MS,
  questionMedianMs: number = DEFAULT_QUESTION_MEDIAN_MS,
): ResponseTimeSignal {
  // データなし → 中立シグナル
  if (responseTimeMs == null || responseTimeMs <= 0) {
    return { confidenceMultiplier: 1.0, conflictIndicator: 0, convictionIndicator: 0.5 };
  }

  // クリッピング
  const clipped = Math.max(MIN_RESPONSE_MS, Math.min(MAX_RESPONSE_MS, responseTimeMs));
  const baseline = Math.max(MIN_RESPONSE_MS, userBaselineMs || DEFAULT_BASELINE_MS);
  const qMedian = Math.max(MIN_RESPONSE_MS, questionMedianMs || DEFAULT_QUESTION_MEDIAN_MS);

  // 対数スケールで個人基準 + 質問基準を合成
  // personalRatio > 0: ユーザーの普段より遅い
  // personalRatio < 0: ユーザーの普段より速い
  const personalRatio = Math.log(clipped / baseline);
  const questionRatio = Math.log(clipped / qMedian);

  // 合成 z-score（個人基準を重視: 0.6）
  const zScore = 0.6 * personalRatio + 0.4 * questionRatio;

  // ── confidenceMultiplier ──
  // 滑らかなS字カーブで遷移
  //   z < -1.5: 0.55 (極端に速い → 読んでいない可能性)
  //   z ≈ -1.0: 0.70 (速い → 表面的反応リスク)
  //   z ≈  0.0: 1.00 (標準 → フル信頼)
  //   z ≈ +1.0: 0.85 (やや遅い → 軽い葛藤)
  //   z > +2.0: 0.60 (非常に遅い → 強い葛藤)
  let confidenceMultiplier: number;
  if (zScore < -1.5) {
    // 極端に速い: sigmoid で 0.55 に漸近
    confidenceMultiplier = 0.55 + 0.15 / (1 + Math.exp(-3 * (zScore + 1.5)));
  } else if (zScore < -0.3) {
    // やや速い → 標準へ回復: 線形補間
    const t = (zScore + 1.5) / 1.2; // 0 to 1
    confidenceMultiplier = 0.70 + 0.30 * t;
  } else if (zScore < 0.5) {
    // 標準域: フル信頼
    confidenceMultiplier = 1.0;
  } else if (zScore < 2.0) {
    // やや遅い → 葛藤: 線形減少
    const t = (zScore - 0.5) / 1.5; // 0 to 1
    confidenceMultiplier = 1.0 - 0.15 * t;
  } else {
    // 非常に遅い: sigmoid で 0.55 に漸近
    confidenceMultiplier = 0.55 + 0.30 / (1 + Math.exp(2 * (zScore - 2.5)));
  }

  // ── conflictIndicator ──
  // z > 0.5 で上昇。長考ほど葛藤が強い
  const conflictIndicator = Math.max(0, Math.min(1,
    1 / (1 + Math.exp(-2.5 * (zScore - 1.0)))
  ));

  // ── convictionIndicator ──
  // z ≈ -0.3 でピーク（考えた上での適度な速さ）
  // 極端に速い or 遅い場合は低下
  const convictionIndicator = Math.max(0, Math.min(1,
    Math.exp(-0.5 * Math.pow((zScore + 0.3) / 0.8, 2))
  ));

  return {
    confidenceMultiplier: Math.max(0.5, Math.min(1.2, confidenceMultiplier)),
    conflictIndicator,
    convictionIndicator,
  };
}

// ── ユーザーベースライン計算 ──

/**
 * 直近の回答時間配列からユーザー個人の中央値を算出
 * @param recentResponseTimes 直近の回答時間 (ms) — 最大20件推奨
 * @returns 中央値 (ms)
 */
export function computeUserBaseline(recentResponseTimes: number[]): number {
  const valid = recentResponseTimes
    .filter((t) => t > MIN_RESPONSE_MS && t < MAX_RESPONSE_MS);

  if (valid.length === 0) return DEFAULT_BASELINE_MS;

  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

// ── バッチ処理: 回答配列から一括でシグナルを生成 ──

export interface AnnotatedResponseTime {
  questionId: string;
  responseTimeMs: number | undefined | null;
  signal: ResponseTimeSignal;
}

/**
 * 回答配列に対して一括でResponseTimeSignalを付与
 * ユーザーベースラインは配列内から自動計算
 */
export function annotateResponseTimes(
  answers: { questionId: string; responseTimeMs?: number | null }[],
  existingUserBaselineMs?: number,
): AnnotatedResponseTime[] {
  // ユーザーベースラインの決定
  const times = answers
    .map((a) => a.responseTimeMs)
    .filter((t): t is number => t != null && t > MIN_RESPONSE_MS);
  const userBaseline = existingUserBaselineMs ?? computeUserBaseline(times);

  return answers.map((a) => ({
    questionId: a.questionId,
    responseTimeMs: a.responseTimeMs ?? null,
    signal: computeResponseTimeSignal(a.responseTimeMs, userBaseline),
    // questionMedianMs は将来的に質問プールから取得（今はデフォルト）
  }));
}
