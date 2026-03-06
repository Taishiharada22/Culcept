// lib/origin/v6/questions.ts
// Question bank for v6 — extends v5 with romance + learning themes.

import type { ThemeType } from "./types";

export type QuestionOption = {
  id: string;
  label: string;
  icon?: string;
};

export type Question = {
  id: string;
  text: string;
  options: QuestionOption[];
  depth: number;
};

/* ─── Question bank per theme ─── */

const emotion: Question[] = [
  {
    id: "emotion_d0",
    text: "この時期、一番強く感じていた感情は？",
    depth: 0,
    options: [
      { id: "joy",        label: "喜び・ワクワク",   icon: "😊" },
      { id: "anxiety",    label: "不安・緊張",       icon: "😰" },
      { id: "anger",      label: "怒り・反発",       icon: "😤" },
      { id: "loneliness", label: "寂しさ・孤独",     icon: "😢" },
      { id: "curiosity",  label: "好奇心・探求",     icon: "🤔" },
      { id: "peace",      label: "平穏・安心",       icon: "😌" },
    ],
  },
  {
    id: "emotion_d1",
    text: "その感情の一番の原因は？",
    depth: 1,
    options: [
      { id: "people",      label: "周りの人",     icon: "👥" },
      { id: "environment", label: "環境・場所",   icon: "🏠" },
      { id: "self",        label: "自分自身",     icon: "🪞" },
      { id: "event",       label: "特定の出来事", icon: "⚡" },
    ],
  },
];

const relationship: Question[] = [
  {
    id: "rel_d0",
    text: "この時期の人間関係は？",
    depth: 0,
    options: [
      { id: "lively",  label: "賑やか・多人数",     icon: "🎉" },
      { id: "close",   label: "少数の深い関係",     icon: "🤝" },
      { id: "alone",   label: "一人が多かった",     icon: "🚶" },
      { id: "complex", label: "複雑・衝突もあった", icon: "🌀" },
    ],
  },
  {
    id: "rel_d1",
    text: "一番影響を受けた存在は？",
    depth: 1,
    options: [
      { id: "family",  label: "家族",           icon: "🏠" },
      { id: "friend",  label: "友人",           icon: "👫" },
      { id: "mentor",  label: "先生・上司",     icon: "🎓" },
      { id: "partner", label: "恋人・パートナー", icon: "💕" },
    ],
  },
];

const work: Question[] = [
  {
    id: "work_d0",
    text: "この時期の取り組み方は？",
    depth: 0,
    options: [
      { id: "fullpower", label: "全力投球",       icon: "🔥" },
      { id: "steady",    label: "コツコツ積み上げ", icon: "🧱" },
      { id: "minimal",   label: "最低限こなす",   icon: "😐" },
      { id: "searching", label: "模索中だった",   icon: "🔍" },
    ],
  },
  {
    id: "work_d1",
    text: "一番力を入れていたことは？",
    depth: 1,
    options: [
      { id: "study",  label: "勉強・スキル", icon: "📖" },
      { id: "club",   label: "部活・仕事",   icon: "💼" },
      { id: "play",   label: "遊び・趣味",   icon: "🎮" },
      { id: "social", label: "人付き合い",   icon: "💬" },
    ],
  },
];

const challenge: Question[] = [
  {
    id: "chal_d0",
    text: "この時期の最大の壁は？",
    depth: 0,
    options: [
      { id: "ability", label: "能力・実力不足",   icon: "📉" },
      { id: "people",  label: "人間関係の問題",   icon: "💔" },
      { id: "change",  label: "環境の変化",       icon: "🌪" },
      { id: "inner",   label: "自分との戦い",     icon: "🧠" },
    ],
  },
  {
    id: "chal_d1",
    text: "その壁にどう向き合った？",
    depth: 1,
    options: [
      { id: "fight",   label: "努力で乗り越えた",     icon: "💪" },
      { id: "help",    label: "誰かに助けてもらった", icon: "🤲" },
      { id: "avoid",   label: "避けた・逃げた",       icon: "🏃" },
      { id: "ongoing", label: "まだ向き合っている",   icon: "⏳" },
    ],
  },
];

const self: Question[] = [
  {
    id: "self_d0",
    text: "この時の自分をひと言で表すと？",
    depth: 0,
    options: [
      { id: "challenger", label: "挑戦者", icon: "⚔️" },
      { id: "observer",   label: "傍観者", icon: "👁" },
      { id: "lost",       label: "迷子",   icon: "🌫" },
      { id: "settler",    label: "安住者", icon: "🏡" },
    ],
  },
  {
    id: "self_d1",
    text: "自分の一番の強みは何だった？",
    depth: 1,
    options: [
      { id: "action",   label: "行動力", icon: "🏃" },
      { id: "thinking", label: "思考力", icon: "🧠" },
      { id: "empathy",  label: "共感力", icon: "❤️" },
      { id: "patience", label: "忍耐力", icon: "🪨" },
    ],
  },
];

const direction: Question[] = [
  {
    id: "dir_d0",
    text: "この時期、何を目指していた？",
    depth: 0,
    options: [
      { id: "clear",   label: "明確な目標があった", icon: "🎯" },
      { id: "vague",   label: "漠然とした希望",     icon: "☁️" },
      { id: "nothing", label: "特に何も",           icon: "😶" },
      { id: "survive", label: "目の前を生き抜く",   icon: "🛡" },
    ],
  },
  {
    id: "dir_d1",
    text: "今振り返って、あの時期の選択は？",
    depth: 1,
    options: [
      { id: "right",   label: "正解だった",     icon: "✅" },
      { id: "regret",  label: "後悔している",   icon: "😔" },
      { id: "neutral", label: "どちらでもない", icon: "🤷" },
      { id: "unsure",  label: "まだわからない", icon: "❓" },
    ],
  },
];

const romance: Question[] = [
  {
    id: "rom_d0",
    text: "この時期の恋愛・パートナーシップは？",
    depth: 0,
    options: [
      { id: "active",   label: "恋愛していた",     icon: "💘" },
      { id: "longing",  label: "憧れ・片思い",     icon: "🌸" },
      { id: "none",     label: "恋愛以外に夢中",   icon: "🎯" },
      { id: "complex",  label: "複雑だった",       icon: "💔" },
    ],
  },
  {
    id: "rom_d1",
    text: "恋愛から学んだことは？",
    depth: 1,
    options: [
      { id: "self_know", label: "自分を知った",     icon: "🪞" },
      { id: "others",    label: "人の温かさ",       icon: "🤗" },
      { id: "pain",      label: "痛みと成長",       icon: "🌱" },
      { id: "freedom",   label: "自由の大切さ",     icon: "🕊" },
    ],
  },
];

const learning: Question[] = [
  {
    id: "learn_d0",
    text: "この時期、一番の学びは？",
    depth: 0,
    options: [
      { id: "academic",  label: "学問・知識",     icon: "📚" },
      { id: "skill",     label: "技術・スキル",   icon: "🔧" },
      { id: "life",      label: "人生の教訓",     icon: "💡" },
      { id: "social",    label: "社会の仕組み",   icon: "🏛" },
    ],
  },
  {
    id: "learn_d1",
    text: "その学びはどこから？",
    depth: 1,
    options: [
      { id: "teacher",    label: "先生・指導者",     icon: "🎓" },
      { id: "experience", label: "実体験",           icon: "🏔" },
      { id: "books",      label: "本・メディア",     icon: "📖" },
      { id: "failure",    label: "失敗から",         icon: "💥" },
    ],
  },
];

export const THEME_QUESTIONS: Record<ThemeType, Question[]> = {
  emotion,
  relationship,
  work,
  challenge,
  self,
  direction,
  romance,
  learning,
};

/** Get the next unanswered question for a theme branch */
export function getNextQuestion(
  theme: ThemeType,
  answeredDepths: number[],
): Question | null {
  const questions = THEME_QUESTIONS[theme];
  const maxAnswered = answeredDepths.length > 0 ? Math.max(...answeredDepths) : -1;
  const nextDepth = maxAnswered + 1;
  return questions.find((q) => q.depth === nextDepth) ?? null;
}
