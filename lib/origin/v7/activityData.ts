// Activity History — カードデータ定義

import type { ActivityCategory } from "./workspaceTypes";

/* ─── 活動カテゴリカード ─── */

export type ActivityCategoryCardDef = {
  id: ActivityCategory;
  label: string;
  icon: string;
  description: string;
};

export const ACTIVITY_CATEGORY_CARDS: ActivityCategoryCardDef[] = [
  { id: "club", label: "部活・サークル", icon: "🏅", description: "学校や組織での部活・サークル活動" },
  { id: "hobby", label: "趣味", icon: "🎨", description: "個人的に続けていた趣味" },
  { id: "study", label: "勉強・学習", icon: "📚", description: "学業や資格取得、独学" },
  { id: "part_time", label: "アルバイト", icon: "💰", description: "学生時代のアルバイト" },
  { id: "job", label: "仕事", icon: "💼", description: "本業・フルタイムの仕事" },
  { id: "creative", label: "創作活動", icon: "✏️", description: "音楽・美術・執筆などの創作" },
  { id: "competition", label: "競技・大会", icon: "🏆", description: "スポーツや学術の競技" },
  { id: "volunteer", label: "ボランティア", icon: "🤲", description: "社会貢献・奉仕活動" },
  { id: "other", label: "その他", icon: "📝", description: "上記に当てはまらない活動" },
];

/* ─── 時間配分カード ─── */

export type TimeAllocationCardDef = {
  id: "main" | "secondary" | "occasional";
  label: string;
  icon: string;
  description: string;
};

export const TIME_ALLOCATION_CARDS: TimeAllocationCardDef[] = [
  { id: "main", label: "生活の中心", icon: "⭐", description: "一番時間を使っていた" },
  { id: "secondary", label: "並行してやっていた", icon: "🔄", description: "他のことと並行" },
  { id: "occasional", label: "時々やっていた", icon: "🌿", description: "たまにやる程度" },
];

/* ─── ラベル取得ヘルパー ─── */

export function getActivityCategoryLabel(id: ActivityCategory): string {
  return ACTIVITY_CATEGORY_CARDS.find((c) => c.id === id)?.label ?? id;
}

export function getTimeAllocationLabel(id: string): string {
  return TIME_ALLOCATION_CARDS.find((c) => c.id === id)?.label ?? id;
}
