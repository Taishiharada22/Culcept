// lib/aneurasync/crossSessionNarrative.ts
// セッション横断ナラティブエンジン
// 複数日の観測データからトレンド・パターン・回復を検出し、物語的洞察を生成する

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { TRAIT_AXES } from "@/lib/stargazer/traitAxes";
import type { MicroStargazerProgress } from "./microStargazer";

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */

export interface CrossSessionInsight {
  /** 表示テキスト */
  text: string;
  /** 検出タイプ */
  type:
    | "category_trend"     // カテゴリの連続低迷/好調
    | "axis_drift"         // Stargazer軸の方向変化
    | "recovery"           // 落ちてたけど回復
    | "volatility"         // 日によって大きくブレる
    | "emerging_pattern"   // 新しいパターンの出現
    | "stability";         // 長期安定
  /** 重要度 (0-1) */
  salience: number;
}

export interface PastObservationDay {
  date: string;
  answers: { theme: string; value: number }[];
}

/* ═══════════════════════════════════════════════
   カテゴリ名マップ
   ═══════════════════════════════════════════════ */

const CATEGORY_NAMES: Record<string, string> = {
  partner: "人との関わり",
  outfit: "見た目・コーデ",
  care: "自分のケア",
  preparation: "準備・段取り",
  impression: "印象・振り返り",
  mood: "気分",
  selfMatch: "自己一致感",
  interpersonal: "対人",
  date: "デート",
};

function getCategoryFromTheme(theme: string): string | null {
  if (theme.startsWith("cat_")) {
    // cat_partner_xxx → partner
    const parts = theme.slice(4).split("_");
    return parts[0] ?? null;
  }
  // Legacy themes
  if (theme === "mood" || theme === "selfMatch" || theme === "interpersonal" || theme === "date" || theme === "outfit") {
    return theme;
  }
  return null;
}

/* ═══════════════════════════════════════════════
   1. カテゴリ別トレンド検出
   直近N日間の同カテゴリスコアを集計し、連続パターンを検出
   ═══════════════════════════════════════════════ */

function detectCategoryTrends(
  recentDays: PastObservationDay[],
): CrossSessionInsight[] {
  if (recentDays.length < 3) return [];

  const insights: CrossSessionInsight[] = [];

  // カテゴリ別にスコアを日付順に収集
  const categoryScores = new Map<string, { date: string; score: number }[]>();

  for (const day of recentDays) {
    for (const answer of day.answers) {
      const cat = getCategoryFromTheme(answer.theme);
      if (!cat) continue;
      const existing = categoryScores.get(cat) ?? [];
      // 同じ日の同カテゴリは平均化
      const sameDayIdx = existing.findIndex((e) => e.date === day.date);
      if (sameDayIdx >= 0) {
        existing[sameDayIdx].score = (existing[sameDayIdx].score + answer.value) / 2;
      } else {
        existing.push({ date: day.date, score: answer.value });
      }
      categoryScores.set(cat, existing);
    }
  }

  for (const [cat, scores] of categoryScores) {
    if (scores.length < 3) continue;
    const recent3 = scores.slice(-3);
    const name = CATEGORY_NAMES[cat] ?? cat;

    // 連続低迷 (3日連続 ≤ 2)
    if (recent3.every((s) => s.score <= 2)) {
      insights.push({
        text: `「${name}」のスコアが3日連続で低い。ここが今、一番重い場所かもしれない。何か原因に心当たりはある？`,
        type: "category_trend",
        salience: 0.9,
      });
      continue;
    }

    // 連続好調 (3日連続 ≥ 4)
    if (recent3.every((s) => s.score >= 4)) {
      insights.push({
        text: `「${name}」が3日連続で高い。ここが今のあなたの安定域。この調子が続くなら、それはもう実力。`,
        type: "stability",
        salience: 0.5,
      });
      continue;
    }

    // 回復パターン (前半低→後半上昇)
    if (scores.length >= 4) {
      const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
      const secondHalf = scores.slice(Math.floor(scores.length / 2));
      const avgFirst = firstHalf.reduce((s, e) => s + e.score, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((s, e) => s + e.score, 0) / secondHalf.length;

      if (avgFirst <= 2.5 && avgSecond >= 3.5) {
        insights.push({
          text: `「${name}」が回復してきてる。前半は沈んでたけど、最近は持ち直してる。何が変わった？`,
          type: "recovery",
          salience: 0.75,
        });
        continue;
      }

      if (avgFirst >= 3.5 && avgSecond <= 2.5) {
        insights.push({
          text: `「${name}」が下がってきてる。前半は良かったのに、最近は重くなってる。心当たりは？`,
          type: "category_trend",
          salience: 0.85,
        });
        continue;
      }
    }

    // ボラティリティ (振れ幅が大きい)
    if (scores.length >= 3) {
      const vals = scores.map((s) => s.score);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      if (max - min >= 3) {
        insights.push({
          text: `「${name}」の振れ幅が大きい。日によって1→4のように変わってる。何がこの変動を生んでるんだろう。`,
          type: "volatility",
          salience: 0.7,
        });
      }
    }
  }

  // salience順にソート
  insights.sort((a, b) => b.salience - a.salience);
  return insights;
}

/* ═══════════════════════════════════════════════
   2. Stargazer軸ドリフト検出
   microProgressの軸スコアの推移を分析
   ═══════════════════════════════════════════════ */

function detectAxisDrift(
  microProgress: MicroStargazerProgress,
): CrossSessionInsight[] {
  const insights: CrossSessionInsight[] = [];

  for (const [axisId, progress] of Object.entries(microProgress.axes)) {
    if (!progress?.answers || progress.answers.length < 4) continue;

    const answers = progress.answers;
    const halfIdx = Math.floor(answers.length / 2);
    const firstHalf = answers.slice(0, halfIdx);
    const secondHalf = answers.slice(halfIdx);

    const avgFirst = firstHalf.reduce((s, a) => s + a.score, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, a) => s + a.score, 0) / secondHalf.length;
    const drift = avgSecond - avgFirst;

    if (Math.abs(drift) < 0.3) continue; // Not significant

    const axisDef = TRAIT_AXES.find((a) => a.id === axisId);
    if (!axisDef) continue;

    const direction = drift > 0 ? axisDef.labelRight : axisDef.labelLeft;
    const magnitude = Math.abs(drift) > 0.5 ? "はっきりと" : "少しずつ";

    insights.push({
      text: `「${axisDef.labelLeft}↔${axisDef.labelRight}」の軸が、${magnitude}「${direction}」の方向に動いてる。意識的？それとも自然に？`,
      type: "axis_drift",
      salience: Math.min(0.95, 0.5 + Math.abs(drift)),
    });
  }

  insights.sort((a, b) => b.salience - a.salience);
  return insights;
}

/* ═══════════════════════════════════════════════
   3. 全体的なスコアトレンド検出
   日ごとの平均スコアから全体の傾向を読む
   ═══════════════════════════════════════════════ */

function detectOverallTrend(
  recentDays: PastObservationDay[],
): CrossSessionInsight | null {
  if (recentDays.length < 4) return null;

  const dailyAvgs = recentDays.map((day) => {
    if (day.answers.length === 0) return 3;
    return day.answers.reduce((s, a) => s + a.value, 0) / day.answers.length;
  });

  // 直近3日 vs その前の平均
  const recent3 = dailyAvgs.slice(-3);
  const older = dailyAvgs.slice(0, -3);
  if (older.length === 0) return null;

  const avgRecent = recent3.reduce((s, v) => s + v, 0) / recent3.length;
  const avgOlder = older.reduce((s, v) => s + v, 0) / older.length;
  const diff = avgRecent - avgOlder;

  if (diff <= -0.8) {
    return {
      text: "全体的に、ここ数日で状態が落ちてきてる。少し自分を労る時間、取れてる？",
      type: "category_trend",
      salience: 0.85,
    };
  }

  if (diff >= 0.8) {
    return {
      text: "ここ数日、全体のスコアが上がってきてる。何かいい変化があったんだね。",
      type: "recovery",
      salience: 0.6,
    };
  }

  // 全日安定 (標準偏差が小さい)
  const mean = dailyAvgs.reduce((s, v) => s + v, 0) / dailyAvgs.length;
  const variance = dailyAvgs.reduce((s, v) => s + (v - mean) ** 2, 0) / dailyAvgs.length;
  if (variance < 0.15 && recentDays.length >= 5) {
    return {
      text: "ここ数日、スコアがとても安定してる。今のあなたは、いい意味で一定のリズムを掴んでるのかも。",
      type: "stability",
      salience: 0.4,
    };
  }

  return null;
}

/* ═══════════════════════════════════════════════
   4. 曜日パターン検出
   ═══════════════════════════════════════════════ */

function detectDayOfWeekPattern(
  recentDays: PastObservationDay[],
): CrossSessionInsight | null {
  if (recentDays.length < 7) return null;

  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  const dayScores = new Map<number, number[]>();

  for (const day of recentDays) {
    const dow = new Date(day.date).getDay();
    const avg = day.answers.length > 0
      ? day.answers.reduce((s, a) => s + a.value, 0) / day.answers.length
      : 3;
    const existing = dayScores.get(dow) ?? [];
    existing.push(avg);
    dayScores.set(dow, existing);
  }

  // Find the day with consistently lowest score (at least 2 data points)
  let worstDay = -1;
  let worstAvg = 5;
  let bestDay = -1;
  let bestAvg = 0;

  for (const [dow, scores] of dayScores) {
    if (scores.length < 2) continue;
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    if (avg < worstAvg) { worstAvg = avg; worstDay = dow; }
    if (avg > bestAvg) { bestAvg = avg; bestDay = dow; }
  }

  if (worstDay >= 0 && worstAvg <= 2.5 && bestDay >= 0 && bestAvg - worstAvg >= 1.0) {
    return {
      text: `${dayNames[worstDay]}曜日のスコアがいつも低い。${dayNames[bestDay]}曜日は高い。曜日で自分の状態が変わるパターン、見えてきた。`,
      type: "emerging_pattern",
      salience: 0.65,
    };
  }

  return null;
}

/* ═══════════════════════════════════════════════
   Public API
   ═══════════════════════════════════════════════ */

/**
 * セッション横断ナラティブを生成する。
 * 過去の観測データ + microProgress から最大3つのインサイトを返す。
 *
 * @param recentDays 直近の観測データ (7-14日分)
 * @param microProgress Stargazer micro の進捗
 * @returns 最も重要なインサイト (最大3件, salience順)
 */
export function generateCrossSessionNarrative(
  recentDays: PastObservationDay[],
  microProgress: MicroStargazerProgress,
): CrossSessionInsight[] {
  const allInsights: CrossSessionInsight[] = [];

  // 1. カテゴリ別トレンド
  allInsights.push(...detectCategoryTrends(recentDays));

  // 2. Stargazer軸ドリフト
  allInsights.push(...detectAxisDrift(microProgress));

  // 3. 全体トレンド
  const overall = detectOverallTrend(recentDays);
  if (overall) allInsights.push(overall);

  // 4. 曜日パターン
  const dayPattern = detectDayOfWeekPattern(recentDays);
  if (dayPattern) allInsights.push(dayPattern);

  // salience順でソート、上位3件を返す
  allInsights.sort((a, b) => b.salience - a.salience);
  return allInsights.slice(0, 3);
}

/**
 * 挨拶用の1行ナラティブを返す。
 * generateCrossSessionNarrative の最重要インサイトを短く要約。
 */
export function getCrossSessionGreetingLine(
  recentDays: PastObservationDay[],
  microProgress: MicroStargazerProgress,
): string | null {
  const insights = generateCrossSessionNarrative(recentDays, microProgress);
  if (insights.length === 0) return null;

  const top = insights[0];

  // 挨拶には短い版を返す（完了画面で詳細版を見せる）
  switch (top.type) {
    case "category_trend":
      return top.salience >= 0.8
        ? "最近の傾向、少し気になることがある。今日の観測でもう少し見てみる。"
        : "ここ数日の流れ、見えてきたものがある。";
    case "axis_drift":
      return "あなたの内面の地図が、少しずつ動いてる。今日はそれを確かめてみたい。";
    case "recovery":
      return "最近、回復の兆しが見える。今日もそれが続いてるか、見てみよう。";
    case "volatility":
      return "日によって揺れが大きいね。今日はどっち側にいるんだろう。";
    case "emerging_pattern":
      return "面白いパターンが見えてきた。今日の答えでもう少し確認したい。";
    case "stability":
      return "安定してるね。その安定が何に支えられてるか、少し掘ってみる。";
    default:
      return null;
  }
}
