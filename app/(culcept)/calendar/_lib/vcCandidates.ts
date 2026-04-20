/**
 * Visual Coordinate — Candidate Generation (Full)
 * WardrobeItem → Slot別スコア付き候補リスト
 *
 * 20軸 Intent をスロット別の重みで変換し、
 * 各アイテムの属性から推定したスコアとマッチング
 */
import type { WardrobeItem } from "@/app/my-style/_lib/types";
import type { Intent, Slot } from "./vcTypes";
import { SLOT_ORDER } from "./vcTypes";

/* ═══════════════════════════════════════════════
   WardrobeItem → Slot マッピング
   ═══════════════════════════════════════════════ */
function itemToSlot(item: WardrobeItem): Slot | null {
  const cat = item.categoryMain || item.category;
  switch (cat) {
    case "outer": case "outerwear": return "outer";
    case "tops": return "top";
    case "bottoms": return "bottom";
    case "shoes": return "shoes";
    case "accessory": case "accessories": case "bag": case "hat": return "accessory";
    default: return null;
  }
}

/* ═══════════════════════════════════════════════
   WardrobeItem 属性 → 0-1 数値変換
   ═══════════════════════════════════════════════ */
const clamp = (v: number) => Math.max(0, Math.min(1, v));

function formalityNum(f?: string): number {
  switch (f) { case "dress": return 0.85; case "smart": return 0.55; case "casual": return 0.25; default: return 0.40; }
}
function warmthNum(w?: 1 | 2 | 3): number {
  switch (w) { case 3: return 0.90; case 2: return 0.55; case 1: return 0.20; default: return 0.35; }
}
function waterNum(w?: string): number {
  switch (w) { case "waterproof": return 1.0; case "repellent": return 0.6; default: return 0.1; }
}

/** 動きやすさ（stretch + silhouette + formality） */
function mobilityNum(item: WardrobeItem): number {
  let v = 0.5;
  if (item.attributes?.stretch === "high") v += 0.25;
  else if (item.attributes?.stretch === "some") v += 0.10;
  if (item.silhouette === "loose" || item.silhouette === "oversized") v += 0.10;
  if (item.silhouette === "slim") v -= 0.10;
  if (item.formality === "casual") v += 0.05;
  if (item.formality === "dress") v -= 0.15;
  return clamp(v);
}

/** 通気性（materialFamily + thickness） */
function breathableNum(item: WardrobeItem): number {
  let v = 0.5;
  const mats = item.materialFamily ?? [];
  if (mats.includes("linen")) v += 0.25;
  if (mats.includes("cotton")) v += 0.15;
  if (mats.includes("mesh")) v += 0.30;
  if (mats.includes("polyester")) v -= 0.05;
  if (mats.includes("wool")) v -= 0.10;
  if (item.thickness === "thin") v += 0.15;
  if (item.thickness === "thick") v -= 0.20;
  return clamp(v);
}

/** シワ耐性（drape + material） */
function wrinkleSafeNum(item: WardrobeItem): number {
  let v = 0.5;
  if (item.drape === "structured") v += 0.20;
  if (item.drape === "drapey") v -= 0.10;
  const mats = item.materialFamily ?? [];
  if (mats.includes("polyester") || mats.includes("nylon")) v += 0.15;
  if (mats.includes("linen")) v -= 0.25;
  if (mats.includes("cotton")) v -= 0.05;
  if (mats.includes("wool")) v += 0.05;
  return clamp(v);
}

/** 締め付け度（低い=締め付けない: ゆったり→高スコア） */
function looseNum(item: WardrobeItem): number {
  let v = 0.5;
  if (item.silhouette === "oversized") v += 0.30;
  if (item.silhouette === "loose") v += 0.20;
  if (item.silhouette === "regular") v += 0.05;
  if (item.silhouette === "slim") v -= 0.20;
  if (item.attributes?.stretch === "high") v += 0.15;
  return clamp(v);
}

/** 汚れ耐性（色の暗さ + material） */
function dirtySafeNum(item: WardrobeItem): number {
  let v = 0.4;
  // 暗い色は汚れに強い
  const darkColors = ["black", "navy", "charcoal", "brown", "olive", "gray", "dark"];
  const color = (item.colorName ?? item.color ?? "").toLowerCase();
  if (darkColors.some(c => color.includes(c))) v += 0.25;
  const lightColors = ["white", "cream", "ivory", "beige", "light"];
  if (lightColors.some(c => color.includes(c))) v -= 0.20;
  // 素材
  const mats = item.materialFamily ?? [];
  if (mats.includes("nylon") || mats.includes("polyester")) v += 0.10;
  if (mats.includes("silk")) v -= 0.15;
  return clamp(v);
}

/** 風防止（outerのみ意味がある。thickness + 素材） */
function windProofNum(item: WardrobeItem): number {
  let v = 0.3;
  if (item.thickness === "thick") v += 0.25;
  if (item.thickness === "mid") v += 0.10;
  const mats = item.materialFamily ?? [];
  if (mats.includes("nylon") || mats.includes("polyester")) v += 0.20;
  if (mats.includes("leather")) v += 0.25;
  if (mats.includes("wool")) v += 0.10;
  return clamp(v);
}

/** スタイルタグ推定 */
function inferStyleTags(item: WardrobeItem): string[] {
  const tags: string[] = [];
  if (item.formality === "dress") tags.push("formal", "dress", "clean");
  if (item.formality === "smart") tags.push("work", "clean", "chic");
  if (item.formality === "casual") tags.push("casual", "relax");
  if (item.subcategory?.includes("hoodie") || item.subcategory?.includes("sweat")) tags.push("casual", "relax", "active");
  if (item.subcategory?.includes("shirt") || item.subcategory?.includes("blouse")) tags.push("clean", "work");
  if (item.subcategory?.includes("down") || item.subcategory?.includes("coat")) tags.push("functional");
  if (item.pattern === "solid") tags.push("clean");
  if (item.pattern === "stripe" || item.pattern === "check") tags.push("statement");
  if (item.attributes?.water === "waterproof" || item.attributes?.water === "repellent") tags.push("rain_ok", "functional");
  if (item.silhouette === "slim") tags.push("sharp");
  if (item.silhouette === "oversized") tags.push("street");
  if (item.silhouette === "loose") tags.push("relax");
  return [...new Set(tags)];
}

/* ═══════════════════════════════════════════════
   スロット別スコア重み
   各スロットの "役割" に合わせて Intent 軸の重みを変える
   合計 = 1.0
   ═══════════════════════════════════════════════ */
type SlotWeights = {
  style: number;       // sceneTag マッチ
  formality: number;
  attention: number;
  trust: number;
  romance: number;
  mobility: number;
  walkNeed: number;
  wrinkleSafe: number;
  tightAvoid: number;
  breathable: number;
  warmth: number;      // warmthNeed
  rain: number;        // rainNeed
  wind: number;        // windNeed
  dirtySafe: number;
  splashSafe: number;
};

const SLOT_W: Record<Slot, SlotWeights> = {
  /* Shoes: 移動の支配者 */
  shoes: {
    style: 0.10, formality: 0.12, attention: 0.05, trust: 0.03, romance: 0.02,
    mobility: 0.08, walkNeed: 0.20, wrinkleSafe: 0.00, tightAvoid: 0.05, breathable: 0.05,
    warmth: 0.05, rain: 0.15, wind: 0.00, dirtySafe: 0.07, splashSafe: 0.03,
  },
  /* Bottom: 座り/動きの快適 */
  bottom: {
    style: 0.12, formality: 0.10, attention: 0.05, trust: 0.03, romance: 0.03,
    mobility: 0.13, walkNeed: 0.05, wrinkleSafe: 0.15, tightAvoid: 0.12, breathable: 0.07,
    warmth: 0.03, rain: 0.02, wind: 0.00, dirtySafe: 0.08, splashSafe: 0.02,
  },
  /* Top: 顔周り印象 + 快適 */
  top: {
    style: 0.15, formality: 0.10, attention: 0.15, trust: 0.10, romance: 0.05,
    mobility: 0.03, walkNeed: 0.00, wrinkleSafe: 0.07, tightAvoid: 0.05, breathable: 0.15,
    warmth: 0.05, rain: 0.00, wind: 0.00, dirtySafe: 0.07, splashSafe: 0.03,
  },
  /* Outer: 天候の支配者 */
  outer: {
    style: 0.10, formality: 0.07, attention: 0.05, trust: 0.03, romance: 0.02,
    mobility: 0.05, walkNeed: 0.00, wrinkleSafe: 0.05, tightAvoid: 0.03, breathable: 0.05,
    warmth: 0.22, rain: 0.18, wind: 0.10, dirtySafe: 0.03, splashSafe: 0.02,
  },
  /* Accessory: 印象の微調整 */
  accessory: {
    style: 0.25, formality: 0.10, attention: 0.25, trust: 0.05, romance: 0.20,
    mobility: 0.00, walkNeed: 0.00, wrinkleSafe: 0.00, tightAvoid: 0.00, breathable: 0.00,
    warmth: 0.02, rain: 0.03, wind: 0.00, dirtySafe: 0.02, splashSafe: 0.02,
    // accessory は pocketNeed は関係ないので重みに含めない
  },
};

/* ═══════════════════════════════════════════════
   スコア計算
   ═══════════════════════════════════════════════ */
export function scoreItem(item: WardrobeItem, intent: Intent, slot: Slot): number {
  const tags = inferStyleTags(item);
  const hasTag = (t: string) => tags.includes(t);

  // banned check
  if (intent.bannedTags.some(t => hasTag(t))) return 0;

  const W = SLOT_W[slot];

  // ── 各次元のマッチスコア（0-1） ──
  // style: sceneTag マッチ率
  const style = intent.sceneTags.length > 0
    ? intent.sceneTags.reduce((a, t) => a + (hasTag(t) ? 1 : 0), 0) / intent.sceneTags.length
    : 0.5;

  // 数値近接スコア（1 - |item属性 - intent目標|）
  const fScore = 1 - Math.abs(formalityNum(item.formality) - intent.formality);
  const mScore = 1 - Math.abs(mobilityNum(item) - intent.mobility);
  const wkScore = slot === "shoes" ? (1 - Math.abs(mobilityNum(item) - intent.walkNeed)) : 0.5;
  const wrScore = 1 - Math.abs(wrinkleSafeNum(item) - intent.wrinkleSafe);
  const taScore = 1 - Math.abs(looseNum(item) - intent.tightAvoid);
  const brScore = 1 - Math.abs(breathableNum(item) - intent.breathable);

  // 天候スコア（需要 × 供給）
  const warmScore = clamp(intent.warmthNeed * warmthNum(item.attributes?.warmth));
  const rainScore = clamp(intent.rainNeed * waterNum(item.attributes?.water));
  const windScore = clamp(intent.windNeed * windProofNum(item));
  const dirtyScore = clamp(intent.dirtySafe > 0.3 ? (1 - Math.abs(dirtySafeNum(item) - intent.dirtySafe)) : 0.5);
  const splashScore = clamp(intent.splashSafe > 0.3 ? waterNum(item.attributes?.water) * intent.splashSafe : 0.3);

  // 印象スコア（タグベース + formality近接）
  const attScore = hasTag("statement") || hasTag("chic") ? 0.8 : hasTag("clean") ? 0.5 : 0.3;
  const trustScore = hasTag("clean") || hasTag("work") ? 0.7 : hasTag("casual") ? 0.3 : 0.5;
  const romScore = hasTag("chic") || hasTag("clean") ? 0.6 : hasTag("relax") ? 0.3 : 0.4;

  // 重み付き合計
  const total =
    style * W.style +
    fScore * W.formality +
    attScore * W.attention +
    trustScore * W.trust +
    romScore * W.romance +
    mScore * W.mobility +
    wkScore * W.walkNeed +
    wrScore * W.wrinkleSafe +
    taScore * W.tightAvoid +
    brScore * W.breathable +
    warmScore * W.warmth +
    rainScore * W.rain +
    windScore * W.wind +
    dirtyScore * W.dirtySafe +
    splashScore * W.splashSafe;

  return total;
}

/* ═══════════════════════════════════════════════
   候補リスト生成
   ═══════════════════════════════════════════════ */
export type ScoredCandidate = { item: WardrobeItem; score: number };

const MAX_CANDIDATES = 7;

export function buildCandidates(
  inventory: WardrobeItem[],
  intent: Intent,
): Record<Slot, ScoredCandidate[]> {
  const result: Record<Slot, ScoredCandidate[]> = {
    accessory: [], outer: [], top: [], bottom: [], shoes: [],
  };

  for (const item of inventory) {
    const slot = itemToSlot(item);
    if (!slot) continue;

    const score = scoreItem(item, intent, slot);
    if (score <= 0) continue;

    result[slot].push({ item, score });
  }

  for (const slot of SLOT_ORDER) {
    result[slot].sort((a, b) => b.score - a.score);
    result[slot] = result[slot].slice(0, MAX_CANDIDATES);
  }

  return result;
}
