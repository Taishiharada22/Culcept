// lib/life-map/resolveChapterIcon.ts
// Resolve chapter/node type into the corresponding life-map chapter icon asset.

const FALLBACK_ICON = "/life-map/icons/chapters/icon-work.svg";

const MAP: Array<{ keys: string[]; src: string }> = [
  { keys: ["birth"], src: "/life-map/icons/chapters/icon-birth.svg" },
  { keys: ["child", "early_childhood"], src: "/life-map/icons/chapters/icon-childhood.svg" },
  {
    keys: ["elementary", "school"],
    src: "/life-map/icons/chapters/icon-school.svg",
  },
  { keys: ["junior", "middle"], src: "/life-map/icons/chapters/icon-juniorhigh.svg" },
  { keys: ["high"], src: "/life-map/icons/chapters/icon-highschool.svg" },
  {
    keys: ["study", "higher", "university", "college"],
    src: "/life-map/icons/chapters/icon-university.svg",
  },
  {
    keys: ["turning", "crossroad", "crossroads", "pivot"],
    src: "/life-map/icons/chapters/icon-turning-point.svg",
  },
  { keys: ["work", "job", "career", "present"], src: "/life-map/icons/chapters/icon-work.svg" },
];

export function resolveChapterIcon(rawType: string | undefined | null): string {
  const type = `${rawType ?? ""}`.trim().toLowerCase();
  if (!type) return FALLBACK_ICON;

  for (const item of MAP) {
    if (item.keys.some((key) => type.includes(key))) {
      return item.src;
    }
  }
  return FALLBACK_ICON;
}
