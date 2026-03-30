// ============================================================
// Rendezvous Question System 定数
// 将来的に調整しやすいように切り出し
// ============================================================

import type { LayerWeights } from "./types";

// ---------- 3層合成の重み ----------

/** 固定層 60%, 可変層 25%, 当日層 15% */
export const DEFAULT_LAYER_WEIGHTS: LayerWeights = {
  fixed: 0.60,
  variable: 0.25,
  daily: 0.15,
};

// ---------- 重み合成 ----------

/** ユーザー重みの補正係数の基本値 */
export const DEFAULT_ADJUSTMENT_FACTOR = 0.5;

/** rigidityが最大時の補正係数 */
export const MIN_ADJUSTMENT_FACTOR = 0.25;

/** rigidityが最小時の補正係数 */
export const MAX_ADJUSTMENT_FACTOR = 0.75;

// ---------- 相性判定 ----------

/** 相性スコアの最小値 */
export const MIN_COMPATIBILITY = 0;

/** 相性スコアの最大値 */
export const MAX_COMPATIBILITY = 1;

/** similarity判定で「近い」と見なす最大距離 (scaleの場合) */
export const SIMILARITY_CLOSE_THRESHOLD = 1;

/** complementary判定の理想距離 (scaleの場合) */
export const COMPLEMENTARY_IDEAL_DISTANCE = 3;

// ---------- 文脈スコア ----------

/** 文脈スコアの最大値 */
export const MAX_CONTEXT_SCORE = 100;

// ---------- 初回質問 ----------

/** 初回オンボーディングの質問数目安 */
export const ONBOARDING_QUESTION_COUNT_TARGET = 35;

// ---------- 毎日質問 ----------

/** 毎日質問の最大数 */
export const DAILY_QUESTION_MAX = 3;

/** 毎日質問の最小数 */
export const DAILY_QUESTION_MIN = 1;

/** 毎日回答の有効期限 (時間) */
export const DAILY_ANSWER_VALIDITY_HOURS = 24;

/** 可変層回答の有効期限 (日) */
export const VARIABLE_LAYER_VALIDITY_DAYS = 14;

// ---------- 理由文生成 ----------

/** 理由文に含める最大ポジティブ要因数 */
export const MAX_POSITIVE_FACTORS = 3;

/** 理由文に含める最大注意要因数 */
export const MAX_CAUTION_FACTORS = 2;

/** ポジティブ要因の閾値 (効果的重み * スコア) */
export const POSITIVE_FACTOR_THRESHOLD = 0.6;

/** 注意要因の閾値 */
export const CAUTION_FACTOR_THRESHOLD = 0.4;

// ---------- アバター判断 ----------

export type AvatarJudgment = "go" | "hold" | "low_recommend";

export const AVATAR_JUDGMENT_LABELS: Record<AvatarJudgment, string> = {
  go: "GO",
  hold: "保留",
  low_recommend: "低推奨",
};

export const AVATAR_JUDGMENT_COLORS: Record<AvatarJudgment, string> = {
  go: "#34D399",
  hold: "#FBBF24",
  low_recommend: "#94A3B8",
};

/** GOと判断するための最低スコア */
export const JUDGMENT_GO_THRESHOLD = 75;

/** 保留と判断するための最低スコア */
export const JUDGMENT_HOLD_THRESHOLD = 55;

// ---------- 重要度ラベル ----------

export const IMPORTANCE_LABELS: Record<number, string> = {
  1: "ほぼ気にしない",
  2: "あまり気にしない",
  3: "どちらでもない",
  4: "やや大切",
  5: "とても大切",
};

// ---------- 柔軟性ラベル ----------

export const FLEXIBILITY_LABELS: Record<number, string> = {
  1: "絶対合ってほしい",
  2: "できれば合ってほしい",
  3: "普通",
  4: "少しくらいズレてもOK",
  5: "かなり違っても大丈夫",
};
