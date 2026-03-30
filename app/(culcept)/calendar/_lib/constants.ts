import type { SyncBand } from "./types";
import type { FormalityCode, ThicknessCode } from "@/app/my-style/_lib/taxonomy";

/* ── SYNC バンド閾値 ── */
export function getSyncBand(total: number): SyncBand {
  if (total >= 85) return "excellent";
  if (total >= 65) return "good";
  if (total >= 45) return "caution";
  return "risk";
}

export const SYNC_BAND_COLORS: Record<SyncBand, { bg: string; text: string; border: string; ring: string }> = {
  excellent: { bg: "bg-emerald-50/60", text: "text-emerald-600", border: "border-emerald-300/40", ring: "#10b981" },
  good:      { bg: "bg-blue-50/60",    text: "text-blue-600",    border: "border-blue-300/40",    ring: "#3b82f6" },
  caution:   { bg: "bg-amber-50/60",   text: "text-amber-600",   border: "border-amber-300/40",   ring: "#f59e0b" },
  risk:      { bg: "bg-red-50/60",     text: "text-red-500",     border: "border-red-300/40",     ring: "#ef4444" },
};

export const SYNC_BAND_LABELS: Record<SyncBand, string> = {
  excellent: "最適",
  good: "良好",
  caution: "注意",
  risk: "要調整",
};

/* ── TPO → フォーマリティ ── */
export const TPO_FORMALITY_MAP: Record<string, FormalityCode> = {
  work: "smart",
  meeting: "dress",
  date: "smart",
  party: "dress",
  casual: "casual",
  outdoor: "casual",
  sports: "casual",
  travel: "casual",
};

/* ── 気温 → 厚み推奨 ── */
export function getRecommendedThickness(tempMax: number | null): { thickness: ThicknessCode; needsOuter: boolean } {
  if (tempMax === null) return { thickness: "mid", needsOuter: false };
  if (tempMax >= 25) return { thickness: "thin", needsOuter: false };
  if (tempMax >= 15) return { thickness: "mid", needsOuter: false };
  if (tempMax >= 5)  return { thickness: "mid", needsOuter: true };
  return { thickness: "thick", needsOuter: true };
}

/* ── シルエット相性 ── */
export const SILHOUETTE_HARMONY: Record<string, Record<string, number>> = {
  slim:      { slim: 18, regular: 22, loose: 25, oversized: 20 },
  regular:   { slim: 22, regular: 20, loose: 22, oversized: 18 },
  loose:     { slim: 25, regular: 22, loose: 18, oversized: 15 },
  oversized: { slim: 22, regular: 20, loose: 15, oversized: 10 },
};

/* ── ムードタグ ── */
export const MOOD_TAGS: Record<string, string> = {
  casual_relaxed: "リラックス",
  casual_active: "アクティブ",
  smart_clean: "きれいめ",
  smart_sharp: "シャープ",
  dress_elegant: "エレガント",
  dress_classic: "クラシック",
  minimal: "ミニマル",
  layered: "レイヤード",
  soft: "柔らかい",
  bold: "強め",
};

/* ── イベントアイコン ── */
export const EVENT_ICONS: Record<string, string> = {
  work: "💼", meeting: "👔", date: "💕", party: "🎉",
  casual: "😎", outdoor: "🏕️", sports: "🏃", travel: "✈️",
};

/* ── 天気アイコン ── */
export const DAILY_WEATHER_ICONS: Record<string, string> = {
  sun: "☀️", cloud: "☁️", rain: "🌧️", snow: "❄️", storm: "⛈️", fog: "🌫️", unknown: "🌤️",
};

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/* ── 月の季節推定 ── */
export function getSeasonForMonth(month: number): "ss" | "aw" {
  return month >= 4 && month <= 9 ? "ss" : "aw";
}
