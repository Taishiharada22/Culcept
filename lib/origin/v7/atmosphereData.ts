import type { AtmosphereCard } from "./types";

export const ATMOSPHERE_CARDS: AtmosphereCard[] = [
  { id: "quiet", label: "静かだった", icon: "🌙", colorAccent: "#6B7FA0" },
  { id: "hectic", label: "慌ただしかった", icon: "💨", colorAccent: "#D4884A" },
  { id: "hot", label: "熱かった", icon: "🔥", colorAccent: "#C95540" },
  { id: "suffocating", label: "窮屈だった", icon: "🧱", colorAccent: "#8A7060" },
  { id: "protected", label: "守られていた", icon: "🛡️", colorAccent: "#6AAA8A" },
  { id: "shaky", label: "揺れていた", icon: "🌊", colorAccent: "#5A8AB0" },
  { id: "expanding", label: "広がっていた", icon: "🌅", colorAccent: "#D4A040" },
  { id: "heavy", label: "重かった", icon: "⛅", colorAccent: "#707080" },
  { id: "dazzling", label: "眩しかった", icon: "✨", colorAccent: "#E0B840" },
  { id: "lonely", label: "少し孤独だった", icon: "🪶", colorAccent: "#9090A8" },
  { id: "searching", label: "何かを探していた", icon: "🔍", colorAccent: "#7A90B0" },
  { id: "free", label: "自由だった", icon: "🕊️", colorAccent: "#80C0A0" },
  { id: "tense", label: "張り詰めていた", icon: "🎻", colorAccent: "#A06070" },
  { id: "warm", label: "あたたかかった", icon: "☀️", colorAccent: "#D09050" },
];

export function getAtmosphereLabel(id: string): string {
  return ATMOSPHERE_CARDS.find((c) => c.id === id)?.label ?? id;
}
