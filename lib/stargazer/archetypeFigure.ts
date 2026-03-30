/** englishName → 既存画像ファイル名のマッピング */
const FIGURE_MAP: Record<string, string> = {
  // 完全一致
  alchemist: "alchemist",
  architect: "architect",
  commander: "commander",
  oracle: "oracle",
  pioneer: "pioneer",
  guardian: "guardian",
  catalyst: "catalyst",
  dynamo: "dynamo",
  empath: "empath",
  maestro: "maestro",
  forger: "forger",
  healer: "healer",
  mentor: "mentor",
  tactician: "tactician",
  sage: "sage",
  scout: "scout",
  sentinel: "sentinel",
  sphinx: "sphinx",
  phantom: "phantom",
  defender: "defender",
  curator: "curator",
  hermit: "hermit",
  virtuoso: "virtuoso",
  atlas: "atlas",
  captain: "captain",
  inspector: "inspector",
  muse: "muse",
  // フォールバック（画像が存在しない englishName → 近いイメージの既存画像）
  strategist: "tactician",
  inventor: "alchemist",
  revolutionary: "pioneer",
  builder: "forger",
  entrepreneur: "commander",
  visionary: "oracle",
  onmyoji: "sphinx",
  prophet: "oracle",
  bard: "muse",
  diplomat: "mentor",
  invader: "captain",
  discerner: "inspector",
  philosopher: "sage",
  advisor: "mentor",
  advocate: "sentinel",
  artist: "virtuoso",
  knight: "defender",
  executive: "commander",
};

export function getArchetypeFigureSrc(englishName?: string | null): string | null {
  if (!englishName) return null;
  const key = englishName.toLowerCase();
  const mapped = FIGURE_MAP[key] ?? key;
  return `/samples/figure/${mapped}.png`;
}
