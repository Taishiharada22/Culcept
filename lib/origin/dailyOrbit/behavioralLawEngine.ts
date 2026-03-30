import type {
  DailyOrbitStore,
  DailyOrbitEntry,
  OrbitLaw,
  CompletionTexture,
} from "./types";
import { TEXTURE_META } from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Law types and unlock tiers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type LawType =
  | "weather_completion"       // Inner Weather × 完了率
  | "texture_next_day"         // テクスチャ(前日) × 翌日完了率
  | "emotion_next_day"         // 感情タグ × 翌日完了率
  | "carry_outcome"            // 持ち越し日数 × 結果
  | "weekday_completion"       // 曜日 × 完了率
  | "weekday_texture"          // 曜日 × テクスチャ
  | "weekly_rhythm";           // 週内リズム系

export type LawTier = "early" | "mature";

export const LAW_TIER_CONFIG: Record<LawTier, { minDays: number; types: LawType[] }> = {
  early: {
    minDays: 14,
    types: ["weather_completion", "texture_next_day", "emotion_next_day", "carry_outcome"],
  },
  mature: {
    minDays: 28,
    types: ["weekday_completion", "weekday_texture", "weekly_rhythm"],
  },
};

const CONFIDENCE_THRESHOLD = 0.75;
const MIN_PATTERN_POINTS = 10;
const MIN_DIFFERENCE_POINTS = 15; // percentage points
const MAX_COUNTEREXAMPLE_RATIO = 0.25;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type DayData = {
  date: string;
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  completionRate: number;
  completedCount: number;
  totalCount: number;
  dominantTexture: CompletionTexture | null;
  textures: Record<CompletionTexture, number>;
  energyLevel: number | null; // from Inner Weather, -1 to 1
  emotionTags: string[]; // from journal
  carriedTasks: { text: string; carryCount: number; completed: boolean }[];
};

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

function buildDayData(entry: DailyOrbitEntry): DayData {
  const tasks = entry.tasks;
  const completed = tasks.filter((t) => t.completed);
  const textures: Record<CompletionTexture, number> = { satisfying: 0, relieved: 0, just_done: 0 };
  for (const t of completed) {
    if (t.texture) textures[t.texture]++;
  }
  const textureEntries = Object.entries(textures) as [CompletionTexture, number][];
  const maxTexture = textureEntries.sort((a, b) => b[1] - a[1])[0];
  const dominantTexture = maxTexture[1] > 0 ? maxTexture[0] : null;

  const d = new Date(entry.date + "T00:00:00");
  const energyLevel = entry.dayState?.energy
    ? ({ very_low: -1, low: -0.5, moderate: 0, high: 0.5, very_high: 1 }[entry.dayState.energy] ?? null)
    : null;

  return {
    date: entry.date,
    dayOfWeek: d.getDay(),
    completionRate: tasks.length > 0 ? completed.length / tasks.length : 0,
    completedCount: completed.length,
    totalCount: tasks.length,
    dominantTexture,
    textures,
    energyLevel,
    emotionTags: [], // filled from journal data if available
    carriedTasks: tasks
      .filter((t) => (t.carryCount ?? 0) > 0)
      .map((t) => ({ text: t.text, carryCount: t.carryCount, completed: t.completed })),
  };
}

function getSortedDayData(store: DailyOrbitStore): DayData[] {
  return Object.values(store.entries)
    .filter((e) => e.tasks.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(buildDayData);
}

function getDayCount(store: DailyOrbitStore): number {
  if (!store.firstUsedAt) return 0;
  const first = new Date(store.firstUsedAt);
  const now = new Date();
  return Math.floor((now.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

function makeLawId(type: LawType, detail: string): string {
  return `law_${type}_${detail}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Law candidate type
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type LawCandidate = {
  id: string;
  type: LawType;
  text: string;
  confidence: number;
  dataPoints: number;
  category: OrbitLaw["category"];
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Early tier analyzers (2 weeks)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function analyzeWeatherCompletion(data: DayData[]): LawCandidate | null {
  const withEnergy = data.filter((d) => d.energyLevel !== null && d.totalCount > 0);
  if (withEnergy.length < MIN_PATTERN_POINTS) return null;

  const lowEnergy = withEnergy.filter((d) => d.energyLevel! <= -0.5);
  const highEnergy = withEnergy.filter((d) => d.energyLevel! >= 0.5);
  if (lowEnergy.length < 3 || highEnergy.length < 3) return null;

  const lowRate = lowEnergy.reduce((s, d) => s + d.completionRate, 0) / lowEnergy.length;
  const highRate = highEnergy.reduce((s, d) => s + d.completionRate, 0) / highEnergy.length;
  const diff = Math.abs(highRate - lowRate) * 100;

  if (diff < MIN_DIFFERENCE_POINTS) return null;

  // Confidence: how consistent is the pattern?
  const consistentLow = lowEnergy.filter((d) => d.completionRate < (lowRate + highRate) / 2).length;
  const confidence = consistentLow / lowEnergy.length;
  if (confidence < CONFIDENCE_THRESHOLD) return null;

  const lowPct = Math.round(lowRate * 100);
  const highPct = Math.round(highRate * 100);

  if (highRate > lowRate) {
    return {
      id: makeLawId("weather_completion", "energy"),
      type: "weather_completion",
      text: `エネルギーが高い日の完了率は${highPct}%、低い日は${lowPct}%。${Math.round(diff)}ポイントの差があります。あなたの実行力はエネルギー状態と連動する傾向があります。`,
      confidence,
      dataPoints: withEnergy.length,
      category: "energy_behavior",
    };
  }

  // Interesting case: low energy but high completion (resilience)
  return {
    id: makeLawId("weather_completion", "resilience"),
    type: "weather_completion",
    text: `エネルギーが低い日でも完了率は${lowPct}%。高い日の${highPct}%と大きく変わりません。あなたの実行力は体調に左右されにくいようです。`,
    confidence,
    dataPoints: withEnergy.length,
    category: "energy_behavior",
  };
}

function analyzeTextureNextDay(data: DayData[]): LawCandidate | null {
  if (data.length < MIN_PATTERN_POINTS) return null;

  const pairs: { prevTexture: CompletionTexture; nextRate: number }[] = [];
  for (let i = 0; i < data.length - 1; i++) {
    if (data[i].dominantTexture && data[i + 1].totalCount > 0) {
      pairs.push({
        prevTexture: data[i].dominantTexture!,
        nextRate: data[i + 1].completionRate,
      });
    }
  }
  if (pairs.length < 8) return null;

  const byTexture: Record<CompletionTexture, number[]> = { satisfying: [], relieved: [], just_done: [] };
  for (const p of pairs) byTexture[p.prevTexture].push(p.nextRate);

  // Find the texture with highest and lowest next-day rate
  const avgRates: [CompletionTexture, number, number][] = (
    Object.entries(byTexture) as [CompletionTexture, number[]][]
  )
    .filter(([, rates]) => rates.length >= 3)
    .map(([tex, rates]) => [tex, rates.reduce((s, r) => s + r, 0) / rates.length, rates.length]);

  if (avgRates.length < 2) return null;
  avgRates.sort((a, b) => b[1] - a[1]);

  const [bestTex, bestRate] = avgRates[0];
  const [worstTex, worstRate] = avgRates[avgRates.length - 1];
  const diff = (bestRate - worstRate) * 100;

  if (diff < MIN_DIFFERENCE_POINTS) return null;

  // Confidence check
  const bestPairs = pairs.filter((p) => p.prevTexture === bestTex);
  const overallAvg = pairs.reduce((s, p) => s + p.nextRate, 0) / pairs.length;
  const consistentBest = bestPairs.filter((p) => p.nextRate > overallAvg).length;
  const confidence = consistentBest / bestPairs.length;
  if (confidence < CONFIDENCE_THRESHOLD) return null;

  const bestLabel = TEXTURE_META[bestTex].label;
  const bestEmoji = TEXTURE_META[bestTex].emoji;
  const bestPct = Math.round(bestRate * 100);
  const worstLabel = TEXTURE_META[worstTex].label;
  const worstPct = Math.round(worstRate * 100);

  return {
    id: makeLawId("texture_next_day", bestTex),
    type: "texture_next_day",
    text: `${bestEmoji}「${bestLabel}」で終えた翌日の完了率は${bestPct}%。「${worstLabel}」の翌日は${worstPct}%。完了の質が翌日に影響する傾向があります。`,
    confidence,
    dataPoints: pairs.length,
    category: "texture_pattern",
  };
}

function analyzeCarryOutcome(data: DayData[]): LawCandidate | null {
  const allCarried: { carryCount: number; completed: boolean }[] = [];
  for (const d of data) {
    for (const t of d.carriedTasks) {
      allCarried.push(t);
    }
  }
  if (allCarried.length < MIN_PATTERN_POINTS) return null;

  // Group by carry count threshold
  const short = allCarried.filter((t) => t.carryCount <= 2);
  const long = allCarried.filter((t) => t.carryCount >= 3);

  if (short.length < 3 || long.length < 3) return null;

  const shortCompleteRate = short.filter((t) => t.completed).length / short.length;
  const longCompleteRate = long.filter((t) => t.completed).length / long.length;
  const diff = (shortCompleteRate - longCompleteRate) * 100;

  if (diff < MIN_DIFFERENCE_POINTS) return null;

  const confidence = 1 - (long.filter((t) => t.completed).length / long.length);
  if (confidence < CONFIDENCE_THRESHOLD * 0.9) return null; // slightly relaxed for this pattern

  const longReleasePct = Math.round((1 - longCompleteRate) * 100);

  return {
    id: makeLawId("carry_outcome", "days"),
    type: "carry_outcome",
    text: `3日以上持ち越したタスクの${longReleasePct}%は最終的に手放されています。2日目までに判断するほうが効率的かもしれません。`,
    confidence: Math.min(confidence, 0.95),
    dataPoints: allCarried.length,
    category: "time_pattern",
  };
}

// Emotion → next day (requires journal emotion data injected into DayData)
function analyzeEmotionNextDay(data: DayData[]): LawCandidate | null {
  // This requires journal emotion tags to be injected.
  // For now, we use the dayState.emotion field from Inner Weather as a proxy.
  const pairs: { emotion: string; nextRate: number }[] = [];
  for (let i = 0; i < data.length - 1; i++) {
    const entry = data[i];
    const nextEntry = data[i + 1];
    if (nextEntry.totalCount === 0) continue;

    // Use emotion tags if available, otherwise fall back to dayState
    const emotions = entry.emotionTags.length > 0
      ? entry.emotionTags
      : []; // will be populated when journal data is injected

    for (const em of emotions) {
      pairs.push({ emotion: em, nextRate: nextEntry.completionRate });
    }
  }
  if (pairs.length < 8) return null;

  // Group by emotion
  const byEmotion: Record<string, number[]> = {};
  for (const p of pairs) {
    if (!byEmotion[p.emotion]) byEmotion[p.emotion] = [];
    byEmotion[p.emotion].push(p.nextRate);
  }

  const avgRates = Object.entries(byEmotion)
    .filter(([, rates]) => rates.length >= 3)
    .map(([em, rates]) => ({ emotion: em, avg: rates.reduce((s, r) => s + r, 0) / rates.length, count: rates.length }));

  if (avgRates.length < 2) return null;
  avgRates.sort((a, b) => b.avg - a.avg);

  const best = avgRates[0];
  const worst = avgRates[avgRates.length - 1];
  const diff = (best.avg - worst.avg) * 100;
  if (diff < MIN_DIFFERENCE_POINTS) return null;

  const overallAvg = pairs.reduce((s, p) => s + p.nextRate, 0) / pairs.length;
  const bestPairs = pairs.filter((p) => p.emotion === best.emotion);
  const consistent = bestPairs.filter((p) => p.nextRate > overallAvg).length;
  const confidence = consistent / bestPairs.length;
  if (confidence < CONFIDENCE_THRESHOLD) return null;

  const bestPct = Math.round(best.avg * 100);
  const diffPct = Math.round((best.avg - overallAvg) * 100);

  return {
    id: makeLawId("emotion_next_day", best.emotion),
    type: "emotion_next_day",
    text: `「${best.emotion}」と記録した翌日の完了率は${bestPct}%で、平均より+${diffPct}%。${best.emotion}はあなたにとって充電の合図かもしれません。`,
    confidence,
    dataPoints: pairs.length,
    category: "energy_behavior",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mature tier analyzers (4 weeks)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function analyzeWeekdayCompletion(data: DayData[]): LawCandidate | null {
  const byDay: Record<number, number[]> = {};
  for (const d of data) {
    if (d.totalCount === 0) continue;
    if (!byDay[d.dayOfWeek]) byDay[d.dayOfWeek] = [];
    byDay[d.dayOfWeek].push(d.completionRate);
  }

  // Need at least 4 instances of a day to make claims
  const dayAvgs = Object.entries(byDay)
    .filter(([, rates]) => rates.length >= 4)
    .map(([day, rates]) => ({
      day: Number(day),
      avg: rates.reduce((s, r) => s + r, 0) / rates.length,
      count: rates.length,
      rates,
    }));

  if (dayAvgs.length < 3) return null;

  const overallAvg = data
    .filter((d) => d.totalCount > 0)
    .reduce((s, d) => s + d.completionRate, 0) / data.filter((d) => d.totalCount > 0).length;

  // Find best and worst day
  dayAvgs.sort((a, b) => b.avg - a.avg);
  const best = dayAvgs[0];
  const worst = dayAvgs[dayAvgs.length - 1];

  const diff = (best.avg - worst.avg) * 100;
  if (diff < MIN_DIFFERENCE_POINTS) return null;

  // Confidence: consistency of best day
  const consistent = best.rates.filter((r) => r > overallAvg).length;
  const confidence = consistent / best.count;
  if (confidence < CONFIDENCE_THRESHOLD) return null;

  // Recency check: last week should still show the pattern
  const recentData = data.slice(-7);
  const recentBest = recentData.filter((d) => d.dayOfWeek === best.day && d.totalCount > 0);
  if (recentBest.length > 0) {
    const recentAvg = recentBest.reduce((s, d) => s + d.completionRate, 0) / recentBest.length;
    if (recentAvg < overallAvg) return null; // pattern broke recently
  }

  const bestPct = Math.round(best.avg * 100);
  const overallPct = Math.round(overallAvg * 100);
  const bestName = DAY_NAMES[best.day];

  return {
    id: makeLawId("weekday_completion", String(best.day)),
    type: "weekday_completion",
    text: `${bestName}曜日の完了率は${bestPct}%。他の曜日の平均${overallPct}%を上回ります。${bestName}曜日はあなたにとって力を発揮しやすい日なのかもしれません。`,
    confidence,
    dataPoints: data.filter((d) => d.totalCount > 0).length,
    category: "time_pattern",
  };
}

function analyzeWeekdayTexture(data: DayData[]): LawCandidate | null {
  const byDay: Record<number, Record<CompletionTexture, number>> = {};
  for (const d of data) {
    const total = d.textures.satisfying + d.textures.relieved + d.textures.just_done;
    if (total === 0) continue;
    if (!byDay[d.dayOfWeek]) byDay[d.dayOfWeek] = { satisfying: 0, relieved: 0, just_done: 0 };
    byDay[d.dayOfWeek].satisfying += d.textures.satisfying;
    byDay[d.dayOfWeek].relieved += d.textures.relieved;
    byDay[d.dayOfWeek].just_done += d.textures.just_done;
  }

  const dayAnalysis: { day: number; dominant: CompletionTexture; ratio: number; total: number }[] = [];

  for (const [dayStr, tex] of Object.entries(byDay)) {
    const total = tex.satisfying + tex.relieved + tex.just_done;
    if (total < 4) continue; // need enough data per day
    const entries = Object.entries(tex) as [CompletionTexture, number][];
    entries.sort((a, b) => b[1] - a[1]);
    const [dominant, count] = entries[0];
    dayAnalysis.push({ day: Number(dayStr), dominant, ratio: count / total, total });
  }

  if (dayAnalysis.length < 3) return null;

  // Find the day with highest dominance of a non-satisfying texture
  const interesting = dayAnalysis
    .filter((d) => d.ratio >= 0.6)
    .sort((a, b) => b.ratio - a.ratio);

  if (interesting.length === 0) return null;

  const target = interesting[0];
  const label = TEXTURE_META[target.dominant].label;
  const emoji = TEXTURE_META[target.dominant].emoji;
  const pct = Math.round(target.ratio * 100);
  const dayName = DAY_NAMES[target.day];

  // Confidence check: consistency across instances of that day
  const dayData = data.filter((d) => d.dayOfWeek === target.day && d.dominantTexture !== null);
  const consistent = dayData.filter((d) => d.dominantTexture === target.dominant).length;
  const confidence = dayData.length > 0 ? consistent / dayData.length : 0;
  if (confidence < CONFIDENCE_THRESHOLD) return null;

  const description =
    target.dominant === "just_done"
      ? "義務処理モードに入りやすい曜日かもしれません。"
      : target.dominant === "satisfying"
        ? "心地よく集中できる曜日のようです。"
        : "プレッシャーと向き合う日になりやすいようです。";

  return {
    id: makeLawId("weekday_texture", `${target.day}_${target.dominant}`),
    type: "weekday_texture",
    text: `${dayName}曜日は${emoji}「${label}」が${pct}%。${description}`,
    confidence,
    dataPoints: target.total,
    category: "texture_pattern",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type GeneratedLaw = {
  law: OrbitLaw;
  type: LawType; // which law generator produced this
  isNew: boolean; // true if this law didn't exist before
  isUpdated: boolean; // true if confidence/text changed
};

export function generateBehavioralLaws(
  store: DailyOrbitStore,
  journalEmotions?: Record<string, string[]>, // date → emotion tags from journal
): GeneratedLaw[] {
  const dayCount = getDayCount(store);
  const data = getSortedDayData(store);

  // Inject journal emotion tags if provided
  if (journalEmotions) {
    for (const d of data) {
      if (journalEmotions[d.date]) {
        d.emotionTags = journalEmotions[d.date];
      }
    }
  }

  const existingLaws = new Map(store.orbitLaws.map((l) => [l.id, l]));
  const candidates: LawCandidate[] = [];

  // Early tier (2 weeks)
  if (dayCount >= LAW_TIER_CONFIG.early.minDays) {
    const earlyAnalyzers: ((data: DayData[]) => LawCandidate | null)[] = [
      analyzeWeatherCompletion,
      analyzeTextureNextDay,
      analyzeEmotionNextDay,
      analyzeCarryOutcome,
    ];
    for (const analyzer of earlyAnalyzers) {
      const candidate = analyzer(data);
      if (candidate) candidates.push(candidate);
    }
  }

  // Mature tier (4 weeks)
  if (dayCount >= LAW_TIER_CONFIG.mature.minDays) {
    const matureAnalyzers: ((data: DayData[]) => LawCandidate | null)[] = [
      analyzeWeekdayCompletion,
      analyzeWeekdayTexture,
    ];
    for (const analyzer of matureAnalyzers) {
      const candidate = analyzer(data);
      if (candidate) candidates.push(candidate);
    }
  }

  // Convert candidates to laws, checking against existing
  const results: GeneratedLaw[] = [];
  for (const candidate of candidates) {
    const existing = existingLaws.get(candidate.id);
    if (existing) {
      // Update if confidence changed significantly
      const confidenceChanged = Math.abs(existing.confidence - candidate.confidence) > 0.05;
      if (confidenceChanged) {
        results.push({
          law: {
            ...existing,
            text: candidate.text,
            confidence: candidate.confidence,
            dataPoints: candidate.dataPoints,
          },
          type: candidate.type,
          isNew: false,
          isUpdated: true,
        });
      }
    } else {
      results.push({
        law: {
          id: candidate.id,
          text: candidate.text,
          confidence: candidate.confidence,
          dataPoints: candidate.dataPoints,
          discoveredAt: new Date().toISOString(),
          category: candidate.category,
        },
        type: candidate.type,
        isNew: true,
        isUpdated: false,
      });
    }
  }

  return results;
}

export function getUnlockedLawTypes(dayCount: number): LawType[] {
  const types: LawType[] = [];
  for (const tier of Object.values(LAW_TIER_CONFIG)) {
    if (dayCount >= tier.minDays) {
      types.push(...tier.types);
    }
  }
  return types;
}

export function getNextLawUnlockInfo(dayCount: number): { daysUntil: number; tierName: string } | null {
  for (const [name, config] of Object.entries(LAW_TIER_CONFIG)) {
    if (dayCount < config.minDays) {
      return { daysUntil: config.minDays - dayCount, tierName: name === "early" ? "最初の法則" : "曜日パターン" };
    }
  }
  return null;
}
