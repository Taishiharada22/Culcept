/**
 * ワードローブギャップ検出
 *
 * ユーザーのワードローブを分析し、不足カテゴリ・天候対応アイテム・
 * 季節対応を検出。購入提案を生成する。
 */

import type { WardrobeItem } from "@/app/my-style/_lib/types";
import type { WeatherDaily, WornRecord } from "./types";
import type { ExtendedWeatherContext } from "./materialWeather";
import { inferMaterial, type MaterialCategory } from "./materialWeather";

/* ── ギャップ種別 ── */
export type GapType =
  | "missing_category"     // カテゴリ不足（靴ゼロ等）
  | "weather_coverage"     // 天候対応不足（雨用靴なし等）
  | "season_coverage"      // 季節対応不足（冬物ゼロ等）
  | "material_diversity"   // 素材多様性不足
  | "formality_gap"        // フォーマリティ不足
  | "color_monotony";      // カラーバリエーション不足

export interface WardrobeGap {
  type: GapType;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  suggestion: string;
  icon: string;
}

export interface GapAnalysis {
  gaps: WardrobeGap[];
  overallScore: number; // 0-100 (100 = 完璧なワードローブ)
  strongPoints: string[];
}

/* ── カテゴリ定義 ── */
const ESSENTIAL_CATEGORIES = ["tops", "bottoms", "shoes"] as const;
const EXTENDED_CATEGORIES = ["outerwear", "outer", "accessories"] as const;

/* ── メイン分析 ── */
export function analyzeWardrobeGaps(
  wardrobe: WardrobeItem[],
  recentWeather?: WeatherDaily[],
  wornHistory?: WornRecord[],
): GapAnalysis {
  const gaps: WardrobeGap[] = [];
  const strongPoints: string[] = [];
  let score = 100;

  if (wardrobe.length === 0) {
    return {
      gaps: [{ type: "missing_category", severity: "high", title: "ワードローブが空です", description: "アイテムを登録してコーデ提案を受けましょう", suggestion: "トップス・ボトムス・靴を最低1つずつ登録", icon: "👗" }],
      overallScore: 0,
      strongPoints: [],
    };
  }

  // カテゴリマップ
  const catMap = new Map<string, WardrobeItem[]>();
  for (const item of wardrobe) {
    const cat = item.category || "unknown";
    if (!catMap.has(cat)) catMap.set(cat, []);
    catMap.get(cat)!.push(item);
  }

  // 1. 必須カテゴリチェック
  for (const cat of ESSENTIAL_CATEGORIES) {
    const items = catMap.get(cat) ?? [];
    if (items.length === 0) {
      gaps.push({
        type: "missing_category",
        severity: "high",
        title: `${categoryJa(cat)}がありません`,
        description: `コーデ提案に${categoryJa(cat)}は必須です`,
        suggestion: `${categoryJa(cat)}を最低2-3点登録しましょう`,
        icon: categoryIcon(cat),
      });
      score -= 20;
    } else if (items.length < 3) {
      gaps.push({
        type: "missing_category",
        severity: "medium",
        title: `${categoryJa(cat)}が少なめ（${items.length}点）`,
        description: "バリエーションが限られ提案の幅が狭くなります",
        suggestion: `${categoryJa(cat)}をあと${3 - items.length}点追加すると提案の質が向上`,
        icon: categoryIcon(cat),
      });
      score -= 8;
    } else {
      strongPoints.push(`${categoryJa(cat)}: ${items.length}点`);
    }
  }

  // 2. 天候対応チェック
  const hasRainwear = wardrobe.some(i =>
    i.attributes?.water === "waterproof" || i.attributes?.water === "repellent" ||
    (i.name ?? "").includes("レイン") || (i.name ?? "").includes("防水")
  );
  const hasRainShoes = (catMap.get("shoes") ?? []).some(i =>
    i.attributes?.water === "waterproof" || i.attributes?.water === "repellent" ||
    (i.name ?? "").includes("レイン") || (i.name ?? "").includes("防水") || (i.name ?? "").includes("ブーツ")
  );

  if (!hasRainwear) {
    gaps.push({
      type: "weather_coverage",
      severity: "medium",
      title: "防水アイテムがありません",
      description: "雨の日のコーデが弱くなります",
      suggestion: "撥水加工のアウターやレインコートの追加を検討",
      icon: "☔",
    });
    score -= 10;
  }
  if (!hasRainShoes) {
    gaps.push({
      type: "weather_coverage",
      severity: "medium",
      title: "防水靴がありません",
      description: "雨の日に適切な靴の提案ができません",
      suggestion: "防水スニーカーやレインブーツを1足追加",
      icon: "👢",
    });
    score -= 8;
  }

  // 3. 季節対応チェック
  const seasonItems = { spring: 0, summer: 0, autumn: 0, winter: 0, all: 0 };
  for (const item of wardrobe) {
    const s = item.season as keyof typeof seasonItems | undefined;
    if (s && s in seasonItems) seasonItems[s]++;
    else seasonItems.all++;
  }

  const thickItems = wardrobe.filter(i => i.thickness === "thick");
  const thinItems = wardrobe.filter(i => i.thickness === "thin");

  if (thickItems.length === 0) {
    gaps.push({
      type: "season_coverage",
      severity: "medium",
      title: "厚手アイテムがゼロ",
      description: "寒い日のコーデが組めません",
      suggestion: "ニット・フリース・厚手コートを追加",
      icon: "🧥",
    });
    score -= 10;
  }
  if (thinItems.length === 0) {
    gaps.push({
      type: "season_coverage",
      severity: "low",
      title: "薄手アイテムがゼロ",
      description: "暑い日の選択肢が限られます",
      suggestion: "Tシャツ・リネンシャツなど薄手素材を追加",
      icon: "🌞",
    });
    score -= 5;
  }

  // アウターチェック
  const outerItems = [...(catMap.get("outerwear") ?? []), ...(catMap.get("outer") ?? [])];
  if (outerItems.length === 0) {
    gaps.push({
      type: "missing_category",
      severity: "medium",
      title: "アウターがありません",
      description: "寒い日・雨の日のレイヤードができません",
      suggestion: "ジャケット・コートを最低1着登録",
      icon: "🧥",
    });
    score -= 12;
  } else if (outerItems.length >= 3) {
    strongPoints.push(`アウター: ${outerItems.length}点で充実`);
  }

  // 4. 素材多様性チェック
  const materials = new Set<MaterialCategory>();
  for (const item of wardrobe) {
    const mat = inferMaterial(item);
    if (mat !== "unknown") materials.add(mat);
  }

  if (materials.size <= 2 && wardrobe.length >= 5) {
    gaps.push({
      type: "material_diversity",
      severity: "low",
      title: "素材バリエーションが少なめ",
      description: `${materials.size}種類のみ。天候に応じた素材選択の幅が狭い`,
      suggestion: "異なる素材のアイテムを追加すると天候対応力UP",
      icon: "🧶",
    });
    score -= 5;
  } else if (materials.size >= 5) {
    strongPoints.push(`素材多様性: ${materials.size}種類`);
  }

  // 5. フォーマリティチェック
  const formalityMap = { casual: 0, smart: 0, dress: 0 };
  for (const item of wardrobe) {
    const f = item.formality as keyof typeof formalityMap | undefined;
    if (f && f in formalityMap) formalityMap[f]++;
  }
  if (formalityMap.dress === 0 && formalityMap.smart === 0) {
    gaps.push({
      type: "formality_gap",
      severity: "low",
      title: "きれいめアイテムがゼロ",
      description: "フォーマルな予定に対応できません",
      suggestion: "ジャケット・革靴・きれいめパンツを追加",
      icon: "👔",
    });
    score -= 5;
  }

  // 6. カラーバリエーション
  const colorBuckets = new Set<string>();
  for (const item of wardrobe) {
    const hex = item.colorHex || item.color;
    if (!hex) continue;
    colorBuckets.add(getColorFamily(hex));
  }
  if (colorBuckets.size <= 2 && wardrobe.length >= 5) {
    gaps.push({
      type: "color_monotony",
      severity: "low",
      title: "カラーバリエーションが少なめ",
      description: `${colorBuckets.size}系統のみ。コーデの幅が狭くなりがち`,
      suggestion: "差し色になるアクセントカラーのアイテムを追加",
      icon: "🎨",
    });
    score -= 5;
  } else if (colorBuckets.size >= 5) {
    strongPoints.push(`カラー: ${colorBuckets.size}系統で豊富`);
  }

  // スコアをクランプ
  score = Math.max(0, Math.min(100, score));

  // severity順ソート
  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  gaps.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

  return { gaps, overallScore: score, strongPoints };
}

/* ── ヘルパー ── */
function categoryJa(cat: string): string {
  const m: Record<string, string> = { tops: "トップス", bottoms: "ボトムス", shoes: "靴", outerwear: "アウター", outer: "アウター", accessories: "アクセサリー" };
  return m[cat] ?? cat;
}

function categoryIcon(cat: string): string {
  const m: Record<string, string> = { tops: "👕", bottoms: "👖", shoes: "👟", outerwear: "🧥", outer: "🧥", accessories: "💍" };
  return m[cat] ?? "👗";
}

function getColorFamily(hex: string): string {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return "unknown";
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  // モノクロ判定
  if (max - min < 30) {
    if (l < 50) return "black";
    if (l > 200) return "white";
    return "gray";
  }

  // hue算出
  const d = max - min;
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;

  if (h < 30 || h >= 330) return "red";
  if (h < 60) return "orange";
  if (h < 90) return "yellow";
  if (h < 150) return "green";
  if (h < 210) return "cyan";
  if (h < 270) return "blue";
  return "purple";
}
