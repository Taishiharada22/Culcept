// lib/stargazer/stage3Bridge.ts
// Stage 3 質問を日次観測フローに接続するブリッジ
//
// Stage 3 質問は `options[].axisMappings` (複数軸 × weight) を持つ。
// 日次観測フローでは Shadow Play と同じ方式で処理する:
//   - GET: plan に stage3Question を含めて返す
//   - POST: stage3Answers を受け取り、axisMappings から軸スナップショットを生成する

import { STAGE3_QUESTIONS, type Stage3Question } from "./stage3Questions";

// ── 対象条件 ──────────────────────────────────────────────────
// totalSessions >= 20 OR 合計観測数 >= 20 でアクティブになる。
// 5問に1問の割合で出題（セッション数で判定）。
// values_clarification / transformation_readiness は 10セッションに1問。
const STAGE3_MIN_SESSIONS = 7;

/** 値明確化・変容準備カテゴリ */
const VALUES_CATEGORIES = new Set(["values_clarification", "transformation_readiness"]);

/**
 * Stage 3 質問を選択して返す。
 * 対象外の場合は null を返す。
 *
 * - 通常カテゴリ: 5セッションに1問
 * - values_clarification / transformation_readiness: 10セッションに1問
 *
 * @param totalSessions ユーザーの総セッション数
 * @param seed 日付 + userId で重複しない選択を作るシード文字列
 * @param recentStage3Ids 直近に出題済みの Stage 3 質問 ID（除外用）
 */
export function selectStage3Question(
  totalSessions: number,
  seed: string,
  recentStage3Ids: string[] = [],
): Stage3Question | null {
  // 対象外: セッション数が閾値未満
  if (totalSessions < STAGE3_MIN_SESSIONS) return null;

  // 3問に1問: セッション数が 3 の倍数の時のみ出題
  if (totalSessions % 3 !== 0) return null;

  const recentSet = new Set(recentStage3Ids);

  // 10セッションに1回は values_clarification/transformation_readiness を優先
  const isValuesSlot = totalSessions % 6 === 0;

  let pool: Stage3Question[];
  if (isValuesSlot) {
    // 価値明確化・変容準備カテゴリから優先選択
    const valuesCandidates = STAGE3_QUESTIONS.filter(
      (q) => VALUES_CATEGORIES.has(q.category) && !recentSet.has(q.id),
    );
    pool = valuesCandidates.length > 0
      ? valuesCandidates
      : STAGE3_QUESTIONS.filter((q) => !recentSet.has(q.id));
  } else {
    // 通常: 全カテゴリから選択
    pool = STAGE3_QUESTIONS.filter((q) => !recentSet.has(q.id));
  }

  if (pool.length === 0) pool = STAGE3_QUESTIONS;
  if (pool.length === 0) return null;

  // シードベースの安定した選択（同じ日・ユーザーなら同じ質問）
  const hash = hashStr(seed);
  const index = Math.abs(hash) % pool.length;
  return pool[index];
}

/**
 * Stage 3 の回答を軸スナップショット行の配列に変換する。
 *
 * @param questionId 回答した Stage3Question の id
 * @param optionId   選択した Stage3Option の id
 * @param userId     Supabase ユーザー ID
 * @param sessionDate 観測日 (YYYY-MM-DD)
 * @param observationState 観測時の状態タグ（オプション）
 * @returns stargazer_axis_snapshots に insert できる行の配列
 */
export function stage3AnswerToSnapshots(
  questionId: string,
  optionId: string,
  userId: string,
  sessionDate: string,
  observationState?: Record<string, string> | null,
): {
  user_id: string;
  axis_id: string;
  score: number;
  confidence: number;
  context: null;
  observation_layer: string;
  variant_id: string;
  session_date: string;
  observation_state?: Record<string, string>;
}[] {
  const question = STAGE3_QUESTIONS.find((q) => q.id === questionId);
  if (!question) return [];

  const option = question.options.find((o) => o.id === optionId);
  if (!option) return [];

  return option.axisMappings
    .filter((m) => m.weight !== 0)
    .map((m) => ({
      user_id: userId,
      axis_id: m.key,
      score: m.weight,
      confidence: 0.5, // Stage 3 は深層シナリオ質問: 信頼度を高めに設定
      context: null,
      observation_layer: "stage3",
      variant_id: questionId,
      session_date: sessionDate,
      ...(observationState ? { observation_state: observationState } : {}),
    }));
}

/** 簡易ハッシュ（シードベース選択用） */
function hashStr(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
