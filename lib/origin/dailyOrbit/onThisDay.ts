/**
 * On This Day — 過去の今日
 * Day One の最強リテンション施策を Origin に。
 * 1ヶ月前、3ヶ月前、6ヶ月前、1年前のジャーナルを取得。
 */

export type OnThisDayEntry = {
  date: string;
  label: string; // 「1ヶ月前」「3ヶ月前」等
  daysAgo: number;
  title?: string;
  bodySnippet: string;
  emotionTags: string[];
  innerWeather?: { emoji?: string; label?: string } | null;
  photoUrl?: string | null;
  photoUrls?: string[] | null;
};

const LOOKBACK_PERIODS = [
  { months: 1, label: "1ヶ月前" },
  { months: 2, label: "2ヶ月前" },
  { months: 3, label: "3ヶ月前" },
  { months: 6, label: "半年前" },
  { months: 12, label: "1年前" },
  { months: 24, label: "2年前" },
];

function subtractMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

/**
 * 過去の今日に該当するジャーナルを取得
 */
export async function getOnThisDay(today: string): Promise<OnThisDayEntry[]> {
  const targetDates = LOOKBACK_PERIODS.map((p) => ({
    date: subtractMonths(today, p.months),
    label: p.label,
    months: p.months,
  }));

  const dateList = targetDates.map((d) => d.date).join(",");

  try {
    const res = await fetch(`/api/origin/journal?dates=${dateList}`);
    const data = await res.json();
    if (!data.ok || !data.entries) return [];

    const entries: OnThisDayEntry[] = [];
    for (const target of targetDates) {
      const match = data.entries.find(
        (e: { date: string }) => e.date === target.date,
      );
      if (match && (match.body || match.title)) {
        entries.push({
          date: match.date,
          label: target.label,
          daysAgo: target.months * 30,
          title: match.title || undefined,
          bodySnippet: (match.body || "").slice(0, 100),
          emotionTags: match.emotion_tags ?? [],
          innerWeather: match.inner_weather_ref,
          photoUrl: match.photo_url ?? null,
          photoUrls: match.photo_urls ?? null,
        });
      }
    }
    return entries;
  } catch {
    return [];
  }
}
