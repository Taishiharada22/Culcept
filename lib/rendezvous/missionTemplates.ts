import "server-only";

import type { RendezvousCategory } from "./types";

// ============================================================
// 協同ミッション テンプレート (Feature C)
// マッチ前の匿名2人で小さな共同作業
// ============================================================

export type MissionTemplateType =
  | "playlist"   // プレイリスト共作
  | "story"      // 交互物語
  | "trip"       // 架空旅行計画
  | "sunday"     // 理想の日曜日設計
  | "recipe"     // 架空レシピ開発
  | "question"   // 質問リレー

export type MissionTemplate = {
  type: MissionTemplateType;
  title: string;
  description: string;
  rules: string;
  turnsRequired: number;       // 必要なターン数（交互操作の回数）
  timeoutMinutes: number;      // 制限時間
  categories: RendezvousCategory[]; // 対象カテゴリ
  icon: string;
};

export const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    type: "playlist",
    title: "プレイリスト共作",
    description: "2人で1つのプレイリストを作りましょう。交互に1曲ずつ追加します。",
    rules: "相手が選んだ曲を聴いてから、次の1曲を選んでください。全部で8曲（4曲ずつ）。",
    turnsRequired: 8,
    timeoutMinutes: 1440, // 24時間
    categories: ["romantic", "friendship", "cocreation", "community", "partner"],
    icon: "🎵",
  },
  {
    type: "story",
    title: "交互物語",
    description: "2人で1つの短い物語を書きましょう。交互に1文ずつ追加します。",
    rules: "相手の文を受けて、物語を続けてください。全部で10文（5文ずつ）。最初のお題：「ある朝、見知らぬ鍵を拾った。」",
    turnsRequired: 10,
    timeoutMinutes: 1440,
    categories: ["romantic", "friendship", "cocreation", "community", "partner"],
    icon: "📖",
  },
  {
    type: "trip",
    title: "架空旅行計画",
    description: "2人で架空の3日間の旅行を計画しましょう。交互にアイデアを出します。",
    rules: "行き先、宿、食事、アクティビティを交互に提案。全部で6提案（3つずつ）。",
    turnsRequired: 6,
    timeoutMinutes: 1440,
    categories: ["romantic", "friendship", "partner"],
    icon: "✈️",
  },
  {
    type: "sunday",
    title: "理想の日曜日",
    description: "2人で「理想の日曜日」のタイムテーブルを作りましょう。",
    rules: "朝から夜まで、交互に1時間分の過ごし方を提案。全部で8時間分（4つずつ）。",
    turnsRequired: 8,
    timeoutMinutes: 1440,
    categories: ["romantic", "friendship", "partner"],
    icon: "☀️",
  },
  {
    type: "recipe",
    title: "架空レシピ開発",
    description: "2人で存在しない料理のレシピを考えましょう。",
    rules: "交互に材料と手順を追加。全部で8ステップ（4つずつ）。最後に料理名を一緒に考える。",
    turnsRequired: 8,
    timeoutMinutes: 1440,
    categories: ["friendship", "cocreation", "community"],
    icon: "🍳",
  },
  {
    type: "question",
    title: "質問リレー",
    description: "交互に質問を出し合い、答え合います。相手の答えを聞いてから次の質問を考えます。",
    rules: "「はい/いいえ」で終わらない質問を。全部で6往復（3問ずつ）。",
    turnsRequired: 12, // 質問6 + 回答6
    timeoutMinutes: 1440,
    categories: ["romantic", "friendship", "cocreation", "community", "partner"],
    icon: "💬",
  },
];

/**
 * カテゴリに適したミッションをランダム選択
 */
export function selectMissionForCategory(
  category: RendezvousCategory,
  seed?: number,
): MissionTemplate {
  const eligible = MISSION_TEMPLATES.filter((m) =>
    m.categories.includes(category),
  );
  if (eligible.length === 0) return MISSION_TEMPLATES[0];

  const idx = seed !== undefined ? seed % eligible.length : Math.floor(Math.random() * eligible.length);
  return eligible[idx];
}
