// Era Affiliation — カードデータ定義

import type { EraRole, RelationshipTone, LifeCenter } from "./workspaceTypes";

/* ─── 役割カード ─── */

export type RoleCardDef = { id: EraRole; label: string; icon: string; description: string };

export const ERA_ROLE_CARDS: RoleCardDef[] = [
  { id: "leader", label: "リーダー", icon: "👑", description: "まとめる立場だった" },
  { id: "supporter", label: "サポーター", icon: "🤝", description: "支える側にいた" },
  { id: "lone_wolf", label: "一匹狼", icon: "🐺", description: "単独で動くことが多かった" },
  { id: "mediator", label: "調整役", icon: "⚖️", description: "間を取り持つことが多かった" },
  { id: "entertainer", label: "ムードメーカー", icon: "🎭", description: "場を盛り上げる役だった" },
  { id: "follower", label: "フォロワー", icon: "🚶", description: "誰かについていくことが多かった" },
  { id: "observer", label: "観察者", icon: "👁️", description: "周りを見ていることが多かった" },
  { id: "outsider", label: "外から見ていた", icon: "🪟", description: "集団の中にいなかった" },
];

/* ─── 人間関係の質感カード ─── */

export type RelationshipCardDef = { id: RelationshipTone; label: string; icon: string };

export const RELATIONSHIP_CARDS: RelationshipCardDef[] = [
  { id: "close_group", label: "親密な少人数グループ", icon: "👫" },
  { id: "wide_shallow", label: "広く浅い付き合い", icon: "🌐" },
  { id: "few_deep", label: "少数だが深い関係", icon: "💎" },
  { id: "mostly_alone", label: "ほとんど一人だった", icon: "🪶" },
  { id: "mixed", label: "場面によって違った", icon: "🔄" },
];

/* ─── 生活中心カード ─── */

export type LifeCenterCardDef = { id: LifeCenter; label: string; icon: string };

export const LIFE_CENTER_CARDS: LifeCenterCardDef[] = [
  { id: "study", label: "勉強", icon: "📚" },
  { id: "club", label: "部活・サークル", icon: "🏅" },
  { id: "friends", label: "友人関係", icon: "👥" },
  { id: "family", label: "家庭", icon: "🏠" },
  { id: "hobby", label: "趣味・好きなこと", icon: "✨" },
  { id: "part_time", label: "アルバイト", icon: "💰" },
  { id: "romance", label: "恋愛", icon: "💕" },
  { id: "survival", label: "生き延びること", icon: "🛡️" },
  { id: "escape", label: "逃避・回避", icon: "🚪" },
];

/* ─── ラベル取得ヘルパー ─── */

export function getEraRoleLabel(id: EraRole): string {
  return ERA_ROLE_CARDS.find((c) => c.id === id)?.label ?? id;
}

export function getRelationshipLabel(id: RelationshipTone): string {
  return RELATIONSHIP_CARDS.find((c) => c.id === id)?.label ?? id;
}

export function getLifeCenterLabel(id: LifeCenter): string {
  return LIFE_CENTER_CARDS.find((c) => c.id === id)?.label ?? id;
}
