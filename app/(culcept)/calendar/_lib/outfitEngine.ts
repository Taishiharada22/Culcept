import type { WardrobeItem } from "@/app/my-style/_lib/types";
import type { WeatherDaily, DayProposal, OutfitProposal, ProposalVariant, MoodShift, SatisfactionProfile } from "./types";
import { computeSyncScore } from "./syncScoring";
import { analyzeRisks } from "./riskAnalysis";
import { getSeasonForMonth, getRecommendedThickness, TPO_FORMALITY_MAP, MOOD_TAGS } from "./constants";
import type { CalendarPersonaProfile } from "./personaBoost";
import { candidatePersonaBoost } from "./personaBoost";
import { satisfactionItemBoost, detectConditionRegret } from "./satisfactionLearner";
import type { ExtendedWeatherContext } from "./materialWeather";
import type { ComboGraph } from "./comboGraph";
import type { OutfitAdaptation } from "./aneurasyncIntegration";
import { rejectionScoreAdjustment, abPreferenceBoost, loadRejections } from "./bidirectionalFeedback";
import type { ProposalRejection } from "./bidirectionalFeedback";
import { computeRotationProfiles, seasonalPersonalBoost } from "./deepTemporalIntelligence";
import type { ItemRotationProfile } from "./deepTemporalIntelligence";
import { loadWornHistory } from "./rotationTracker";

/* ── スコアリング用キャッシュ（毎アイテムでlocalStorage読まないように） ── */
interface ScoringCache {
  rejections: ProposalRejection[];
  rotationMap: Map<string, ItemRotationProfile>;
  wornHistory: import("./types").WornRecord[];
  allWardrobe: WardrobeItem[];
}

let _scoringCache: ScoringCache | null = null;

function getScoringCache(allWardrobe: WardrobeItem[]): ScoringCache {
  if (_scoringCache && _scoringCache.allWardrobe === allWardrobe) return _scoringCache;
  const wornHistory = loadWornHistory();
  const rejections = loadRejections();
  const profiles = wornHistory.length >= 3
    ? computeRotationProfiles(wornHistory, allWardrobe)
    : [];
  const rotationMap = new Map(profiles.map(p => [p.itemId, p]));
  _scoringCache = { rejections, rotationMap, wornHistory, allWardrobe };
  return _scoringCache;
}

/** 提案生成完了後にキャッシュをクリア */
export function clearScoringCache(): void {
  _scoringCache = null;
}

/* ── 拡張オプション型 ── */
export interface OutfitExtendedOptions {
  extWeather?: ExtendedWeatherContext | null;
  comboGraph?: ComboGraph | null;
  adaptation?: OutfitAdaptation | null;
}

/* ── シード生成（日付ベースで決定的） ── */
function buildSeed(date: string, events: Array<{ event_type: string }>): number {
  const seedBase = date.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const eventSeed = events.map(e => e.event_type).join("|");
  return seedBase + eventSeed.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

/* ── シード付きシャッフル ── */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/* ── カテゴリでフィルタ ── */
type CategoryGroup = "outer" | "tops" | "bottoms" | "shoes";

function categorize(item: WardrobeItem): CategoryGroup | null {
  const cat = item.categoryMain || item.category;
  if (cat === "outer" || cat === "outerwear") return "outer";
  if (cat === "tops") return "tops";
  if (cat === "bottoms") return "bottoms";
  if (cat === "shoes") return "shoes";
  return null;
}

/* ── アイテムの適格スコア ── */
function scoreCandidate(
  item: WardrobeItem,
  season: "ss" | "aw",
  recThickness: string,
  requiredFormality: string,
  recentlyWornIds: Set<string>,
  moodShift?: MoodShift,
  persona?: CalendarPersonaProfile | null,
  satisfactionProfile?: SatisfactionProfile | null,
  cache?: ScoringCache | null,
): number {
  let score = 50; // ベース

  // 季節マッチ
  if (item.season === "all" || item.season === season) score += 10;
  else if (item.season) score -= 15;

  // 厚みマッチ
  if (item.thickness === recThickness) score += 10;
  else if (item.thickness) score += 3;

  // フォーマリティマッチ
  const fOrder: Record<string, number> = { casual: 0, smart: 1, dress: 2 };
  if (item.formality) {
    const diff = Math.abs((fOrder[item.formality] ?? 0) - (fOrder[requiredFormality] ?? 0));
    if (diff === 0) score += 15;
    else if (diff === 1) score += 5;
    else score -= 10;
  }

  // 最近着用ペナルティ
  if (recentlyWornIds.has(item.id)) score -= 20;

  // 品質スコアボーナス
  if (item.qualityScore) score += Math.round(item.qualityScore / 20);

  // ムードシフト
  if (moodShift) {
    if (moodShift.axis === "formality" && item.formality) {
      const itemF = fOrder[item.formality] ?? 0;
      if (moodShift.direction === 1 && itemF >= 1) score += 5;
      if (moodShift.direction === -1 && itemF <= 1) score += 5;
    }
  }

  // PersonaGenome好みブースト (PCカラー + シルエット + 素材)
  if (persona && persona.completeness > 0) {
    score += candidatePersonaBoost(persona, item) * 2; // ×2でスコアに反映
  }

  // 満足度学習ブースト
  if (satisfactionProfile && satisfactionProfile.dataPoints > 0) {
    score += satisfactionItemBoost(satisfactionProfile, item.id);
  }

  // 拒否データからの暗黙フィードバック
  if (cache && cache.rejections.length > 0) {
    score += rejectionScoreAdjustment(cache.rejections, item.id);
  }

  // A/B選択好みブースト
  score += abPreferenceBoost(item);

  // ローテーション最適化ブースト
  if (cache) {
    const rp = cache.rotationMap.get(item.id);
    if (rp) score += rp.rotationScore;
    // 季節別個人スタイルブースト
    if (cache.wornHistory.length >= 5) {
      score += seasonalPersonalBoost(cache.wornHistory, cache.allWardrobe, item);
    }
  }

  return score;
}

/* ── ムードタグ推定 ── */
function inferMoodTag(items: WardrobeItem[], events: Array<{ event_type: string }>): string {
  const formalities = items.map(i => i.formality).filter(Boolean);
  const hasDress = formalities.includes("dress");
  const hasCasual = formalities.includes("casual");
  const hasSmart = formalities.includes("smart");
  const isActive = events.some(e => ["sports", "outdoor"].includes(e.event_type));

  if (hasDress) return MOOD_TAGS.dress_elegant || "エレガント";
  if (isActive) return MOOD_TAGS.casual_active || "アクティブ";
  if (hasSmart) return MOOD_TAGS.smart_clean || "きれいめ";
  if (hasCasual) return MOOD_TAGS.casual_relaxed || "リラックス";
  return MOOD_TAGS.minimal || "ミニマル";
}

/* ── 理由文生成 ── */
function buildReason(
  items: WardrobeItem[],
  weather: WeatherDaily | null,
  events: Array<{ event_type: string }>,
): string {
  const parts: string[] = [];

  if (weather?.temp_max != null) {
    parts.push(`最高${weather.temp_max}°の気温に合わせた構成`);
  }

  if (events.length > 0) {
    const eventNames = events.map(e => e.event_type === "work" ? "仕事" : e.event_type === "date" ? "デート" : e.event_type === "meeting" ? "ミーティング" : e.event_type).slice(0, 2);
    parts.push(`${eventNames.join("・")}に対応`);
  }

  const tops = items.find(i => categorize(i) === "tops");
  const bottoms = items.find(i => categorize(i) === "bottoms");
  if (tops?.silhouette && bottoms?.silhouette) {
    parts.push(`${tops.silhouette}×${bottoms.silhouette}のバランス`);
  }

  return parts.join("。") || "ワードローブから最適な組み合わせを提案";
}

/* ── コンボ生成 ── */
function buildCombo(
  pools: Record<CategoryGroup, WardrobeItem[]>,
  needsOuter: boolean,
  seed: number,
  weather: WeatherDaily | null,
  events: Array<{ event_type: string }>,
  month: number,
  recentlyWornIds: Set<string>,
  variant: ProposalVariant,
  moodShift?: MoodShift,
  persona?: CalendarPersonaProfile | null,
  satisfactionProfile?: SatisfactionProfile | null,
  extendedOptions?: OutfitExtendedOptions | null,
  allWardrobe?: WardrobeItem[],
): OutfitProposal | null {
  const season = getSeasonForMonth(month);
  const { thickness: recThickness } = getRecommendedThickness(weather?.temp_max ?? null);

  // 最もフォーマルなTPO
  const fOrder: Record<string, number> = { casual: 0, smart: 1, dress: 2 };
  let reqFormality = "casual";
  for (const e of events) {
    const f = TPO_FORMALITY_MAP[e.event_type] ?? "casual";
    if ((fOrder[f] ?? 0) > (fOrder[reqFormality] ?? 0)) reqFormality = f;
  }

  // 条件別regret検出 → フォーマリティシフト
  if (satisfactionProfile && variant === "main") {
    const { hasRegret, suggestedFormalityShift } = detectConditionRegret(
      satisfactionProfile,
      weather?.weather_icon,
      events.map(e => e.event_type),
    );
    if (hasRegret && suggestedFormalityShift > 0) {
      const fKeys = ["casual", "smart", "dress"];
      const currentIdx = fKeys.indexOf(reqFormality);
      if (currentIdx >= 0 && currentIdx < fKeys.length - 1) {
        reqFormality = fKeys[currentIdx + 1];
      }
    }
  }

  // バリアント補正
  let adjustedFormality = reqFormality;
  if (variant === "casual") adjustedFormality = "casual";
  if (variant === "dressy") adjustedFormality = "dress";

  // スコアリングキャッシュ（localStorage読み込みを1回に集約）
  const cache = allWardrobe ? getScoringCache(allWardrobe) : null;

  // 各カテゴリからベスト候補を選ぶ
  const pickBest = (pool: WardrobeItem[]): WardrobeItem | null => {
    if (pool.length === 0) return null;
    const scored = pool.map(item => ({
      item,
      score: scoreCandidate(item, season, recThickness, adjustedFormality, recentlyWornIds, moodShift, persona, satisfactionProfile, cache),
    }));
    scored.sort((a, b) => b.score - a.score);

    // シード付きで上位3つからランダム選択
    const topN = scored.slice(0, Math.min(3, scored.length));
    const idx = seed % topN.length;
    return topN[idx].item;
  };

  const selectedItems: WardrobeItem[] = [];

  const top = pickBest(pools.tops);
  if (top) selectedItems.push(top);

  const bottom = pickBest(pools.bottoms);
  if (bottom) selectedItems.push(bottom);

  const shoe = pickBest(variant === "rain"
    ? (pools.shoes.filter(s => s.attributes?.water === "waterproof" || s.attributes?.water === "repellent").length > 0
      ? pools.shoes.filter(s => s.attributes?.water === "waterproof" || s.attributes?.water === "repellent")
      : pools.shoes)
    : pools.shoes
  );
  if (shoe) selectedItems.push(shoe);

  // アウター
  if (needsOuter || variant === "cold") {
    const outerPool = variant === "cold"
      ? (pools.outer.filter(o => o.thickness === "thick").length > 0
        ? pools.outer.filter(o => o.thickness === "thick")
        : pools.outer)
      : pools.outer;
    const outer = pickBest(outerPool);
    if (outer) selectedItems.push(outer);
  }

  if (selectedItems.length < 2) return null;

  const sync = computeSyncScore(selectedItems, weather, events, month, persona, satisfactionProfile, extendedOptions);
  const risks = analyzeRisks({ id: "", items: selectedItems, sync, risks: [], reason: "", moodTag: "", variant }, weather, events, recentlyWornIds);

  return {
    id: `${variant}-${seed}`,
    items: selectedItems,
    sync,
    risks,
    reason: buildReason(selectedItems, weather, events),
    moodTag: inferMoodTag(selectedItems, events),
    variant,
  };
}

/* ── メイン: 日次提案生成 ── */
export function generateDayProposal(
  wardrobe: WardrobeItem[],
  date: string,
  weather: WeatherDaily | null,
  events: Array<{ event_type: string; event_name: string }>,
  recentlyWornItemIds: string[],
  moodShift?: MoodShift,
  persona?: CalendarPersonaProfile | null,
  satisfactionProfile?: SatisfactionProfile | null,
  extendedOptions?: OutfitExtendedOptions | null,
): DayProposal | null {
  if (wardrobe.length === 0) return null;

  const month = parseInt(date.split("-")[1], 10);
  const seed = buildSeed(date, events);
  const { needsOuter } = getRecommendedThickness(weather?.temp_max ?? null);
  const recentlyWornIds = new Set(recentlyWornItemIds);

  // カテゴリ別プール
  const pools: Record<CategoryGroup, WardrobeItem[]> = {
    outer: [], tops: [], bottoms: [], shoes: [],
  };
  for (const item of wardrobe) {
    const cat = categorize(item);
    if (cat) pools[cat].push(item);
  }

  // シード付きシャッフル
  for (const key of Object.keys(pools) as CategoryGroup[]) {
    pools[key] = seededShuffle(pools[key], seed + key.charCodeAt(0));
  }

  // メイン提案
  const main = buildCombo(pools, needsOuter, seed, weather, events, month, recentlyWornIds, "main", moodShift, persona, satisfactionProfile, extendedOptions, wardrobe);
  if (!main) return null;

  // 代替提案（バリアント）
  const alternatives: OutfitProposal[] = [];
  const variants: ProposalVariant[] = ["casual", "dressy"];

  if (weather?.outfit_tag === "rain" || weather?.weather_icon === "rain") {
    variants.push("rain");
  }
  if (weather?.temp_max != null && weather.temp_max < 15) {
    variants.push("cold");
  }

  for (const v of variants) {
    const alt = buildCombo(pools, needsOuter || v === "cold", seed + v.charCodeAt(0) * 100, weather, events, month, recentlyWornIds, v, moodShift, persona, satisfactionProfile, extendedOptions, wardrobe);
    if (alt && alt.items.some(i => !main.items.find(mi => mi.id === i.id))) {
      alternatives.push(alt);
    }
  }

  clearScoringCache();
  return { date, main, alternatives, insights: [] };
}
