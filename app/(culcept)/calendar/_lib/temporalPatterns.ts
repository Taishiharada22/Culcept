/**
 * 時間的パターン認識エンジン
 *
 * 曜日別嗜好: 月曜はフォーマル寄り、金曜はカジュアルなど
 * イベント前パターン: デート前日は身だしなみ度UP、出張前は実用寄りなど
 * 時系列の満足度トレンド: 直近の好みシフトを検出
 */

import type { WornRecord, WeatherDaily } from "./types";
import { loadWornHistory } from "./rotationTracker";

/* ── 曜日別プロファイル ── */
export interface DayOfWeekProfile {
  dayOfWeek: number; // 0=Sun, 6=Sat
  avgSatisfaction: number;
  preferredFormality: "casual" | "smart" | "dress" | null;
  avgItemCount: number;
  sampleCount: number;
}

/* ── イベント前パターン ── */
export interface PreEventPattern {
  eventType: string;
  daysBefore: number; // 0=当日, 1=前日
  formalityShift: number; // -1 casual寄り, 0 normal, +1 formal寄り
  satisfactionDelta: number; // 普段比の満足度差
}

/* ── 時系列パターン ── */
export interface TemporalProfile {
  dayOfWeekProfiles: DayOfWeekProfile[];
  preEventPatterns: PreEventPattern[];
  recentTrendDirection: "improving" | "stable" | "declining";
  recentAvgSatisfaction: number;
  weekdayVsWeekend: { weekdayAvg: number; weekendAvg: number };
}

/* ── 曜日別集計 ── */
function buildDayOfWeekProfiles(
  history: WornRecord[],
  dayDataMap?: Map<string, { events?: Array<{ event_type: string }> }>,
): DayOfWeekProfile[] {
  const buckets: Array<{ totalSat: number; count: number; formalities: string[]; itemCounts: number[] }> = Array.from(
    { length: 7 },
    () => ({ totalSat: 0, count: 0, formalities: [], itemCounts: [] }),
  );

  for (const record of history) {
    if (!record.satisfaction) continue;
    const dow = new Date(record.date).getDay();
    const b = buckets[dow];
    b.totalSat += record.satisfaction;
    b.count += 1;
    b.itemCounts.push(record.itemIds.length);

    // フォーマリティはイベントから推定
    const dayInfo = dayDataMap?.get(record.date);
    if (dayInfo?.events && dayInfo.events.length > 0) {
      const formal = dayInfo.events.some(e => ["meeting", "party", "date"].includes(e.event_type));
      b.formalities.push(formal ? "smart" : "casual");
    }
  }

  return buckets.map((b, i) => {
    if (b.count === 0) {
      return { dayOfWeek: i, avgSatisfaction: 0, preferredFormality: null, avgItemCount: 0, sampleCount: 0 };
    }
    const formalCount = b.formalities.filter(f => f === "smart" || f === "dress").length;
    const casualCount = b.formalities.filter(f => f === "casual").length;
    return {
      dayOfWeek: i,
      avgSatisfaction: b.totalSat / b.count,
      preferredFormality: formalCount > casualCount * 1.5 ? "smart" as const
        : casualCount > formalCount * 1.5 ? "casual" as const : null,
      avgItemCount: b.itemCounts.reduce((a, c) => a + c, 0) / b.itemCounts.length,
      sampleCount: b.count,
    };
  });
}

/* ── イベント前日パターン検出 ── */
function detectPreEventPatterns(
  history: WornRecord[],
  dayDataMap?: Map<string, { events?: Array<{ event_type: string }> }>,
): PreEventPattern[] {
  if (!dayDataMap || history.length < 10) return [];

  const overall = history.filter(r => r.satisfaction).reduce((a, r) => a + r.satisfaction, 0) /
    Math.max(1, history.filter(r => r.satisfaction).length);

  const eventDayMap = new Map<string, string[]>();
  for (const [date, info] of dayDataMap) {
    if (info.events) {
      for (const e of info.events) {
        if (!eventDayMap.has(e.event_type)) eventDayMap.set(e.event_type, []);
        eventDayMap.get(e.event_type)!.push(date);
      }
    }
  }

  const patterns: PreEventPattern[] = [];

  for (const [eventType, dates] of eventDayMap) {
    if (dates.length < 2) continue;

    // 当日の満足度
    const eventDaySats: number[] = [];
    for (const d of dates) {
      const record = history.find(r => r.date === d && r.satisfaction);
      if (record) eventDaySats.push(record.satisfaction);
    }

    if (eventDaySats.length >= 2) {
      const avg = eventDaySats.reduce((a, b) => a + b, 0) / eventDaySats.length;
      if (Math.abs(avg - overall) >= 0.5) {
        patterns.push({
          eventType,
          daysBefore: 0,
          formalityShift: avg > overall ? 1 : -1,
          satisfactionDelta: avg - overall,
        });
      }
    }
  }

  return patterns;
}

/* ── 直近トレンド (14日 vs 過去全体) ── */
function detectRecentTrend(history: WornRecord[]): {
  direction: "improving" | "stable" | "declining";
  recentAvg: number;
} {
  const withSat = history.filter(r => r.satisfaction).sort((a, b) => a.date.localeCompare(b.date));
  if (withSat.length < 7) return { direction: "stable", recentAvg: 0 };

  const recentCount = Math.min(14, Math.floor(withSat.length / 2));
  const recent = withSat.slice(-recentCount);
  const older = withSat.slice(0, -recentCount);

  const recentAvg = recent.reduce((a, r) => a + r.satisfaction, 0) / recent.length;
  const olderAvg = older.reduce((a, r) => a + r.satisfaction, 0) / Math.max(1, older.length);

  const diff = recentAvg - olderAvg;
  return {
    direction: diff >= 0.3 ? "improving" : diff <= -0.3 ? "declining" : "stable",
    recentAvg,
  };
}

/* ── メイン: TemporalProfile 構築 ── */
export function buildTemporalProfile(
  wornHistory?: WornRecord[],
  dayDataMap?: Map<string, { events?: Array<{ event_type: string }> }>,
): TemporalProfile {
  const history = wornHistory ?? loadWornHistory();
  const withSat = history.filter(r => r.satisfaction);

  const dowProfiles = buildDayOfWeekProfiles(history, dayDataMap);
  const preEventPatterns = detectPreEventPatterns(history, dayDataMap);
  const trend = detectRecentTrend(history);

  // 平日 vs 週末
  const weekdaySats = withSat
    .filter(r => { const d = new Date(r.date).getDay(); return d >= 1 && d <= 5; })
    .map(r => r.satisfaction);
  const weekendSats = withSat
    .filter(r => { const d = new Date(r.date).getDay(); return d === 0 || d === 6; })
    .map(r => r.satisfaction);

  return {
    dayOfWeekProfiles: dowProfiles,
    preEventPatterns,
    recentTrendDirection: trend.direction,
    recentAvgSatisfaction: trend.recentAvg,
    weekdayVsWeekend: {
      weekdayAvg: weekdaySats.length > 0 ? weekdaySats.reduce((a, b) => a + b, 0) / weekdaySats.length : 0,
      weekendAvg: weekendSats.length > 0 ? weekendSats.reduce((a, b) => a + b, 0) / weekendSats.length : 0,
    },
  };
}

/* ── 曜日による SYNC 補正値 ── */
export function temporalFormalityHint(
  profile: TemporalProfile,
  dayOfWeek: number,
): { formalityBoost: number; reason: string | null } {
  const dowProfile = profile.dayOfWeekProfiles[dayOfWeek];
  if (!dowProfile || dowProfile.sampleCount < 3) return { formalityBoost: 0, reason: null };

  if (dowProfile.preferredFormality === "smart" || dowProfile.preferredFormality === "dress") {
    return {
      formalityBoost: 1,
      reason: `${["日", "月", "火", "水", "木", "金", "土"][dayOfWeek]}曜日はフォーマル寄りの傾向`,
    };
  }
  if (dowProfile.preferredFormality === "casual") {
    return {
      formalityBoost: -1,
      reason: `${["日", "月", "火", "水", "木", "金", "土"][dayOfWeek]}曜日はカジュアル傾向`,
    };
  }

  return { formalityBoost: 0, reason: null };
}
