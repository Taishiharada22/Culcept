import "server-only";

// lib/stargazer/depthReadiness.ts
// 深度準備度計算 — ユーザーがどの深さの質問に対応できるかを多要素で評価する
//
// totalSessions ベースの単純な深度解放を置き換え、
// 回答安定性・スキップ率・応答時間・一貫性・深い質問への受容度から
// 総合的な「準備度スコア」を算出する。

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DepthReadiness, DataConfidence } from "./questionPoolTypes";

// ═══ デフォルト値（データ不足時のフォールバック） ═══

const DEFAULT_FACTORS = {
  answerStability: 0.5,
  skipRate: 0.5,
  avgResponseTime: 0.5,
  answerConsistency: 0.5,
  deepQuestionReception: 0.5,
  lensObservationDepth: {} as Record<string, number>,
};

// ═══ 内部型 ═══

/** stargazer_question_shown の行データ（必要カラムのみ） */
interface ShownRow {
  question_key: string;
  shown_at: string;
  answered: boolean;
  score: number | null;
  response_time_ms: number | null;
}

/** stargazer_question_pool の行データ（depth/lens 取得用） */
interface PoolRow {
  question_key: string;
  depth_score: number;
  primary_lens_id: string | null;
  axis_id: string;
}

// ═══ メイン関数 ═══

/**
 * ユーザーの深度準備度を計算する。
 *
 * lensId が指定された場合、そのレンズに属する質問のみを対象にする。
 * null の場合は全体的な準備度を返す。
 *
 * @param userId  - 対象ユーザーID
 * @param lensId  - 特定レンズID（null で全体）
 * @param supabase - Supabase クライアント
 */
export async function calculateDepthReadiness(
  userId: string,
  lensId: string | null,
  supabase: SupabaseClient,
): Promise<DepthReadiness> {
  // ── 1. データ取得 ──
  const thirtyDaysAgo = daysAgoISO(30);

  // ユーザーの回答履歴（直近30日）
  const { data: shownRows } = await supabase
    .from("stargazer_question_shown")
    .select("question_key, shown_at, answered, score, response_time_ms")
    .eq("user_id", userId)
    .gte("shown_at", thirtyDaysAgo)
    .order("shown_at", { ascending: false });

  const allShown: ShownRow[] = (shownRows ?? []) as ShownRow[];

  if (allShown.length === 0) {
    // データなし → 最小限の深度のみ許可
    return buildResult(1, 0, "none", DEFAULT_FACTORS);
  }

  // 質問プールからの depth_score / lens 情報取得
  const questionKeys = Array.from(new Set(allShown.map((r) => r.question_key)));
  const poolMap = await fetchPoolMap(questionKeys, supabase);

  // lensId 指定がある場合、対象質問をフィルタ
  const filteredShown = lensId
    ? allShown.filter((r) => {
        const pool = poolMap.get(r.question_key);
        return pool?.primary_lens_id === lensId;
      })
    : allShown;

  // ── 2. 回答数に基づくフォールバック判定 ──
  const answeredRows = filteredShown.filter((r) => r.answered);
  const answeredCount = answeredRows.length;

  if (answeredCount === 0) {
    return buildResult(1, 0, "none", DEFAULT_FACTORS);
  }

  if (answeredCount < 5) {
    // 低信頼度 → depth 2 まで
    const lensObservationDepth = computeLensObservationDepth(answeredRows, poolMap);
    return buildResult(2, 0, "low", {
      ...DEFAULT_FACTORS,
      lensObservationDepth,
    });
  }

  // ── 3. 各要素の計算（medium / high 信頼度） ──
  const dataConfidence: DataConfidence = answeredCount < 15 ? "medium" : "high";

  const answerStability = computeAnswerStability(answeredRows, poolMap);
  const skipRate = computeSkipRate(filteredShown);
  const avgResponseTime = computeAvgResponseTime(answeredRows);
  const answerConsistency = computeAnswerConsistency(filteredShown);
  const deepQuestionReception = computeDeepQuestionReception(filteredShown, poolMap);
  const lensObservationDepth = computeLensObservationDepth(answeredRows, poolMap);

  // ── 4. 総合スコア計算 ──
  // skipRate はすでに「低スキップ = 高スコア」に変換済みなのでそのまま使う
  const readinessScore =
    answerStability * 0.2 +
    skipRate * 0.2 +
    avgResponseTime * 0.15 +
    answerConsistency * 0.15 +
    deepQuestionReception * 0.3;

  // maxSafeDepth: readinessScore × 6 を floor して [1, 6] にクランプ
  let maxSafeDepth = Math.floor(readinessScore * 6);
  maxSafeDepth = clamp(maxSafeDepth, 1, 6);

  // medium 信頼度の場合は depth 4 でキャップ
  if (dataConfidence === "medium") {
    maxSafeDepth = Math.min(maxSafeDepth, 4);
  }

  // ── 5. ハード前提条件によるオーバーライド ──
  maxSafeDepth = applyHardPrerequisites(
    maxSafeDepth,
    readinessScore,
    lensId,
    answeredRows,
    poolMap,
  );

  const factors = {
    answerStability,
    skipRate,
    avgResponseTime,
    answerConsistency,
    deepQuestionReception,
    lensObservationDepth,
  };

  return buildResult(maxSafeDepth, readinessScore, dataConfidence, factors);
}

// ═══ 要素計算関数 ═══

/**
 * 回答安定性 (0-1)
 * 同一軸の回答スコアの標準偏差の逆数。
 * 14日以内の回答を対象とし、安定しているほど高い値を返す。
 */
function computeAnswerStability(
  answeredRows: ShownRow[],
  poolMap: Map<string, PoolRow>,
): number {
  const fourteenDaysAgo = daysAgoISO(14);
  const recentAnswered = answeredRows.filter(
    (r) => r.shown_at >= fourteenDaysAgo && r.score !== null,
  );

  if (recentAnswered.length < 2) {
    return DEFAULT_FACTORS.answerStability;
  }

  // 軸ごとにスコアを集める
  const axisScoures: Record<string, number[]> = {};
  for (const row of recentAnswered) {
    const pool = poolMap.get(row.question_key);
    const axisKey = pool?.axis_id ?? "unknown";
    if (!axisScoures[axisKey]) axisScoures[axisKey] = [];
    axisScoures[axisKey].push(row.score!);
  }

  // 各軸の標準偏差を計算し、全体の平均を取る
  const stdDevs: number[] = [];
  for (const scores of Object.values(axisScoures)) {
    if (scores.length < 2) continue;
    stdDevs.push(standardDeviation(scores));
  }

  if (stdDevs.length === 0) {
    return DEFAULT_FACTORS.answerStability;
  }

  const avgStdDev = stdDevs.reduce((a, b) => a + b, 0) / stdDevs.length;
  // stdDev 0.5 以上 → 完全に不安定 (0)
  return Math.max(0, 1 - avgStdDev * 2);
}

/**
 * スキップ率 (0-1)
 * 直近7日間で表示された質問のうち、回答されなかった割合の逆数。
 * スキップが少ないほど高い値を返す。
 */
function computeSkipRate(shownRows: ShownRow[]): number {
  const sevenDaysAgo = daysAgoISO(7);
  const recentShown = shownRows.filter((r) => r.shown_at >= sevenDaysAgo);

  if (recentShown.length === 0) {
    return DEFAULT_FACTORS.skipRate;
  }

  const skippedCount = recentShown.filter((r) => !r.answered).length;
  // 低スキップ = 高スコア
  return 1 - skippedCount / recentShown.length;
}

/**
 * 平均応答時間スコア (0-1)
 * 理想的な応答時間（3-8秒）にどれだけ近いか。
 * 範囲内なら1.0、範囲外は距離に応じてペナルティ。
 */
function computeAvgResponseTime(answeredRows: ShownRow[]): number {
  const withTime = answeredRows.filter(
    (r) => r.response_time_ms !== null && r.response_time_ms > 0,
  );

  if (withTime.length === 0) {
    return DEFAULT_FACTORS.avgResponseTime;
  }

  const avgMs =
    withTime.reduce((sum, r) => sum + r.response_time_ms!, 0) / withTime.length;

  // 理想範囲: 3000-8000ms
  const IDEAL_MIN = 3000;
  const IDEAL_MAX = 8000;

  if (avgMs >= IDEAL_MIN && avgMs <= IDEAL_MAX) {
    return 1.0;
  }

  // 範囲外: 距離に応じたペナルティ
  // 1000ms や 15000ms あたりで 0.3 程度になるように調整
  if (avgMs < IDEAL_MIN) {
    // 速すぎる: 深く考えていない可能性
    const distance = IDEAL_MIN - avgMs;
    return Math.max(0, 1 - distance / 5000);
  }

  // 遅すぎる: 迷いすぎている可能性
  const distance = avgMs - IDEAL_MAX;
  return Math.max(0, 1 - distance / 12000);
}

/**
 * 回答一貫性 (0-1)
 * 再観測質問（同じ question_key が複数回出題されたケース）で、
 * スコアがどれだけ近いかを評価する。
 * 再観測データがなければデフォルト 0.5。
 */
function computeAnswerConsistency(shownRows: ShownRow[]): number {
  // 同じ question_key で複数回回答されたものを検出
  const keyScores: Record<string, number[]> = {};
  for (const row of shownRows) {
    if (!row.answered || row.score === null) continue;
    if (!keyScores[row.question_key]) keyScores[row.question_key] = [];
    keyScores[row.question_key].push(row.score);
  }

  // 2回以上回答されたキーのみ対象
  const reobservedKeys = Object.entries(keyScores).filter(
    ([, scores]) => scores.length >= 2,
  );

  if (reobservedKeys.length === 0) {
    // 再観測データなし → デフォルト
    return DEFAULT_FACTORS.answerConsistency;
  }

  // 各キーのスコア差の平均を計算
  let totalDiff = 0;
  let comparisons = 0;

  for (const [, scores] of reobservedKeys) {
    // 直近2回のスコア差を使用
    for (let i = 1; i < scores.length; i++) {
      totalDiff += Math.abs(scores[i] - scores[i - 1]);
      comparisons++;
    }
  }

  if (comparisons === 0) {
    return DEFAULT_FACTORS.answerConsistency;
  }

  const avgDiff = totalDiff / comparisons;
  // スコア差 0 → 完全一貫 (1.0)、差 1.0 → 不一貫 (0.0)
  return Math.max(0, 1 - avgDiff);
}

/**
 * 深い質問への受容度 (0-1)
 * depth_score >= 3 の質問に対する回答率。
 * 深い質問がまだ出題されていなければデフォルト 0.5。
 */
function computeDeepQuestionReception(
  shownRows: ShownRow[],
  poolMap: Map<string, PoolRow>,
): number {
  // depth >= 3 の質問を抽出
  const deepShown = shownRows.filter((r) => {
    const pool = poolMap.get(r.question_key);
    return pool && pool.depth_score >= 3;
  });

  if (deepShown.length === 0) {
    // 深い質問がまだ出題されていない
    return DEFAULT_FACTORS.deepQuestionReception;
  }

  const deepAnswered = deepShown.filter((r) => r.answered).length;
  return deepAnswered / deepShown.length;
}

/**
 * レンズ別の最大観測深度を集計する。
 * 各レンズで回答済みの質問の中で最大の depth_score を返す。
 */
function computeLensObservationDepth(
  answeredRows: ShownRow[],
  poolMap: Map<string, PoolRow>,
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const row of answeredRows) {
    const pool = poolMap.get(row.question_key);
    if (!pool?.primary_lens_id) continue;

    const lens = pool.primary_lens_id;
    const depth = pool.depth_score;
    result[lens] = Math.max(result[lens] ?? 0, depth);
  }

  return result;
}

// ═══ ハード前提条件 ═══

/**
 * 深度に対するハード前提条件を適用する。
 * 計算された maxSafeDepth を、前提条件を満たさない場合に引き下げる。
 *
 * - depth >= 2: レンズ表面質問（depth 1）に最低1回回答済み
 * - depth >= 4: レンズ depth <= 2 に最低3回回答済み
 * - depth == 6: readinessScore >= 0.7 かつ レンズ回答数 >= 10
 */
function applyHardPrerequisites(
  maxSafeDepth: number,
  readinessScore: number,
  lensId: string | null,
  answeredRows: ShownRow[],
  poolMap: Map<string, PoolRow>,
): number {
  // レンズ指定がない場合はハード前提条件をスキップ
  // （全体的な準備度として、個別レンズの制約は適用しない）
  if (!lensId) return maxSafeDepth;

  // このレンズの回答履歴を抽出
  const lensAnswered = answeredRows.filter((r) => {
    const pool = poolMap.get(r.question_key);
    return pool?.primary_lens_id === lensId;
  });

  const lensAnsweredWithDepth = lensAnswered.map((r) => ({
    ...r,
    depth: poolMap.get(r.question_key)?.depth_score ?? 1,
  }));

  // depth >= 2: 表面質問（depth 1）に最低1回回答が必要
  if (maxSafeDepth >= 2) {
    const surfaceAnswers = lensAnsweredWithDepth.filter((r) => r.depth === 1);
    if (surfaceAnswers.length === 0) {
      return 1;
    }
  }

  // depth >= 4: depth <= 2 に最低3回回答が必要
  if (maxSafeDepth >= 4) {
    const shallowAnswers = lensAnsweredWithDepth.filter((r) => r.depth <= 2);
    if (shallowAnswers.length < 3) {
      return Math.min(maxSafeDepth, 3);
    }
  }

  // depth == 6: readinessScore >= 0.7 かつ レンズ回答数 >= 10
  if (maxSafeDepth >= 6) {
    if (readinessScore < 0.7 || lensAnswered.length < 10) {
      return Math.min(maxSafeDepth, 5);
    }
  }

  return maxSafeDepth;
}

// ═══ データ取得ヘルパー ═══

/**
 * question_key のリストから stargazer_question_pool の情報を取得し、
 * question_key → PoolRow のマップを返す。
 *
 * Supabase の .in() フィルタには上限があるため、100件ごとにバッチ処理する。
 */
async function fetchPoolMap(
  questionKeys: string[],
  supabase: SupabaseClient,
): Promise<Map<string, PoolRow>> {
  const map = new Map<string, PoolRow>();

  if (questionKeys.length === 0) return map;

  // 100件ずつバッチ処理（Supabase .in() の推奨上限）
  const BATCH_SIZE = 100;
  for (let i = 0; i < questionKeys.length; i += BATCH_SIZE) {
    const batch = questionKeys.slice(i, i + BATCH_SIZE);

    const { data } = await supabase
      .from("stargazer_question_pool")
      .select("question_key, depth_score, primary_lens_id, axis_id")
      .in("question_key", batch);

    if (data) {
      for (const row of data as PoolRow[]) {
        map.set(row.question_key, row);
      }
    }
  }

  return map;
}

// ═══ ユーティリティ ═══

/** 結果オブジェクトを組み立てる */
function buildResult(
  maxSafeDepth: number,
  readinessScore: number,
  dataConfidence: DataConfidence,
  factors: DepthReadiness["factors"],
): DepthReadiness {
  return {
    maxSafeDepth: clamp(maxSafeDepth, 1, 6),
    readinessScore: clamp(readinessScore, 0, 1),
    dataConfidence,
    factors,
  };
}

/** 値を [min, max] の範囲にクランプする */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** N日前の日付を ISO 文字列（YYYY-MM-DD）で返す */
function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

/** 配列の標準偏差を計算する（母標準偏差） */
function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance);
}
