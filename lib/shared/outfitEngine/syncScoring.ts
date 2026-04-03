import type { WardrobeItem } from "@/app/my-style/_lib/types";
import type { WeatherDaily, SyncScore, SyncBreakdown, SatisfactionProfile } from "@/app/(culcept)/calendar/_lib/types";
import { getSyncBand, TPO_FORMALITY_MAP, getRecommendedThickness, SILHOUETTE_HARMONY, getSeasonForMonth } from "@/app/(culcept)/calendar/_lib/constants";
import type { CalendarPersonaProfile } from "@/app/(culcept)/calendar/_lib/personaBoost";
import { computePcVisualBoost } from "@/app/(culcept)/calendar/_lib/personaBoost";
import { scorePersonalFit } from "@/app/(culcept)/calendar/_lib/satisfactionLearner";
import type { ExtendedWeatherContext } from "@/app/(culcept)/calendar/_lib/materialWeather";
import { scoreOutfitMaterials, buildExtendedWeatherContext } from "@/app/(culcept)/calendar/_lib/materialWeather";
import type { ComboGraph } from "@/app/(culcept)/calendar/_lib/comboGraph";
import { scoreCombosForOutfit } from "@/app/(culcept)/calendar/_lib/comboGraph";
import type { OutfitAdaptation } from "@/app/(culcept)/calendar/_lib/aneurasyncIntegration";

/* ── 色変換（matchScore/color.ts から移植） ── */
function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

/* ── Climate サブスコア (0-25) ── */
function scoreClimate(
  items: WardrobeItem[],
  weather: WeatherDaily | null,
  month: number,
  extWeather?: ExtendedWeatherContext | null,
): { score: number; reasons: string[] } {
  if (!weather && items.length === 0) return { score: 12, reasons: [] };
  const reasons: string[] = [];
  let score = 15; // ベース

  const season = getSeasonForMonth(month);
  const { thickness: recThickness } = getRecommendedThickness(weather?.temp_max ?? null);

  for (const item of items) {
    // 季節チェック
    if (item.season && item.season !== "all" && item.season !== season) {
      score -= 4;
      reasons.push(`${item.name}は季節外れ`);
    }
    // 厚みチェック
    if (item.thickness) {
      if (item.thickness === recThickness) score += 2;
      else if (
        (recThickness === "thick" && item.thickness === "thin") ||
        (recThickness === "thin" && item.thickness === "thick")
      ) {
        score -= 3;
        reasons.push(`${item.name}の厚みが気温に合わない`);
      }
    }
    // 雨対応チェック
    if (weather?.outfit_tag === "rain" || weather?.weather_icon === "rain" || weather?.weather_icon === "storm") {
      if (item.attributes?.water === "waterproof" || item.attributes?.water === "repellent") {
        score += 2;
      } else if (item.category === "shoes") {
        score -= 2;
        reasons.push("雨の日に防水でない靴");
      }
    }
  }

  // 素材×天候マトリクス統合 (湿度・風速考慮)
  if (extWeather) {
    const materialResult = scoreOutfitMaterials(items, extWeather);
    if (materialResult.totalScore >= 1.5) {
      score += 2;
      reasons.push("素材が天候に最適");
    } else if (materialResult.totalScore <= -1.5) {
      score -= 3;
      const worst = materialResult.itemScores.find(s => s.score <= -2);
      if (worst && worst.reasons.length > 0) {
        reasons.push(worst.reasons[0]);
      } else {
        reasons.push("素材が天候に合わない");
      }
    }

    // 体感温度と実温度の乖離が大きい場合
    const rawAvg = extWeather.rawTempMax != null && extWeather.rawTempMin != null
      ? (extWeather.rawTempMax + extWeather.rawTempMin) / 2
      : null;
    if (rawAvg != null && Math.abs(extWeather.feltTemp - rawAvg) >= 4) {
      reasons.push(`体感${Math.round(extWeather.feltTemp)}° (実温度比${extWeather.feltTemp > rawAvg ? "+" : ""}${Math.round(extWeather.feltTemp - rawAvg)}°)`);
    }
  }

  return { score: Math.max(0, Math.min(25, score)), reasons: reasons.slice(0, 2) };
}

/* ── TPO サブスコア (0-25) ── */
function scoreTPO(items: WardrobeItem[], events: Array<{ event_type: string }>): { score: number; reasons: string[] } {
  if (events.length === 0) return { score: 20, reasons: [] }; // 予定なし→ほぼ問題なし
  const reasons: string[] = [];
  let score = 15;

  // 最もフォーマルな予定を基準にする
  const formalityOrder: Record<string, number> = { casual: 0, smart: 1, dress: 2 };
  let maxFormality = "casual";
  for (const e of events) {
    const f = TPO_FORMALITY_MAP[e.event_type] ?? "casual";
    if ((formalityOrder[f] ?? 0) > (formalityOrder[maxFormality] ?? 0)) maxFormality = f;
  }

  let matchCount = 0;
  for (const item of items) {
    if (!item.formality) continue;
    const itemLevel = formalityOrder[item.formality] ?? 0;
    const reqLevel = formalityOrder[maxFormality] ?? 0;
    if (itemLevel >= reqLevel) {
      matchCount++;
    } else if (reqLevel - itemLevel >= 2) {
      score -= 4;
      reasons.push(`${item.name}はTPOに対してカジュアルすぎる`);
    } else {
      score -= 2;
    }
  }

  if (matchCount === items.filter(i => i.formality).length && matchCount > 0) {
    score += 8;
  }

  return { score: Math.max(0, Math.min(25, score)), reasons: reasons.slice(0, 2) };
}

/* ── Visual Harmony サブスコア (0-25) ── */
function scoreVisualHarmony(items: WardrobeItem[], persona?: CalendarPersonaProfile | null): { score: number; reasons: string[] } {
  if (items.length < 2) return { score: 18, reasons: [] };
  const reasons: string[] = [];
  let score = 15;

  // 色の調和: アイテム間のhue距離をチェック
  const hues: number[] = [];
  for (const item of items) {
    const hex = item.colorHex || item.color;
    if (!hex) continue;
    const hsl = hexToHsl(hex);
    if (hsl) hues.push(hsl.h);
  }

  if (hues.length >= 2) {
    // 補色・類似色チェック
    const hueDiffs: number[] = [];
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        let diff = Math.abs(hues[i] - hues[j]);
        if (diff > 180) diff = 360 - diff;
        hueDiffs.push(diff);
      }
    }
    const avgDiff = hueDiffs.reduce((a, b) => a + b, 0) / hueDiffs.length;

    if (avgDiff < 30) {
      score += 6; // 同系色
      reasons.push("色の統一感が高い");
    } else if (avgDiff < 60) {
      score += 4; // 類似色
    } else if (avgDiff > 150 && avgDiff < 180) {
      score += 3; // 補色（上手く使えばOK）
    } else if (avgDiff > 90 && avgDiff < 150) {
      score -= 2; // ちょっと散らばりすぎ
    }
  }

  // シルエットバランス
  const tops = items.find(i => i.category === "tops" || i.category === "outerwear");
  const bottoms = items.find(i => i.category === "bottoms");
  if (tops?.silhouette && bottoms?.silhouette) {
    const harmony = SILHOUETTE_HARMONY[tops.silhouette]?.[bottoms.silhouette] ?? 18;
    score += Math.round((harmony - 15) / 2); // -2 to +5
    if (harmony >= 24) reasons.push("シルエットバランスが良い");
    if (harmony <= 12) reasons.push("上下のシルエットに注意");
  }

  // パターン重複チェック
  const patterns = items.map(i => i.pattern).filter(Boolean);
  const nonSolid = patterns.filter(p => p !== "solid");
  if (nonSolid.length >= 2) {
    const unique = new Set(nonSolid);
    if (unique.size < nonSolid.length) {
      score -= 3; // 同じ柄の重複
    } else {
      score -= 2; // 異なる柄の組み合わせ
      reasons.push("柄物の組み合わせに注意");
    }
  }

  // PersonaGenome PCシーズン連携ブースト
  if (persona?.pcSeason4) {
    const pcBoost = computePcVisualBoost(persona, items);
    if (pcBoost >= 2) {
      score += pcBoost;
      reasons.push("パーソナルカラーに合った配色");
    } else if (pcBoost >= 1) {
      score += pcBoost;
    }
  }

  return { score: Math.max(0, Math.min(25, score)), reasons: reasons.slice(0, 2) };
}

/* ── Mobility サブスコア (0-25) ── */
function scoreMobility(items: WardrobeItem[], events: Array<{ event_type: string }>): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 20; // ベースは高め

  const isActive = events.some(e => ["sports", "outdoor", "travel"].includes(e.event_type));

  if (isActive) {
    for (const item of items) {
      // ストレッチチェック
      if (item.attributes?.stretch === "none" && (item.category === "bottoms" || item.category === "tops")) {
        score -= 3;
        reasons.push(`${item.name}はストレッチ性がない`);
      }
      // ドレープチェック（構造的すぎると動きにくい）
      if (item.drape === "structured" && item.category !== "shoes") {
        score -= 2;
      }
      // 靴の種類
      if (item.category === "shoes" && item.formality === "dress") {
        score -= 4;
        reasons.push("アクティブな予定にドレスシューズは不向き");
      }
    }
  }

  // 重さ・動きやすさの一般チェック
  const thickItems = items.filter(i => i.thickness === "thick");
  if (thickItems.length >= 3) {
    score -= 3;
    reasons.push("厚手アイテムが多すぎて動きにくい");
  }

  return { score: Math.max(0, Math.min(25, score)), reasons: reasons.slice(0, 2) };
}

/* ── メインSYNCスコア計算 ── */
export function computeSyncScore(
  items: WardrobeItem[],
  weather: WeatherDaily | null,
  events: Array<{ event_type: string }>,
  month: number,
  persona?: CalendarPersonaProfile | null,
  satisfactionProfile?: SatisfactionProfile | null,
  extendedOptions?: {
    extWeather?: ExtendedWeatherContext | null;
    comboGraph?: ComboGraph | null;
    adaptation?: OutfitAdaptation | null;
  } | null,
): SyncScore {
  if (items.length === 0) {
    return {
      total: 0,
      breakdown: { climate: 0, tpo: 0, visualHarmony: 0, mobility: 0, personalFit: 0 },
      band: "risk",
      reasons: ["アイテムが選択されていません"],
    };
  }

  const extWeather = extendedOptions?.extWeather ?? null;
  const comboGraph = extendedOptions?.comboGraph ?? null;
  const adaptation = extendedOptions?.adaptation ?? null;

  const climate = scoreClimate(items, weather, month, extWeather);
  const tpo = scoreTPO(items, events);
  const visual = scoreVisualHarmony(items, persona);
  const mobility = scoreMobility(items, events);

  // 5軸目: 満足度学習ベースの Personal Fit
  const personalFitResult = satisfactionProfile
    ? scorePersonalFit(
        satisfactionProfile,
        items.map(i => i.id),
        weather?.weather_icon,
        events.map(e => e.event_type),
      )
    : { score: 12, reasons: [] as string[] }; // データなし→中立12

  // コンボグラフからのブースト (personalFitに加算)
  if (comboGraph && comboGraph.totalEdges > 0) {
    const comboResult = scoreCombosForOutfit(comboGraph, items.map(i => i.id));
    const comboAdjust = Math.max(-5, Math.min(5, comboResult.score));
    personalFitResult.score = Math.max(0, Math.min(25, personalFitResult.score + comboAdjust));
    if (comboResult.reasons.length > 0) personalFitResult.reasons.push(comboResult.reasons[0]);
  }

  // Aneurasync適応ブースト
  if (adaptation && adaptation.reason) {
    // 快適性重視の場合はmobility微増
    if (adaptation.comfortPriority >= 0.7) {
      mobility.score = Math.min(25, mobility.score + 2);
    }
  }

  const breakdown: SyncBreakdown = {
    climate: climate.score,
    tpo: tpo.score,
    visualHarmony: visual.score,
    mobility: mobility.score,
    personalFit: personalFitResult.score,
  };

  // 合計は0-125だが、表示は0-100%に正規化
  const rawTotal = breakdown.climate + breakdown.tpo + breakdown.visualHarmony + breakdown.mobility + breakdown.personalFit;
  const total = Math.round((rawTotal / 125) * 100);
  const reasons = [
    ...climate.reasons,
    ...tpo.reasons,
    ...visual.reasons,
    ...mobility.reasons,
    ...personalFitResult.reasons,
  ].slice(0, 3);

  return {
    total,
    breakdown,
    band: getSyncBand(total),
    reasons,
  };
}
