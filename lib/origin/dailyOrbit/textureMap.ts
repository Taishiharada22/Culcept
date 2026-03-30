/**
 * Texture Map Engine
 * 完了テクスチャを週単位で可視化。
 * 曜日との関係が見え、軽い洞察に接続できる構造。
 */

import type { DailyOrbitStore, CompletionTexture } from "./types";
import { TEXTURE_META } from "./types";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export type TextureDay = {
  date: string;
  dow: number; // 0=Sun
  dowLabel: string;
  satisfying: number;
  relieved: number;
  just_done: number;
  total: number;
};

export type TextureWeek = {
  label: string; // "3/24 – 3/30"
  start: string;
  end: string;
  days: TextureDay[];
  totalTasks: number;
  dominantTexture: CompletionTexture | null;
  /** 先週との比較洞察（あれば） */
  insight: string | null;
};

export type TextureMapData = {
  weeks: TextureWeek[];
  /** 曜日別の傾向（全期間） */
  dowTrend: {
    dow: number;
    dowLabel: string;
    dominant: CompletionTexture | null;
    dominantPct: number;
    total: number;
  }[];
  /** グローバル洞察 */
  globalInsight: string | null;
};

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeWeek(store: DailyOrbitStore, mondayDate: Date): TextureWeek {
  const days: TextureDay[] = [];
  let totalTasks = 0;
  const textureSums: Record<CompletionTexture, number> = { satisfying: 0, relieved: 0, just_done: 0 };

  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayDate);
    d.setDate(mondayDate.getDate() + i);
    const key = fmt(d);
    const entry = store.entries[key];
    const day: TextureDay = {
      date: key,
      dow: d.getDay(),
      dowLabel: DAY_LABELS[d.getDay()],
      satisfying: 0,
      relieved: 0,
      just_done: 0,
      total: 0,
    };
    if (entry) {
      for (const t of entry.tasks) {
        if (t.completed && t.texture) {
          day[t.texture]++;
          textureSums[t.texture]++;
          day.total++;
          totalTasks++;
        }
      }
    }
    days.push(day);
  }

  const sundayDate = new Date(mondayDate);
  sundayDate.setDate(mondayDate.getDate() + 6);
  const label = `${mondayDate.getMonth() + 1}/${mondayDate.getDate()} – ${sundayDate.getMonth() + 1}/${sundayDate.getDate()}`;

  const dominant = totalTasks > 0
    ? (Object.entries(textureSums) as [CompletionTexture, number][]).sort((a, b) => b[1] - a[1])[0]
    : null;

  return {
    label,
    start: fmt(mondayDate),
    end: fmt(sundayDate),
    days,
    totalTasks,
    dominantTexture: dominant && dominant[1] > 0 ? dominant[0] : null,
    insight: null,
  };
}

/**
 * 直近4週分のテクスチャマップを生成。
 */
export function generateTextureMap(store: DailyOrbitStore, today: string): TextureMapData | null {
  const todayDate = new Date(today + "T00:00:00");
  const thisMonday = getMonday(todayDate);

  const weeks: TextureWeek[] = [];
  for (let w = 0; w < 4; w++) {
    const monday = new Date(thisMonday);
    monday.setDate(thisMonday.getDate() - w * 7);
    const week = computeWeek(store, monday);
    if (week.totalTasks > 0) weeks.push(week);
  }

  if (weeks.length === 0) return null;

  // 週間比較洞察
  if (weeks.length >= 2) {
    const current = weeks[0];
    const prev = weeks[1];
    if (current.totalTasks >= 3 && prev.totalTasks >= 3) {
      if (current.dominantTexture && prev.dominantTexture && current.dominantTexture !== prev.dominantTexture) {
        current.insight = `先週の「${TEXTURE_META[prev.dominantTexture].label}」中心から、今週は「${TEXTURE_META[current.dominantTexture].label}」に変わりつつあります`;
      }
      // すっきり率の変化
      const currentSat = current.days.reduce((s, d) => s + d.satisfying, 0);
      const prevSat = prev.days.reduce((s, d) => s + d.satisfying, 0);
      const currentPct = current.totalTasks > 0 ? currentSat / current.totalTasks : 0;
      const prevPct = prev.totalTasks > 0 ? prevSat / prev.totalTasks : 0;
      if (!current.insight && currentPct > prevPct + 0.2) {
        current.insight = "「すっきり」で終われるタスクの割合が先週より増えています";
      } else if (!current.insight && currentPct < prevPct - 0.2) {
        current.insight = "今週は義務的に終えるタスクが多めかもしれません";
      }
    }
  }

  // 曜日別傾向
  const dowStats: Record<number, Record<CompletionTexture, number>> = {};
  for (let dow = 0; dow < 7; dow++) {
    dowStats[dow] = { satisfying: 0, relieved: 0, just_done: 0 };
  }
  for (const week of weeks) {
    for (const day of week.days) {
      dowStats[day.dow].satisfying += day.satisfying;
      dowStats[day.dow].relieved += day.relieved;
      dowStats[day.dow].just_done += day.just_done;
    }
  }

  const dowTrend = Object.entries(dowStats).map(([dow, counts]) => {
    const total = counts.satisfying + counts.relieved + counts.just_done;
    const dominant = total > 0
      ? (Object.entries(counts) as [CompletionTexture, number][]).sort((a, b) => b[1] - a[1])[0]
      : null;
    return {
      dow: parseInt(dow),
      dowLabel: DAY_LABELS[parseInt(dow)],
      dominant: dominant && dominant[1] > 0 ? dominant[0] : null,
      dominantPct: dominant && total > 0 ? Math.round((dominant[1] / total) * 100) : 0,
      total,
    };
  });

  // グローバル洞察
  let globalInsight: string | null = null;
  const satisfyingDows = dowTrend.filter((d) => d.dominant === "satisfying" && d.total >= 2);
  const justDoneDows = dowTrend.filter((d) => d.dominant === "just_done" && d.total >= 2);
  if (satisfyingDows.length >= 1 && justDoneDows.length >= 1) {
    globalInsight = `${satisfyingDows.map((d) => d.dowLabel).join("・")}曜日は手応えのある完了が多く、${justDoneDows.map((d) => d.dowLabel).join("・")}曜日は淡々とこなす日になりがちです`;
  }

  return { weeks: weeks.reverse(), dowTrend, globalInsight };
}
