// ============================================================
// Daily Question Flow
// 毎日の質問選出 + 回答反映ロジック
// 毎日必要なのは再診断ではなく観測更新
// ============================================================

import type {
  QuestionMaster,
  UserQuestionResponse,
  UserDynamicPreference,
  DailyQuestionSet,
  ContextType,
} from "./types";
import { DAILY_ELIGIBLE_QUESTIONS } from "./questionMaster";
import {
  DAILY_QUESTION_MAX,
  DAILY_QUESTION_MIN,
  DAILY_ANSWER_VALIDITY_HOURS,
  VARIABLE_LAYER_VALIDITY_DAYS,
} from "./constants";

// ---------- Daily Question Selection ----------

/**
 * 今日の質問を選出する
 *
 * 選出基準:
 * 1. dailyEligible = true の質問のみ
 * 2. 最近回答していない質問を優先
 * 3. 日付ベースのシードで一貫性を持たせる
 */
export function selectDailyQuestions(params: {
  userId: string;
  date: string; // YYYY-MM-DD
  recentResponses: UserQuestionResponse[];
  count?: number;
}): DailyQuestionSet {
  const { userId, date, recentResponses } = params;
  const count = Math.min(
    params.count ?? DAILY_QUESTION_MAX,
    DAILY_QUESTION_MAX,
  );

  // 最近回答した質問IDを集める
  const recentIds = new Set(
    recentResponses
      .filter((r) => {
        const answeredDate = r.answeredAt.slice(0, 10);
        const daysDiff = dateDiffDays(answeredDate, date);
        return daysDiff <= 3; // 直近3日以内の回答はスキップ
      })
      .map((r) => r.questionId),
  );

  // 候補の質問: まだ最近回答していないもの
  const candidates = DAILY_ELIGIBLE_QUESTIONS.filter(
    (q) => !recentIds.has(q.id),
  );

  // 候補が足りなければ全てから選ぶ
  const pool =
    candidates.length >= count ? candidates : DAILY_ELIGIBLE_QUESTIONS;

  // 日付ベースの擬似ランダムで選出
  const seed = hashDateUser(date, userId);
  const selected = seededShuffle(pool, seed).slice(
    0,
    Math.max(DAILY_QUESTION_MIN, count),
  );

  return {
    userId,
    date,
    questions: selected,
    answeredCount: 0,
  };
}

// ---------- Daily Answer Processing ----------

/**
 * 毎日の回答をUserDynamicPreferenceに変換
 *
 * 毎日回答は固定層を書き換えない。
 * 可変層 / 当日層として別で持つ。
 */
export function processDailyAnswers(
  userId: string,
  answers: UserQuestionResponse[],
  previousPreference?: UserDynamicPreference | null,
): UserDynamicPreference {
  // 回答からcontextBiasとmoodAdjustmentsを推定
  const contextBias = { friend: 0.5, romance: 0.5, orbiter: 0.5, cocreation: 0.5 };
  const moodAdjustments = {
    calmness: 0,
    novelty: 0,
    depth: 0,
    socialEnergy: 0,
  };

  for (const answer of answers) {
    const val =
      typeof answer.answerValue === "number"
        ? answer.answerValue
        : parseFloat(String(answer.answerValue)) || 3;
    const normalized = (val - 1) / 4; // 0..1

    // 各質問の重要度からcontextBiasを推定
    const imp = answer.importanceByContext;
    const totalImp = imp.friend + imp.romance + imp.orbiter + imp.cocreation;
    if (totalImp > 0) {
      contextBias.friend += (imp.friend / totalImp - 1 / 4) * 0.3;
      contextBias.romance += (imp.romance / totalImp - 1 / 4) * 0.3;
      contextBias.orbiter += (imp.orbiter / totalImp - 1 / 4) * 0.3;
      contextBias.cocreation += (imp.cocreation / totalImp - 1 / 4) * 0.3;
    }

    // 回答値からmoodAdjustmentsを微調整
    // (質問の特性に基づく)
    const question = DAILY_ELIGIBLE_QUESTIONS.find(
      (q) => q.id === answer.questionId,
    );
    if (question) {
      for (const mapping of question.featureMapping) {
        const delta = (normalized - 0.5) * mapping.contribution * 0.2;
        switch (mapping.featureKey) {
          case "calmness":
            moodAdjustments.calmness += delta;
            break;
          case "novelty":
            moodAdjustments.novelty += delta;
            break;
          case "depth":
            moodAdjustments.depth += delta;
            break;
          case "playfulness":
            moodAdjustments.socialEnergy += delta;
            break;
        }
      }
    }
  }

  // 前回の可変層と混合 (exponential moving average)
  if (previousPreference) {
    const alpha = 0.3; // 新しい回答の影響度
    contextBias.friend =
      previousPreference.contextBias.friend * (1 - alpha) +
      contextBias.friend * alpha;
    contextBias.romance =
      previousPreference.contextBias.romance * (1 - alpha) +
      contextBias.romance * alpha;
    contextBias.orbiter =
      previousPreference.contextBias.orbiter * (1 - alpha) +
      contextBias.orbiter * alpha;
    contextBias.cocreation =
      previousPreference.contextBias.cocreation * (1 - alpha) +
      contextBias.cocreation * alpha;
  }

  // 0..1にクランプ
  contextBias.friend = clamp01(contextBias.friend);
  contextBias.romance = clamp01(contextBias.romance);
  contextBias.orbiter = clamp01(contextBias.orbiter);
  contextBias.cocreation = clamp01(contextBias.cocreation);

  return {
    userId,
    contextBias,
    moodAdjustments,
    validUntil: new Date(
      Date.now() + DAILY_ANSWER_VALIDITY_HOURS * 60 * 60 * 1000,
    ).toISOString(),
    source: "daily_update",
  };
}

// ---------- Daily Feedback ----------

/**
 * 毎日回答後のフィードバックテキスト生成
 * 「回答後は必ず何かしら変化が見えるようにする」
 */
export function generateDailyFeedback(
  preference: UserDynamicPreference,
): string {
  const biases: { ctx: ContextType; val: number }[] = [
    { ctx: "friend", val: preference.contextBias.friend },
    { ctx: "romance", val: preference.contextBias.romance },
    { ctx: "orbiter", val: preference.contextBias.orbiter },
    { ctx: "cocreation", val: preference.contextBias.cocreation },
  ];
  biases.sort((a, b) => b.val - a.val);

  const contextLabels: Record<ContextType, string> = {
    friend: "友達的なつながり",
    romance: "恋愛的なつながり",
    orbiter: "Orbiterとしてのつながり",
    cocreation: "共創パートナーとしてのつながり",
  };

  const primaryBias = biases[0];
  const moodTexts: string[] = [];

  if ((preference.moodAdjustments.calmness ?? 0) > 0.1) {
    moodTexts.push("安心感重視");
  }
  if ((preference.moodAdjustments.novelty ?? 0) > 0.1) {
    moodTexts.push("新しい刺激を求めている");
  }
  if ((preference.moodAdjustments.depth ?? 0) > 0.1) {
    moodTexts.push("深い会話を好む傾向");
  }
  if ((preference.moodAdjustments.socialEnergy ?? 0) > 0.1) {
    moodTexts.push("社交的なエネルギーが高い");
  }

  let feedback = `今は${contextLabels[primaryBias.ctx]}に寄っています`;
  if (moodTexts.length > 0) {
    feedback += `。${moodTexts.slice(0, 2).join("、")}`;
  }

  return feedback;
}

// ---------- Helpers ----------

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function dateDiffDays(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.abs(Math.round((b - a) / (24 * 60 * 60 * 1000)));
}

/** 日付 + ユーザーIDからシード値を生成 */
function hashDateUser(date: string, userId: string): number {
  let hash = 0;
  const str = `${date}:${userId}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // 32bit integer
  }
  return Math.abs(hash);
}

/** シードベースのシャッフル (Fisher-Yates) */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
