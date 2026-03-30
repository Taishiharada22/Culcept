/**
 * PersonaGenome → SYNC スコアリング連携
 *
 * PersonaGenome の4レイヤーからカレンダーに関連するデータを抽出し、
 * SYNC スコアのブーストと outfitEngine の候補選択を強化する。
 *
 * 連携ポイント:
 *  - Physical.pcSeason4    → Visual Harmony: アイテム色とPCシーズンの相性
 *  - Physical.bodySubtype  → Visual Harmony: シルエット推奨の微調整
 *  - Behavioral.silhouettePreference → 候補ソートに加味
 *  - Behavioral.materialPreference   → 候補ソートに加味
 *  - Behavioral.dominantColorAxis    → Visual Harmony 色軸ブースト
 *  - Personality dimensions  → ムードタグの精度向上
 */

import type { PersonaGenome, PhysicalLayer, BehavioralLayer, PersonalityLayer } from "@/lib/aneurasync/personaGenome";
import type { WardrobeItem } from "@/app/my-style/_lib/types";

/* ── カレンダー向け軽量プロファイル ── */
export interface CalendarPersonaProfile {
  pcSeason4: string | null;       // spring / summer / autumn / winter
  bodySubtype: string | null;     // 7-type body classification
  silhouettePref: Record<string, number>; // silhouette → preference weight
  materialPref: Record<string, number>;   // material → preference weight
  dominantColorAxis: string;      // dark / low_sat / neutral / light / high_sat
  dominantSilhouetteAxis: string; // tight / neutral / relaxed / oversize
  styleAxis: {
    minimal_vs_maximal: number;   // -1 to +1
    classic_vs_trendy: number;
    cautious_vs_bold: number;
    function_vs_expression: number;
  };
  completeness: number;           // 0-100
}

/* ── PersonaGenome → CalendarPersonaProfile 変換 ── */
export function extractCalendarProfile(genome: PersonaGenome): CalendarPersonaProfile {
  const getDimScore = (id: string): number => {
    const dim = genome.personality.dimensions.find(d => d.dimension === id);
    return dim ? dim.score : 0;
  };

  return {
    pcSeason4: genome.physical.pcSeason4,
    bodySubtype: genome.physical.bodySubtype,
    silhouettePref: genome.behavioral.silhouettePreference ?? {},
    materialPref: genome.behavioral.materialPreference ?? {},
    dominantColorAxis: genome.behavioral.dominantColorAxis ?? "neutral",
    dominantSilhouetteAxis: genome.behavioral.dominantSilhouetteAxis ?? "neutral",
    styleAxis: {
      minimal_vs_maximal: getDimScore("minimal_vs_maximal"),
      classic_vs_trendy: getDimScore("classic_vs_trendy"),
      cautious_vs_bold: getDimScore("cautious_vs_bold"),
      function_vs_expression: getDimScore("function_vs_expression"),
    },
    completeness: genome.completeness,
  };
}

/* ── PC シーズン × アイテム色ブースト ── */
const PC_SEASON_HUE_AFFINITY: Record<string, { hueRange: [number, number]; warmth: "warm" | "cool"; brightness: "bright" | "muted" }> = {
  spring:  { hueRange: [30, 80],   warmth: "warm",  brightness: "bright" },
  summer:  { hueRange: [180, 270], warmth: "cool",  brightness: "muted"  },
  autumn:  { hueRange: [15, 55],   warmth: "warm",  brightness: "muted"  },
  winter:  { hueRange: [260, 350], warmth: "cool",  brightness: "bright" },
};

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

/**
 * PCシーズンとアイテム色の相性スコア (0〜+3)
 */
export function pcColorBoost(pcSeason: string | null, item: WardrobeItem): number {
  if (!pcSeason) return 0;
  const affinity = PC_SEASON_HUE_AFFINITY[pcSeason];
  if (!affinity) return 0;

  const hex = item.colorHex || item.color;
  if (!hex) return 0;
  const hsl = hexToHsl(hex);
  if (!hsl) return 0;

  let boost = 0;

  // 色相が好みレンジに入っているか
  const [lo, hi] = affinity.hueRange;
  const inRange = lo <= hi
    ? (hsl.h >= lo && hsl.h <= hi)
    : (hsl.h >= lo || hsl.h <= hi);
  if (inRange) boost += 1;

  // 暖色/寒色マッチ
  const isWarm = hsl.h >= 0 && hsl.h <= 60 || hsl.h >= 300;
  if ((affinity.warmth === "warm" && isWarm) || (affinity.warmth === "cool" && !isWarm)) {
    boost += 1;
  }

  // 彩度/明度マッチ
  if (affinity.brightness === "bright" && hsl.s > 0.4 && hsl.l > 0.4) boost += 1;
  if (affinity.brightness === "muted" && (hsl.s <= 0.5 || hsl.l <= 0.5)) boost += 1;

  return Math.min(3, boost);
}

/**
 * シルエット好みブースト (0〜+2)
 */
export function silhouettePreferenceBoost(profile: CalendarPersonaProfile, item: WardrobeItem): number {
  if (!item.silhouette || Object.keys(profile.silhouettePref).length === 0) return 0;
  const pref = profile.silhouettePref[item.silhouette] ?? 0;
  // prefは通常0〜1のweight → 0.6以上で+1, 0.8以上で+2
  if (pref >= 0.8) return 2;
  if (pref >= 0.6) return 1;
  return 0;
}

/**
 * 素材好みブースト (0〜+2)
 */
export function materialPreferenceBoost(profile: CalendarPersonaProfile, item: WardrobeItem): number {
  if (!item.materialFamily || item.materialFamily.length === 0 || Object.keys(profile.materialPref).length === 0) return 0;
  const pref = Math.max(...item.materialFamily.map(m => profile.materialPref[m] ?? 0));
  if (pref >= 0.8) return 2;
  if (pref >= 0.6) return 1;
  return 0;
}

/**
 * Visual Harmony のPC補正 (0〜+3)
 * 全アイテムのPCカラーブーストの平均
 */
export function computePcVisualBoost(profile: CalendarPersonaProfile, items: WardrobeItem[]): number {
  if (!profile.pcSeason4 || items.length === 0) return 0;
  const boosts = items.map(i => pcColorBoost(profile.pcSeason4, i));
  return Math.round(boosts.reduce((a, b) => a + b, 0) / items.length);
}

/**
 * outfitEngine 候補スコアリング用の合算ブースト
 */
export function candidatePersonaBoost(profile: CalendarPersonaProfile, item: WardrobeItem): number {
  let boost = 0;
  boost += pcColorBoost(profile.pcSeason4, item);
  boost += silhouettePreferenceBoost(profile, item);
  boost += materialPreferenceBoost(profile, item);
  return boost;
}

/**
 * パーソナリティ軸からスタイルムード方向を推定
 * returns: "minimal" | "bold" | "classic" | "expressive" | "neutral"
 */
export function inferPersonaStyleDirection(profile: CalendarPersonaProfile): string {
  const { minimal_vs_maximal, classic_vs_trendy, cautious_vs_bold, function_vs_expression } = profile.styleAxis;

  // 各軸が -1 to +1 のスコア
  // minimal寄り（負値が大きい）→ ミニマル
  if (minimal_vs_maximal < -0.3 && function_vs_expression < -0.2) return "minimal";
  // 大胆寄り → ボールド
  if (cautious_vs_bold > 0.3 && minimal_vs_maximal > 0.2) return "bold";
  // クラシック寄り → クラシック
  if (classic_vs_trendy < -0.3) return "classic";
  // 表現重視 → エクスプレッシブ
  if (function_vs_expression > 0.3) return "expressive";

  return "neutral";
}
