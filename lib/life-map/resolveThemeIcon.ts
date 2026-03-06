// lib/life-map/resolveThemeIcon.ts
// Resolve theme id into the corresponding life-map theme icon asset.

const FALLBACK_ICON = "/life-map/icons/themes/icon-emotion.svg";

const THEME_ICON_MAP: Record<string, string> = {
  emotion: "/life-map/icons/themes/icon-emotion.svg",
  relationship: "/life-map/icons/themes/icon-relationship.svg",
  challenge: "/life-map/icons/themes/icon-challenge.svg",
  love: "/life-map/icons/themes/icon-love.svg",
  learning: "/life-map/icons/themes/icon-learning.svg",
  work: "/life-map/icons/chapters/icon-work.svg",
};

export function resolveThemeIcon(rawTheme: string | undefined | null): string {
  const theme = `${rawTheme ?? ""}`.trim().toLowerCase();
  if (!theme) return FALLBACK_ICON;

  if (THEME_ICON_MAP[theme]) {
    return THEME_ICON_MAP[theme];
  }

  if (theme.includes("relation")) return THEME_ICON_MAP.relationship;
  if (theme.includes("emotion")) return THEME_ICON_MAP.emotion;
  if (theme.includes("challenge")) return THEME_ICON_MAP.challenge;
  if (theme.includes("love")) return THEME_ICON_MAP.love;
  if (theme.includes("learn")) return THEME_ICON_MAP.learning;
  if (theme.includes("work") || theme.includes("career")) return THEME_ICON_MAP.work;

  return FALLBACK_ICON;
}
