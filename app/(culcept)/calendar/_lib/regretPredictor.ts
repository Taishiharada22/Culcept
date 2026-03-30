/**
 * 後悔予測エンジン
 *
 * 「家を出る前に、今日のコーデで後悔しそうか？」を事前に警告する。
 *
 * 5つの後悔因子を統合:
 * 1. 過去の低満足度パターン再現
 * 2. 素材×天候ミスマッチ
 * 3. コンボグラフの toxic pair
 * 4. 曜日パターンからの逸脱
 * 5. イベントとのフォーマリティギャップ
 */

import type { WardrobeItem } from "@/app/my-style/_lib/types";
import type { WeatherDaily, SatisfactionProfile, WornRecord } from "./types";
import type { ComboGraph } from "./comboGraph";
import type { TemporalProfile } from "./temporalPatterns";
import type { ExtendedWeatherContext, MaterialCategory } from "./materialWeather";
import { scoreCombosForOutfit } from "./comboGraph";
import { inferMaterial, scoreMaterialWeather } from "./materialWeather";

/* ── 後悔因子 ── */
export interface RegretFactor {
  source: "satisfaction" | "material" | "combo" | "temporal" | "formality";
  severity: number;   // 0-100 (高いほど後悔リスクが高い)
  message: string;
  suggestion?: string; // 改善提案
}

/* ── 後悔予測結果 ── */
export interface RegretPrediction {
  probability: number;  // 0-100% (後悔する確率)
  level: "safe" | "mild" | "warning" | "danger";
  factors: RegretFactor[];
  topSuggestion: string | null;
}

/* ── 1. 過去の満足度パターンチェック ── */
function checkSatisfactionRegret(
  items: WardrobeItem[],
  profile: SatisfactionProfile | null,
  weatherIcon?: string,
  eventTypes?: string[],
): RegretFactor | null {
  if (!profile || profile.dataPoints < 5) return null;

  // 低評価アイテムの検出
  let worstItem: { name: string; avg: number; count: number } | null = null;
  for (const item of items) {
    const data = profile.itemScores.get(item.id);
    if (data && data.avg <= 2.0 && data.count >= 2) {
      if (!worstItem || data.avg < worstItem.avg) {
        worstItem = { name: item.name ?? item.category, avg: data.avg, count: data.count };
      }
    }
  }

  if (worstItem) {
    return {
      source: "satisfaction",
      severity: Math.round(Math.min(90, (3 - worstItem.avg) * 30 + worstItem.count * 5)),
      message: `${worstItem.name}は過去${worstItem.count}回で平均${worstItem.avg.toFixed(1)}の低評価`,
      suggestion: `${worstItem.name}を別のアイテムに変更してみてください`,
    };
  }

  // 条件別の低評価パターン
  if (weatherIcon && eventTypes && eventTypes.length > 0) {
    const condKey = `${weatherIcon}_${eventTypes.sort().join(",")}`;
    const condData = profile.conditionScores.get(condKey);
    if (condData && condData.avg < 2.5 && condData.count >= 2) {
      return {
        source: "satisfaction",
        severity: 60,
        message: "似た天気×予定の組み合わせで過去に低評価",
        suggestion: "フォーマリティを一段上げてみてください",
      };
    }
  }

  return null;
}

/* ── 2. 素材×天候ミスマッチ ── */
function checkMaterialRegret(
  items: WardrobeItem[],
  ctx: ExtendedWeatherContext,
): RegretFactor | null {
  let worstScore = 0;
  let worstItem: { name: string; material: MaterialCategory; reasons: string[] } | null = null;

  for (const item of items) {
    const material = inferMaterial(item);
    if (material === "unknown") continue;
    const { score, reasons } = scoreMaterialWeather(material, ctx);
    if (score < worstScore) {
      worstScore = score;
      worstItem = { name: item.name ?? item.category, material, reasons };
    }
  }

  if (worstItem && worstScore <= -2) {
    return {
      source: "material",
      severity: Math.round(Math.min(85, Math.abs(worstScore) * 28)),
      message: worstItem.reasons[0] ?? `${worstItem.name}の素材が天候に合わない`,
      suggestion: `${worstItem.name}を天候に合った素材のアイテムに交換`,
    };
  }

  return null;
}

/* ── 3. コンボグラフの相性チェック ── */
function checkComboRegret(
  items: WardrobeItem[],
  graph: ComboGraph | null,
): RegretFactor | null {
  if (!graph || graph.totalEdges < 3) return null;

  const result = scoreCombosForOutfit(graph, items.map(i => i.id));

  if (result.worstPair && result.worstPair.affinity <= -40) {
    return {
      source: "combo",
      severity: Math.round(Math.min(80, Math.abs(result.worstPair.affinity))),
      message: "過去に相性が悪かった組み合わせが含まれています",
      suggestion: "別のアイテムへの差し替えで改善できます",
    };
  }

  return null;
}

/* ── 4. 曜日パターン逸脱 ── */
function checkTemporalRegret(
  items: WardrobeItem[],
  temporal: TemporalProfile | null,
  dayOfWeek: number,
): RegretFactor | null {
  if (!temporal) return null;

  const dowProfile = temporal.dayOfWeekProfiles[dayOfWeek];
  if (!dowProfile || dowProfile.sampleCount < 4) return null;

  // 曜日の平均満足度が低い → 注意
  if (dowProfile.avgSatisfaction > 0 && dowProfile.avgSatisfaction < 2.5) {
    const dayLabel = ["日", "月", "火", "水", "木", "金", "土"][dayOfWeek];
    return {
      source: "temporal",
      severity: 40,
      message: `${dayLabel}曜日は過去に満足度が低い傾向（平均${dowProfile.avgSatisfaction.toFixed(1)}）`,
      suggestion: "いつもと違うスタイルを試してみては",
    };
  }

  // フォーマリティの逸脱
  if (dowProfile.preferredFormality) {
    const formalityOrder: Record<string, number> = { casual: 0, smart: 1, dress: 2 };
    const itemFormalities = items.map(i => formalityOrder[i.formality ?? "casual"] ?? 0);
    const avgFormality = itemFormalities.reduce((a, b) => a + b, 0) / Math.max(1, itemFormalities.length);
    const expected = formalityOrder[dowProfile.preferredFormality] ?? 0;

    if (Math.abs(avgFormality - expected) >= 1.5) {
      const dayLabel = ["日", "月", "火", "水", "木", "金", "土"][dayOfWeek];
      return {
        source: "temporal",
        severity: 30,
        message: `${dayLabel}曜日はいつもと違うフォーマリティ`,
        suggestion: dowProfile.preferredFormality === "casual"
          ? "カジュアル寄りのアイテムに変更を"
          : "フォーマル寄りのアイテムに変更を",
      };
    }
  }

  return null;
}

/* ── 5. フォーマリティギャップ ── */
function checkFormalityRegret(
  items: WardrobeItem[],
  events: Array<{ event_type: string }>,
): RegretFactor | null {
  if (events.length === 0) return null;

  const formalityOrder: Record<string, number> = { casual: 0, smart: 1, dress: 2 };
  const hasFormal = events.some(e => ["meeting", "party", "date"].includes(e.event_type));
  const hasCasual = events.some(e => ["outdoor", "sports", "casual"].includes(e.event_type));

  if (hasFormal) {
    const casualItems = items.filter(i => (formalityOrder[i.formality ?? "casual"] ?? 0) === 0);
    if (casualItems.length > items.length / 2) {
      return {
        source: "formality",
        severity: 65,
        message: "フォーマルな予定にカジュアルすぎるコーデ",
        suggestion: "トップスかボトムスをきれいめに変更",
      };
    }
  }

  if (hasCasual && !hasFormal) {
    const dressyItems = items.filter(i => (formalityOrder[i.formality ?? "casual"] ?? 0) >= 2);
    if (dressyItems.length > items.length / 2) {
      return {
        source: "formality",
        severity: 35,
        message: "カジュアルな予定にフォーマルすぎるコーデ",
        suggestion: "もう少しリラックスしたアイテムに",
      };
    }
  }

  return null;
}

/* ── メイン: 後悔予測 ── */
export function predictRegret(
  items: WardrobeItem[],
  weather: WeatherDaily | null,
  events: Array<{ event_type: string }>,
  extWeather: ExtendedWeatherContext,
  options: {
    satisfactionProfile?: SatisfactionProfile | null;
    comboGraph?: ComboGraph | null;
    temporalProfile?: TemporalProfile | null;
    dayOfWeek?: number;
  } = {},
): RegretPrediction {
  const factors: RegretFactor[] = [];

  // 各因子をチェック
  const satFactor = checkSatisfactionRegret(
    items, options.satisfactionProfile ?? null,
    weather?.weather_icon, events.map(e => e.event_type),
  );
  if (satFactor) factors.push(satFactor);

  const matFactor = checkMaterialRegret(items, extWeather);
  if (matFactor) factors.push(matFactor);

  const comboFactor = checkComboRegret(items, options.comboGraph ?? null);
  if (comboFactor) factors.push(comboFactor);

  const tempFactor = checkTemporalRegret(
    items, options.temporalProfile ?? null, options.dayOfWeek ?? new Date().getDay(),
  );
  if (tempFactor) factors.push(tempFactor);

  const formFactor = checkFormalityRegret(items, events);
  if (formFactor) factors.push(formFactor);

  // 総合確率算出: 各因子のseverityを重み付き合成
  // 最も深刻な因子が支配的 + 副因子は減衰
  factors.sort((a, b) => b.severity - a.severity);

  let probability = 0;
  for (let i = 0; i < factors.length; i++) {
    const weight = 1 / (i + 1); // 最初の因子はフル、2番目は半分、3番目は1/3...
    probability += factors[i].severity * weight;
  }
  // 正規化: 最大で100に収まるよう
  probability = Math.round(Math.min(95, probability * 0.6));

  const level: RegretPrediction["level"] =
    probability >= 60 ? "danger" :
    probability >= 35 ? "warning" :
    probability >= 15 ? "mild" : "safe";

  const topSuggestion = factors.length > 0 ? factors[0].suggestion ?? null : null;

  return { probability, level, factors, topSuggestion };
}
