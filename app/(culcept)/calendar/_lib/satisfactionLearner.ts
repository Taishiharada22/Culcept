/**
 * 満足度フィードバック学習モジュール
 *
 * 着用記録（satisfaction 1-5）から以下を学習:
 *  - アイテム別満足度スコア
 *  - コンボ別満足度（top×bottom等のペア）
 *  - 条件別満足度（天気×イベント組み合わせ）
 */

import type { WornRecord, SatisfactionProfile, WeatherDaily } from "./types";
import { loadWornHistory } from "./rotationTracker";

/* ── コンボキー生成 ── */
function comboKey(ids: string[]): string {
  // 2要素ペアに展開してソート
  return [...ids].sort().join("+");
}

/* ── 条件キー生成 ── */
function conditionKey(
  weatherIcon: string | undefined,
  eventTypes: string[],
): string {
  const w = weatherIcon ?? "unknown";
  const e = eventTypes.length > 0 ? eventTypes.sort().join(",") : "none";
  return `${w}_${e}`;
}

/* ── ローカルストレージからプロファイル構築 ── */
export function buildSatisfactionProfile(
  wornHistory?: WornRecord[],
  dayDataForConditions?: Map<string, { weather?: WeatherDaily | null; events?: Array<{ event_type: string }> }>,
): SatisfactionProfile {
  const history = wornHistory ?? loadWornHistory();

  const itemScores = new Map<string, { total: number; count: number; lastWorn: string }>();
  const comboScoresAcc = new Map<string, { total: number; count: number }>();
  const conditionScoresAcc = new Map<string, { total: number; count: number }>();

  let oldestDate = "";

  for (const record of history) {
    if (!record.satisfaction || record.itemIds.length === 0) continue;

    if (!oldestDate || record.date < oldestDate) oldestDate = record.date;

    // アイテム別集計
    for (const id of record.itemIds) {
      const existing = itemScores.get(id);
      if (existing) {
        existing.total += record.satisfaction;
        existing.count += 1;
        if (record.date > existing.lastWorn) existing.lastWorn = record.date;
      } else {
        itemScores.set(id, { total: record.satisfaction, count: 1, lastWorn: record.date });
      }
    }

    // コンボ別集計（全2要素ペア）
    if (record.itemIds.length >= 2) {
      for (let i = 0; i < record.itemIds.length; i++) {
        for (let j = i + 1; j < record.itemIds.length; j++) {
          const key = comboKey([record.itemIds[i], record.itemIds[j]]);
          const existing = comboScoresAcc.get(key);
          if (existing) {
            existing.total += record.satisfaction;
            existing.count += 1;
          } else {
            comboScoresAcc.set(key, { total: record.satisfaction, count: 1 });
          }
        }
      }
    }

    // 条件別集計
    if (dayDataForConditions) {
      const dayInfo = dayDataForConditions.get(record.date);
      if (dayInfo) {
        const key = conditionKey(
          dayInfo.weather?.weather_icon,
          dayInfo.events?.map(e => e.event_type) ?? [],
        );
        const existing = conditionScoresAcc.get(key);
        if (existing) {
          existing.total += record.satisfaction;
          existing.count += 1;
        } else {
          conditionScoresAcc.set(key, { total: record.satisfaction, count: 1 });
        }
      }
    }
  }

  // avg変換
  const finalItemScores = new Map<string, { avg: number; count: number; lastWorn: string }>();
  for (const [id, data] of itemScores) {
    finalItemScores.set(id, {
      avg: data.total / data.count,
      count: data.count,
      lastWorn: data.lastWorn,
    });
  }

  const finalComboScores = new Map<string, { avg: number; count: number }>();
  for (const [key, data] of comboScoresAcc) {
    finalComboScores.set(key, { avg: data.total / data.count, count: data.count });
  }

  const finalConditionScores = new Map<string, { avg: number; count: number }>();
  for (const [key, data] of conditionScoresAcc) {
    finalConditionScores.set(key, { avg: data.total / data.count, count: data.count });
  }

  return {
    itemScores: finalItemScores,
    comboScores: finalComboScores,
    conditionScores: finalConditionScores,
    dataPoints: history.filter(r => r.satisfaction).length,
    oldestDate,
  };
}

/* ── アイテム候補スコアへの満足度ブースト ── */
export function satisfactionItemBoost(
  profile: SatisfactionProfile,
  itemId: string,
): number {
  const data = profile.itemScores.get(itemId);
  if (!data) return 0;

  // avg>=4 & 2回以上 → +8
  if (data.avg >= 4.0 && data.count >= 2) return 8;
  // avg>=4 & 1回 → +4
  if (data.avg >= 4.0) return 4;
  // avg>=3 → +3
  if (data.avg >= 3.0) return 3;
  // avg<=2 & 2回以上 → -10 (繰り返し低評価)
  if (data.avg <= 2.0 && data.count >= 2) return -10;
  // avg==1 & 2回以上 → -25 (never again)
  if (data.avg <= 1.0 && data.count >= 2) return -25;
  // avg<=2 & 1回 → -5
  if (data.avg <= 2.0) return -5;

  return 0;
}

/* ── コンボ満足度ブースト ── */
export function satisfactionComboBonus(
  profile: SatisfactionProfile,
  itemIds: string[],
): number {
  if (itemIds.length < 2 || profile.comboScores.size === 0) return 0;

  let totalBonus = 0;
  let pairCount = 0;

  for (let i = 0; i < itemIds.length; i++) {
    for (let j = i + 1; j < itemIds.length; j++) {
      const key = comboKey([itemIds[i], itemIds[j]]);
      const data = profile.comboScores.get(key);
      if (data && data.count >= 1) {
        pairCount++;
        if (data.avg >= 4.5) totalBonus += 15;
        else if (data.avg >= 4.0) totalBonus += 8;
        else if (data.avg <= 2.0 && data.count >= 2) totalBonus -= 10;
      }
    }
  }

  // 複数ペアがある場合は平均化
  return pairCount > 0 ? Math.round(totalBonus / pairCount) : 0;
}

/* ── 条件別の嗜好シフト検出 ── */
export function detectConditionRegret(
  profile: SatisfactionProfile,
  weatherIcon: string | undefined,
  eventTypes: string[],
): { hasRegret: boolean; suggestedFormalityShift: number } {
  const key = conditionKey(weatherIcon, eventTypes);
  const data = profile.conditionScores.get(key);

  if (!data || data.count < 2) return { hasRegret: false, suggestedFormalityShift: 0 };

  // avg < 2.5 で2回以上 → regret pattern
  if (data.avg < 2.5) {
    // フォーマリティを1段上げることを提案
    return { hasRegret: true, suggestedFormalityShift: 1 };
  }

  return { hasRegret: false, suggestedFormalityShift: 0 };
}

/* ── SYNC 5軸目: Personal Fit スコア (0-25) ── */
export function scorePersonalFit(
  profile: SatisfactionProfile,
  itemIds: string[],
  weatherIcon?: string,
  eventTypes?: string[],
): { score: number; reasons: string[] } {
  if (profile.dataPoints === 0) {
    // データなし → 中立
    return { score: 12, reasons: [] };
  }

  let score = 12; // ベース
  const reasons: string[] = [];

  // アイテム別満足度の総合
  let itemBoostTotal = 0;
  let itemCount = 0;
  let hasNeverAgain = false;

  for (const id of itemIds) {
    const boost = satisfactionItemBoost(profile, id);
    if (boost <= -25) hasNeverAgain = true;
    itemBoostTotal += boost;
    const data = profile.itemScores.get(id);
    if (data) itemCount++;
  }

  if (itemCount > 0) {
    const avgBoost = itemBoostTotal / itemIds.length;
    if (avgBoost >= 6) {
      score += 8;
      reasons.push("過去の着用で高評価のアイテム");
    } else if (avgBoost >= 3) {
      score += 4;
    } else if (avgBoost <= -5) {
      score -= 6;
      reasons.push("過去に低評価だったアイテムを含む");
    }
  }

  if (hasNeverAgain) {
    score -= 10;
    reasons.push("繰り返し低評価のアイテムが含まれています");
  }

  // コンボボーナス
  const comboBonus = satisfactionComboBonus(profile, itemIds);
  if (comboBonus >= 10) {
    score += 5;
    reasons.push("過去に好評だった組み合わせ");
  } else if (comboBonus >= 5) {
    score += 3;
  } else if (comboBonus <= -5) {
    score -= 3;
  }

  // 条件マッチ
  if (weatherIcon && eventTypes) {
    const { hasRegret } = detectConditionRegret(profile, weatherIcon, eventTypes);
    if (hasRegret) {
      score -= 3;
      reasons.push("類似条件で過去に低評価");
    }
  }

  return { score: Math.max(0, Math.min(25, score)), reasons: reasons.slice(0, 2) };
}
