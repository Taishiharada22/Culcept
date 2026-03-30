import type { OutfitProposal, WeatherDaily, RiskWarning } from "./types";
import { getRecommendedThickness, TPO_FORMALITY_MAP } from "./constants";

export function analyzeRisks(
  proposal: OutfitProposal,
  weather: WeatherDaily | null,
  events: Array<{ event_type: string }>,
  recentlyWornIds?: Set<string>,
): RiskWarning[] {
  const warnings: RiskWarning[] = [];
  const items = proposal.items;

  /* ── 気温リスク ── */
  if (weather?.temp_max != null && weather?.temp_min != null) {
    const gap = weather.temp_max - weather.temp_min;
    if (gap >= 12) {
      warnings.push({
        type: "temperature",
        severity: "medium",
        message: `寒暖差${gap}°: 朝晩と日中で体感が大きく変わります`,
      });
    }

    const { thickness: recThickness, needsOuter } = getRecommendedThickness(weather.temp_max);
    const hasOuter = items.some(i => i.category === "outerwear" || i.categoryMain === "outer");
    if (needsOuter && !hasOuter) {
      warnings.push({
        type: "temperature",
        severity: "high",
        message: "気温が低いのにアウターがありません",
      });
    }

    const allThin = items.every(i => !i.thickness || i.thickness === "thin");
    if (recThickness === "thick" && allThin) {
      warnings.push({
        type: "temperature",
        severity: "high",
        message: "薄手のみの構成ですが、厚手の推奨日です",
      });
    }
  }

  /* ── 天気リスク ── */
  if (weather?.outfit_tag === "rain" || weather?.weather_icon === "rain" || weather?.weather_icon === "storm") {
    const hasWaterproof = items.some(i => i.attributes?.water === "waterproof" || i.attributes?.water === "repellent");
    if (!hasWaterproof) {
      warnings.push({
        type: "weather",
        severity: "medium",
        message: "雨予報ですが防水アイテムがありません",
      });
    }

    const hasLightColor = items.some(i => {
      if (!i.colorHex && !i.color) return false;
      const hex = i.colorHex || i.color;
      if (!hex.startsWith("#")) return false;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return (r + g + b) / 3 > 200; // very light
    });
    if (hasLightColor) {
      warnings.push({
        type: "weather",
        severity: "low",
        message: "雨の日は淡色が汚れやすい傾向",
      });
    }
  }

  /* ── TPOリスク ── */
  if (events.length > 0) {
    const fOrder: Record<string, number> = { casual: 0, smart: 1, dress: 2 };
    let maxFormalityLevel = 0;
    for (const e of events) {
      const f = TPO_FORMALITY_MAP[e.event_type] ?? "casual";
      maxFormalityLevel = Math.max(maxFormalityLevel, fOrder[f] ?? 0);
    }

    for (const item of items) {
      if (!item.formality) continue;
      const itemLevel = fOrder[item.formality] ?? 0;
      if (maxFormalityLevel >= 2 && itemLevel === 0) {
        warnings.push({
          type: "formality",
          severity: "high",
          message: `${item.name}はフォーマルな予定に対してカジュアルすぎます`,
        });
      }
    }
  }

  /* ── 動きやすさリスク ── */
  const isActive = events.some(e => ["sports", "outdoor"].includes(e.event_type));
  if (isActive) {
    const stiffItems = items.filter(i =>
      i.attributes?.stretch === "none" && (i.category === "bottoms" || i.category === "tops")
    );
    if (stiffItems.length > 0) {
      warnings.push({
        type: "mobility",
        severity: "medium",
        message: `${stiffItems[0].name}はストレッチ性がなくアクティブな動きに不向き`,
      });
    }
  }

  /* ── 繰り返しリスク ── */
  if (recentlyWornIds) {
    const repeatItems = items.filter(i => recentlyWornIds.has(i.id));
    if (repeatItems.length >= 2) {
      warnings.push({
        type: "repetition",
        severity: "low",
        message: `${repeatItems.length}点が最近着用済み — 着回しバランスに注意`,
      });
    }
  }

  return warnings.slice(0, 5);
}
