/**
 * インサイト Shadow Log
 *
 * 目的: 本番データに対してインサイトエンジンの発火状況を裏で記録する。
 * UIに表示する前に「どの日に何が発火したか」「信頼度はいくつか」「特徴判定は何か」を確認する。
 *
 * ストレージ: localStorage (既存の bidirectionalFeedback と同じパターン)
 * 保持期間: 90日
 */

import type { Insight } from "./types";

const SHADOW_LOG_KEY = "culcept_calendar_insight_shadow_v1";

export interface InsightShadowEntry {
  /** 対象日付 */
  date: string;
  /** 記録タイムスタンプ */
  timestamp: number;
  /** 発火したインサイト一覧 */
  fired: Array<{
    type: string;
    tier: string;
    label: string;
    text: string;
    priority: number;
    confidence: number;
  }>;
  /** 生成された候補数（フィルタ前） */
  candidateCount: number;
  /** フィルタで除外された数 */
  filteredCount: number;
  /** genome_relationship が発火したか */
  genomeRelationshipFired: boolean;
  /** genome_relationship 発火時の詳細 */
  genomeDetail?: {
    confidence: number;
    trait: string;
    label: string;
    text: string;
  };
  /** イベント型 */
  eventTypes: string[];
  /** 天気 */
  weatherIcon: string | null;
}

/** Shadow ログを記録 */
export function recordInsightShadow(
  date: string,
  insights: Insight[],
  candidateCount: number,
  events: Array<{ event_type: string }>,
  weatherIcon: string | null,
): void {
  const genomeInsight = insights.find(i => i.type === "genome_relationship");

  const entry: InsightShadowEntry = {
    date,
    timestamp: Date.now(),
    fired: insights.map(i => ({
      type: i.type,
      tier: i.tier,
      label: i.label,
      text: i.text,
      priority: i.priority,
      confidence: i.confidence,
    })),
    candidateCount,
    filteredCount: candidateCount - insights.length,
    genomeRelationshipFired: !!genomeInsight,
    genomeDetail: genomeInsight ? {
      confidence: genomeInsight.confidence,
      trait: genomeInsight.label,
      label: genomeInsight.label,
      text: genomeInsight.text,
    } : undefined,
    eventTypes: events.map(e => e.event_type),
    weatherIcon,
  };

  const history = loadShadowLog();
  // 同じ日付の既存エントリは上書き
  const filtered = history.filter(h => h.date !== date);
  filtered.push(entry);

  // 90日以内のみ保持
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const trimmed = filtered.filter(h => h.timestamp > cutoff);

  try {
    localStorage.setItem(SHADOW_LOG_KEY, JSON.stringify(trimmed));
  } catch { /* storage full */ }

  // Dev console output: 発火状況をリアルタイム確認
  if (process.env.NODE_ENV === "development") {
    const tierCounts: Record<string, number> = {};
    for (const i of entry.fired) {
      tierCounts[i.tier] = (tierCounts[i.tier] ?? 0) + 1;
    }
    console.log(
      `%c[Insight Shadow] ${date}`,
      "color: #8b5cf6; font-weight: bold",
      `| ${entry.fired.length}/${candidateCount}件発火`,
      `| tiers:`, tierCounts,
      entry.genomeRelationshipFired ? `| 🧬 Genome発火!` : "",
      `| events: [${entry.eventTypes.join(",")}]`,
    );
    if (entry.genomeRelationshipFired && entry.genomeDetail) {
      console.log(
        `  %c🧬 ${entry.genomeDetail.label}: ${entry.genomeDetail.text}`,
        "color: #d946ef",
        `(confidence: ${entry.genomeDetail.confidence})`,
      );
    }
    for (const i of entry.fired) {
      const confBar = "█".repeat(Math.round(i.confidence * 10)) + "░".repeat(10 - Math.round(i.confidence * 10));
      console.log(
        `  %c${i.tier}%c ${i.type} [${confBar}] ${i.text.slice(0, 40)}`,
        `color: ${i.tier === "practical" ? "#6b7280" : i.tier === "self-understanding" ? "#8b5cf6" : "#6366f1"}`,
        "color: inherit",
      );
    }
  }
}

/** Shadow ログを読み込み */
export function loadShadowLog(): InsightShadowEntry[] {
  try {
    const raw = localStorage.getItem(SHADOW_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/** Shadow ログのサマリを生成（開発者確認用） */
export function getShadowSummary(): {
  totalDays: number;
  tierBreakdown: Record<string, number>;
  typeBreakdown: Record<string, number>;
  genomeFiredDays: number;
  avgConfidenceByTier: Record<string, number>;
  recentEntries: InsightShadowEntry[];
} {
  const log = loadShadowLog();

  const tierBreakdown: Record<string, number> = {};
  const typeBreakdown: Record<string, number> = {};
  const confidenceSums: Record<string, { sum: number; count: number }> = {};
  let genomeFiredDays = 0;

  for (const entry of log) {
    if (entry.genomeRelationshipFired) genomeFiredDays++;
    for (const insight of entry.fired) {
      tierBreakdown[insight.tier] = (tierBreakdown[insight.tier] ?? 0) + 1;
      typeBreakdown[insight.type] = (typeBreakdown[insight.type] ?? 0) + 1;
      const cs = confidenceSums[insight.tier] ?? { sum: 0, count: 0 };
      cs.sum += insight.confidence;
      cs.count++;
      confidenceSums[insight.tier] = cs;
    }
  }

  const avgConfidenceByTier: Record<string, number> = {};
  for (const [tier, cs] of Object.entries(confidenceSums)) {
    avgConfidenceByTier[tier] = cs.count > 0 ? Math.round((cs.sum / cs.count) * 100) / 100 : 0;
  }

  return {
    totalDays: log.length,
    tierBreakdown,
    typeBreakdown,
    genomeFiredDays,
    avgConfidenceByTier,
    recentEntries: log.slice(-7), // 直近7日
  };
}
