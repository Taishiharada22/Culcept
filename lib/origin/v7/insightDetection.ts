// lib/origin/v7/insightDetection.ts
// 新規インサイト検出 — save更新前後を比較

import type { OriginV7Save } from "./types";
import { deriveFormationChains } from "./formationReader";

export type DetectedInsight = {
  type: "cross_connection" | "new_chain" | "depth_milestone";
  title: string;
  body: string;
  relatedChapterIds: string[];
};

/**
 * save更新前後を比較し、新しく発見されたインサイトを返す
 */
export function detectNewInsights(
  prevSave: OriginV7Save,
  nextSave: OriginV7Save,
): DetectedInsight[] {
  const insights: DetectedInsight[] = [];

  // 新しいチャプターが追加された場合
  const prevIds = new Set(prevSave.chapters.map((c) => c.id));
  const newChapters = nextSave.chapters.filter((c) => !prevIds.has(c.id));

  if (newChapters.length === 0) return insights;

  // Formation chainsの変化を検出
  const prevChains = deriveFormationChains(prevSave);
  const nextChains = deriveFormationChains(nextSave);

  // 新しいchainが見つかった場合
  const prevChainKeys = new Set(
    prevChains.map((c) => `${c.sourcePeriod}-${c.mechanism}`),
  );
  const newChains = nextChains.filter(
    (c) => !prevChainKeys.has(`${c.sourcePeriod}-${c.mechanism}`),
  );

  if (newChains.length > 0) {
    const chain = newChains[0];
    insights.push({
      type: "cross_connection",
      title: "つながりが見えました",
      body: `「${chain.sourcePeriod}」の経験が、今のあなたに「${chain.remains}」として残っているようです。`,
      relatedChapterIds: newChapters.map((c) => c.id),
    });
  }

  // チャプター数マイルストーン
  const milestones = [3, 5, 10, 20];
  for (const m of milestones) {
    if (prevSave.chapters.length < m && nextSave.chapters.length >= m) {
      insights.push({
        type: "depth_milestone",
        title: `${m}の記憶`,
        body: `${m}つ目の記憶が刻まれました。あなたの形成史が、深みを増しています。`,
        relatedChapterIds: [],
      });
    }
  }

  return insights;
}

/** 既に見たインサイトを管理 */
const SEEN_KEY = "origin_seen_insights";

export function markInsightSeen(insightKey: string): void {
  if (typeof window === "undefined") return;
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[];
    if (!seen.includes(insightKey)) {
      seen.push(insightKey);
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    }
  } catch {
    // QuotaExceededError
  }
}

export function isInsightSeen(insightKey: string): boolean {
  if (typeof window === "undefined") return false;
  const seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[];
  return seen.includes(insightKey);
}
