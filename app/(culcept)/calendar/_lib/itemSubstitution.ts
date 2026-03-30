/**
 * アイテム代替提案エンジン
 *
 * 「このアイテムがなければ、代わりにこれを」
 * ワードローブ内で最適な代替を見つけ、SYNC影響度を評価する。
 */

import type { WardrobeItem } from "@/app/my-style/_lib/types";
import type { WeatherDaily } from "./types";
import type { ExtendedWeatherContext } from "./materialWeather";
import { inferMaterial, scoreMaterialWeather } from "./materialWeather";

/* ── 代替候補 ── */
export interface SubstitutionCandidate {
  original: WardrobeItem;
  substitute: WardrobeItem;
  reason: string;
  syncImpact: number; // -10 ~ +10 (正=改善, 負=劣化)
  confidence: number; // 0-1
}

/* ── 提案結果 ── */
export interface SubstitutionResult {
  substitutions: SubstitutionCandidate[];
  hasAlternatives: boolean;
}

/* ── メイン: アウトフィットの各アイテムに代替提案 ── */
export function findSubstitutions(
  outfitItems: WardrobeItem[],
  fullWardrobe: WardrobeItem[],
  weather: WeatherDaily | null,
  extWeather: ExtendedWeatherContext | null,
  events: Array<{ event_type: string }>,
): SubstitutionResult {
  const substitutions: SubstitutionCandidate[] = [];
  const outfitIds = new Set(outfitItems.map(i => i.id));

  for (const original of outfitItems) {
    // 同カテゴリの代替候補
    const candidates = fullWardrobe.filter(w =>
      w.id !== original.id &&
      !outfitIds.has(w.id) &&
      isSameCategory(w, original)
    );

    if (candidates.length === 0) continue;

    // スコアリング
    const scored = candidates.map(sub => {
      let impact = 0;
      const reasons: string[] = [];
      let conf = 0.5;

      // 1. 素材×天候の比較
      if (extWeather) {
        const origMat = inferMaterial(original);
        const subMat = inferMaterial(sub);
        const origScore = scoreMaterialWeather(origMat, extWeather);
        const subScore = scoreMaterialWeather(subMat, extWeather);
        const diff = subScore.score - origScore.score;
        if (diff >= 1) {
          impact += Math.min(3, diff);
          reasons.push(`素材が天候により適合`);
        } else if (diff <= -1) {
          impact += Math.max(-3, diff);
          reasons.push(`素材の天候適合が低下`);
        }
      }

      // 2. 厚み適合
      if (weather?.temp_max != null) {
        const temp = weather.temp_max;
        const idealThickness = temp >= 25 ? "thin" : temp >= 15 ? "mid" : "thick";
        if (sub.thickness === idealThickness && original.thickness !== idealThickness) {
          impact += 2;
          reasons.push("厚みが気温にマッチ");
          conf += 0.1;
        } else if (original.thickness === idealThickness && sub.thickness !== idealThickness) {
          impact -= 2;
        }
      }

      // 3. フォーマリティ適合
      const formalityOrder: Record<string, number> = { casual: 0, smart: 1, dress: 2 };
      const hasFormalEvent = events.some(e => ["meeting", "date", "party"].includes(e.event_type));
      if (hasFormalEvent) {
        const origF = formalityOrder[original.formality ?? "casual"] ?? 0;
        const subF = formalityOrder[sub.formality ?? "casual"] ?? 0;
        if (subF > origF) {
          impact += 1;
          reasons.push("よりフォーマルなイベント対応");
        } else if (subF < origF) {
          impact -= 1;
        }
      }

      // 4. 季節適合 (SeasonCode: "ss" | "aw" | "all")
      if (original.season && sub.season) {
        const month = new Date().getMonth() + 1;
        const currentSeasonCode = (month >= 4 && month <= 9) ? "ss" : "aw";
        if (sub.season === currentSeasonCode && original.season !== currentSeasonCode && original.season !== "all") {
          impact += 1;
          reasons.push("季節にマッチ");
        }
      }

      // 5. 色の新鮮さ（同系色ばかり避ける）
      const otherColors = outfitItems.filter(i => i.id !== original.id).map(i => i.colorHex || i.color).filter(Boolean);
      const subColor = sub.colorHex || sub.color;
      if (subColor && otherColors.length > 0) {
        const allSame = otherColors.every(c => c === subColor);
        if (!allSame && (original.colorHex || original.color) === subColor) {
          // 代替が元と同じ色なら変化なし
        } else if (!allSame) {
          // 異なる色で多様性UP
          conf += 0.05;
        }
      }

      // 雨天時の防水チェック
      const isRainy = weather?.outfit_tag === "rain" || weather?.weather_icon === "rain";
      if (isRainy && original.category === "shoes") {
        const subWater = sub.attributes?.water;
        const origWater = original.attributes?.water;
        if ((subWater === "waterproof" || subWater === "repellent") && origWater !== "waterproof" && origWater !== "repellent") {
          impact += 3;
          reasons.push("防水仕様で雨対応");
          conf += 0.2;
        }
      }

      return {
        original,
        substitute: sub,
        reason: reasons.length > 0 ? reasons[0] : "同カテゴリの代替候補",
        syncImpact: Math.max(-10, Math.min(10, impact)),
        confidence: Math.min(1, conf),
      };
    });

    // 最も影響度の高い代替を選択
    scored.sort((a, b) => b.syncImpact - a.syncImpact || b.confidence - a.confidence);
    const best = scored[0];
    if (best && (best.syncImpact > 0 || best.confidence >= 0.5)) {
      substitutions.push(best);
    }
  }

  // impactの高い順
  substitutions.sort((a, b) => b.syncImpact - a.syncImpact);

  return {
    substitutions: substitutions.slice(0, 3), // 最大3つまで
    hasAlternatives: substitutions.length > 0,
  };
}

/* ── カテゴリ一致判定 ── */
function isSameCategory(a: WardrobeItem, b: WardrobeItem): boolean {
  const normalize = (cat: string | undefined) => {
    if (!cat) return "unknown";
    if (cat === "outer" || cat === "outerwear") return "outerwear";
    return cat;
  };
  return normalize(a.category) === normalize(b.category);
}
