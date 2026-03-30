// ============================================================
// プログレッシブプロファイル構築
// 初期2週間で毎日1-2問ずつ段階的にプロファイルを深化
// ============================================================

import type { MatchingVector } from "@/lib/rendezvous/types";

/**
 * 次に回答すべき質問を選出
 *
 * ルール:
 * 1. コア質問（影響力が大きい）を優先
 * 2. 最近3日以内に回答した質問は除外
 * 3. 日付+userIdのハッシュで毎日の選出を安定化
 * 4. 1日最大2問
 */
export function getNextQuestions(opts: {
  userId: string;
  answeredQuestionIds: string[];
  recentlyAnsweredIds: string[]; // 直近3日以内
  date: Date;
  maxQuestions?: number;
}): ProgressiveQuestion[] {
  const { userId, answeredQuestionIds, recentlyAnsweredIds, date, maxQuestions = 2 } = opts;

  const answeredSet = new Set(answeredQuestionIds);
  const recentSet = new Set(recentlyAnsweredIds);

  // 未回答かつ最近回答していない質問をフィルタ
  const available = PROGRESSIVE_QUESTIONS.filter(
    (q) => !answeredSet.has(q.id) && !recentSet.has(q.id),
  );

  if (available.length === 0) return [];

  // コア質問を優先、日付ハッシュでシャッフル
  const dateHash = simpleHash(`${userId}:${date.toISOString().slice(0, 10)}`);

  const sorted = [...available].sort((a, b) => {
    // コア質問を優先
    if (a.isCore !== b.isCore) return a.isCore ? -1 : 1;
    // 優先度順
    if (a.priority !== b.priority) return a.priority - b.priority;
    // 日付ハッシュでランダム化
    return ((simpleHash(a.id) + dateHash) % 100) - ((simpleHash(b.id) + dateHash) % 100);
  });

  return sorted.slice(0, maxQuestions);
}

export type ProgressiveQuestion = {
  id: string;
  text: string;
  /** この質問が影響するMatchingVector次元 */
  targetAxes: string[];
  /** コア質問かどうか（優先的に出題） */
  isCore: boolean;
  /** 優先度（低い方が先） */
  priority: number;
  /** 回答選択肢 */
  options: Array<{
    label: string;
    /** 各軸への影響値 */
    axisImpacts: Record<string, number>;
  }>;
  /** この質問が明らかにする自己理解 */
  insightTemplate: string;
};

/**
 * プログレッシブ質問マスター
 * 初期2週間で段階的に出題される14問
 */
export const PROGRESSIVE_QUESTIONS: ProgressiveQuestion[] = [
  // Week 1: 基本的な接続パターン
  {
    id: "prog_01",
    text: "友人から突然の深刻な相談。あなたの最初の反応は？",
    targetAxes: ["emotional_openness", "conflict_directness"],
    isCore: true,
    priority: 1,
    options: [
      {
        label: "すぐに全力で寄り添う",
        axisImpacts: { emotional_openness: 0.15, conflict_directness: 0.05 },
      },
      {
        label: "まず状況を整理して冷静に聞く",
        axisImpacts: { emotional_openness: -0.05, conflict_directness: 0.10 },
      },
      {
        label: "自分にできることを探しながら聞く",
        axisImpacts: { emotional_openness: 0.05, initiative: 0.10 },
      },
    ],
    insightTemplate: "あなたは困っている人に対して、{pattern}タイプのようです",
  },
  {
    id: "prog_02",
    text: "楽しみにしていた予定が急にキャンセルに。どう過ごす？",
    targetAxes: ["structure_preference", "stability_need"],
    isCore: true,
    priority: 2,
    options: [
      {
        label: "すぐに別の予定を立てる",
        axisImpacts: { structure_preference: 0.15, stability_need: 0.10 },
      },
      {
        label: "のんびり過ごす時間に切り替える",
        axisImpacts: { structure_preference: -0.10, stability_need: -0.05 },
      },
      {
        label: "少しがっかりするが、受け入れる",
        axisImpacts: { stability_need: 0.05 },
      },
    ],
    insightTemplate: "予期しない変化に対して、あなたは{pattern}傾向があるようです",
  },
  {
    id: "prog_03",
    text: "グループの中で、あなたはどの役割になりやすい？",
    targetAxes: ["initiative", "social_energy"],
    isCore: true,
    priority: 3,
    options: [
      {
        label: "自然とまとめ役になる",
        axisImpacts: { initiative: 0.15, social_energy: 0.10 },
      },
      {
        label: "アイデアを出す人",
        axisImpacts: { initiative: 0.10, stimulation_need: 0.10 },
      },
      {
        label: "みんなの話を聞いてサポートする",
        axisImpacts: { initiative: -0.10, emotional_openness: 0.10 },
      },
      {
        label: "一歩引いて観察する",
        axisImpacts: { initiative: -0.15, distance_need: 0.10 },
      },
    ],
    insightTemplate: "集団の中でのあなたは、{pattern}ポジションを自然に取ります",
  },
  {
    id: "prog_04",
    text: "信頼している人に裏切られたと感じた経験。その後どうした？",
    targetAxes: ["conflict_directness", "emotional_openness", "distance_need"],
    isCore: true,
    priority: 4,
    options: [
      {
        label: "直接話し合いの場を設けた",
        axisImpacts: { conflict_directness: 0.15, emotional_openness: 0.05 },
      },
      {
        label: "しばらく距離を置いた",
        axisImpacts: { distance_need: 0.15, conflict_directness: -0.10 },
      },
      {
        label: "共通の友人に相談した",
        axisImpacts: { social_energy: 0.10 },
      },
      {
        label: "自分の中で消化して、静かに関係を見直した",
        axisImpacts: { emotional_openness: -0.10, distance_need: 0.10 },
      },
    ],
    insightTemplate: "信頼が揺らいだとき、あなたは{pattern}方法で向き合います",
  },
  // Week 1 後半: 関係性の深度パターン
  {
    id: "prog_05",
    text: "新しい人と仲良くなるきっかけは？",
    targetAxes: ["depth_speed", "conversation_temperature"],
    isCore: false,
    priority: 5,
    options: [
      {
        label: "深い話題で意気投合したとき",
        axisImpacts: { depth_speed: 0.15, conversation_temperature: 0.05 },
      },
      {
        label: "一緒に何かをして楽しかったとき",
        axisImpacts: { stimulation_need: 0.10, social_energy: 0.05 },
      },
      {
        label: "何度も顔を合わせるうちに自然と",
        axisImpacts: { depth_speed: -0.10, stability_need: 0.10 },
      },
    ],
    insightTemplate: "あなたにとって親しさの入口は{pattern}です",
  },
  {
    id: "prog_06",
    text: "「一人の時間」はあなたにとって？",
    targetAxes: ["distance_need", "stability_need"],
    isCore: false,
    priority: 6,
    options: [
      {
        label: "充電に欠かせない。ないと疲れる",
        axisImpacts: { distance_need: 0.20 },
      },
      {
        label: "たまにあれば十分",
        axisImpacts: { distance_need: 0.0 },
      },
      {
        label: "寂しくなりやすい。誰かといたい",
        axisImpacts: { distance_need: -0.15, emotional_openness: 0.05 },
      },
    ],
    insightTemplate: "一人の時間は、あなたにとって{pattern}なものです",
  },
  // Week 2: より深い自己理解
  {
    id: "prog_07",
    text: "大切な人にどうしても言えないことがあるとき、どうする？",
    targetAxes: ["emotional_openness", "conflict_directness"],
    isCore: false,
    priority: 7,
    options: [
      {
        label: "いつか勇気を出して伝える",
        axisImpacts: { emotional_openness: 0.10, conflict_directness: 0.05 },
      },
      {
        label: "態度や行動で少しずつ示す",
        axisImpacts: { emotional_openness: -0.05 },
      },
      {
        label: "自分の中に留めておく",
        axisImpacts: { emotional_openness: -0.15, distance_need: 0.05 },
      },
    ],
    insightTemplate: "伝えにくいことがあるとき、あなたは{pattern}傾向があります",
  },
  {
    id: "prog_08",
    text: "関係がマンネリ化してきたと感じたら？",
    targetAxes: ["stimulation_need", "stability_need"],
    isCore: false,
    priority: 8,
    options: [
      {
        label: "新しいことを一緒に始めたい",
        axisImpacts: { stimulation_need: 0.15, stability_need: -0.05 },
      },
      {
        label: "安定しているなら問題ない",
        axisImpacts: { stability_need: 0.15, stimulation_need: -0.10 },
      },
      {
        label: "深い会話で関係を見つめ直したい",
        axisImpacts: { depth_speed: 0.10, emotional_openness: 0.05 },
      },
    ],
    insightTemplate: "関係の新鮮さについて、あなたは{pattern}を求める傾向があります",
  },
  {
    id: "prog_09",
    text: "完璧ではない自分を見せることについて",
    targetAxes: ["emotional_openness", "distance_need"],
    isCore: false,
    priority: 9,
    options: [
      {
        label: "信頼できる人には見せられる",
        axisImpacts: { emotional_openness: 0.10 },
      },
      {
        label: "誰にでもオープンでいたい",
        axisImpacts: { emotional_openness: 0.20, distance_need: -0.10 },
      },
      {
        label: "できるだけ見せたくない",
        axisImpacts: { emotional_openness: -0.15, distance_need: 0.10 },
      },
    ],
    insightTemplate: "弱さを見せることについて、あなたは{pattern}",
  },
  {
    id: "prog_10",
    text: "理想の休日の過ごし方は？",
    targetAxes: ["social_energy", "stimulation_need", "structure_preference"],
    isCore: false,
    priority: 10,
    options: [
      {
        label: "友人と新しい場所を探検",
        axisImpacts: { social_energy: 0.15, stimulation_need: 0.10 },
      },
      {
        label: "気の合う人とカフェでゆっくり",
        axisImpacts: { social_energy: 0.05, stability_need: 0.05 },
      },
      {
        label: "家で趣味に没頭",
        axisImpacts: { social_energy: -0.15, distance_need: 0.10 },
      },
      {
        label: "計画せず、気分で決める",
        axisImpacts: { structure_preference: -0.15, stimulation_need: 0.05 },
      },
    ],
    insightTemplate: "休日の過ごし方から見えるあなたの{pattern}",
  },
  {
    id: "prog_11",
    text: "相手に「変わってほしい」と思ったことがあるとき",
    targetAxes: ["conflict_directness", "initiative"],
    isCore: false,
    priority: 11,
    options: [
      {
        label: "素直に伝えて一緒に考える",
        axisImpacts: { conflict_directness: 0.15, initiative: 0.10 },
      },
      {
        label: "まず自分が変わることを考える",
        axisImpacts: { conflict_directness: -0.05, emotional_openness: 0.05 },
      },
      {
        label: "ありのままを受け入れようとする",
        axisImpacts: { conflict_directness: -0.10, stability_need: 0.05 },
      },
    ],
    insightTemplate: "他者への期待について、あなたは{pattern}アプローチを取ります",
  },
  {
    id: "prog_12",
    text: "感謝を伝えるとき、どう伝える？",
    targetAxes: ["emotional_openness", "conversation_temperature"],
    isCore: false,
    priority: 12,
    options: [
      {
        label: "言葉ではっきり「ありがとう」と伝える",
        axisImpacts: { emotional_openness: 0.10, conversation_temperature: 0.10 },
      },
      {
        label: "行動で返す（何かしてあげる）",
        axisImpacts: { initiative: 0.10 },
      },
      {
        label: "心の中で感謝している",
        axisImpacts: { emotional_openness: -0.10, conversation_temperature: -0.05 },
      },
    ],
    insightTemplate: "感謝の伝え方に、あなたの{pattern}が現れています",
  },
  {
    id: "prog_13",
    text: "長い付き合いの友人と最近疎遠に。どう感じる？",
    targetAxes: ["stability_need", "distance_need"],
    isCore: false,
    priority: 13,
    options: [
      {
        label: "自分から連絡を取りたい",
        axisImpacts: { initiative: 0.10, stability_need: 0.10 },
      },
      {
        label: "自然の流れに任せる",
        axisImpacts: { distance_need: 0.10 },
      },
      {
        label: "少し寂しいが、きっとまた会える",
        axisImpacts: { stability_need: 0.05, emotional_openness: 0.05 },
      },
    ],
    insightTemplate: "人との距離について、あなたは{pattern}感覚を持っています",
  },
  {
    id: "prog_14",
    text: "自分を一番理解してくれるのは？",
    targetAxes: ["emotional_openness", "depth_speed"],
    isCore: false,
    priority: 14,
    options: [
      {
        label: "長い時間を共にした人",
        axisImpacts: { depth_speed: -0.10, stability_need: 0.10 },
      },
      {
        label: "深い話をした人",
        axisImpacts: { depth_speed: 0.15, emotional_openness: 0.05 },
      },
      {
        label: "自分自身が一番わかっている",
        axisImpacts: { distance_need: 0.10, initiative: 0.05 },
      },
      {
        label: "誰にも完全には理解されない",
        axisImpacts: { distance_need: 0.15, emotional_openness: -0.10 },
      },
    ],
    insightTemplate: "理解されることについて、あなたは{pattern}と感じています",
  },
];

/**
 * 回答からMatchingVectorを更新
 */
export function applyProgressiveAnswer(
  currentVector: MatchingVector,
  question: ProgressiveQuestion,
  selectedOptionIndex: number,
): MatchingVector {
  const option = question.options[selectedOptionIndex];
  if (!option) return currentVector;

  const updated = { ...currentVector };
  for (const [axis, impact] of Object.entries(option.axisImpacts)) {
    if (axis in updated) {
      const key = axis as keyof MatchingVector;
      updated[key] = Math.max(0, Math.min(1, updated[key] + impact));
    }
  }

  return updated;
}

function simpleHash(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}
