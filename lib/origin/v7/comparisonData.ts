import type { ComparisonCard } from "./types";

export const COMPARISON_CARDS: ComparisonCard[] = [
  { id: "more_honest", label: "今よりあの頃の方が、素直だった", icon: "💧" },
  { id: "more_guarded", label: "今よりあの頃の方が、構えていた", icon: "🛡️" },
  { id: "relied_more", label: "今よりあの頃の方が、人に頼れていた", icon: "🤝" },
  { id: "carried_alone", label: "今よりあの頃の方が、一人で抱えがちだった", icon: "🎒" },
  { id: "more_passionate", label: "今よりあの頃の方が、熱くなりやすかった", icon: "🔥" },
  { id: "more_cool", label: "今よりあの頃の方が、冷静だった", icon: "🧊" },
  { id: "more_confident", label: "今よりあの頃の方が、自信があった", icon: "💪" },
  { id: "less_confident", label: "今よりあの頃の方が、自信がなかった", icon: "🌧️" },
  { id: "more_outgoing", label: "今よりあの頃の方が、外向的だった", icon: "🌻" },
  { id: "more_inward", label: "今よりあの頃の方が、内向的だった", icon: "🐚" },
  { id: "more_sensitive", label: "今よりあの頃の方が、周りに敏感だった", icon: "🎐" },
  { id: "more_selfcentered", label: "今よりあの頃の方が、自分本位だった", icon: "🪞" },
];

export function getComparisonLabel(id: string): string {
  return COMPARISON_CARDS.find((c) => c.id === id)?.label ?? id;
}
