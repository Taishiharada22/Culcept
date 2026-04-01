// lib/stargazer/expansionTuning.ts
// P4 運用確認フェーズ: 拡張軸の閾値・混入条件の微調整パラメータ
// ここを変更するだけで出題条件を調整できる（コードロジック変更不要）
//
// 変更時は decision-log.md に記録すること

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 出題ゲート
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 拡張質問を出し始める最低セッション数 */
export const EXPANSION_MIN_SESSIONS = 20;

/** 拡張質問を出し始める最低日数 */
export const EXPANSION_MIN_DAYS = 7;

/** 最近N日以内に出題した質問を除外する窓 */
export const EXPANSION_RECENCY_WINDOW_DAYS = 14;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 候補軸スコアリング
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** hidden だが解放に近い軸の confidence 下限 */
export const NEAR_EMERGING_CONFIDENCE = 0.08;

/** 矛盾検出時の優先度ブースト倍率 */
export const CONTRADICTION_BOOST = 2.0;

/** 低精度（情報利得が高い）の優先度ブースト倍率 */
export const LOW_PRECISION_BOOST = 1.5;

/** 低精度と見做す precision の閾値 */
export const LOW_PRECISION_THRESHOLD = 5.0;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 深さ解放
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** depth=2 を解放する precision 閾値 */
export const DEPTH_2_PRECISION = 3;

/** depth=3 を解放する precision 閾値 */
export const DEPTH_3_PRECISION = 10;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 回答処理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 拡張質問回答の証拠精度（daily の倍率） */
export const EXPANSION_EVIDENCE_PRECISION = 0.8;

/** 雑回答（極端に速い）と見做す閾値 (ms) */
export const FAST_ANSWER_THRESHOLD_MS = 1500;

/** 雑回答時の精度低下係数 */
export const FAST_ANSWER_PENALTY = 0.6;

/** 熟考（長い回答時間）と見做す閾値 (ms) */
export const SLOW_ANSWER_THRESHOLD_MS = 10000;

/** 熟考時の精度ブースト係数 */
export const SLOW_ANSWER_BOOST = 1.1;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// アラート閾値（monitoring API 用）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 1セッションあたりの質問数がこれを超えたら heavy session */
export const HEAVY_SESSION_THRESHOLD = 10;

/** 軸偏りアラートを出す最多/最少の比率 */
export const AXIS_BIAS_RATIO_THRESHOLD = 3;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO運用基準（2026-04-01 承認）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 回答完了率: 健全 */
export const COMPLETION_RATE_HEALTHY = 80;
/** 回答完了率: 注意 */
export const COMPLETION_RATE_CAUTION = 60;
// 59%以下 = 要修正

/** 回答時間: 適正下限 (ms) — これ未満は直感押しの可能性 */
export const RESPONSE_TIME_TOO_FAST_MS = 1500;
/** 回答時間: 適正上限 median (ms) — これ以上は質問が重い可能性 */
export const RESPONSE_TIME_IDEAL_MAX_MS = 6000;
/** 回答時間: p90 がこれを超え続けるなら重い */
export const RESPONSE_TIME_P90_HEAVY_MS = 10000;

/** lightness p90 維持目標 */
export const LIGHTNESS_P90_TARGET = 8;
/** lightness p95 維持目標 */
export const LIGHTNESS_P95_TARGET = 9;
