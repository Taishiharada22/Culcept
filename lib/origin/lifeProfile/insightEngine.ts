// lib/origin/lifeProfile/insightEngine.ts
// #2 AIが先に語る — 蓄積データから毎日の「気づき」を生成
//
// ルールベースで驚きのある洞察を生成する。
// 将来的にはLLM APIと連携するが、まずはローカルロジックで
// 「予想外のつながり」を発見する。

import type { LifeProfileStore, LifeProfileEntry, LifeProfileCategory } from "./types";
import { CATEGORY_META } from "./types";
import { getTopViewedCategories, getDepthSkipRate } from "./passiveObserver";

export type DailyInsight = {
  id: string;
  type: "cross_connection" | "depth_nudge" | "pattern" | "absence" | "milestone";
  title: string;
  body: string;
  relatedEntryIds: string[];
  generatedAt: string;
};

/** 日付ベースのシード（同じ日に同じインサイト） */
function daySeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/** カテゴリ間の意外なつながりを発見 */
function findCrossConnections(entries: LifeProfileEntry[]): DailyInsight | null {
  if (entries.length < 3) return null;

  // 異なるカテゴリのエントリ間で、深掘り回答に共通キーワードを探す
  const withDepth = entries.filter((e) => e.depthResponses.length > 0);
  if (withDepth.length < 2) return null;

  for (let i = 0; i < withDepth.length - 1; i++) {
    for (let j = i + 1; j < withDepth.length; j++) {
      const a = withDepth[i];
      const b = withDepth[j];
      if (a.category === b.category) continue;

      const aWords = a.depthResponses.flatMap((r) => r.answer.split(/[\s、。！？,.\n]+/)).filter((w) => w.length >= 2);
      const bWords = b.depthResponses.flatMap((r) => r.answer.split(/[\s、。！？,.\n]+/)).filter((w) => w.length >= 2);
      const common = aWords.filter((w) => bWords.includes(w));

      if (common.length > 0) {
        const metaA = CATEGORY_META[a.category];
        const metaB = CATEGORY_META[b.category];
        return {
          id: `insight_cross_${daySeed()}`,
          type: "cross_connection",
          title: "意外なつながり",
          body: `「${a.title}」(${metaA.label})と「${b.title}」(${metaB.label})の間に、共通する想いが見えます。あなたの中で、これらは深いところで繋がっているのかもしれません。`,
          relatedEntryIds: [a.id, b.id],
          generatedAt: new Date().toISOString(),
        };
      }
    }
  }
  return null;
}

/** 深掘りが浅いエントリへのナッジ */
function findDepthNudge(entries: LifeProfileEntry[]): DailyInsight | null {
  const shallow = entries.filter(
    (e) => e.depthResponses.length === 0 && e.impact >= 3,
  );
  if (shallow.length === 0) return null;

  const seed = daySeed();
  const target = shallow[Math.floor(pseudoRandom(seed) * shallow.length)];
  const meta = CATEGORY_META[target.category];
  const nextQ = meta.depthQuestions[0];

  return {
    id: `insight_nudge_${seed}`,
    type: "depth_nudge",
    title: "もう少し深く",
    body: `「${target.title}」について、まだ深掘りされていません。${nextQ}`,
    relatedEntryIds: [target.id],
    generatedAt: new Date().toISOString(),
  };
}

/** 影響度のパターン発見 */
function findImpactPattern(entries: LifeProfileEntry[]): DailyInsight | null {
  if (entries.length < 4) return null;

  // 影響度5のエントリだけ抽出
  const highImpact = entries.filter((e) => e.impact >= 4);
  if (highImpact.length < 2) return null;

  // カテゴリの偏りを検出
  const catCounts: Partial<Record<LifeProfileCategory, number>> = {};
  for (const e of highImpact) {
    catCounts[e.category] = (catCounts[e.category] || 0) + 1;
  }
  const sorted = Object.entries(catCounts).sort(([, a], [, b]) => b - a);
  if (sorted.length > 0 && sorted[0][1] >= 2) {
    const topCat = sorted[0][0] as LifeProfileCategory;
    const meta = CATEGORY_META[topCat];
    return {
      id: `insight_pattern_${daySeed()}`,
      type: "pattern",
      title: "あなたの重心",
      body: `影響度の高い項目が「${meta.label}」に集中しています。あなたの人生で、${meta.label}が特に大きな意味を持っているようです。`,
      relatedEntryIds: highImpact.filter((e) => e.category === topCat).map((e) => e.id),
      generatedAt: new Date().toISOString(),
    };
  }
  return null;
}

/** 空のカテゴリへの好奇心的ナッジ */
function findAbsenceInsight(
  entries: LifeProfileEntry[],
): DailyInsight | null {
  const filledCats = new Set(entries.map((e) => e.category));
  const allCats = Object.keys(CATEGORY_META) as LifeProfileCategory[];
  const empty = allCats.filter((c) => !filledCats.has(c));
  if (empty.length === 0 || entries.length < 2) return null;

  const seed = daySeed();
  const target = empty[Math.floor(pseudoRandom(seed + 1) * empty.length)];
  const meta = CATEGORY_META[target];

  return {
    id: `insight_absence_${seed}`,
    type: "absence",
    title: "まだ語られていない領域",
    body: `「${meta.label}」には、まだ何も記録されていません。${meta.description} — ここにも、あなたを形作る何かがあるかもしれません。`,
    relatedEntryIds: [],
    generatedAt: new Date().toISOString(),
  };
}

/** マイルストーン検出 */
function findMilestone(entries: LifeProfileEntry[]): DailyInsight | null {
  const thresholds = [
    { count: 3, msg: "3つのプロフィールが見え始めました" },
    { count: 5, msg: "5つの側面。あなたの姿が浮かび上がってきています" },
    { count: 10, msg: "10の記録。分身はかなりあなたを理解し始めています" },
    { count: 20, msg: "20の記録。これはもう、あなたの人生の地図です" },
  ];

  for (const t of thresholds.reverse()) {
    if (entries.length >= t.count) {
      return {
        id: `insight_milestone_${t.count}`,
        type: "milestone",
        title: "到達点",
        body: t.msg,
        relatedEntryIds: [],
        generatedAt: new Date().toISOString(),
      };
    }
  }
  return null;
}

/** #8 受動観測データからの行動パターン洞察 */
function findBehaviorInsight(entries: LifeProfileEntry[]): DailyInsight | null {
  if (entries.length < 3) return null;

  // 最もよく閲覧するカテゴリ vs 最もエントリの多いカテゴリのギャップ
  const topViewed = getTopViewedCategories();
  if (topViewed.length === 0) return null;

  const catCounts: Partial<Record<string, number>> = {};
  for (const e of entries) {
    catCounts[e.category] = (catCounts[e.category] || 0) + 1;
  }
  const topFilled = Object.entries(catCounts).sort(([, a = 0], [, b = 0]) => b - a)[0]?.[0];

  // よく見るけど記入が少ない = 気になるけど言語化できていない
  const viewedButEmpty = topViewed.find(
    (cat) => !catCounts[cat] || catCounts[cat]! <= 1,
  );
  if (viewedButEmpty) {
    const meta = CATEGORY_META[viewedButEmpty as LifeProfileCategory];
    if (meta) {
      return {
        id: `insight_behavior_${daySeed()}`,
        type: "pattern",
        title: "無意識の関心",
        body: `あなたは「${meta.label}」のページをよく訪れますが、まだあまり記録していません。何か言語化したいものがあるのかもしれません。`,
        relatedEntryIds: [],
        generatedAt: new Date().toISOString(),
      };
    }
  }

  // 深掘りスキップ率が高い → 深掘りの質問が合っていない可能性
  const skipRate = getDepthSkipRate();
  if (skipRate > 0.6 && entries.length >= 5) {
    return {
      id: `insight_skiprate_${daySeed()}`,
      type: "depth_nudge",
      title: "深掘りの壁",
      body: `深掘り質問のスキップ率が高めです。答えにくい質問は、実は最も重要な領域かもしれません。無理せず、一つだけ向き合ってみませんか？`,
      relatedEntryIds: [],
      generatedAt: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * 今日の気づきを生成
 * 優先順位: behavior > cross_connection > pattern > depth_nudge > absence > milestone
 */
export function generateDailyInsight(
  store: LifeProfileStore,
): DailyInsight | null {
  const entries = store.entries;
  if (entries.length === 0) return null;

  const seed = daySeed();
  const roll = pseudoRandom(seed + 42);

  // 行動ベースの洞察は20%の確率で最優先
  if (roll < 0.2) {
    const behavior = findBehaviorInsight(entries);
    if (behavior) return behavior;
  }

  // 日によって異なるタイプを優先
  if (roll < 0.3) {
    return (
      findCrossConnections(entries) ??
      findBehaviorInsight(entries) ??
      findImpactPattern(entries) ??
      findDepthNudge(entries) ??
      findAbsenceInsight(entries) ??
      findMilestone(entries)
    );
  } else if (roll < 0.6) {
    return (
      findImpactPattern(entries) ??
      findDepthNudge(entries) ??
      findBehaviorInsight(entries) ??
      findCrossConnections(entries) ??
      findAbsenceInsight(entries) ??
      findMilestone(entries)
    );
  } else {
    return (
      findDepthNudge(entries) ??
      findAbsenceInsight(entries) ??
      findCrossConnections(entries) ??
      findImpactPattern(entries) ??
      findMilestone(entries)
    );
  }
}
