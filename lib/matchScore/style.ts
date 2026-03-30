// lib/matchScore/style.ts
// スタイルマッチスコア計算

export type SwipePrefs = {
  silhouette?: Record<string, number>;
  material?: Record<string, number>;
  detail?: Record<string, number>;
  pattern?: Record<string, number>;
};

export type StyleScoreInput = {
  userLanes: string[];
  userMoodKeywords: string[];
  itemStyleTags: string[];
  itemMoodTags: string[];
  swipePrefs?: SwipePrefs;
};

export type StyleScoreResult = {
  score: number;
  reasons: string[];
};

const STYLE_GROUPS: Record<string, string[]> = {
  casual: ["casual", "daily", "street", "sporty"],
  formal: ["elegant", "luxury", "classic", "workwear"],
  creative: ["vintage", "minimal", "outdoor"],
};

function tagOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a.map(s => s.toLowerCase()));
  const setB = new Set(b.map(s => s.toLowerCase()));
  let inter = 0;
  for (const item of setA) if (setB.has(item)) inter++;
  return inter / Math.sqrt(setA.size * setB.size);
}

function groupOverlap(userTags: string[], itemTags: string[]): number {
  const userGroups = new Set<string>();
  const itemGroups = new Set<string>();
  for (const [group, tags] of Object.entries(STYLE_GROUPS)) {
    if (userTags.some(t => tags.includes(t.toLowerCase()))) userGroups.add(group);
    if (itemTags.some(t => tags.includes(t.toLowerCase()))) itemGroups.add(group);
  }
  if (userGroups.size === 0 || itemGroups.size === 0) return 0.5;
  let overlap = 0;
  for (const g of userGroups) if (itemGroups.has(g)) overlap++;
  return overlap / Math.max(userGroups.size, itemGroups.size);
}

export function calcStyleScore(input: StyleScoreInput): StyleScoreResult {
  const reasons: string[] = [];

  if (input.userLanes.length === 0 && input.userMoodKeywords.length === 0) {
    return { score: 50, reasons: ["スタイルデータ未登録"] };
  }

  const tagSim = tagOverlap(input.userLanes, input.itemStyleTags);
  const moodSim = tagOverlap(input.userMoodKeywords, input.itemMoodTags);
  const groupSim = groupOverlap(input.userLanes, input.itemStyleTags);

  let swipeBonus = 0;
  if (input.swipePrefs) {
    const prefCats = Object.values(input.swipePrefs).filter(Boolean);
    if (prefCats.length > 0) {
      swipeBonus = 5;
      reasons.push("スワイプ傾向を反映");
    }
  }

  const rawScore = (tagSim * 40 + moodSim * 20 + groupSim * 30 + 10) + swipeBonus;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  const matchedTags = input.userLanes.filter(t =>
    input.itemStyleTags.some(it => it.toLowerCase() === t.toLowerCase())
  );
  if (matchedTags.length > 0) {
    reasons.push(`スタイル一致: ${matchedTags.slice(0, 3).join(", ")}`);
  }

  const matchedMood = input.userMoodKeywords.filter(m =>
    input.itemMoodTags.some(im => im.toLowerCase() === m.toLowerCase())
  );
  if (matchedMood.length > 0) {
    reasons.push(`ムード一致: ${matchedMood.slice(0, 2).join(", ")}`);
  }

  if (reasons.length === 0) {
    if (tagSim > 0.3) reasons.push("スタイル傾向が近い");
    else if (tagSim > 0) reasons.push("スタイル傾向がやや異なる");
    else reasons.push("スタイルデータ不足");
  }

  return {
    score,
    reasons: reasons.slice(0, 3),
  };
}
