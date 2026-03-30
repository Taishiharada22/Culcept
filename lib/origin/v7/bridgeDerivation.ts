/**
 * ノード間形成要約 — 2つの chapter 間の変化を表すテキストを生成
 * FormationBridge で使用（表示時に都度生成、保存しない）
 */

import type { MemoryChapter } from "./types";
import { getPeriodLabel } from "./periods";
import { extractLayers } from "./layerExtraction";

/**
 * 2つの chapter 間の形成要約テキストを生成
 * from が古い方、to が新しい方
 */
export function deriveBridgeText(
  from: MemoryChapter,
  to: MemoryChapter,
): string {
  const fromLayers = extractLayers(from);
  const toLayers = extractLayers(to);
  const fromPeriod = getPeriodLabel(from.fact.period);
  const toPeriod = getPeriodLabel(to.fact.period);

  // echoes の差分を見る
  const fromEchoes = new Set(from.echoes);
  const newEchoes = to.echoes.filter((e) => !fromEchoes.has(e));
  const lostEchoes = from.echoes.filter((e) => !to.echoes.includes(e));

  const parts: string[] = [];

  // 新しく残ったもの
  if (newEchoes.length > 0) {
    parts.push(`「${newEchoes.join("」「")}」が加わった`);
  }

  // 失われたもの
  if (lostEchoes.length > 0) {
    parts.push(`「${lostEchoes.join("」「")}」が薄れた`);
  }

  // learnedPatterns の変化
  if (fromLayers.learnedPatterns && toLayers.learnedPatterns &&
      fromLayers.learnedPatterns !== toLayers.learnedPatterns) {
    parts.push("動き方が変わった");
  }

  // 何も差分が取れない場合のフォールバック
  if (parts.length === 0) {
    return `${fromPeriod}から${toPeriod}へ`;
  }

  return parts.join("。");
}

/**
 * 複数 chapters をソートして隣接ペアごとの bridge を返す
 */
export function deriveBridges(
  chapters: MemoryChapter[],
): { fromId: string; toId: string; text: string }[] {
  if (chapters.length < 2) return [];

  const sorted = [...chapters].sort((a, b) => {
    const pa = PERIOD_ORDER.indexOf(a.fact.period);
    const pb = PERIOD_ORDER.indexOf(b.fact.period);
    if (pa !== pb) return pa - pb;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return sorted.slice(0, -1).map((from, i) => ({
    fromId: from.id,
    toId: sorted[i + 1].id,
    text: deriveBridgeText(from, sorted[i + 1]),
  }));
}

/** 時代の順序（ソート用） */
const PERIOD_ORDER = [
  "early_childhood",
  "elementary",
  "middle_school",
  "high_school",
  "late_teens",
  "early_twenties",
  "mid_twenties",
  "thirties",
  "forties_plus",
  "special_period",
] as const;
