// Root Profile — カードデータ定義

import type { HomeAtmosphere, MovingReason } from "./workspaceTypes";

/* ─── 家庭の雰囲気カード ─── */

export type AtmosphereCardDef = {
  id: HomeAtmosphere;
  label: string;
  icon: string;
  description: string;
};

export const HOME_ATMOSPHERE_CARDS: AtmosphereCardDef[] = [
  { id: "warm", label: "あたたかかった", icon: "🏡", description: "安心感がある家庭" },
  { id: "strict", label: "厳しかった", icon: "📏", description: "規律やルールが明確だった" },
  { id: "quiet", label: "静かだった", icon: "🤫", description: "会話が少なく穏やかだった" },
  { id: "busy", label: "忙しかった", icon: "🏃", description: "家族がそれぞれ忙しかった" },
  { id: "tense", label: "緊張感があった", icon: "⚡", description: "ピリッとした空気があった" },
  { id: "free", label: "自由だった", icon: "🌿", description: "干渉が少なく放任だった" },
  { id: "unstable", label: "不安定だった", icon: "🌊", description: "波があり安定しなかった" },
  { id: "lonely", label: "孤独だった", icon: "🌙", description: "一人でいる時間が多かった" },
  { id: "mixed", label: "複雑だった", icon: "🌀", description: "一言では言えない" },
];

/* ─── 現在の距離カード ─── */

export type DistanceCardDef = {
  id: "living" | "near" | "far" | "very_far";
  label: string;
  icon: string;
};

export const DISTANCE_CARDS: DistanceCardDef[] = [
  { id: "living", label: "今もそこに住んでいる", icon: "🏠" },
  { id: "near", label: "近い（同じ都道府県内）", icon: "🚶" },
  { id: "far", label: "離れている", icon: "🚃" },
  { id: "very_far", label: "かなり離れている（海外含む）", icon: "✈️" },
];

/* ─── 引越理由カード ─── */

export type MovingReasonCardDef = {
  id: MovingReason;
  label: string;
  icon: string;
};

export const MOVING_REASON_CARDS: MovingReasonCardDef[] = [
  { id: "family", label: "家庭の事情", icon: "👨‍👩‍👧" },
  { id: "school", label: "進学", icon: "🎓" },
  { id: "work", label: "仕事", icon: "💼" },
  { id: "marriage", label: "結婚・パートナー", icon: "💍" },
  { id: "independence", label: "独立・一人暮らし", icon: "🪶" },
  { id: "environment", label: "環境を変えたかった", icon: "🌱" },
  { id: "other", label: "その他", icon: "📝" },
];

/* ─── ラベル取得ヘルパー ─── */

export function getHomeAtmosphereLabel(id: HomeAtmosphere): string {
  return HOME_ATMOSPHERE_CARDS.find((c) => c.id === id)?.label ?? id;
}

export function getDistanceLabel(id: string): string {
  return DISTANCE_CARDS.find((c) => c.id === id)?.label ?? id;
}

export function getMovingReasonLabel(id: MovingReason): string {
  return MOVING_REASON_CARDS.find((c) => c.id === id)?.label ?? id;
}
