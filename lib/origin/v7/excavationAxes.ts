/**
 * 探索軸 — 記憶を掘り起こすための10種の入口
 * ExcavationModule / ExcavationCard で使用
 */

import type { ExplorationAxis } from "./types";

export type ExcavationAxisDef = {
  id: ExplorationAxis;
  label: string;
  description: string;
  icon: string;
  /** 上位表示（デフォルト表示）する軸かどうか */
  primary: boolean;
};

export const EXCAVATION_AXES: ExcavationAxisDef[] = [
  {
    id: "place",
    label: "場所から辿る",
    description: "その頃よく過ごしていた場所から、記憶を開きます",
    icon: "📍",
    primary: true,
  },
  {
    id: "person",
    label: "人から辿る",
    description: "誰の前にいた自分かを辿ると、プロフィールが見えてきます",
    icon: "👤",
    primary: true,
  },
  {
    id: "daily_flow",
    label: "1日の流れから辿る",
    description: "朝から夜まで、繰り返していた日常の骨格から",
    icon: "🕐",
    primary: true,
  },
  {
    id: "belongings",
    label: "持ち物から辿る",
    description: "物に紐づく記憶は、意外と鮮明に残っています",
    icon: "🎒",
    primary: true,
  },
  {
    id: "difference",
    label: "今との差から辿る",
    description: "今の自分との違いから、過去の断片が見えてきます",
    icon: "🔄",
    primary: false,
  },
  {
    id: "unspoken",
    label: "言えなかったことから辿る",
    description: "飲み込んだ言葉には、その時の本音が宿っています",
    icon: "🤐",
    primary: false,
  },
  {
    id: "pride",
    label: "その頃の誇りから辿る",
    description: "何を誇っていたかに、その時の軸が見えます",
    icon: "👑",
    primary: false,
  },
  {
    id: "defense",
    label: "身につけた守り方から辿る",
    description: "自分を守るために覚えたことが、今の構えに繋がっています",
    icon: "🛡️",
    primary: false,
  },
  {
    id: "loss",
    label: "失ったものから辿る",
    description: "手放したものの中に、今も探しているものがあるかもしれません",
    icon: "🕊️",
    primary: false,
  },
  {
    id: "weapon",
    label: "得た武器から辿る",
    description: "その時期に手に入れた強さや技が、今も活きています",
    icon: "⚔️",
    primary: false,
  },
];

/** primary軸のみ返す */
export function getPrimaryAxes(): ExcavationAxisDef[] {
  return EXCAVATION_AXES.filter((a) => a.primary);
}

/** IDから軸定義を取得 */
export function getAxisDef(id: ExplorationAxis): ExcavationAxisDef | undefined {
  return EXCAVATION_AXES.find((a) => a.id === id);
}
