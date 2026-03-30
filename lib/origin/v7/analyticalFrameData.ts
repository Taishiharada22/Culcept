// Analytical Frame — 共通分析フレーム（14問）の質問定義

import type { EraRole, RewardType } from "./workspaceTypes";

/* ─── 質問タイプ ─── */

export type FrameQuestionType = "select" | "multi_select" | "short_text";

export type FrameOption = {
  id: string;
  label: string;
  icon: string;
};

export type FrameQuestion = {
  id: string;
  number: number;
  question: string;
  type: FrameQuestionType;
  fieldKey: string; // AnalyticalFrame のフィールド名
  options?: FrameOption[];
  placeholder?: string;
};

/* ─── Q7: 求めていたもの ─── */

const SOUGHT_OPTIONS: FrameOption[] = [
  { id: "safety", label: "安全・安心", icon: "🛡️" },
  { id: "recognition", label: "承認・評価", icon: "🌟" },
  { id: "belonging", label: "居場所・つながり", icon: "🏠" },
  { id: "freedom", label: "自由・解放", icon: "🕊️" },
  { id: "achievement", label: "達成感", icon: "🏆" },
  { id: "growth", label: "成長・変化", icon: "🌱" },
  { id: "meaning", label: "意味・意義", icon: "💎" },
  { id: "escape", label: "逃避", icon: "🚪" },
];

/* ─── Q8: 避けていたもの ─── */

const AVOIDED_OPTIONS: FrameOption[] = [
  { id: "scolded", label: "怒られること", icon: "😨" },
  { id: "stand_out", label: "浮くこと", icon: "🫥" },
  { id: "behind", label: "遅れること", icon: "⏰" },
  { id: "bother", label: "迷惑をかけること", icon: "🙇" },
  { id: "alone", label: "一人になること", icon: "🫂" },
  { id: "rejected", label: "拒絶されること", icon: "🚫" },
  { id: "failure", label: "失敗すること", icon: "💥" },
  { id: "exposed", label: "本音がバレること", icon: "🎭" },
];

/* ─── Q9: 圧力 ─── */

const PRESSURE_OPTIONS: FrameOption[] = [
  { id: "expectation", label: "期待に応える", icon: "📊" },
  { id: "comparison", label: "比較・競争", icon: "⚖️" },
  { id: "conformity", label: "周囲に合わせる", icon: "🔄" },
  { id: "perfection", label: "完璧でいる", icon: "💎" },
  { id: "responsibility", label: "責任を果たす", icon: "🎯" },
  { id: "time", label: "時間がない", icon: "⏳" },
  { id: "financial", label: "経済的なもの", icon: "💰" },
  { id: "none", label: "特になかった", icon: "🍃" },
];

/* ─── Q10: 報酬 ─── */

const REWARD_OPTIONS: FrameOption[] = [
  { id: "security", label: "安心感", icon: "🛡️" },
  { id: "recognition", label: "承認", icon: "🌟" },
  { id: "achievement", label: "達成感", icon: "🏆" },
  { id: "belonging", label: "所属感", icon: "👥" },
  { id: "freedom", label: "自由", icon: "🕊️" },
];

/* ─── Q11: 得たもの ─── */

const GAINED_OPTIONS: FrameOption[] = [
  { id: "skill", label: "スキル・技術", icon: "🔧" },
  { id: "confidence", label: "自信", icon: "💪" },
  { id: "relationship", label: "人間関係", icon: "🤝" },
  { id: "perspective", label: "視野・視点", icon: "👁️" },
  { id: "resilience", label: "耐性・強さ", icon: "🛡️" },
  { id: "identity", label: "アイデンティティ", icon: "🪞" },
  { id: "habit", label: "習慣・ルーティン", icon: "🔁" },
  { id: "nothing", label: "特になかった", icon: "🍃" },
];

/* ─── Q12: 失ったもの ─── */

const LOST_OPTIONS: FrameOption[] = [
  { id: "time", label: "時間", icon: "⏳" },
  { id: "relationship", label: "人間関係", icon: "👋" },
  { id: "confidence", label: "自信", icon: "📉" },
  { id: "innocence", label: "純粋さ", icon: "🌸" },
  { id: "freedom", label: "自由", icon: "🔒" },
  { id: "health", label: "健康・体力", icon: "🩹" },
  { id: "opportunity", label: "機会・可能性", icon: "🚪" },
  { id: "nothing", label: "特になかった", icon: "🍃" },
];

/* ─── Q3: 役割（ERA_ROLE_CARDSと同期） ─── */

const ROLE_OPTIONS: FrameOption[] = [
  { id: "leader", label: "リーダー", icon: "👑" },
  { id: "supporter", label: "サポーター", icon: "🤝" },
  { id: "lone_wolf", label: "一匹狼", icon: "🐺" },
  { id: "mediator", label: "調整役", icon: "⚖️" },
  { id: "entertainer", label: "ムードメーカー", icon: "🎭" },
  { id: "follower", label: "フォロワー", icon: "🚶" },
  { id: "observer", label: "観察者", icon: "👁️" },
  { id: "outsider", label: "外から見ていた", icon: "🪟" },
];

/* ─── 全14問の定義 ─── */

export const ANALYTICAL_FRAME_QUESTIONS: FrameQuestion[] = [
  {
    id: "af_q1",
    number: 1,
    question: "何をしていましたか？",
    type: "short_text",
    fieldKey: "whatWasDone",
    placeholder: "例：吹奏楽でクラリネットを吹いていた",
  },
  {
    id: "af_q2",
    number: 2,
    question: "どんな環境でしたか？",
    type: "short_text",
    fieldKey: "environment",
    placeholder: "例：厳しい顧問がいた、のんびりした雰囲気",
  },
  {
    id: "af_q3",
    number: 3,
    question: "そこでの自分の立ち位置は？",
    type: "select",
    fieldKey: "role",
    options: ROLE_OPTIONS,
  },
  {
    id: "af_q4",
    number: 4,
    question: "なぜ始めましたか？",
    type: "multi_select",
    fieldKey: "whyStarted",
    options: [
      { id: "liked_it", label: "好きだった", icon: "❤️" },
      { id: "good_at_it", label: "得意だった", icon: "💪" },
      { id: "invited", label: "誘われた", icon: "🤝" },
      { id: "family_influence", label: "家庭の影響", icon: "👨‍👩‍👧" },
      { id: "wanted_belonging", label: "居場所がほしかった", icon: "🏠" },
      { id: "wanted_recognition", label: "認められたかった", icon: "🌟" },
      { id: "for_future", label: "将来のため", icon: "🎯" },
      { id: "wanted_escape", label: "逃げたかった", icon: "🚪" },
      { id: "wanted_change", label: "変わりたかった", icon: "🔄" },
      { id: "neutral", label: "なんとなく", icon: "🍃" },
    ],
  },
  {
    id: "af_q5",
    number: 5,
    question: "なぜ続けましたか？",
    type: "multi_select",
    fieldKey: "whyContinued",
    options: [
      { id: "enjoyable", label: "楽しかった", icon: "😊" },
      { id: "got_results", label: "結果が出た", icon: "📈" },
      { id: "recognized", label: "認められた", icon: "🏆" },
      { id: "had_peers", label: "仲間がいた", icon: "👥" },
      { id: "hard_to_quit", label: "やめにくかった", icon: "🔗" },
      { id: "became_habit", label: "習慣になった", icon: "🔁" },
      { id: "core_self", label: "自分の核だった", icon: "💎" },
      { id: "nowhere_else", label: "他に行き場がなかった", icon: "🚫" },
    ],
  },
  {
    id: "af_q6",
    number: 6,
    question: "なぜやめた（変わった）のですか？",
    type: "multi_select",
    fieldKey: "whyStopped",
    options: [
      { id: "lost_interest", label: "飽きた", icon: "😶" },
      { id: "environment_changed", label: "環境が変わった", icon: "🌊" },
      { id: "tired", label: "疲れた", icon: "😩" },
      { id: "hurt", label: "傷ついた", icon: "💔" },
      { id: "job_done", label: "やりきった", icon: "✅" },
      { id: "found_alternative", label: "別の道を見つけた", icon: "🛤️" },
      { id: "didnt_fit", label: "合わなかった", icon: "🧩" },
      { id: "couldnt_continue", label: "続けられなくなった", icon: "🚧" },
    ],
  },
  {
    id: "af_q7",
    number: 7,
    question: "そこで求めていたものは？",
    type: "select",
    fieldKey: "whatWasSought",
    options: SOUGHT_OPTIONS,
  },
  {
    id: "af_q8",
    number: 8,
    question: "避けたかったことは？",
    type: "select",
    fieldKey: "whatWasAvoided",
    options: AVOIDED_OPTIONS,
  },
  {
    id: "af_q9",
    number: 9,
    question: "どんな圧力がありましたか？",
    type: "select",
    fieldKey: "pressure",
    options: PRESSURE_OPTIONS,
  },
  {
    id: "af_q10",
    number: 10,
    question: "何が報酬（見返り）でしたか？",
    type: "multi_select",
    fieldKey: "reward",
    options: REWARD_OPTIONS,
  },
  {
    id: "af_q11",
    number: 11,
    question: "得たものは何ですか？",
    type: "select",
    fieldKey: "whatGained",
    options: GAINED_OPTIONS,
  },
  {
    id: "af_q12",
    number: 12,
    question: "失ったもの・代償は？",
    type: "select",
    fieldKey: "whatLost",
    options: LOST_OPTIONS,
  },
  {
    id: "af_q13",
    number: 13,
    question: "そこで覚えたルール・動き方は？",
    type: "short_text",
    fieldKey: "learnedRules",
    placeholder: "例：先に空気を読んでから動く、結果を出せば認められる",
  },
  {
    id: "af_q14",
    number: 14,
    question: "今の自分に残っているものは？",
    type: "short_text",
    fieldKey: "whatRemains",
    placeholder: "例：人前で緊張しやすい、完璧を求める癖",
  },
];

/* ─── 進捗ヘルパー ─── */

export function countAnsweredQuestions(frame: Record<string, unknown> | null): number {
  if (!frame) return 0;
  let count = 0;
  for (const q of ANALYTICAL_FRAME_QUESTIONS) {
    const val = frame[q.fieldKey];
    if (val === null || val === undefined || val === "") continue;
    if (Array.isArray(val) && val.length === 0) continue;
    count++;
  }
  return count;
}

export const TOTAL_FRAME_QUESTIONS = ANALYTICAL_FRAME_QUESTIONS.length; // 14
