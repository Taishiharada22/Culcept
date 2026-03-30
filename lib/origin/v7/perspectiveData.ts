import type { PerspectiveCard } from "./types";

export const PERSPECTIVE_CARDS: PerspectiveCard[] = [
  { id: "bright", label: "明るい人に見えていた", icon: "😊" },
  { id: "calm", label: "落ち着いている人に見えていた", icon: "🧘" },
  { id: "unapproachable", label: "近寄りがたいと思われていた", icon: "🚪" },
  { id: "kind", label: "優しい人だと思われていた", icon: "🤲" },
  { id: "competitive", label: "負けず嫌いに見られていた", icon: "🔥" },
  { id: "mysterious", label: "何を考えているかわからないと思われていた", icon: "🌫️" },
  { id: "serious", label: "真面目な人に見えていた", icon: "📐" },
  { id: "own_world", label: "自分の世界を持っていると思われていた", icon: "🌌" },
  { id: "reliable", label: "頼りになると思われていた", icon: "🏔️" },
  { id: "funny", label: "面白い人だと思われていた", icon: "😄" },
  { id: "quiet_person", label: "おとなしい人だと思われていた", icon: "🤫" },
  { id: "leader", label: "リーダー的に見られていた", icon: "🎯" },
];

export function getPerspectiveLabel(id: string): string {
  return PERSPECTIVE_CARDS.find((c) => c.id === id)?.label ?? id;
}
