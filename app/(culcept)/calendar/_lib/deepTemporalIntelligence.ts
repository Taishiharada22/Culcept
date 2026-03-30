/**
 * 深層時系列知性エンジン
 *
 * 表層的な時間パターンを超え、
 * ・気分×天気×曜日の3次元条件付き学習
 * ・着用サイクル最適化（アイテム別の最適ローテーション間隔）
 * ・季節ごとの個人スタイルシフトの追跡
 * を実現する。
 */

import type { WardrobeItem } from "@/app/my-style/_lib/types";
import type { WornRecord } from "./types";

/* ── ストレージキー ── */
const MOOD_RECORD_KEY = "culcept_calendar_mood_records_v1";

/* ── 1. 気分×天気×曜日 3次元パターン ── */

export interface MoodRecord {
  date: string;
  dayOfWeek: number;           // 0=Sun...6=Sat
  weatherIcon: string;         // sun, cloud, rain, snow, storm
  satisfaction: number;        // 1-5
  tags: string[];              // 暑かった, 寒かった, etc.
  formalityLevel: number;      // 0=casual, 1=smart, 2=dress
  colorBrightness: number;     // 0-1 (HSL lightness avg)
}

/** サーバーに mood record を保存（calendar_outfits.sync_snapshot.mood に格納） */
function syncMoodToServer(record: MoodRecord): void {
  fetch("/api/calendar/day", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date: record.date,
      worn_record: {
        syncSnapshot: { mood: record },
      },
    }),
  }).catch(() => { /* silent — localStorage がフォールバック */ });
}

/** サーバーから mood records を復元（calendar_outfits.sync_snapshot.mood を集約） */
export async function fetchMoodRecordsFromServer(): Promise<MoodRecord[]> {
  try {
    const res = await fetch("/api/calendar/history?days=180", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    const records: MoodRecord[] = [];
    for (const row of data.records ?? []) {
      const mood = row.syncSnapshot?.mood as MoodRecord | undefined;
      if (mood?.date) records.push(mood);
    }
    return records;
  } catch {
    return [];
  }
}

export function saveMoodRecord(record: MoodRecord): void {
  const history = loadMoodRecords();
  // 同日は上書き
  const idx = history.findIndex(r => r.date === record.date);
  if (idx >= 0) history[idx] = record;
  else history.push(record);
  // 直近180日のみ
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);
  const cutoffStr = cutoff.toISOString().split("T")[0];
  const trimmed = history.filter(r => r.date >= cutoffStr);
  try {
    localStorage.setItem(MOOD_RECORD_KEY, JSON.stringify(trimmed));
  } catch { /* storage full */ }
  // サーバーにも非同期で同期
  syncMoodToServer(record);
}

export function loadMoodRecords(): MoodRecord[] {
  try {
    const raw = localStorage.getItem(MOOD_RECORD_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/**
 * サーバー優先で mood records を読み込む。
 * サーバーにデータがあれば localStorage にもキャッシュ。
 */
export async function loadMoodRecordsWithSync(): Promise<MoodRecord[]> {
  const serverRecords = await fetchMoodRecordsFromServer();
  const localRecords = loadMoodRecords();

  if (serverRecords.length > 0) {
    // サーバーとローカルをマージ（サーバー優先、ローカルの新しい分を補完）
    const byDate = new Map<string, MoodRecord>();
    for (const r of localRecords) byDate.set(r.date, r);
    for (const r of serverRecords) byDate.set(r.date, r); // サーバー側で上書き
    const merged = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    try { localStorage.setItem(MOOD_RECORD_KEY, JSON.stringify(merged)); } catch { /* */ }
    return merged;
  }

  // サーバーが空ならローカルを返す（初回同期はsaveMoodRecord経由で行われる）
  return localRecords;
}

/**
 * 3次元条件パターン: (曜日, 天気) → 統計
 */
export interface ConditionPattern {
  dayOfWeek: number;
  weatherIcon: string;
  avgSatisfaction: number;
  avgFormality: number;
  avgBrightness: number;
  count: number;
  dominantTags: string[];      // 最頻出タグ
}

export function build3DPatterns(records: MoodRecord[]): ConditionPattern[] {
  const key = (dow: number, w: string) => `${dow}:${w}`;
  const map = new Map<string, {
    sats: number[]; forms: number[]; brights: number[];
    tagCounts: Map<string, number>; dow: number; weather: string;
  }>();

  for (const r of records) {
    const k = key(r.dayOfWeek, r.weatherIcon);
    if (!map.has(k)) {
      map.set(k, { sats: [], forms: [], brights: [], tagCounts: new Map(), dow: r.dayOfWeek, weather: r.weatherIcon });
    }
    const m = map.get(k)!;
    m.sats.push(r.satisfaction);
    m.forms.push(r.formalityLevel);
    m.brights.push(r.colorBrightness);
    for (const tag of r.tags) {
      m.tagCounts.set(tag, (m.tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const patterns: ConditionPattern[] = [];
  for (const [, m] of map) {
    if (m.sats.length < 2) continue;
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const dominantTags = [...m.tagCounts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([tag]) => tag);

    patterns.push({
      dayOfWeek: m.dow,
      weatherIcon: m.weather,
      avgSatisfaction: Math.round(avg(m.sats) * 10) / 10,
      avgFormality: Math.round(avg(m.forms) * 100) / 100,
      avgBrightness: Math.round(avg(m.brights) * 100) / 100,
      count: m.sats.length,
      dominantTags,
    });
  }

  return patterns.sort((a, b) => b.count - a.count);
}

/**
 * 今日の条件(曜日, 天気)に基づくスタイル推奨
 */
export interface ConditionStyleHint {
  suggestedFormality: "casual" | "smart" | "dress" | null;
  suggestedBrightness: "light" | "dark" | null;    // 明るい色 vs 暗い色
  avoidTags: string[];                              // 「寒かった」が多い → 厚めに
  confidence: number;                               // 0-1
  reason: string;
}

export function getConditionStyleHint(
  dayOfWeek: number,
  weatherIcon: string,
): ConditionStyleHint {
  const records = loadMoodRecords();
  const patterns = build3DPatterns(records);

  // 完全一致
  const exact = patterns.find(p => p.dayOfWeek === dayOfWeek && p.weatherIcon === weatherIcon);
  // 天気のみ一致
  const weatherOnly = patterns.filter(p => p.weatherIcon === weatherIcon);
  // 曜日のみ一致
  const dowOnly = patterns.filter(p => p.dayOfWeek === dayOfWeek);

  const source = exact ?? (weatherOnly.length > 0
    ? mergePatterns(weatherOnly)
    : dowOnly.length > 0 ? mergePatterns(dowOnly) : null);

  if (!source || source.count < 3) {
    return { suggestedFormality: null, suggestedBrightness: null, avoidTags: [], confidence: 0, reason: "" };
  }

  // フォーマリティ推奨
  let suggestedFormality: "casual" | "smart" | "dress" | null = null;
  if (source.avgFormality >= 1.5) suggestedFormality = "dress";
  else if (source.avgFormality >= 0.7) suggestedFormality = "smart";
  else suggestedFormality = "casual";

  // 明度推奨
  let suggestedBrightness: "light" | "dark" | null = null;
  if (source.avgBrightness >= 0.6) suggestedBrightness = "light";
  else if (source.avgBrightness <= 0.35) suggestedBrightness = "dark";

  // 回避タグ (低満足度と相関するタグ)
  const avoidTags = source.dominantTags.filter(t =>
    t === "寒かった" || t === "暑かった" || t === "動きにくかった"
  );

  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  const weatherNames: Record<string, string> = { sun: "晴れ", cloud: "曇り", rain: "雨", snow: "雪" };
  const confidence = Math.min(1, source.count / 10);

  const parts: string[] = [];
  if (exact) {
    parts.push(`${dayNames[dayOfWeek]}曜×${weatherNames[weatherIcon] ?? weatherIcon}の過去${source.count}回の傾向から`);
  }
  if (suggestedFormality) {
    parts.push(`${suggestedFormality === "dress" ? "きれいめ" : suggestedFormality === "smart" ? "スマート" : "カジュアル"}が満足度高め`);
  }
  if (avoidTags.includes("寒かった")) parts.push("厚着めが安心");
  if (avoidTags.includes("暑かった")) parts.push("薄着めが快適");

  return {
    suggestedFormality,
    suggestedBrightness,
    avoidTags,
    confidence,
    reason: parts.join("。"),
  };
}

/* ── 2. 着用サイクル最適化 ── */

export interface ItemRotationProfile {
  itemId: string;
  avgInterval: number;                    // 平均着用間隔（日数）
  optimalInterval: number;                // 最適間隔（満足度最大化）
  currentDaysSinceWorn: number;
  rotationScore: number;                  // -10 ~ +10 (今着るべきか)
  status: "overdue" | "optimal" | "too_soon" | "never_worn";
}

export function computeRotationProfiles(
  wornHistory: WornRecord[],
  wardrobeItems: WardrobeItem[],
): ItemRotationProfile[] {
  // アイテムごとの着用日リスト
  const itemDates = new Map<string, Array<{ date: string; satisfaction: number }>>();

  for (const record of wornHistory) {
    for (const id of record.itemIds) {
      if (!itemDates.has(id)) itemDates.set(id, []);
      itemDates.get(id)!.push({ date: record.date, satisfaction: record.satisfaction });
    }
  }

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const profiles: ItemRotationProfile[] = [];

  for (const item of wardrobeItems) {
    const dates = itemDates.get(item.id);

    if (!dates || dates.length === 0) {
      profiles.push({
        itemId: item.id,
        avgInterval: 0,
        optimalInterval: 14,
        currentDaysSinceWorn: 999,
        rotationScore: 5,    // 未着用 → やや着るべき
        status: "never_worn",
      });
      continue;
    }

    // 日付順にソート
    const sorted = [...dates].sort((a, b) => a.date.localeCompare(b.date));

    // 間隔を計算
    const intervals: Array<{ days: number; satisfaction: number }> = [];
    for (let i = 1; i < sorted.length; i++) {
      const d1 = new Date(sorted[i - 1].date);
      const d2 = new Date(sorted[i].date);
      const days = Math.round((d2.getTime() - d1.getTime()) / (24 * 60 * 60 * 1000));
      intervals.push({ days, satisfaction: sorted[i].satisfaction });
    }

    const avgInterval = intervals.length > 0
      ? Math.round(intervals.reduce((sum, i) => sum + i.days, 0) / intervals.length)
      : 14;

    // 最適間隔: 満足度が高かった着用間隔を重み付き平均
    let optimalInterval = avgInterval;
    if (intervals.length >= 3) {
      const highSatIntervals = intervals.filter(i => i.satisfaction >= 4);
      if (highSatIntervals.length >= 2) {
        optimalInterval = Math.round(
          highSatIntervals.reduce((sum, i) => sum + i.days, 0) / highSatIntervals.length
        );
      }
    }
    optimalInterval = Math.max(3, Math.min(30, optimalInterval));

    // 最終着用日からの経過日数
    const lastWorn = sorted[sorted.length - 1].date;
    const daysSince = Math.round((today.getTime() - new Date(lastWorn).getTime()) / (24 * 60 * 60 * 1000));

    // ローテーションスコア
    let rotationScore = 0;
    const ratio = daysSince / optimalInterval;
    if (ratio >= 2.0) {
      rotationScore = 8;    // かなり未着用 → 強く推奨
    } else if (ratio >= 1.2) {
      rotationScore = 5;    // やや期間超過
    } else if (ratio >= 0.8) {
      rotationScore = 2;    // ちょうどいいタイミング
    } else if (ratio >= 0.5) {
      rotationScore = 0;    // まだ早め
    } else {
      rotationScore = -5;   // 最近着た → 控えめに
    }

    const status: ItemRotationProfile["status"] =
      ratio >= 1.5 ? "overdue" :
      ratio >= 0.7 ? "optimal" : "too_soon";

    profiles.push({
      itemId: item.id,
      avgInterval,
      optimalInterval,
      currentDaysSinceWorn: daysSince,
      rotationScore,
      status,
    });
  }

  return profiles;
}

/**
 * ローテーションスコアに基づくアイテムスコア補正
 */
export function rotationBoost(
  wornHistory: WornRecord[],
  wardrobeItems: WardrobeItem[],
  itemId: string,
): number {
  const profiles = computeRotationProfiles(wornHistory, wardrobeItems);
  const profile = profiles.find(p => p.itemId === itemId);
  if (!profile) return 0;
  return profile.rotationScore;
}

/* ── 3. 季節ごとの個人スタイルシフト ── */

export interface SeasonalStyleProfile {
  season: "spring" | "summer" | "autumn" | "winter";
  avgFormality: number;
  avgBrightness: number;
  avgSatisfaction: number;
  dominantSilhouette: string | null;
  count: number;
}

export function computeSeasonalStyleProfiles(wornHistory: WornRecord[], wardrobeItems: WardrobeItem[]): SeasonalStyleProfile[] {
  const itemMap = new Map(wardrobeItems.map(i => [i.id, i]));
  const seasonData = new Map<string, {
    forms: number[]; brights: number[]; sats: number[];
    silhouettes: Map<string, number>;
  }>();

  for (const season of ["spring", "summer", "autumn", "winter"]) {
    seasonData.set(season, { forms: [], brights: [], sats: [], silhouettes: new Map() });
  }

  for (const record of wornHistory) {
    const month = parseInt(record.date.split("-")[1], 10);
    const season = month >= 3 && month <= 5 ? "spring"
      : month >= 6 && month <= 8 ? "summer"
      : month >= 9 && month <= 11 ? "autumn"
      : "winter";

    const data = seasonData.get(season)!;
    data.sats.push(record.satisfaction);

    const items = record.itemIds.map(id => itemMap.get(id)).filter(Boolean) as WardrobeItem[];
    const fOrder: Record<string, number> = { casual: 0, smart: 1, dress: 2 };

    for (const item of items) {
      data.forms.push(fOrder[item.formality ?? "casual"] ?? 0);

      // 明度推定
      const hex = item.colorHex || item.color;
      if (hex) {
        const l = hexToLightness(hex);
        if (l !== null) data.brights.push(l);
      }

      if (item.silhouette) {
        data.silhouettes.set(item.silhouette, (data.silhouettes.get(item.silhouette) ?? 0) + 1);
      }
    }
  }

  const profiles: SeasonalStyleProfile[] = [];
  for (const [season, data] of seasonData) {
    if (data.sats.length < 3) continue;
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0.5;
    let dominantSilhouette: string | null = null;
    let maxSil = 0;
    for (const [sil, count] of data.silhouettes) {
      if (count > maxSil) { dominantSilhouette = sil; maxSil = count; }
    }

    profiles.push({
      season: season as SeasonalStyleProfile["season"],
      avgFormality: Math.round(avg(data.forms) * 100) / 100,
      avgBrightness: Math.round(avg(data.brights) * 100) / 100,
      avgSatisfaction: Math.round(avg(data.sats) * 10) / 10,
      dominantSilhouette,
      count: data.sats.length,
    });
  }

  return profiles;
}

/**
 * 現在の季節の個人スタイル傾向に基づくスコア補正
 */
export function seasonalPersonalBoost(
  wornHistory: WornRecord[],
  wardrobeItems: WardrobeItem[],
  item: WardrobeItem,
): number {
  const profiles = computeSeasonalStyleProfiles(wornHistory, wardrobeItems);
  const month = new Date().getMonth() + 1;
  const currentSeason = month >= 3 && month <= 5 ? "spring"
    : month >= 6 && month <= 8 ? "summer"
    : month >= 9 && month <= 11 ? "autumn"
    : "winter";

  const profile = profiles.find(p => p.season === currentSeason);
  if (!profile || profile.count < 5) return 0;

  let boost = 0;
  const fOrder: Record<string, number> = { casual: 0, smart: 1, dress: 2 };

  // フォーマリティ一致
  const itemF = fOrder[item.formality ?? "casual"] ?? 0;
  const diff = Math.abs(itemF - profile.avgFormality);
  if (diff <= 0.3) boost += 3;
  else if (diff >= 1.0) boost -= 3;

  // シルエット一致
  if (profile.dominantSilhouette && item.silhouette === profile.dominantSilhouette) {
    boost += 2;
  }

  return boost;
}

/**
 * 季節スタイル変化のナラティブ生成
 */
export function describeSeasonalShift(
  wornHistory: WornRecord[],
  wardrobeItems: WardrobeItem[],
): string | null {
  const profiles = computeSeasonalStyleProfiles(wornHistory, wardrobeItems);
  if (profiles.length < 2) return null;

  const month = new Date().getMonth() + 1;
  const currentSeason = month >= 3 && month <= 5 ? "spring"
    : month >= 6 && month <= 8 ? "summer"
    : month >= 9 && month <= 11 ? "autumn"
    : "winter";

  const prevSeasonMap: Record<string, string> = {
    spring: "winter", summer: "spring", autumn: "summer", winter: "autumn",
  };
  const current = profiles.find(p => p.season === currentSeason);
  const prev = profiles.find(p => p.season === prevSeasonMap[currentSeason]);

  if (!current || !prev) return null;

  const parts: string[] = [];
  const seasonNames: Record<string, string> = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };

  const fDiff = current.avgFormality - prev.avgFormality;
  if (fDiff >= 0.3) parts.push(`${seasonNames[currentSeason]}はきれいめ寄りに`);
  else if (fDiff <= -0.3) parts.push(`${seasonNames[currentSeason]}はカジュアル寄りに`);

  const bDiff = current.avgBrightness - prev.avgBrightness;
  if (bDiff >= 0.1) parts.push("明るい色を多用する傾向");
  else if (bDiff <= -0.1) parts.push("落ち着いた色合いにシフト");

  if (current.dominantSilhouette && current.dominantSilhouette !== prev.dominantSilhouette) {
    const silNames: Record<string, string> = {
      tight: "タイト", slim: "スリム", regular: "レギュラー", relaxed: "リラックス", oversized: "オーバーサイズ",
    };
    parts.push(`${silNames[current.dominantSilhouette] ?? current.dominantSilhouette}シルエットが中心`);
  }

  if (parts.length === 0) return null;
  return `あなたの${seasonNames[currentSeason]}の傾向: ${parts.join("、")}`;
}

/* ── ヘルパー ── */
function mergePatterns(patterns: ConditionPattern[]): ConditionPattern {
  const all = {
    dayOfWeek: patterns[0].dayOfWeek,
    weatherIcon: patterns[0].weatherIcon,
    avgSatisfaction: 0,
    avgFormality: 0,
    avgBrightness: 0,
    count: 0,
    dominantTags: [] as string[],
  };
  let totalWeight = 0;
  const tagCounts = new Map<string, number>();

  for (const p of patterns) {
    all.avgSatisfaction += p.avgSatisfaction * p.count;
    all.avgFormality += p.avgFormality * p.count;
    all.avgBrightness += p.avgBrightness * p.count;
    all.count += p.count;
    totalWeight += p.count;
    for (const tag of p.dominantTags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  if (totalWeight > 0) {
    all.avgSatisfaction /= totalWeight;
    all.avgFormality /= totalWeight;
    all.avgBrightness /= totalWeight;
  }

  all.dominantTags = [...tagCounts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  return all;
}

function hexToLightness(hex: string): number | null {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}
