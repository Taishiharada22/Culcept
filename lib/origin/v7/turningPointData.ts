// Turning Points — カードデータ定義

import type { TurningPointCategory } from "./workspaceTypes";

/* ─── 転機カテゴリカード ─── */

export type TurningPointCategoryCardDef = {
  id: TurningPointCategory;
  label: string;
  icon: string;
  description: string;
};

export const TURNING_POINT_CATEGORY_CARDS: TurningPointCategoryCardDef[] = [
  { id: "beginning", label: "始まり", icon: "🌅", description: "何かが始まった瞬間" },
  { id: "ending", label: "終わり", icon: "🌆", description: "何かが終わった瞬間" },
  { id: "meeting", label: "出会い", icon: "🤝", description: "重要な人との出会い" },
  { id: "separation", label: "別れ", icon: "👋", description: "離別・別れの経験" },
  { id: "win", label: "成功", icon: "🏆", description: "達成感を得た経験" },
  { id: "loss", label: "喪失", icon: "🕊️", description: "大切なものを失った経験" },
  { id: "defeat", label: "挫折", icon: "💔", description: "打ちのめされた経験" },
  { id: "move", label: "移動", icon: "🚃", description: "場所や環境の移動" },
  { id: "decision", label: "決断", icon: "⚡", description: "大きな決断をした瞬間" },
];

/* ─── 影響度カード ─── */

export type ImpactCardDef = {
  id: "transformative" | "significant" | "subtle";
  label: string;
  icon: string;
  description: string;
};

export const IMPACT_CARDS: ImpactCardDef[] = [
  { id: "transformative", label: "人生が変わった", icon: "🌊", description: "根本的に何かが変わった" },
  { id: "significant", label: "大きな影響があった", icon: "⚡", description: "その後の方向性に影響した" },
  { id: "subtle", label: "静かに影響した", icon: "🌿", description: "気づかないうちに影響していた" },
];

/* ─── ラベル取得ヘルパー ─── */

export function getTurningPointCategoryLabel(id: TurningPointCategory): string {
  return TURNING_POINT_CATEGORY_CARDS.find((c) => c.id === id)?.label ?? id;
}

export function getImpactLabel(id: string): string {
  return IMPACT_CARDS.find((c) => c.id === id)?.label ?? id;
}
