/**
 * Monthly Evolution Report Engine
 * 月末 or 30日蓄積時に「今月どう変わったか」を返すレポート。
 * 数字だけで終わらせない。変化が見えること。
 */

import type { DailyOrbitStore, CompletionTexture, OrbitLaw } from "./types";
import { TEXTURE_META } from "./types";
import type { GeneratedLaw } from "./behavioralLawEngine";

export type MonthlyEvolution = {
  month: string; // "2026-03"
  monthLabel: string; // "3月"
  /** 基本数値 */
  stats: {
    activeDays: number;
    totalTasks: number;
    completedTasks: number;
    completionRate: number;
    journalEntries: number;
  };
  /** テクスチャ変化 */
  textureShift: {
    dominant: CompletionTexture | null;
    dominantPct: number;
    /** 前半/後半の変化 */
    firstHalfDominant: CompletionTexture | null;
    secondHalfDominant: CompletionTexture | null;
    shiftNarrative: string | null;
  };
  /** 新しく見えた法則 */
  newLaws: GeneratedLaw[];
  /** 感情傾向 */
  emotionTrend: { tag: string; count: number }[];
  /** ナラティブ行（2〜4行） */
  narrativeLines: string[];
  /** 来月への一言 */
  nextMonthHint: string;
  /** データが十分か */
  isRich: boolean;
};

const MONTH_NAMES = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

/**
 * 月次レポートを生成。
 * @param monthKey "YYYY-MM" 形式
 * @param journalEmotionTags 月内のjournal感情タグ群
 * @param newLaws 今月発見された法則
 */
export function generateMonthlyEvolution(
  store: DailyOrbitStore,
  monthKey: string,
  journalEmotionTags: string[][] = [],
  newLaws: GeneratedLaw[] = [],
): MonthlyEvolution | null {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = parseInt(yearStr);
  const month = parseInt(monthStr) - 1;

  const entries = Object.values(store.entries).filter((e) => {
    const d = new Date(e.date + "T00:00:00");
    return d.getFullYear() === year && d.getMonth() === month;
  }).sort((a, b) => a.date.localeCompare(b.date));

  if (entries.length < 5) return null; // 最低5日必要

  // ── 基本数値 ──
  let totalTasks = 0, completedTasks = 0;
  for (const e of entries) {
    totalTasks += e.tasks.length;
    completedTasks += e.tasks.filter((t) => t.completed).length;
  }
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // ── テクスチャ分析 ──
  const textureCounts: Record<CompletionTexture, number> = { satisfying: 0, relieved: 0, just_done: 0 };
  const firstHalf: Record<CompletionTexture, number> = { satisfying: 0, relieved: 0, just_done: 0 };
  const secondHalf: Record<CompletionTexture, number> = { satisfying: 0, relieved: 0, just_done: 0 };
  const midDate = new Date(year, month, 16).toISOString().slice(0, 10);

  for (const e of entries) {
    const isFirst = e.date < midDate;
    for (const t of e.tasks) {
      if (t.texture) {
        textureCounts[t.texture]++;
        if (isFirst) firstHalf[t.texture]++;
        else secondHalf[t.texture]++;
      }
    }
  }

  const totalTex = textureCounts.satisfying + textureCounts.relieved + textureCounts.just_done;
  const dominant = totalTex > 0
    ? (Object.entries(textureCounts) as [CompletionTexture, number][]).sort((a, b) => b[1] - a[1])[0]
    : null;

  const firstTotal = firstHalf.satisfying + firstHalf.relieved + firstHalf.just_done;
  const secondTotal = secondHalf.satisfying + secondHalf.relieved + secondHalf.just_done;
  const firstDominant = firstTotal > 0
    ? (Object.entries(firstHalf) as [CompletionTexture, number][]).sort((a, b) => b[1] - a[1])[0][0]
    : null;
  const secondDominant = secondTotal > 0
    ? (Object.entries(secondHalf) as [CompletionTexture, number][]).sort((a, b) => b[1] - a[1])[0][0]
    : null;

  let shiftNarrative: string | null = null;
  if (firstDominant && secondDominant && firstDominant !== secondDominant && firstTotal >= 3 && secondTotal >= 3) {
    shiftNarrative = `月前半は「${TEXTURE_META[firstDominant].label}」、後半は「${TEXTURE_META[secondDominant].label}」が中心に。完了の質が変わっています`;
  }

  // ── 感情傾向 ──
  const emotionCounts: Record<string, number> = {};
  for (const tags of journalEmotionTags) {
    for (const tag of tags) {
      emotionCounts[tag] = (emotionCounts[tag] ?? 0) + 1;
    }
  }
  const emotionTrend = Object.entries(emotionCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));

  // ── ナラティブ ──
  const narrativeLines: string[] = [];
  const isRich = entries.length >= 14;

  if (entries.length >= 20) {
    narrativeLines.push(`${entries.length}日間、ほぼ毎日記録を続けました`);
  } else if (entries.length >= 10) {
    narrativeLines.push(`${entries.length}日間の記録。着実にプロフィールが見えてきています`);
  } else {
    narrativeLines.push(`${entries.length}日間の記録から、最初の傾向が見え始めています`);
  }

  if (completionRate >= 75) {
    narrativeLines.push("やると決めたことの大半をやり遂げた月でした");
  } else if (completionRate >= 50) {
    narrativeLines.push("バランスを取りながら進めた月。無理のないペースです");
  } else if (completionRate > 0) {
    narrativeLines.push("タスクの完了率は控えめ。日々の流れを優先していたのかもしれません");
  }

  if (shiftNarrative) {
    narrativeLines.push(shiftNarrative);
  }

  if (newLaws.length > 0) {
    narrativeLines.push(`新しい法則が${newLaws.length}つ見つかりました。あなたの取扱説明書が厚くなりました`);
  }

  if (emotionTrend.length > 0) {
    const topEmotion = emotionTrend[0];
    if (topEmotion.count >= 5) {
      narrativeLines.push(`「${topEmotion.tag}」が${topEmotion.count}回。今月を貫くキーワードかもしれません`);
    }
  }

  // ── 来月への一言 ──
  let nextMonthHint = "来月も、あなたのペースで続けてください";
  if (completionRate >= 75 && dominant && dominant[0] === "satisfying") {
    nextMonthHint = "この調子を自然に保てるといいですね。無理せず、でも手を抜かず";
  } else if (newLaws.length > 0) {
    nextMonthHint = "見つかった法則が来月も成り立つか、一緒に観察しましょう";
  } else if (entries.length < 14) {
    nextMonthHint = "もう少しデータが集まると、より深い傾向が見えてきます";
  }

  return {
    month: monthKey,
    monthLabel: MONTH_NAMES[month],
    stats: {
      activeDays: entries.length,
      totalTasks,
      completedTasks,
      completionRate,
      journalEntries: journalEmotionTags.length,
    },
    textureShift: {
      dominant: dominant ? dominant[0] : null,
      dominantPct: dominant && totalTex > 0 ? Math.round((dominant[1] / totalTex) * 100) : 0,
      firstHalfDominant: firstDominant,
      secondHalfDominant: secondDominant,
      shiftNarrative,
    },
    newLaws,
    emotionTrend,
    narrativeLines: narrativeLines.slice(0, 4),
    nextMonthHint,
    isRich,
  };
}

/**
 * 月末レポートを表示すべきか判定。
 * 月の最終3日間 or 30日蓄積で表示。
 */
export function shouldShowMonthlyReport(store: DailyOrbitStore, today: string): string | null {
  const todayDate = new Date(today + "T00:00:00");
  const year = todayDate.getFullYear();
  const month = todayDate.getMonth();

  // 月の最終3日間かチェック
  const lastDay = new Date(year, month + 1, 0).getDate();
  const dayOfMonth = todayDate.getDate();
  const isMonthEnd = dayOfMonth >= lastDay - 2;

  if (!isMonthEnd) return null;

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  // 今月のエントリが5件以上あるか
  const entries = Object.values(store.entries).filter((e) => {
    const d = new Date(e.date + "T00:00:00");
    return d.getFullYear() === year && d.getMonth() === month;
  });

  if (entries.length < 5) return null;

  // 既にdismissされてないか
  if (typeof window !== "undefined") {
    try {
      const dismissed = localStorage.getItem(`origin_monthly_report_dismissed_${monthKey}`);
      if (dismissed) return null;
    } catch {}
  }

  return monthKey;
}

export function dismissMonthlyReport(monthKey: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(`origin_monthly_report_dismissed_${monthKey}`, "1"); } catch {}
}
