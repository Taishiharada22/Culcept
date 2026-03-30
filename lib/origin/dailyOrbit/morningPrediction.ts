/**
 * Morning Prediction Engine
 * 朝にOriginを開いた時、その日の傾向を短く返す。
 * 断定しすぎず、1〜3行程度。
 */

import type { DailyOrbitStore, DailyOrbitEntry, CompletionTexture } from "./types";
import { TEXTURE_META } from "./types";

export type MorningPrediction = {
  lines: string[];
  /** データ根拠の強さ: "light" = 2週未満, "personal" = 2週以上 */
  depth: "light" | "personal";
  /** 生成日 */
  date: string;
};

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function getRecentEntries(store: DailyOrbitStore, today: string, days: number): DailyOrbitEntry[] {
  const entries: DailyOrbitEntry[] = [];
  const start = new Date(today + "T00:00:00");
  for (let i = 1; i <= days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (store.entries[key]) entries.push(store.entries[key]);
  }
  return entries;
}

/**
 * 朝の予測を生成。
 * 午前中（5:00-12:00）のみ表示想定。午後は null を返す。
 */
export function generateMorningPrediction(
  store: DailyOrbitStore,
  today: string,
  innerWeatherLabel?: string | null,
): MorningPrediction | null {
  const hour = new Date().getHours();
  if (hour < 5 || hour >= 12) return null;

  const entries = getRecentEntries(store, today, 30);
  if (entries.length < 2) return null;

  const isPersonal = entries.length >= 14;
  const lines: string[] = [];
  const todayDow = new Date(today + "T00:00:00").getDay();
  const todayDowLabel = DAY_LABELS[todayDow];

  // ── 曜日パターン（2週以上） ──
  if (isPersonal) {
    const sameDowEntries = entries.filter((e) => new Date(e.date + "T00:00:00").getDay() === todayDow);
    if (sameDowEntries.length >= 2) {
      const rates = sameDowEntries
        .filter((e) => e.tasks.length > 0)
        .map((e) => e.tasks.filter((t) => t.completed).length / e.tasks.length);
      if (rates.length >= 2) {
        const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
        if (avgRate >= 0.75) {
          lines.push(`${todayDowLabel}曜日は完了率が高めの傾向があります`);
        } else if (avgRate <= 0.4) {
          lines.push(`${todayDowLabel}曜日はゆっくりペースになりがちです`);
        }
      }

      // 曜日別テクスチャ傾向
      const textures: Record<CompletionTexture, number> = { satisfying: 0, relieved: 0, just_done: 0 };
      let texTotal = 0;
      for (const e of sameDowEntries) {
        for (const t of e.tasks) {
          if (t.texture) { textures[t.texture]++; texTotal++; }
        }
      }
      if (texTotal >= 3) {
        const dominant = (Object.entries(textures) as [CompletionTexture, number][]).sort((a, b) => b[1] - a[1])[0];
        const pct = Math.round((dominant[1] / texTotal) * 100);
        if (pct >= 60) {
          lines.push(`最近の${todayDowLabel}曜日は「${TEXTURE_META[dominant[0]].label}」で終わることが多いです`);
        }
      }
    }
  }

  // ── 直近のテクスチャ傾向（軽量版: 3日以上） ──
  if (lines.length === 0 && entries.length >= 3) {
    const recent3 = entries.slice(0, 3);
    const textures: Record<CompletionTexture, number> = { satisfying: 0, relieved: 0, just_done: 0 };
    let texTotal = 0;
    for (const e of recent3) {
      for (const t of e.tasks) {
        if (t.texture) { textures[t.texture]++; texTotal++; }
      }
    }
    if (texTotal >= 3) {
      const dominant = (Object.entries(textures) as [CompletionTexture, number][]).sort((a, b) => b[1] - a[1])[0];
      const pct = Math.round((dominant[1] / texTotal) * 100);
      if (pct >= 60) {
        lines.push(`ここ数日、「${TEXTURE_META[dominant[0]].label}」で終われるタスクが増えています`);
      }
    }
  }

  // ── 午前/午後の傾向（2週以上） ──
  if (isPersonal && lines.length < 2) {
    const morningCompleted: number[] = [];
    const afternoonCompleted: number[] = [];
    for (const e of entries) {
      let am = 0, pm = 0, amTotal = 0, pmTotal = 0;
      for (const t of e.tasks) {
        if (!t.addedAt) continue;
        const h = new Date(t.addedAt).getHours();
        if (h < 12) { amTotal++; if (t.completed) am++; }
        else { pmTotal++; if (t.completed) pm++; }
      }
      if (amTotal >= 1) morningCompleted.push(am / amTotal);
      if (pmTotal >= 1) afternoonCompleted.push(pm / pmTotal);
    }
    const amAvg = morningCompleted.length > 0 ? morningCompleted.reduce((a, b) => a + b, 0) / morningCompleted.length : 0;
    const pmAvg = afternoonCompleted.length > 0 ? afternoonCompleted.reduce((a, b) => a + b, 0) / afternoonCompleted.length : 0;
    if (amAvg > pmAvg + 0.15 && morningCompleted.length >= 5) {
      lines.push("午前中に動ける傾向があります");
    } else if (pmAvg > amAvg + 0.15 && afternoonCompleted.length >= 5) {
      lines.push("午後から調子が上がる傾向があります");
    }
  }

  // ── 連続記録のモメンタム ──
  if (store.currentStreak >= 3 && lines.length < 3) {
    lines.push(`${store.currentStreak}日連続で記録中。リズムができています`);
  }

  // ── Inner Weather 参照 ──
  if (innerWeatherLabel && lines.length < 3) {
    // Inner Weather は表示するだけ（予測テキストには含めない）
    // TodoSection 側でInner Weatherは既に表示されているため、ここでは重複しない
  }

  // ── 直近の完了率の変化 ──
  if (entries.length >= 5 && lines.length < 2) {
    const recent3 = entries.slice(0, 3).filter((e) => e.tasks.length > 0);
    const older3 = entries.slice(3, 6).filter((e) => e.tasks.length > 0);
    if (recent3.length >= 2 && older3.length >= 2) {
      const recentRate = recent3.reduce((s, e) => s + e.tasks.filter((t) => t.completed).length / e.tasks.length, 0) / recent3.length;
      const olderRate = older3.reduce((s, e) => s + e.tasks.filter((t) => t.completed).length / e.tasks.length, 0) / older3.length;
      if (recentRate > olderRate + 0.15) {
        lines.push("直近の完了率が上がってきています");
      } else if (recentRate < olderRate - 0.15) {
        lines.push("ここ数日はペースがゆっくりめ。無理しない日にしても大丈夫です");
      }
    }
  }

  if (lines.length === 0) return null;

  return {
    lines: lines.slice(0, 3),
    depth: isPersonal ? "personal" : "light",
    date: today,
  };
}
