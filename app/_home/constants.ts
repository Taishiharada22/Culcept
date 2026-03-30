/**
 * Home page shared constants, types, and style helpers.
 * Extracted from AneurasyncHome.tsx to reduce main component size.
 */
import type React from "react";

/* ═══ COLORS ═══ */
export const C = {
  bg: "#060510",
  s1: "#ffffff",
  s2: "#f5f6fa",
  s3: "#ecedf4",
  s4: "#e0e2ee",
  sync: "#3B82F6",
  neural: "#8B5CF6",
  pulse: "#EC4899",
  amber: "#F59E0B",
  gold: "#EAB308",
  rv: "#EF4444",
  style: "#A855F7",
  t1: "#1a1a2e",
  t2: "#4a4a68",
  t3: "#8888a0",
  t4: "#c8c8dc",
};

/* ═══ ZONE ACCENTS ═══ */
export const Z = {
  presence: { accent: C.sync, light: "#D6E4FF", deep: "#C2D6FF", shadow: "rgba(59,130,246,0.22)" },
  observation: { accent: "#6366F1", light: "#DBD8FF", deep: "#CCC8FF", shadow: "rgba(99,102,241,0.22)" },
  identity: { accent: C.neural, light: "#E0D4FF", deep: "#D0C0FF", shadow: "rgba(139,92,246,0.22)" },
  preexp: { accent: C.sync, light: "#D6E4FF", deep: "#C2D6FF", shadow: "rgba(59,130,246,0.22)" },
  rendezvous: { accent: C.rv, light: "#FFD9D1", deep: "#FFC8BC", shadow: "rgba(239,68,68,0.22)" },
  outfit: { accent: "#14B8A6", light: "#C8F5E3", deep: "#B0EDDA", shadow: "rgba(20,184,166,0.22)" },
  proposal: { accent: C.pulse, light: "#FCDCEC", deep: "#F8C8DE", shadow: "rgba(236,72,153,0.22)" },
  community: { accent: C.neural, light: "#E0D4FF", deep: "#D0C0FF", shadow: "rgba(139,92,246,0.22)" },
  exploration: { accent: C.amber, light: "#FDEACC", deep: "#FBDFB5", shadow: "rgba(245,158,11,0.22)" },
  dailyObs: { accent: C.sync, light: "#D6E4FF", deep: "#C2D6FF", shadow: "rgba(59,130,246,0.22)" },
};

/* ═══ BACKGROUND ═══ */
export const BG_TOP = "#f8f6f3";
export const BG_GRADIENT = `linear-gradient(180deg, ${BG_TOP} 0%, #f6f3f0 30%, #f4f1ed 60%, #f6f3f0 100%)`;

/* ═══ STYLE HELPERS ═══ */
export const zoneGlow = (zone: keyof typeof Z): React.CSSProperties => ({
  position: "absolute" as const,
  top: -60,
  left: "50%",
  transform: "translateX(-50%)",
  width: 600,
  height: 300,
  borderRadius: "50%",
  background: `radial-gradient(ellipse, ${Z[zone].shadow}, transparent 70%)`,
  pointerEvents: "none" as const,
  zIndex: 0,
});

export const zoneCard = (zone: keyof typeof Z, extra?: React.CSSProperties): React.CSSProperties => ({
  borderRadius: 20,
  background: "#ffffff",
  border: `1px solid rgba(0,0,0,0.04)`,
  boxShadow: `0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)`,
  padding: 20,
  textDecoration: "none",
  color: "inherit",
  transition: "box-shadow 0.35s, transform 0.35s",
  ...extra,
});

export const denseZoneCard = (zone: keyof typeof Z, extra?: React.CSSProperties): React.CSSProperties => ({
  borderRadius: 18,
  background: `linear-gradient(148deg, ${Z[zone].deep}FF 0%, #fbfbff 34%, ${Z[zone].light}FF 100%)`,
  border: `1.5px solid ${Z[zone].accent}90`,
  boxShadow: `0 20px 42px ${Z[zone].shadow}, 0 6px 16px rgba(30, 24, 54, 0.14), inset 0 1px 0 rgba(255,255,255,0.92)`,
  padding: 20,
  textDecoration: "none",
  color: "inherit",
  transition: "box-shadow 0.3s, transform 0.3s",
  ...extra,
});

export const identityNodeCard = (color: string, hovered: boolean, compact = false): React.CSSProperties => ({
  minWidth: compact ? 110 : 124,
  padding: compact ? "10px 12px" : "12px 14px",
  borderRadius: compact ? 18 : 20,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  background: `linear-gradient(160deg, ${color}74 0%, rgba(255,255,255,0.998) 30%, rgba(238,242,255,1) 62%, ${color}54 100%)`,
  border: `1px solid ${color}90`,
  backdropFilter: "blur(3px) saturate(116%)",
  WebkitBackdropFilter: "blur(3px) saturate(116%)",
  boxShadow: hovered
    ? `0 24px 52px ${color}3a, 0 9px 22px rgba(36,30,68,0.16), inset 0 1px 0 rgba(255,255,255,0.94)`
    : `0 18px 38px ${color}30, 0 7px 18px rgba(36,30,68,0.14), inset 0 1px 0 rgba(255,255,255,0.9)`,
  transition: "box-shadow 0.35s, transform 0.35s, background 0.35s",
});

export const identityNodeIcon = (color: string, hovered: boolean, compact = false): React.CSSProperties => ({
  width: compact ? 56 : 66,
  height: compact ? 56 : 66,
  borderRadius: compact ? 16 : 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: `radial-gradient(circle at 34% 28%, ${color}b4 0%, ${color}72 42%, rgba(255,255,255,0.82) 100%)`,
  border: `1px solid ${color}90`,
  boxShadow: hovered
    ? `0 0 40px ${color}42, 0 14px 28px ${color}24, inset 0 0 28px ${color}2a`
    : `0 14px 26px ${color}30, inset 0 0 24px ${color}1e`,
  transition: "box-shadow 0.35s, transform 0.35s",
});

export const mono = "'JetBrains Mono','SF Mono',monospace";

export const HOME_FLOATING_LAYOUT = {
  instrumentRailOffsetY: 0,
  instrumentRailMobileOffsetY: 0,
  talkFabBottom: 88,
  talkFabMobileBottom: 80,
};

/* ═══ TYPES ═══ */
export type RecommendationView = {
  href: string;
  name: string;
  brand: string;
  price: string;
  tag: string;
  score: number;
  why: string;
  image?: string;
};

export type ActivityItem = {
  icon: string;
  text: string;
  time: string;
  href?: string;
};

export type WeekDay = {
  d: string;
  n: number;
  i: string;
  hi: number;
  lo: number;
  now?: boolean;
  s: number;
};

export type ObservationLevel = 0 | 1 | 2 | 3 | 4;
export type ObservationLevelInfo = {
  level: ObservationLevel;
  name: string;
  description: string;
  nextAction: string;
};

/* ═══ OBSERVATION LEVEL ═══ */
export const IDENTITY_RECOMMENDED_ORDER: Record<string, number> = {
  origin: 1,
  genome: 2,
  style: 3,
  phenotype: 4,
  presence: 5,
};

const LEVEL_LABELS: Record<ObservationLevel, { name: string; description: string }> = {
  0: { name: "🌑 未観測", description: "最初の質問に答えてみよう" },
  1: { name: "🌒 覚醒", description: "あなたの基本的な傾向が見えてきたよ" },
  2: { name: "🌓 探索", description: "いろんな面からデータが集まってきてるよ" },
  3: { name: "🌔 深化", description: "あなたの全体像がだいぶ見えてきた" },
  4: { name: "🌕 統合", description: "あなたのことがかなり正確にわかってきた" },
};

export function computeObservationLevel(
  sgData: { observationCount?: number; confidence?: number; phase?: string } | null,
  identityLive: any,
  ptData: { pct: number } | null,
): ObservationLevelInfo {
  const obsCount = sgData?.observationCount ?? 0;
  const confidence = sgData?.confidence ?? 0;
  const pcts = {
    origin: identityLive?.origin?.pct ?? 0,
    genome: identityLive?.genome?.pct ?? 0,
    phenotype: ptData?.pct ?? 0,
    presence: identityLive?.presence?.pct ?? 0,
    style: identityLive?.style?.pct ?? 0,
  };
  const activePcts = Object.values(pcts);
  const aboveThreshold = (threshold: number) => activePcts.filter(p => p >= threshold).length;
  const allAbove = (threshold: number) => activePcts.every(p => p >= threshold);

  let level: ObservationLevel = 0;
  if (confidence >= 0.7 && allAbove(30)) level = 4;
  else if (obsCount >= 50 && allAbove(10)) level = 3;
  else if (obsCount >= 20 && aboveThreshold(20) >= 2) level = 2;
  else if (obsCount >= 5 || aboveThreshold(10) >= 1) level = 1;

  const info = LEVEL_LABELS[level];
  const emptyKeys = Object.entries(pcts).filter(([, v]) => v === 0).map(([k]) => k);
  const ELEMENT_LABELS: Record<string, string> = { origin: "Origin", genome: "Genome", phenotype: "Phenotype", presence: "Presence", style: "Style" };
  let nextAction = "";
  if (emptyKeys.length >= 4) nextAction = "各セクションに情報を入れると、あなたのことがもっとわかるようになるよ";
  else if (emptyKeys.length > 0) nextAction = `${emptyKeys.map(k => ELEMENT_LABELS[k]).join("・")} を入力するともっと正確になるよ`;
  else if (level < 4) nextAction = `精度${Math.round(confidence * 100)}% — もう少し答えると統合レベルに到達するよ`;
  else nextAction = "あなたのことがかなり正確にわかってきた";

  return { level, name: info.name, description: info.description, nextAction };
}

/* ═══ DATA CONSTANTS ═══ */
export const weather = { temp: 18, icon: "🌧", hi: 20, lo: 10, hum: 36, tip: "撥水素材 & 暗色が安心" };
export const week: WeekDay[] = [
  { d: "金", n: 6, i: "🌧", hi: 10, lo: 7, now: true, s: 3 },
  { d: "土", n: 7, i: "⛅", hi: 12, lo: 7, s: 2 },
  { d: "日", n: 8, i: "☀️", hi: 16, lo: 14, s: 3 },
  { d: "月", n: 9, i: "⛅", hi: 8, lo: 3, s: 3 },
  { d: "火", n: 10, i: "⛅", hi: 12, lo: 10, s: 2 },
  { d: "水", n: 11, i: "❄️", hi: 12, lo: 11, s: 2 },
  { d: "木", n: 12, i: "☀️", hi: 8, lo: 8, s: 3 },
];
export const outfitSlots = [
  { cat: "OUTER", name: "撥水マウンテンパーカー", my: true, emoji: "🧥" },
  { cat: "TOP", name: "ボーダーカットソー", my: true, emoji: "👕" },
  { cat: "BOTTOM", name: "テーパードパンツ", my: true, emoji: "👖" },
  { cat: "SHOES", name: "防水ブーツ", my: true, emoji: "👢" },
  { cat: "ACC", name: "折りたたみ傘", my: false, price: "¥3,800", emoji: "☂️" },
];
export const picks = [
  { name: "オーバーサイズ MA-1", brand: "URBAN CRAFT", price: "¥14,800", tag: "TREND", score: 94, why: "好みとの一致率 94%" },
  { name: "ワイドカーゴパンツ", brand: "NOID", price: "¥9,800", tag: "HOT", score: 91, why: "体型フィットスコア 91" },
  { name: "シアーニットベスト", brand: "LAYERED", price: "¥7,200", tag: "NEW", score: 88, why: "スタイルレーン一致 88%" },
  { name: "プラットフォームローファー", brand: "SOLE THEORY", price: "¥18,500", tag: "PICK", score: 86, why: "トレンドスコア上位 86" },
];
export const tagC: Record<string, string> = { TREND: C.pulse, HOT: C.amber, NEW: C.sync, PICK: C.neural, SHOP: C.neural, SWIPE: C.sync, TASTE: C.gold, AI: C.neural };

export const identity: Record<string, { label: string; sub: string; emoji: string; color: string; pct: number; insight: string; href: string }> = {
  origin: { label: "Origin", sub: "背景・経験", emoji: "✦", color: C.gold, pct: 0, insight: "あなたの経験や背景を教えてね", href: "/origin" },
  genome: { label: "Genome", sub: "思考・認知", emoji: "🧬", color: C.neural, pct: 0, insight: "思考パターンを分析中...", href: "/aneurasync/genome" },
  phenotype: { label: "Phenotype", sub: "顔・体型・色", emoji: "❋", color: C.pulse, pct: 0, insight: "外見の分析を始めよう", href: "/body-color/avatar" },
  presence: { label: "Presence", sub: "印象・雰囲気", emoji: "◎", color: C.sync, pct: 0, insight: "あなたの雰囲気を分析中...", href: "/sns/profile" },
  style: { label: "Style", sub: "好み・表現", emoji: "◆", color: C.amber, pct: 0, insight: "好みやスタイルを教えてね", href: "/my-style?source=aneurasync&mode=sync" },
};

/* ═══ UTILITY FUNCTIONS ═══ */
export function formatMoney(value: unknown): string | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return `¥${n.toLocaleString()}`;
}

export function getPickTag(item: any, index: number): string {
  const tags = ["TREND", "HOT", "NEW", "PICK", "AI", "TASTE", "SWIPE", "SHOP"];
  const reason = String(item?.reason ?? item?.explain ?? "").toLowerCase();
  if (reason.includes("trend")) return "TREND";
  if (reason.includes("hot") || reason.includes("人気")) return "HOT";
  if (reason.includes("new") || reason.includes("新")) return "NEW";
  if (reason.includes("swipe")) return "SWIPE";
  return tags[index % tags.length];
}

export function formatRelativeTime(value?: string | null): string {
  if (!value) return "just now";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "just now";
  const diff = Date.now() - time;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.round(diff / (60 * 1000)))}分前`;
  if (diff < day) return `${Math.max(1, Math.round(diff / hour))}時間前`;
  return `${Math.max(1, Math.round(diff / day))}日前`;
}

export function extractRecommendationView(item: any, index: number): RecommendationView | null {
  const payload = item?.payload ?? {};
  const targetType = String(item?.targetType ?? "");

  if (targetType === "drop") {
    return {
      href: item?.targetId ? `/drops/${item.targetId}` : "/drops",
      name: String(payload?.title ?? "おすすめアイテム"),
      brand: String(payload?.brand ?? payload?.shop_name_ja ?? payload?.shop_name_en ?? "DROP"),
      price: formatMoney(payload?.display_price ?? payload?.price) ?? "view",
      tag: getPickTag(item, index),
      score: Math.max(78, 96 - index * 3),
      why: String(item?.explain ?? payload?.shop_headline ?? "あなたの好みに近い候補です"),
      image: payload?.cover_image_url ? String(payload.cover_image_url) : undefined,
    };
  }

  if (targetType === "shop") {
    return {
      href: item?.targetId ? `/shops/${item.targetId}` : "/shops",
      name: String(payload?.name_ja ?? payload?.name_en ?? "おすすめショップ"),
      brand: String(payload?.headline ?? "SHOP"),
      price: payload?.drop_count ? `${payload.drop_count} drops` : "shop",
      tag: getPickTag(item, index),
      score: Math.max(76, 92 - index * 3),
      why: String(item?.explain ?? "今の好みに近いショップです"),
      image: payload?.avatar_url ? String(payload.avatar_url) : undefined,
    };
  }

  if (targetType === "insight" && payload?.kind === "swipe_card") {
    const tags = Array.isArray(payload?.tags) ? payload.tags.map(String) : [];
    return {
      href: "/start",
      name: String(payload?.title ?? payload?.card_id ?? "Swipe Card"),
      brand: tags.slice(0, 2).join(" / ") || "CURATED",
      price: payload?.price_band ? String(payload.price_band).toUpperCase() : "curated",
      tag: getPickTag(item, index),
      score: Math.max(75, 90 - index * 2),
      why: String(item?.explain ?? "スワイプ学習から抽出した候補"),
      image: payload?.image_url ? String(payload.image_url) : undefined,
    };
  }

  return null;
}

export function resolveOutfitCategory(name: string, index: number) {
  const label = name.toLowerCase();
  if (/(coat|jacket|outer|parka|blazer|vest)/.test(label)) return "OUTER";
  if (/(pants|jeans|trousers|shorts|skirt|cargo)/.test(label)) return "BOTTOM";
  if (/(boots|sneakers|loafers|heels|shoes)/.test(label)) return "SHOES";
  if (/(bag|hat|scarf|watch|belt|umbrella|ring)/.test(label)) return "ACC";
  if (/(shirt|tee|tshirt|hoodie|sweater|knit|top|blouse|polo)/.test(label)) return "TOP";
  return ["OUTER", "TOP", "BOTTOM", "SHOES"][index] ?? "ITEM";
}
