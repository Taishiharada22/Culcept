import type { DailyOrbitStore, DailyOrbitEntry, CompletionTexture } from "./types";
import { TEXTURE_META } from "./types";

export type MiniInsight = {
  id: string;
  category: "time_of_day" | "texture_trend" | "completion_pace" | "carry_over" | "weather_link";
  text: string;
  confidence: number; // 0-1
  dataPoints: number;
  generatedAt: string;
};

type EntryStats = {
  date: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  morningCompletions: number; // before 12:00
  afternoonCompletions: number; // 12:00-18:00
  eveningCompletions: number; // after 18:00
  textures: Record<CompletionTexture, number>;
  carriedCount: number;
};

function extractStats(entry: DailyOrbitEntry): EntryStats {
  const tasks = entry.tasks;
  const completed = tasks.filter((t) => t.completed);
  let morning = 0, afternoon = 0, evening = 0;
  const textures: Record<CompletionTexture, number> = { satisfying: 0, relieved: 0, just_done: 0 };

  for (const t of completed) {
    if (t.addedAt) {
      const hour = new Date(t.addedAt).getHours();
      if (hour < 12) morning++;
      else if (hour < 18) afternoon++;
      else evening++;
    }
    if (t.texture) textures[t.texture]++;
  }

  return {
    date: entry.date,
    totalTasks: tasks.length,
    completedTasks: completed.length,
    completionRate: tasks.length > 0 ? completed.length / tasks.length : 0,
    morningCompletions: morning,
    afternoonCompletions: afternoon,
    eveningCompletions: evening,
    textures,
    carriedCount: tasks.filter((t) => (t.carryCount ?? 0) > 0).length,
  };
}

function getRecentEntries(store: DailyOrbitStore, days: number): DailyOrbitEntry[] {
  const entries = Object.values(store.entries)
    .filter((e) => e.tasks.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, days);
  return entries;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Insight generators
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function tryTimeOfDay(stats: EntryStats[]): MiniInsight | null {
  const totalCompleted = stats.reduce((s, e) => s + e.completedTasks, 0);
  if (totalCompleted < 5) return null;

  const morning = stats.reduce((s, e) => s + e.morningCompletions, 0);
  const afternoon = stats.reduce((s, e) => s + e.afternoonCompletions, 0);
  const evening = stats.reduce((s, e) => s + e.eveningCompletions, 0);

  const morningRatio = morning / totalCompleted;
  const afternoonRatio = afternoon / totalCompleted;
  const eveningRatio = evening / totalCompleted;

  const dominant = Math.max(morningRatio, afternoonRatio, eveningRatio);
  if (dominant < 0.65) return null;

  // Check consistency: at least 2 of 3 days show the same pattern
  let consistentDays = 0;
  for (const s of stats) {
    if (s.completedTasks === 0) continue;
    const m = s.morningCompletions / s.completedTasks;
    const a = s.afternoonCompletions / s.completedTasks;
    const e = s.eveningCompletions / s.completedTasks;
    const dayDominant = Math.max(m, a, e);
    if (
      (dominant === morningRatio && m === dayDominant) ||
      (dominant === afternoonRatio && a === dayDominant) ||
      (dominant === eveningRatio && e === dayDominant)
    ) {
      consistentDays++;
    }
  }
  if (consistentDays < 2) return null;

  const pct = Math.round(dominant * 100);
  const period =
    dominant === morningRatio ? "午前中" :
    dominant === afternoonRatio ? "午後" : "夜";

  return {
    id: "mini_time_of_day",
    category: "time_of_day",
    text: `${stats.length}日間の完了タスクの${pct}%が${period}に集中しています。${period}型のリズムが見えます。`,
    confidence: dominant,
    dataPoints: totalCompleted,
    generatedAt: new Date().toISOString(),
  };
}

function tryTextureTrend(stats: EntryStats[]): MiniInsight | null {
  const total = stats.reduce(
    (s, e) => s + e.textures.satisfying + e.textures.relieved + e.textures.just_done,
    0,
  );
  if (total < 3) return null;

  const satisfying = stats.reduce((s, e) => s + e.textures.satisfying, 0);
  const relieved = stats.reduce((s, e) => s + e.textures.relieved, 0);
  const justDone = stats.reduce((s, e) => s + e.textures.just_done, 0);

  const ratios: [CompletionTexture, number][] = [
    ["satisfying", satisfying / total],
    ["relieved", relieved / total],
    ["just_done", justDone / total],
  ];
  const [dominantKey, dominantRatio] = ratios.sort((a, b) => b[1] - a[1])[0];
  if (dominantRatio < 0.6) return null;

  const pct = Math.round(dominantRatio * 100);
  const label = TEXTURE_META[dominantKey].label;
  const emoji = TEXTURE_META[dominantKey].emoji;

  const descriptions: Record<CompletionTexture, string> = {
    satisfying: "心地よく片付けられている日が多いようです。",
    relieved: "プレッシャーを乗り越えて完了するパターンが多いようです。",
    just_done: "淡々とこなすスタイルが目立ちます。",
  };

  return {
    id: "mini_texture_trend",
    category: "texture_trend",
    text: `${emoji}「${label}」が${pct}%。${descriptions[dominantKey]}`,
    confidence: dominantRatio,
    dataPoints: total,
    generatedAt: new Date().toISOString(),
  };
}

function tryCompletionPace(stats: EntryStats[]): MiniInsight | null {
  if (stats.length < 3) return null;
  const rates = stats.map((s) => s.completedTasks).reverse(); // chronological

  const increasing = rates.every((v, i) => i === 0 || v >= rates[i - 1]);
  const decreasing = rates.every((v, i) => i === 0 || v <= rates[i - 1]);

  if (!increasing && !decreasing) return null;

  const diff = rates[rates.length - 1] - rates[0];
  if (Math.abs(diff) < 1) return null;

  const trend = increasing ? "増えています" : "減っています";
  const interpretation = increasing
    ? "リズムが掴めてきた兆しかもしれません。"
    : "ペースを落としている時期のようです。無理のないリズムが大事です。";

  return {
    id: "mini_completion_pace",
    category: "completion_pace",
    text: `完了数が${rates.join("→")}と毎日${trend}。${interpretation}`,
    confidence: 0.7,
    dataPoints: stats.length,
    generatedAt: new Date().toISOString(),
  };
}

function tryCarryOver(stats: EntryStats[]): MiniInsight | null {
  const totalCarried = stats.reduce((s, e) => s + e.carriedCount, 0);
  const totalTasks = stats.reduce((s, e) => s + e.totalTasks, 0);
  if (totalTasks < 5) return null;

  if (totalCarried === 0) {
    return {
      id: "mini_carry_over",
      category: "carry_over",
      text: "持ち越しタスクは0件。その日のうちに片付ける力が強いです。",
      confidence: 0.8,
      dataPoints: totalTasks,
      generatedAt: new Date().toISOString(),
    };
  }

  const carryRate = totalCarried / totalTasks;
  if (carryRate < 0.3) return null; // not noteworthy

  return {
    id: "mini_carry_over",
    category: "carry_over",
    text: `タスクの${Math.round(carryRate * 100)}%が持ち越しから来ています。計画と実行のギャップに、あなたの傾向が見えるかもしれません。`,
    confidence: 0.65,
    dataPoints: totalTasks,
    generatedAt: new Date().toISOString(),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DISMISS_KEY = "origin_mini_insight_dismissed_v1";

export function getMiniInsightDismissedWeek(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(DISMISS_KEY); } catch { return null; }
}

export function dismissMiniInsight(): void {
  const weekStart = getWeekStartKey();
  try { localStorage.setItem(DISMISS_KEY, weekStart); } catch {}
}

function getWeekStartKey(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

export function generateMiniInsight(store: DailyOrbitStore): MiniInsight | null {
  // Check if already dismissed this week
  const dismissed = getMiniInsightDismissedWeek();
  if (dismissed === getWeekStartKey()) return null;

  const entries = getRecentEntries(store, 3);
  if (entries.length < 3) return null;

  const stats = entries.map(extractStats);
  const totalCompleted = stats.reduce((s, e) => s + e.completedTasks, 0);
  if (totalCompleted < 5) return null;

  // Try each generator, return the first that passes quality gate
  const generators = [tryTimeOfDay, tryTextureTrend, tryCompletionPace, tryCarryOver];
  for (const gen of generators) {
    const insight = gen(stats);
    if (insight) return insight;
  }
  return null;
}
