// ============================================================
// オンボーディングオーケストレーター
// Stargazer融合アバター誕生 + プログレッシブプロファイル構築
// ============================================================

import type { MatchingVector } from "./types";
import { deriveAttachmentProfile } from "./attachmentProfile";
import { deriveSDTProfile } from "./sdtAxes";

export type OnboardingCompleteness = {
  completed: boolean;
  hasProfile: boolean;
  hasPreferences: boolean;
  hasAvatar: boolean;
  hasMatchingVector: boolean;
  hasAttachmentProfile: boolean;
  hasSDTProfile: boolean;
  /** 0-100 の段階的完了率 */
  progressPercent: number;
  /** 次に推奨するステップ */
  nextStep: string | null;
};

/**
 * Stargazer軸 + オンボーディング回答からMatchingVectorを生成
 *
 * Stargazerの45軸がある場合: 高精度で10次元を導出
 * ない場合: 5問の「本質質問」の回答から基本ベクトルを構築
 */
export function buildInitialMatchingVector(opts: {
  stargazerScores?: Record<string, number>;
  essenceAnswers?: EssenceAnswer[];
}): MatchingVector {
  const { stargazerScores, essenceAnswers } = opts;

  if (stargazerScores && Object.keys(stargazerScores).length >= 10) {
    return buildFromStargazer(stargazerScores);
  }

  if (essenceAnswers && essenceAnswers.length >= 3) {
    return buildFromEssenceAnswers(essenceAnswers);
  }

  return defaultVector();
}

/**
 * 本質質問の回答型
 */
export type EssenceAnswer = {
  questionId: string;
  /** 0..1 のスケール回答 */
  value: number;
};

/**
 * 5問の「本質質問」定義
 * Stargazer未完了ユーザー用。最小限でMatchingVectorを構築する。
 */
export const ESSENCE_QUESTIONS = [
  {
    id: "essence_1",
    text: "新しい人と会ったとき、最初にどう感じることが多い？",
    axis: "social_energy",
    options: [
      { label: "わくわくする、もっと話したい", value: 0.8 },
      { label: "興味はあるが、少し慎重に", value: 0.5 },
      { label: "一人の時間が恋しくなる", value: 0.2 },
    ],
  },
  {
    id: "essence_2",
    text: "大切な人との関係で、最も重要なものは？",
    axis: "emotional_openness",
    secondaryAxis: "distance_need",
    options: [
      { label: "お互いの感情を素直に伝え合えること", value: 0.85 },
      { label: "必要なときにそばにいてくれること", value: 0.6 },
      { label: "お互いの自由を尊重し合えること", value: 0.25 },
    ],
  },
  {
    id: "essence_3",
    text: "意見が食い違ったとき、あなたはどうする？",
    axis: "conflict_directness",
    options: [
      { label: "すぐに話し合いたい", value: 0.85 },
      { label: "少し時間をおいてから向き合う", value: 0.5 },
      { label: "できれば波風を立てたくない", value: 0.15 },
    ],
  },
  {
    id: "essence_4",
    text: "関係が深まるスピードについて",
    axis: "depth_speed",
    options: [
      { label: "早く深い話がしたい", value: 0.85 },
      { label: "自然なペースに任せたい", value: 0.5 },
      { label: "時間をかけてゆっくり", value: 0.2 },
    ],
  },
  {
    id: "essence_5",
    text: "日常の過ごし方は？",
    axis: "structure_preference",
    secondaryAxis: "stability_need",
    options: [
      { label: "計画を立てて動くのが好き", value: 0.8 },
      { label: "ざっくり決めて柔軟に", value: 0.5 },
      { label: "その瞬間の気分で決めたい", value: 0.2 },
    ],
  },
] as const;

function buildFromStargazer(scores: Record<string, number>): MatchingVector {
  const norm = (axis: string, fallback: number) => {
    const v = scores[axis];
    return v !== undefined ? Math.max(0, Math.min(1, (v + 1) / 2)) : fallback;
  };

  return {
    conversation_temperature: norm("social_initiative", 0.5),
    distance_need: norm("independence_vs_harmony", 0.5),
    depth_speed: norm("intimacy_pace", 0.5),
    stability_need: 1 - norm("change_embrace_vs_resist", 0.5),
    stimulation_need: norm("stimulation_need", 0.5),
    initiative: norm("social_initiative", 0.5),
    emotional_openness: norm("emotional_openness", 0.5),
    conflict_directness: norm("direct_vs_diplomatic", 0.5),
    social_energy: norm("social_initiative", 0.5) * 0.6 + (1 - norm("independence_vs_harmony", 0.5)) * 0.4,
    structure_preference: 1 - norm("plan_vs_spontaneous", 0.5),
  };
}

function buildFromEssenceAnswers(answers: EssenceAnswer[]): MatchingVector {
  const mv = defaultVector();
  const answerMap = new Map(answers.map((a) => [a.questionId, a.value]));

  for (const q of ESSENCE_QUESTIONS) {
    const value = answerMap.get(q.id);
    if (value === undefined) continue;

    const axis = q.axis as keyof MatchingVector;
    if (axis in mv) {
      mv[axis] = value;
    }

    if ("secondaryAxis" in q && q.secondaryAxis) {
      const secondary = q.secondaryAxis as keyof MatchingVector;
      if (secondary in mv) {
        // セカンダリ軸は半分の影響度
        mv[secondary] = mv[secondary] * 0.5 + value * 0.5;
      }
    }
  }

  return mv;
}

function defaultVector(): MatchingVector {
  return {
    conversation_temperature: 0.5,
    distance_need: 0.5,
    depth_speed: 0.5,
    stability_need: 0.5,
    stimulation_need: 0.5,
    initiative: 0.5,
    emotional_openness: 0.5,
    conflict_directness: 0.5,
    social_energy: 0.5,
    structure_preference: 0.5,
  };
}

/**
 * オンボーディング完了度を計算
 */
export function computeOnboardingCompleteness(opts: {
  hasProfile: boolean;
  hasPreferences: boolean;
  hasAvatar: boolean;
  hasMatchingVector: boolean;
  hasStargazer: boolean;
  answeredQuestionCount: number;
  totalCoreQuestions: number;
}): OnboardingCompleteness {
  const weights = {
    profile: 20,
    preferences: 15,
    avatar: 15,
    matchingVector: 25,
    stargazer: 15,
    questions: 10,
  };

  let progress = 0;
  if (opts.hasProfile) progress += weights.profile;
  if (opts.hasPreferences) progress += weights.preferences;
  if (opts.hasAvatar) progress += weights.avatar;
  if (opts.hasMatchingVector) progress += weights.matchingVector;
  if (opts.hasStargazer) progress += weights.stargazer;

  const questionProgress =
    opts.totalCoreQuestions > 0
      ? Math.min(1, opts.answeredQuestionCount / opts.totalCoreQuestions)
      : 0;
  progress += questionProgress * weights.questions;

  // 最低限: プロファイル + プリファレンス + アバターで「完了」
  const completed = opts.hasProfile && opts.hasPreferences && opts.hasAvatar;

  // 次のステップ推奨
  let nextStep: string | null = null;
  if (!opts.hasAvatar) nextStep = "avatar_birth";
  else if (!opts.hasProfile) nextStep = "profile_setup";
  else if (!opts.hasPreferences) nextStep = "preferences_setup";
  else if (!opts.hasMatchingVector) nextStep = "essence_questions";
  else if (!opts.hasStargazer) nextStep = "stargazer_observation";
  else if (questionProgress < 0.5) nextStep = "daily_questions";

  // アタッチメント・SDTの有無
  const hasAttachmentProfile = opts.hasMatchingVector;
  const hasSDTProfile = opts.hasStargazer || opts.hasMatchingVector;

  return {
    completed,
    hasProfile: opts.hasProfile,
    hasPreferences: opts.hasPreferences,
    hasAvatar: opts.hasAvatar,
    hasMatchingVector: opts.hasMatchingVector,
    hasAttachmentProfile,
    hasSDTProfile,
    progressPercent: Math.round(progress),
    nextStep,
  };
}

/**
 * オンボーディング時の自己理解インサイトを生成
 */
export function generateOnboardingInsight(
  matchingVector: MatchingVector,
): string {
  const insights: string[] = [];

  if (matchingVector.emotional_openness > 0.7) {
    insights.push("あなたは感情を素直に伝えることで安心を築くタイプかもしれません");
  } else if (matchingVector.emotional_openness < 0.3) {
    insights.push("あなたは行動で気持ちを示すタイプかもしれません。言葉より態度で信頼を伝える人です");
  }

  if (matchingVector.distance_need > 0.7) {
    insights.push("一人の時間が、あなたにとっての充電なのかもしれません");
  } else if (matchingVector.distance_need < 0.3) {
    insights.push("近くにいることが安心の源。そばにいてくれる人を自然と求めています");
  }

  if (matchingVector.conflict_directness > 0.7) {
    insights.push("すれ違いに正面から向き合える強さを持っています");
  } else if (matchingVector.conflict_directness < 0.3) {
    insights.push("調和を大切にする人。でも時には、伝えることが関係を守ることになります");
  }

  if (matchingVector.depth_speed > 0.7) {
    insights.push("心の奥を見せ合える関係を自然に求めています");
  }

  if (matchingVector.stability_need > 0.7) {
    insights.push("予測できる安心感が、あなたの土台です");
  }

  // 最も特徴的な1つを返す
  if (insights.length === 0) {
    return "あなたの分身が、静かに観測を始めました";
  }

  return `今日わかったこと：${insights[0]}`;
}
