/**
 * コンボメモリーグラフ
 *
 * アイテムペアの親和性スコアを着用履歴から構築。
 * 単純な満足度平均だけでなく、「一緒に着られた回数」「季節」「天気条件」を加味した
 * 多次元アフィニティグラフを形成する。
 */

import type { WornRecord, WeatherDaily } from "./types";
import type { WardrobeItem } from "@/app/my-style/_lib/types";
import { loadWornHistory } from "./rotationTracker";

/* ── エッジデータ ── */
export interface ComboEdge {
  itemA: string;
  itemB: string;
  wearCount: number;
  avgSatisfaction: number;
  lastWorn: string;
  affinity: number; // -100 to +100 (正規化済み)
  seasonCounts: Record<string, number>; // "ss" | "aw" → count
  weatherCounts: Record<string, number>; // weather_icon → count
}

/* ── コンボグラフ ── */
export interface ComboGraph {
  edges: Map<string, ComboEdge>;
  itemDegree: Map<string, number>; // アイテム → ペア数
  topAffinity: ComboEdge[];        // affinity上位10
  toxicPairs: ComboEdge[];          // affinity < -30
  totalEdges: number;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function getMonth(date: string): number {
  return new Date(date).getMonth() + 1;
}

function monthToSeason(month: number): string {
  return month >= 4 && month <= 9 ? "ss" : "aw";
}

/* ── グラフ構築 ── */
export function buildComboGraph(
  wornHistory?: WornRecord[],
  dayDataMap?: Map<string, { weather?: WeatherDaily | null }>,
): ComboGraph {
  const history = wornHistory ?? loadWornHistory();

  const edgeAcc = new Map<string, {
    itemA: string; itemB: string;
    totalSat: number; count: number; lastWorn: string;
    seasonCounts: Record<string, number>;
    weatherCounts: Record<string, number>;
  }>();

  for (const record of history) {
    if (!record.satisfaction || record.itemIds.length < 2) continue;

    const month = getMonth(record.date);
    const season = monthToSeason(month);
    const weatherIcon = dayDataMap?.get(record.date)?.weather?.weather_icon ?? "unknown";

    for (let i = 0; i < record.itemIds.length; i++) {
      for (let j = i + 1; j < record.itemIds.length; j++) {
        const key = edgeKey(record.itemIds[i], record.itemIds[j]);
        const existing = edgeAcc.get(key);
        if (existing) {
          existing.totalSat += record.satisfaction;
          existing.count += 1;
          if (record.date > existing.lastWorn) existing.lastWorn = record.date;
          existing.seasonCounts[season] = (existing.seasonCounts[season] ?? 0) + 1;
          existing.weatherCounts[weatherIcon] = (existing.weatherCounts[weatherIcon] ?? 0) + 1;
        } else {
          edgeAcc.set(key, {
            itemA: record.itemIds[i] < record.itemIds[j] ? record.itemIds[i] : record.itemIds[j],
            itemB: record.itemIds[i] < record.itemIds[j] ? record.itemIds[j] : record.itemIds[i],
            totalSat: record.satisfaction,
            count: 1,
            lastWorn: record.date,
            seasonCounts: { [season]: 1 },
            weatherCounts: { [weatherIcon]: 1 },
          });
        }
      }
    }
  }

  // アフィニティ算出: (avgSat - 3) * 33.3 * log2(count + 1) でスケーリング
  const edges = new Map<string, ComboEdge>();
  const itemDegree = new Map<string, number>();

  for (const [key, data] of edgeAcc) {
    const avg = data.totalSat / data.count;
    const rawAffinity = (avg - 3) * 33.3 * Math.log2(data.count + 1);
    const affinity = Math.round(Math.max(-100, Math.min(100, rawAffinity)));

    edges.set(key, {
      itemA: data.itemA,
      itemB: data.itemB,
      wearCount: data.count,
      avgSatisfaction: Math.round(avg * 10) / 10,
      lastWorn: data.lastWorn,
      affinity,
      seasonCounts: data.seasonCounts,
      weatherCounts: data.weatherCounts,
    });

    itemDegree.set(data.itemA, (itemDegree.get(data.itemA) ?? 0) + 1);
    itemDegree.set(data.itemB, (itemDegree.get(data.itemB) ?? 0) + 1);
  }

  const allEdges = [...edges.values()];
  const topAffinity = [...allEdges].sort((a, b) => b.affinity - a.affinity).slice(0, 10);
  const toxicPairs = allEdges.filter(e => e.affinity < -30).sort((a, b) => a.affinity - b.affinity);

  return { edges, itemDegree, topAffinity, toxicPairs, totalEdges: edges.size };
}

/* ── ペアアフィニティ取得 ── */
export function getPairAffinity(graph: ComboGraph, itemA: string, itemB: string): ComboEdge | null {
  return graph.edges.get(edgeKey(itemA, itemB)) ?? null;
}

/* ── 候補アイテム群のコンボスコア ── */
export function scoreCombosForOutfit(
  graph: ComboGraph,
  itemIds: string[],
  currentSeason?: string,
): { score: number; bestPair: ComboEdge | null; worstPair: ComboEdge | null; reasons: string[] } {
  if (itemIds.length < 2 || graph.totalEdges === 0) {
    return { score: 0, bestPair: null, worstPair: null, reasons: [] };
  }

  let totalAffinity = 0;
  let pairCount = 0;
  let bestPair: ComboEdge | null = null;
  let worstPair: ComboEdge | null = null;
  const reasons: string[] = [];

  for (let i = 0; i < itemIds.length; i++) {
    for (let j = i + 1; j < itemIds.length; j++) {
      const edge = getPairAffinity(graph, itemIds[i], itemIds[j]);
      if (!edge) continue;

      // 季節一致ボーナス: 現在季節で着た回数が多いペアほど信頼性高い
      let seasonMultiplier = 1.0;
      if (currentSeason && edge.seasonCounts[currentSeason]) {
        const seasonRatio = edge.seasonCounts[currentSeason] / edge.wearCount;
        seasonMultiplier = 0.7 + seasonRatio * 0.6; // 0.7 - 1.3
      }

      const adjusted = Math.round(edge.affinity * seasonMultiplier);
      totalAffinity += adjusted;
      pairCount++;

      if (!bestPair || adjusted > (bestPair.affinity)) bestPair = edge;
      if (!worstPair || adjusted < (worstPair.affinity)) worstPair = edge;
    }
  }

  if (pairCount === 0) return { score: 0, bestPair: null, worstPair: null, reasons: [] };

  const avgAffinity = totalAffinity / pairCount;

  // -100 ~ +100 → -10 ~ +10 SYNC ブーストポイント
  const score = Math.round(avgAffinity / 10);

  if (bestPair && bestPair.affinity >= 50) {
    reasons.push("過去に高評価だった相性抜群ペア");
  }
  if (worstPair && worstPair.affinity <= -30) {
    reasons.push("過去に相性が悪かったペアが含まれる");
  }

  return { score, bestPair, worstPair, reasons };
}

/* ── あるアイテムの最高パートナーを取得 ── */
export function getBestPartners(
  graph: ComboGraph,
  itemId: string,
  limit = 5,
): ComboEdge[] {
  const partners: ComboEdge[] = [];
  for (const edge of graph.edges.values()) {
    if (edge.itemA === itemId || edge.itemB === itemId) {
      partners.push(edge);
    }
  }
  return partners.sort((a, b) => b.affinity - a.affinity).slice(0, limit);
}
