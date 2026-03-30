// lib/origin/dailyOrbit/insightEngine.ts
// 自分予報 / 軌道の法則 / 漂流タスク分析 / 完了しなかった価値

import type {
  DailyOrbitStore,
  DailyOrbitEntry,
  OrbitLaw,
  SelfForecast,
  TaskNature,
  CompletionTexture,
} from "./types";
import { getRecentEntries } from "./store";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Self Forecast — 自分予報
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function generateSelfForecast(
  store: DailyOrbitStore,
  today: string,
  todayEntry: DailyOrbitEntry,
): SelfForecast | null {
  const totalTasks = todayEntry.tasks.length;
  if (totalTasks === 0) return null;

  const recent = getRecentEntries(store, today, 14);
  if (recent.length < 3) {
    // データ不足: 基本的な予言
    return {
      predictedCompletion: Math.round(totalTasks * 0.6),
      totalTasks,
      hardestTask: null,
      note: "まだデータを集めています。数日後、予言の精度が上がります",
    };
  }

  // 過去の完了率を算出
  const rates = recent
    .filter((e) => e.tasks.length > 0)
    .map((e) => e.tasks.filter((t) => t.completed).length / e.tasks.length);
  const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0.5;

  // 身体状態の影響
  let bodyModifier = 0;
  if (todayEntry.bodyEcho) {
    if (todayEntry.bodyEcho.head === "heavy") bodyModifier -= 0.1;
    if (todayEntry.bodyEcho.chest === "tight") bodyModifier -= 0.05;
    if (todayEntry.bodyEcho.stomach === "tense") bodyModifier -= 0.05;
    if (todayEntry.bodyEcho.limbs === "heavy") bodyModifier -= 0.1;
    if (todayEntry.bodyEcho.head === "light") bodyModifier += 0.05;
    if (todayEntry.bodyEcho.limbs === "light") bodyModifier += 0.05;
  }

  // Stargazer state の影響
  let stateModifier = 0;
  if (todayEntry.dayState) {
    const e = todayEntry.dayState.energy;
    if (e === "very_low") stateModifier -= 0.15;
    else if (e === "low") stateModifier -= 0.08;
    else if (e === "high") stateModifier += 0.05;
    else if (e === "very_high") stateModifier += 0.1;
  }

  // 義務タスクの比率が高いと完了率下がりがち
  const obligationRatio =
    todayEntry.tasks.filter((t) => t.nature === "obligation").length / totalTasks;
  const natureModifier = obligationRatio > 0.7 ? -0.1 : 0;

  const adjustedRate = Math.max(0, Math.min(1, avgRate + bodyModifier + stateModifier + natureModifier));
  const predicted = Math.round(totalTasks * adjustedRate);

  // 一番難しそうなタスク（義務タスクを優先、なければ最長テキスト）
  const hardest =
    todayEntry.tasks.find((t) => t.nature === "obligation" && !t.completed) ??
    [...todayEntry.tasks].sort((a, b) => b.text.length - a.text.length)[0];

  // 予言テキスト生成
  const note = buildForecastNote(predicted, totalTasks, todayEntry, adjustedRate, avgRate);

  return { predictedCompletion: predicted, totalTasks, hardestTask: hardest?.text ?? null, note };
}

function buildForecastNote(
  predicted: number,
  total: number,
  entry: DailyOrbitEntry,
  adjustedRate: number,
  baseRate: number,
): string {
  const parts: string[] = [];

  if (adjustedRate < baseRate - 0.1) {
    if (entry.bodyEcho?.head === "heavy" || entry.bodyEcho?.limbs === "heavy") {
      parts.push("身体が重い日。ペースを落としても大丈夫");
    } else if (entry.dayState?.energy === "very_low" || entry.dayState?.energy === "low") {
      parts.push("エネルギーが低めの日。無理せずに");
    }
  } else if (adjustedRate > baseRate + 0.05) {
    parts.push("今日は調子が良さそう");
  }

  parts.push(`${total}個中${predicted}個くらい完了しそう`);

  const curiosityTasks = entry.tasks.filter((t) => t.nature === "curiosity");
  if (curiosityTasks.length > 0) {
    parts.push("好奇心タスクがある日は没頭しやすい傾向");
  }

  return parts.join("。");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Orbit Laws — 軌道の法則の発見
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function discoverOrbitLaws(store: DailyOrbitStore, today: string): OrbitLaw[] {
  const entries = getRecentEntries(store, today, 30);
  if (entries.length < 7) return []; // 最低7日必要

  const laws: OrbitLaw[] = [];
  const now = new Date().toISOString();

  // ── 1. タスクの本性パターン ──
  const natureStats = analyzeNaturePatterns(entries);
  if (natureStats) laws.push({ ...natureStats, discoveredAt: now });

  // ── 2. 完了の感触パターン ──
  const textureStats = analyzeTexturePatterns(entries);
  if (textureStats) laws.push({ ...textureStats, discoveredAt: now });

  // ── 3. 身体と行動の相関 ──
  const bodyCorr = analyzeBodyCorrelation(entries);
  for (const law of bodyCorr) laws.push({ ...law, discoveredAt: now });

  // ── 4. エネルギーと行動の関係 ──
  const energyLaw = analyzeEnergyBehavior(entries);
  if (energyLaw) laws.push({ ...energyLaw, discoveredAt: now });

  // ── 5. 時間帯パターン (タスク追加の瞬間) ──
  const timeLaw = analyzeAdditionTiming(entries);
  if (timeLaw) laws.push({ ...timeLaw, discoveredAt: now });

  // ── 6. 内在する意図のテーマ ──
  const shadowLaw = analyzeShadowThemes(entries);
  if (shadowLaw) laws.push({ ...shadowLaw, discoveredAt: now });

  // ── 7. 時間的自己の傾向 (Temporal Dialogue) ──
  const temporalLaw = analyzeTemporalSelf(entries);
  if (temporalLaw) laws.push({ ...temporalLaw, discoveredAt: now });

  // ── 8. やらなかったことの価値 ──
  const notDoingLaw = analyzeNotDoingValue(entries);
  if (notDoingLaw) laws.push({ ...notDoingLaw, discoveredAt: now });

  return laws;
}

type PartialLaw = Omit<OrbitLaw, "discoveredAt">;

function analyzeNaturePatterns(entries: DailyOrbitEntry[]): PartialLaw | null {
  const natureCompletionMap: Record<TaskNature, { completed: number; total: number }> = {
    impulse: { completed: 0, total: 0 },
    obligation: { completed: 0, total: 0 },
    investment: { completed: 0, total: 0 },
    curiosity: { completed: 0, total: 0 },
  };

  for (const entry of entries) {
    for (const task of entry.tasks) {
      if (!task.nature) continue;
      natureCompletionMap[task.nature].total++;
      if (task.completed) natureCompletionMap[task.nature].completed++;
    }
  }

  // 最も完了率が高い/低い本性を見つける
  let bestNature: TaskNature | null = null;
  let bestRate = 0;
  let worstNature: TaskNature | null = null;
  let worstRate = 1;

  for (const [nature, stats] of Object.entries(natureCompletionMap)) {
    if (stats.total < 3) continue; // 最低3個必要
    const rate = stats.completed / stats.total;
    if (rate > bestRate) {
      bestRate = rate;
      bestNature = nature as TaskNature;
    }
    if (rate < worstRate) {
      worstRate = rate;
      worstNature = nature as TaskNature;
    }
  }

  if (!bestNature || !worstNature || bestNature === worstNature) return null;

  const NATURE_LABEL: Record<TaskNature, string> = {
    impulse: "\u885d\u52d5",
    obligation: "\u7fa9\u52d9",
    investment: "\u6295\u8cc7",
    curiosity: "\u597d\u5947\u5fc3",
  };

  return {
    id: "nature_completion_gap",
    text: `${NATURE_LABEL[bestNature]}\u30bf\u30b9\u30af\u306e\u5b8c\u4e86\u7387\u306f${Math.round(bestRate * 100)}%\u3002${NATURE_LABEL[worstNature]}\u30bf\u30b9\u30af\u306f${Math.round(worstRate * 100)}%\u3002\u3042\u306a\u305f\u306f${NATURE_LABEL[bestNature]}\u99c6\u52d5\u3067\u52d5\u304f\u4eba\u9593\u3067\u3059`,
    confidence: Math.min(0.9, entries.length / 30),
    dataPoints: entries.length,
    category: "nature_pattern",
  };
}

function analyzeTexturePatterns(entries: DailyOrbitEntry[]): PartialLaw | null {
  const textureCounts: Record<CompletionTexture, number> = {
    satisfying: 0,
    relieved: 0,
    just_done: 0,
  };

  let total = 0;
  for (const entry of entries) {
    for (const task of entry.tasks) {
      if (!task.texture) continue;
      textureCounts[task.texture]++;
      total++;
    }
  }

  if (total < 5) return null;

  const dominant = (Object.entries(textureCounts) as [CompletionTexture, number][])
    .sort((a, b) => b[1] - a[1])[0];

  const TEXTURE_LABEL: Record<CompletionTexture, string> = {
    satisfying: "\u3059\u3063\u304d\u308a",
    relieved: "\u307b\u3063\u3068\u3057\u305f",
    just_done: "\u3053\u306a\u3057\u305f\u3060\u3051",
  };

  const pct = Math.round((dominant[1] / total) * 100);

  if (pct < 50) return null;

  const insights: Record<CompletionTexture, string> = {
    satisfying:
      "\u30bf\u30b9\u30af\u3092\u300c\u81ea\u5206\u306e\u3082\u306e\u300d\u3068\u3057\u3066\u5b8c\u4e86\u3067\u304d\u3066\u3044\u308b",
    relieved:
      "\u30bf\u30b9\u30af\u304b\u3089\u306e\u89e3\u653e\u611f\u304c\u4e3b\u306a\u52d5\u6a5f\u306b\u306a\u3063\u3066\u3044\u308b\u304b\u3082\u3057\u308c\u306a\u3044",
    just_done:
      "\u591a\u304f\u306e\u30bf\u30b9\u30af\u304c\u60e3\u6027\u3067\u51e6\u7406\u3055\u308c\u3066\u3044\u308b\u3002\u672c\u5f53\u306b\u3084\u308a\u305f\u3044\u3053\u3068\u306f\u5225\u306b\u3042\u308b\u304b\u3082",
  };

  return {
    id: "dominant_texture",
    text: `\u5b8c\u4e86\u6642\u306e\u611f\u89e6\u306e${pct}%\u304c\u300c${TEXTURE_LABEL[dominant[0]]}\u300d\u3002${insights[dominant[0]]}`,
    confidence: Math.min(0.85, total / 20),
    dataPoints: entries.length,
    category: "texture_pattern",
  };
}

function analyzeBodyCorrelation(entries: DailyOrbitEntry[]): PartialLaw[] {
  const laws: PartialLaw[] = [];

  // 身体の状態別の完了率
  const bodyCompletionMap: Record<string, { completed: number; total: number; days: number }> = {};

  for (const entry of entries) {
    if (!entry.bodyEcho || entry.tasks.length === 0) continue;
    const completed = entry.tasks.filter((t) => t.completed).length;
    const total = entry.tasks.length;

    for (const [zone, value] of Object.entries(entry.bodyEcho)) {
      if (zone === "recordedAt" || !value) continue;
      const key = `${zone}:${value}`;
      if (!bodyCompletionMap[key]) bodyCompletionMap[key] = { completed: 0, total: 0, days: 0 };
      bodyCompletionMap[key].completed += completed;
      bodyCompletionMap[key].total += total;
      bodyCompletionMap[key].days++;
    }
  }

  const ZONE_LABELS: Record<string, string> = {
    "head:heavy": "\u982d\u304c\u91cd\u3044",
    "head:foggy": "\u982d\u304c\u307c\u3093\u3084\u308a",
    "chest:tight": "\u80f8\u304c\u8a70\u307e\u308b",
    "stomach:tense": "\u80c3\u304c\u304d\u3085\u3063\u3068\u3059\u308b",
    "limbs:heavy": "\u624b\u8db3\u304c\u3060\u308b\u3044",
    "limbs:light": "\u624b\u8db3\u304c\u8efd\u3044",
  };

  for (const [key, stats] of Object.entries(bodyCompletionMap)) {
    if (stats.days < 3 || !ZONE_LABELS[key]) continue;
    const rate = stats.completed / stats.total;
    const avgRate =
      entries
        .filter((e) => e.tasks.length > 0)
        .reduce((sum, e) => sum + e.tasks.filter((t) => t.completed).length / e.tasks.length, 0) /
      entries.filter((e) => e.tasks.length > 0).length;

    const diff = rate - avgRate;
    if (Math.abs(diff) < 0.15) continue;

    const direction = diff > 0 ? "\u5b8c\u4e86\u7387\u304c\u4e0a\u304c\u308b" : "\u5b8c\u4e86\u7387\u304c\u4e0b\u304c\u308b";
    laws.push({
      id: `body_${key}`,
      text: `\u300c${ZONE_LABELS[key]}\u300d\u65e5\u306f${direction}\u50be\u5411\u3002\u8eab\u4f53\u306f\u884c\u52d5\u306e\u524d\u306b\u7b54\u3048\u3092\u6301\u3063\u3066\u3044\u308b`,
      confidence: Math.min(0.8, stats.days / 10),
      dataPoints: stats.days,
      category: "body_correlation",
    });
  }

  return laws;
}

function analyzeEnergyBehavior(entries: DailyOrbitEntry[]): PartialLaw | null {
  const energyGroups: Record<string, { completed: number; total: number; days: number }> = {
    low: { completed: 0, total: 0, days: 0 },
    high: { completed: 0, total: 0, days: 0 },
  };

  for (const entry of entries) {
    if (!entry.dayState?.energy || entry.tasks.length === 0) continue;
    const group = ["very_low", "low"].includes(entry.dayState.energy) ? "low" : "high";
    if (entry.dayState.energy === "moderate") continue;
    energyGroups[group].completed += entry.tasks.filter((t) => t.completed).length;
    energyGroups[group].total += entry.tasks.length;
    energyGroups[group].days++;
  }

  if (energyGroups.low.days < 2 || energyGroups.high.days < 2) return null;

  const lowRate = energyGroups.low.completed / energyGroups.low.total;
  const highRate = energyGroups.high.completed / energyGroups.high.total;
  const diff = highRate - lowRate;

  if (Math.abs(diff) < 0.1) return null;

  let text: string;
  if (diff > 0.2) {
    text = `\u30a8\u30cd\u30eb\u30ae\u30fc\u304c\u9ad8\u3044\u65e5\u306e\u5b8c\u4e86\u7387\u306f${Math.round(highRate * 100)}%\u3001\u4f4e\u3044\u65e5\u306f${Math.round(lowRate * 100)}%\u3002\u30a8\u30cd\u30eb\u30ae\u30fc\u304c\u884c\u52d5\u3092\u5927\u304d\u304f\u5de6\u53f3\u3057\u3066\u3044\u308b`;
  } else if (diff < -0.1) {
    text = `\u30a8\u30cd\u30eb\u30ae\u30fc\u304c\u4f4e\u3044\u65e5\u3067\u3082\u5b8c\u4e86\u7387${Math.round(lowRate * 100)}%\u3002\u7fa9\u52d9\u611f\u304b\u5225\u306e\u529b\u304c\u3042\u306a\u305f\u3092\u52d5\u304b\u3057\u3066\u3044\u308b`;
  } else {
    return null;
  }

  return {
    id: "energy_behavior",
    text,
    confidence: Math.min(0.85, (energyGroups.low.days + energyGroups.high.days) / 14),
    dataPoints: energyGroups.low.days + energyGroups.high.days,
    category: "energy_behavior",
  };
}

function analyzeAdditionTiming(entries: DailyOrbitEntry[]): PartialLaw | null {
  const hourBuckets: Record<string, { count: number; completed: number }> = {
    morning: { count: 0, completed: 0 }, // 5-11
    afternoon: { count: 0, completed: 0 }, // 12-17
    evening: { count: 0, completed: 0 }, // 18-22
    night: { count: 0, completed: 0 }, // 23-4
  };

  for (const entry of entries) {
    for (const task of entry.tasks) {
      if (!task.addedAt) continue;
      const hour = new Date(task.addedAt).getHours();
      let bucket: string;
      if (hour >= 5 && hour < 12) bucket = "morning";
      else if (hour >= 12 && hour < 18) bucket = "afternoon";
      else if (hour >= 18 && hour < 23) bucket = "evening";
      else bucket = "night";

      hourBuckets[bucket].count++;
      if (task.completed) hourBuckets[bucket].completed++;
    }
  }

  // 最も完了率が高い時間帯を見つける
  let bestBucket: string | null = null;
  let bestRate = 0;

  const BUCKET_LABELS: Record<string, string> = {
    morning: "\u5348\u524d",
    afternoon: "\u5348\u5f8c",
    evening: "\u5915\u65b9",
    night: "\u6df1\u591c",
  };

  for (const [bucket, stats] of Object.entries(hourBuckets)) {
    if (stats.count < 3) continue;
    const rate = stats.completed / stats.count;
    if (rate > bestRate) {
      bestRate = rate;
      bestBucket = bucket;
    }
  }

  if (!bestBucket || bestRate < 0.5) return null;

  return {
    id: "addition_timing",
    text: `${BUCKET_LABELS[bestBucket]}\u306b\u8ffd\u52a0\u3057\u305f\u30bf\u30b9\u30af\u306e\u5b8c\u4e86\u7387\u304c${Math.round(bestRate * 100)}%\u3068\u6700\u3082\u9ad8\u3044\u3002${BUCKET_LABELS[bestBucket]}\u306e\u3042\u306a\u305f\u304c\u3001\u672c\u5f53\u306b\u3084\u308a\u305f\u3044\u3053\u3068\u3092\u77e5\u3063\u3066\u3044\u308b`,
    confidence: Math.min(0.75, hourBuckets[bestBucket].count / 15),
    dataPoints: entries.length,
    category: "time_pattern",
  };
}

function analyzeShadowThemes(entries: DailyOrbitEntry[]): PartialLaw | null {
  const shadows = entries
    .filter((e) => e.shadowIntention?.text)
    .map((e) => e.shadowIntention!.text);

  if (shadows.length < 3) return null;

  // キーワードカテゴリ検出
  const categories: Record<string, { keywords: string[]; count: number }> = {
    "\u4eba\u9593\u95a2\u4fc2": { keywords: ["\u9023\u7d61", "\u4f1a\u3046", "\u8a71\u3059", "\u8b1d\u308b", "\u8a00\u3046", "\u4f1d\u3048\u308b", "\u53cb\u9054", "\u5bb6\u65cf", "\u604b\u4eba"], count: 0 },
    "\u5065\u5eb7": { keywords: ["\u75c5\u9662", "\u904b\u52d5", "\u690d\u6b6f", "\u5065\u5eb7", "\u691c\u8a3a", "\u30b8\u30e0", "\u8d70\u308b"], count: 0 },
    "\u30ad\u30e3\u30ea\u30a2": { keywords: ["\u8ee2\u8077", "\u526f\u696d", "\u52c9\u5f37", "\u8cc7\u683c", "\u5c65\u6b74", "\u9762\u63a5"], count: 0 },
    "\u5275\u9020": { keywords: ["\u66f8\u304f", "\u63cf\u304f", "\u4f5c\u308b", "\u59cb\u3081\u308b", "\u30d7\u30ed\u30b8\u30a7\u30af\u30c8"], count: 0 },
    "\u751f\u6d3b\u6574\u7406": { keywords: ["\u7247\u4ed8\u3051", "\u6383\u9664", "\u5f15\u8d8a\u3057", "\u6574\u7406", "\u51e6\u5206", "\u89e3\u7d04"], count: 0 },
  };

  for (const shadow of shadows) {
    for (const [cat, data] of Object.entries(categories)) {
      if (data.keywords.some((kw) => shadow.includes(kw))) {
        categories[cat].count++;
      }
    }
  }

  const dominant = Object.entries(categories)
    .filter(([, d]) => d.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)[0];

  if (!dominant) return null;

  const [catName, catData] = dominant;
  const pct = Math.round((catData.count / shadows.length) * 100);

  return {
    id: "shadow_theme",
    text: `\u5f71\u306e\u610f\u56f3\u306e${pct}%\u304c\u300c${catName}\u300d\u306b\u95a2\u308f\u308b\u3082\u306e\u3002\u610f\u8b58\u306f\u305d\u3053\u306b\u5411\u3044\u3066\u3044\u308b\u306e\u306b\u3001\u884c\u52d5\u306f\u3068\u3069\u3044\u3066\u3044\u306a\u3044`,
    confidence: Math.min(0.7, catData.count / 5),
    dataPoints: shadows.length,
    category: "shadow_theme",
  };
}

function analyzeTemporalSelf(entries: DailyOrbitEntry[]): PartialLaw | null {
  const responses = entries
    .filter((e) => e.temporalDialogue?.response)
    .map((e) => e.temporalDialogue!.response!);

  if (responses.length < 5) return null;

  const counts: Record<string, number> = { lets_go: 0, not_today: 0, naive_past_me: 0 };
  for (const r of responses) counts[r]++;

  const letsGoRate = counts.lets_go / responses.length;

  let text: string;
  if (letsGoRate > 0.6) {
    text = `\u6628\u65e5\u306e\u81ea\u5206\u306e\u8a00\u8449\u306b\u5f93\u3046\u7387${Math.round(letsGoRate * 100)}%\u3002\u81ea\u5206\u3068\u306e\u7d04\u675f\u3092\u5b88\u308b\u30bf\u30a4\u30d7`;
  } else if (counts.naive_past_me > counts.lets_go) {
    text = `\u6628\u65e5\u306e\u81ea\u5206\u3092\u300c\u7518\u3044\u300d\u3068\u611f\u3058\u308b\u3053\u3068\u304c\u591a\u3044\u3002\u671d\u306e\u81ea\u5206\u306f\u591c\u306e\u81ea\u5206\u3088\u308a\u73fe\u5b9f\u7684`;
  } else {
    text = `\u6628\u65e5\u306e\u81ea\u5206\u306e\u8a00\u8449\u306b\u5f93\u3046\u7387${Math.round(letsGoRate * 100)}%\u3002\u8a08\u753b\u3088\u308a\u3001\u305d\u306e\u5834\u306e\u76f4\u611f\u3067\u52d5\u304f\u30bf\u30a4\u30d7`;
  }

  return {
    id: "temporal_self",
    text,
    confidence: Math.min(0.8, responses.length / 14),
    dataPoints: responses.length,
    category: "temporal_self",
  };
}

function analyzeNotDoingValue(entries: DailyOrbitEntry[]): PartialLaw | null {
  // 未完了タスクの本性と、代わりに完了したタスクの本性を比較
  const replacements: { skipped: TaskNature; done: TaskNature }[] = [];

  for (const entry of entries) {
    const skipped = entry.tasks.filter((t) => !t.completed && t.nature);
    const done = entry.tasks.filter((t) => t.completed && t.nature);
    if (skipped.length === 0 || done.length === 0) continue;

    for (const s of skipped) {
      for (const d of done) {
        if (s.nature && d.nature && s.nature !== d.nature) {
          replacements.push({ skipped: s.nature!, done: d.nature! });
        }
      }
    }
  }

  if (replacements.length < 5) return null;

  // 最も多い「義務→X」パターンを見つける
  const obligationSkips = replacements.filter((r) => r.skipped === "obligation");
  if (obligationSkips.length < 3) return null;

  const NATURE_LABEL: Record<TaskNature, string> = {
    impulse: "\u885d\u52d5",
    obligation: "\u7fa9\u52d9",
    investment: "\u6295\u8cc7",
    curiosity: "\u597d\u5947\u5fc3",
  };

  const doneCounts: Record<string, number> = {};
  for (const r of obligationSkips) {
    doneCounts[r.done] = (doneCounts[r.done] ?? 0) + 1;
  }
  const topDone = Object.entries(doneCounts).sort((a, b) => b[1] - a[1])[0];

  return {
    id: "not_doing_value",
    text: `\u7fa9\u52d9\u30bf\u30b9\u30af\u3092\u5b8c\u4e86\u3057\u306a\u304b\u3063\u305f\u65e5\u3001\u4ee3\u308f\u308a\u306b${NATURE_LABEL[topDone[0] as TaskNature]}\u30bf\u30b9\u30af\u3092\u5b8c\u4e86\u3057\u3066\u3044\u305f\u3002\u300c\u3084\u3089\u306a\u304b\u3063\u305f\u300d\u3053\u3068\u3067\u3001\u5225\u306e\u4f55\u304b\u3092\u5b88\u3063\u3066\u3044\u305f`,
    confidence: Math.min(0.75, obligationSkips.length / 10),
    dataPoints: entries.length,
    category: "not_doing_value",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Worth of Not Doing — 完了しなかった価値 (1日分)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function describeNotDoingValue(entry: DailyOrbitEntry): string | null {
  const skipped = entry.tasks.filter((t) => !t.completed);
  const done = entry.tasks.filter((t) => t.completed);

  if (skipped.length === 0 || done.length === 0) return null;

  const NATURE_LABEL: Record<string, string> = {
    impulse: "\u885d\u52d5\u7684\u306a\u3053\u3068",
    obligation: "\u7fa9\u52d9",
    investment: "\u5c06\u6765\u3078\u306e\u6295\u8cc7",
    curiosity: "\u597d\u5947\u5fc3",
  };

  // skipped の nature を集計
  const skippedNatures = skipped.map((t) => t.nature).filter(Boolean);
  const doneNatures = done.map((t) => t.nature).filter(Boolean);

  if (skippedNatures.length === 0 || doneNatures.length === 0) {
    // nature未設定の場合はテキストベースで返す
    return `\u300c${skipped[0].text}\u300d\u3092\u3084\u3089\u306a\u304b\u3063\u305f\u4ee3\u308f\u308a\u306b\u3001\u300c${done[0].text}\u300d\u3092\u5b8c\u4e86\u3057\u305f\u3002\u305d\u308c\u306f\u7121\u610f\u8b58\u306e\u512a\u5148\u5224\u65ad`;
  }

  const skippedLabel = NATURE_LABEL[skippedNatures[0]!] ?? "";
  const doneLabel = NATURE_LABEL[doneNatures[0]!] ?? "";

  return `${skippedLabel}\u3092\u5b8c\u4e86\u3057\u306a\u304b\u3063\u305f\u4ee3\u308f\u308a\u306b\u3001${doneLabel}\u3092\u9078\u3093\u3060\u3002\u300c\u3084\u3089\u306a\u304b\u3063\u305f\u300d\u3053\u3068\u81ea\u4f53\u304c\u3001\u3042\u306a\u305f\u306e\u9078\u629e`;
}
