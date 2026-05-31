import type { WardrobeItem } from "@/app/my-style/_lib/types";
import type { WeatherDaily, DayProposal, OutfitProposal, ProposalVariant, MoodShift, SatisfactionProfile } from "./types";
import { computeSyncScore } from "@/lib/shared/outfitEngine/syncScoring";
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

/**
 * Phase 5-C3: shared 由来の rotationRecords（satisfaction 必須 = learningRecords）で scoring cache を
 * **per-run prime** する。 getScoringCache 本体は無改変で、 同 allWardrobe 参照
 * （generateDayProposal の wardrobe = buildCombo の allWardrobe）により primed cache を再利用させる。
 *   - rejections は現行どおり localStorage 由来（rotationRecords は worn 履歴のみ差し替え）。
 *   - 失敗時は cache を null に戻し、 getScoringCache が loadWornHistory に lazy fallback（退化ゼロ）。
 */
function primeScoringCacheFromRecords(
  allWardrobe: WardrobeItem[],
  rotationRecords: import("./types").WornRecord[],
): void {
  try {
    const rejections = loadRejections();
    const profiles = rotationRecords.length >= 3
      ? computeRotationProfiles(rotationRecords, allWardrobe)
      : [];
    const rotationMap = new Map(profiles.map((p) => [p.itemId, p]));
    _scoringCache = { rejections, rotationMap, wornHistory: rotationRecords, allWardrobe };
  } catch {
    _scoringCache = null;
  }
}

/* ── 拡張オプション型 ── */
export interface OutfitExtendedOptions {
  extWeather?: ExtendedWeatherContext | null;
  comboGraph?: ComboGraph | null;
  adaptation?: OutfitAdaptation | null;
  /**
   * Phase 5-C3: shared WornHistory 由来の rotation/seasonal 学習レコード（satisfaction 必須）。
   * 渡された場合のみ scoring cache を prime（loadWornHistory を読まない）。 完全 optional・flag 既定 off で渡らない。
   */
  rotationRecords?: import("./types").WornRecord[];
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
// D2-1: bag / accessory を supplemental pool として追加（buildCombo は未配線・no-op）。
//   - 主軸（outfit 成立必須）: tops / bottoms / shoes
//   - 条件付き: outer
//   - supplemental: bag / accessory  ← D2-2 で buildCombo に配線
// D2-1: 型と関数を export し、 D2 unit test から直接 assertion 可能にする。
// 内部のロジックは不変（buildCombo 等は file-private のまま）。
export type CategoryGroup = "outer" | "tops" | "bottoms" | "shoes" | "bag" | "accessory";

export function categorize(item: WardrobeItem): CategoryGroup | null {
  // categoryMain（taxonomy.ts の正規語彙）を優先、 無ければ legacy category。
  const cat = item.categoryMain || item.category;
  if (cat === "outer" || cat === "outerwear") return "outer";
  if (cat === "tops") return "tops";
  if (cat === "bottoms") return "bottoms";
  if (cat === "shoes") return "shoes";
  // D2-1: bag は categoryMain のみ（legacy category には bag が無い）。
  if (cat === "bag") return "bag";
  // D2-1: accessory は categoryMain="accessory"、 legacy category="accessories"（複数形）、
  //   legacy category="hat"（accessory.hat に migration）も accessory pool に集約。
  if (cat === "accessory" || cat === "accessories" || cat === "hat") return "accessory";
  return null;
}

// ── D2-2: supplemental bag/accessory selection helpers ───────────────────

/**
 * D2-2: 外出 anchor の判定。
 *   TPO_FORMALITY_MAP の正規 8 種から、 外出が確実な 4 種だけを needsBag 対象にする
 *   （work/meeting/date/party）。 残り（casual/outdoor/sports/travel）は bag が不要な場面を含むため
 *   安全側で除外（D3 以降で必要なら精緻化）。 未知の event_type も false（過剰広げ防止）。
 *   export しているのは D2-2 unit test から直接 assertion できるようにするため（D2-1 と同方針）。
 */
// D3-1: travel を whitelist に追加（外出確定。 day-trip でも手荷物が要るため安全側で採用）。
const BAG_REQUIRED_EVENT_TYPES = new Set(["work", "meeting", "date", "party", "travel"]);
export function selectedItemsNeedsBag(events: ReadonlyArray<{ event_type: string }>): boolean {
  for (const e of events) {
    if (BAG_REQUIRED_EVENT_TYPES.has(e.event_type)) return true;
  }
  return false;
}

/**
 * D3-1: bag pool を TPO / 天気 / formality に応じて **優先順位だけ並べ替える** pure helper。
 *   scoreCandidate には触らず、 pickBest に渡す前段で order を整える（採用 gate の延長）。
 *
 * 不変原則（supplemental を壊さない）:
 *   - **除外しない（partition のみ）**: rain 以外は hard filter せず、 優先群を前に出すだけ。
 *     bag が 1 種類しか無いユーザーでも必ず候補が残る。
 *   - **rain だけ hard filter**: 防水/撥水 bag があればそれだけに絞る（既存 shoes と同じ意味的必然性）。
 *     防水 bag が 1 つも無ければ全 bag を残す（消さない）。
 *
 * 優先順位の根拠:
 *   - rain: waterproof / repellent を最優先（実用）
 *   - travel: backpack / tote / crossbody を前（容量・両手空き）、 shoulder を後ろ
 *   - smart / dress: backpack を後ろ（カジュアル過ぎる）、 tote / shoulder / crossbody を前
 *   - casual: 並べ替えなし（全 bag 等価）
 *
 * subcategory は taxonomy の `"subcategory.<name>"` prefix 形式なので endsWith で判定する。
 */
const BACKPACK_SUFFIX = "backpack";
function isWaterResistant(item: WardrobeItem): boolean {
  const w = item.attributes?.water;
  return w === "waterproof" || w === "repellent";
}
function bagSubcat(item: WardrobeItem): string {
  return (item.subcategory ?? "").toLowerCase();
}
/** order を変えずに [優先群, 残り] へ安定 partition する（filter ではない）。 */
function stablePartition<T>(arr: ReadonlyArray<T>, pred: (x: T) => boolean): T[] {
  const front: T[] = [];
  const back: T[] = [];
  for (const x of arr) (pred(x) ? front : back).push(x);
  return [...front, ...back];
}
export function selectBagPool(
  pool: ReadonlyArray<WardrobeItem>,
  variant: ProposalVariant,
  events: ReadonlyArray<{ event_type: string }>,
  formality: string,
): WardrobeItem[] {
  if (pool.length === 0) return [];

  // 1) rain: 防水/撥水があればそれだけに hard filter（無ければ全件）。
  let working: WardrobeItem[] = [...pool];
  if (variant === "rain") {
    const waterproof = working.filter(isWaterResistant);
    if (waterproof.length > 0) working = waterproof;
  }

  // 2) travel: backpack / tote / crossbody を前（shoulder を後ろ）。
  const isTravel = events.some((e) => e.event_type === "travel");
  if (isTravel) {
    return stablePartition(working, (b) => !bagSubcat(b).endsWith("shoulder"));
  }

  // 3) smart / dress: backpack を後ろへ（formal 寄りでは大きすぎる）。
  if (formality === "smart" || formality === "dress") {
    return stablePartition(working, (b) => !bagSubcat(b).endsWith(BACKPACK_SUFFIX));
  }

  // 4) casual / その他: 並べ替えなし。
  return working;
}

/**
 * D2-2: 既選 selectedItems の formality 最頻値（baseFormality）を求める。
 *   formality 未設定の item は count しない（中性扱い）。 全 item 未設定なら null。
 *   accessory 採用 gate 専用 — scoreCandidate には流さない（CEO 補正 2 = A 採用）。
 */
export function inferBaseFormality(
  items: ReadonlyArray<WardrobeItem>,
): "casual" | "smart" | "dress" | null {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (item.formality === "casual" || item.formality === "smart" || item.formality === "dress") {
      counts[item.formality] = (counts[item.formality] ?? 0) + 1;
    }
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = sorted[0]?.[0];
  if (top === "casual" || top === "smart" || top === "dress") return top;
  return null;
}

/**
 * D2-2: accessory 採用 gate。
 *   baseFormality（実選択結果の最頻値）が smart/dress → 採用、 casual or 不明 → 不採用。
 *   baseFormality が null（全 item formality 未設定）の場合は **fallback として adjustedFormality**
 *   （variant 補正後の reqFormality）を見る。 これも smart/dress なら採用。 → wardrobe に
 *   formality 属性が全く無くても variant=dressy 等で accessory を出せる。
 *   bag と違い event_type には依存しない（formality 軸専用 gate）。
 */
export function selectedItemsNeedsAccessory(
  selectedItems: ReadonlyArray<WardrobeItem>,
  adjustedFormality: string,
): boolean {
  const base = inferBaseFormality(selectedItems) ?? adjustedFormality;
  return base === "smart" || base === "dress";
}

/**
 * D3-2: cold day 判定。 既存 `getRecommendedThickness` の `needsOuter` 境界（temp_max < 15）に整合。
 *   独自閾値を作らない根拠: 「アウターが要る寒さ = scarf が活きる」。 15°C 未満でアウター推奨に入るため、
 *   同じ境界で scarf 優先に切り替える。 temp_max=null（天気不明）は cold 扱いしない（過剰防寒回避）。
 */
export function isColdDay(weather: WeatherDaily | null): boolean {
  return weather?.temp_max != null && weather.temp_max < 15;
}

/** accessory item の subcategory（taxonomy `"subcategory.<name>"` prefix そのまま、 小文字化） */
function accessorySubcat(item: WardrobeItem): string {
  return (item.subcategory ?? "").toLowerCase();
}

// ── D4: accessory subcategory 別 gate helpers ────────────────────────────

/**
 * D4: outfit accessory 採用判定で使う context（CEO 補正に従い既存 event_type / weather field のみ使用）。
 *   - hotSunny: temp_max>=28 + 晴れ系（暑い昼の UV 対策で hat を活かす）。 既存閾値が無いため 28°C を境界に新設
 *     （独自閾値の根拠: 環境省「真夏日」の境界 30°C より少し控えめに、 夏物想定の T シャツ気温帯の上限）。
 *   - rainy: 既存 outfitEngine 内 rain 判定（`weather?.weather_icon === "rain" || outfit_tag === "rain"`）と整合。
 *   - outdoorEvent: TPO_FORMALITY_MAP に実在する `"outdoor"` event_type（推測ではなく実値）。
 *   - hasBottoms: belt は bottoms が無いと使えないため（CEO 補正 3）。
 */
export type AccessoryContext = {
  hotSunny: boolean;
  rainy: boolean;
  outdoorEvent: boolean;
  hasBottoms: boolean;
  baseFormality: "casual" | "smart" | "dress";
};

export function buildAccessoryContext(
  selectedItems: ReadonlyArray<WardrobeItem>,
  weather: WeatherDaily | null,
  events: ReadonlyArray<{ event_type: string }>,
  adjustedFormality: string,
): AccessoryContext {
  const icon = weather?.weather_icon;
  const temp = weather?.temp_max;
  const baseRaw = inferBaseFormality(selectedItems) ?? adjustedFormality;
  const baseFormality: "casual" | "smart" | "dress" =
    baseRaw === "smart" || baseRaw === "dress" ? baseRaw : "casual";
  return {
    hotSunny: temp != null && temp >= 28 && (icon === "sun" || icon === "cloud" || icon === "unknown"),
    rainy: icon === "rain" || weather?.outfit_tag === "rain",
    outdoorEvent: events.some((e) => e.event_type === "outdoor"),
    hasBottoms: selectedItems.some((i) => i.categoryMain === "bottoms" || i.category === "bottoms"),
    baseFormality,
  };
}

/**
 * D4: subcategory 別の **採用 tier** を返す pure helper（hard filter ではなく partition 用）。
 *   "preferred" = 優先群（先頭）／"normal" = 中立／"suppressed" = 抑制群（後ろ）
 *
 *   - scarf: cold day 優先は selectAccessories 側の scarf sub-pool で別途強制（D3-2 維持）。 ここは normal。
 *   - hat:  hot sunny + outdoor → preferred / rainy → suppressed（**除外ではなく後ろへ** = CEO 補正 1）/ それ以外 normal
 *   - belt: bottoms あり + smart/dress → preferred（実用 + 装飾）/ bottoms あり + casual → normal（採用可・CEO 補正 3）/ bottoms 無し → suppressed
 *   - jewelry: dress → preferred / smart → suppressed（**除外ではなく後ろへ** = CEO 補正 4: smart で control されるが pool 1 種なら 1 件残る）/ casual → suppressed
 *
 *   抑制群も後ろに置くだけで、 pool が 1 種類しかなければ最終的に 1 件は採用される（accessory 全体を消さない）。
 */
export type AccessoryTier = "preferred" | "normal" | "suppressed";
export function accessorySubcategoryTier(
  item: WardrobeItem,
  ctx: AccessoryContext,
): AccessoryTier {
  const sub = accessorySubcat(item);
  if (sub.endsWith("scarf")) return "normal"; // scarf は cold sub-pool 側で D3-2 優先
  if (sub.endsWith("hat")) {
    if (ctx.rainy) return "suppressed";
    if (ctx.hotSunny && ctx.outdoorEvent) return "preferred";
    return "normal";
  }
  if (sub.endsWith("belt")) {
    if (!ctx.hasBottoms) return "suppressed";
    if (ctx.baseFormality === "smart" || ctx.baseFormality === "dress") return "preferred";
    return "normal"; // casual + bottoms あり → 採用可
  }
  if (sub.endsWith("jewelry")) {
    if (ctx.baseFormality === "dress") return "preferred";
    return "suppressed"; // smart/casual では後ろへ
  }
  return "normal";
}

/** preferred → normal → suppressed の安定 partition（除外しない）。 */
function partitionByTier(
  pool: ReadonlyArray<WardrobeItem>,
  ctx: AccessoryContext,
): WardrobeItem[] {
  const preferred: WardrobeItem[] = [];
  const normal: WardrobeItem[] = [];
  const suppressed: WardrobeItem[] = [];
  for (const item of pool) {
    const tier = accessorySubcategoryTier(item, ctx);
    if (tier === "preferred") preferred.push(item);
    else if (tier === "suppressed") suppressed.push(item);
    else normal.push(item);
  }
  return [...preferred, ...normal, ...suppressed];
}

/**
 * D3-2: accessory を最大 `count` 件、 **subcategory 重複禁止**で選ぶ pure helper。
 *
 * 規約（supplemental を壊さない）:
 *   - cold day: scarf を **先頭へ stable partition**（除外しない。 scarf 無しなら既存順で fallback）。
 *     scarf が無いだけで accessory 全体を消さない。
 *   - 既に選ばれた subcategory は 2 件目以降で採用しない（jewelry 2 個などの過剰回避）。
 *   - subcategory 未設定の item も 1 件は採用可（空 subcategory は「重複」とは見なさず最大 1 つ通す）。
 *   - `pick(pool)` callback（= buildCombo の pickBest）で各ステップの最良 1 件を選ぶ。
 *     選んだ item を pool から除いて次を選ぶ（同一 item の二重採用を防ぐ）。
 *   - pure: 副作用なし。 入力 mutate なし。
 */
export function selectAccessories(input: {
  pool: ReadonlyArray<WardrobeItem>;
  count: number;
  coldDay: boolean;
  pick: (pool: WardrobeItem[]) => WardrobeItem | null;
  /** D4: subcategory 別 eligibility 用 context（省略可・後方互換）。 渡さなければ D3-2 挙動と完全同一。 */
  ctx?: AccessoryContext;
}): WardrobeItem[] {
  const { count, coldDay, pick, ctx } = input;
  if (input.pool.length === 0 || count <= 0) return [];

  const chosen: WardrobeItem[] = [];
  const usedSubcats = new Set<string>();
  // D4: ctx があれば subcategory 別 tier で安定 partition（除外せず順序のみ変更）。 ctx 無しは D3-2 互換。
  let remaining: WardrobeItem[] = ctx
    ? partitionByTier(input.pool, ctx)
    : [...input.pool];

  // cold day: 1 件目は **scarf sub-pool に限定して pick** する。
  //   理由: pick (= buildCombo の pickBest) は同点候補を内部で再ソート + seed 選択するため、
  //   単に scarf を配列先頭へ並べ替えるだけでは scarf が選ばれる保証がない（formality 未設定だと全 50 点同点）。
  //   そこで cold day かつ scarf が存在するときは scarf だけを pick に渡し、 確実に scarf を最優先採用する。
  //   scarf が無ければ通常 pick に fallback（accessory 全体は消さない）。
  //   D4: scarf cold 優先は subcategory tier より強い（D3-2 仕様を壊さない）。
  if (coldDay) {
    const scarves = remaining.filter((a) => accessorySubcat(a).endsWith("scarf"));
    if (scarves.length > 0) {
      const scarf = pick([...scarves]);
      if (scarf) {
        chosen.push(scarf);
        usedSubcats.add(accessorySubcat(scarf));
        remaining = remaining.filter((x) => x.id !== scarf.id);
      }
    }
  }

  // 残り枠を通常 pick で埋める（subcategory 重複禁止）。
  //   D4: ctx ありの場合、 remaining は tier 順（preferred → normal → suppressed）。 pick は pickBest 同点で
  //   再ソートされ得るが、 tier 別に **sub-pool を順に渡す** ことで eligibility を尊重する。
  if (ctx) {
    // tier 別 sub-pool を順に試す。 各 sub-pool 内で subcategory 重複禁止。
    const tiers: AccessoryTier[] = ["preferred", "normal", "suppressed"];
    for (const tier of tiers) {
      if (chosen.length >= count) break;
      const tierPool = remaining.filter((x) => accessorySubcategoryTier(x, ctx) === tier);
      while (chosen.length < count && tierPool.length > 0) {
        const candidate = pick([...tierPool]);
        if (!candidate) break;
        const subcat = accessorySubcat(candidate);
        if (usedSubcats.has(subcat)) {
          // 同 subcategory はこの tier から除外して別 subcategory を探す。
          for (let i = tierPool.length - 1; i >= 0; i--) {
            if (accessorySubcat(tierPool[i]) === subcat) tierPool.splice(i, 1);
          }
          continue;
        }
        chosen.push(candidate);
        usedSubcats.add(subcat);
        const idx = tierPool.findIndex((x) => x.id === candidate.id);
        if (idx >= 0) tierPool.splice(idx, 1);
        remaining = remaining.filter((x) => x.id !== candidate.id);
      }
    }
  } else {
    // D3-2 互換 path（ctx 無し）
    while (chosen.length < count && remaining.length > 0) {
      const candidate = pick([...remaining]);
      if (!candidate) break;
      const subcat = accessorySubcat(candidate);
      if (usedSubcats.has(subcat)) {
        remaining = remaining.filter((x) => accessorySubcat(x) !== subcat);
        continue;
      }
      chosen.push(candidate);
      usedSubcats.add(subcat);
      remaining = remaining.filter((x) => x.id !== candidate.id);
    }
  }
  return chosen;
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
  const EVENT_JA: Record<string, string> = {
    work: "仕事", date: "デート", meeting: "ミーティング",
    party: "パーティ", formal: "フォーマル", friends: "友達との予定",
    outdoor: "アウトドア", sports: "スポーツ", travel: "旅行",
    interview: "面接",
  };

  // イベントがある日は場面を軸に
  if (events.length > 0) {
    const names = events.map(e => EVENT_JA[e.event_type] ?? e.event_type).slice(0, 2);
    if (weather?.temp_max != null) {
      return `${names.join("・")}の日。${weather.temp_max}°に合わせた構成`;
    }
    return `${names.join("・")}に合わせた構成`;
  }

  // 気温がある日は気温を軸に
  if (weather?.temp_max != null) {
    const temp = weather.temp_max;
    if (temp >= 28) return `${temp}°の暑さに合わせた涼しい構成`;
    if (temp >= 20) return `${temp}°の過ごしやすい気温を活かした構成`;
    if (temp >= 10) return `${temp}°に合わせた快適な重ね着構成`;
    return `${temp}°の寒さに備えた暖かい構成`;
  }

  // フォールバック
  return "手持ちのアイテムからバランスの良い組み合わせを選びました";
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

  // ─── D2-2: supplemental — bag / accessory ──────────────────────────────
  //   既存 outfit 成立判定（selectedItems.length < 2）を通過した **後** に末尾追加するため、
  //   bag/accessory が無くても proposal は null にならない（supplemental 原則）。
  //
  //   event_type 語彙の根拠（read-only audit, D2-2 冒頭, 2026-06-01）:
  //     TPO_FORMALITY_MAP の正規 8 種 (work/meeting/date/party/casual/outdoor/sports/travel) のうち、
  //     外出が確実な 4 種（work/meeting/date/party）のみを needsBag 対象とする。
  //     casual/outdoor/sports/travel は bag 不要のケースを含むため安全側で除外（D3 以降で精緻化）。
  //
  //   accessory の formality gate（CEO 補正 2 = A 採用）:
  //     scoreCandidate には触らず、 既に選ばれた selectedItems の formality 最頻値を見て、
  //     smart/dress の日のみ accessory を採用。 採用判定だけに使う（scoring には流さない）。
  //     formality 未設定の accessory は scoreCandidate 側で中性扱い（既存 if-gate のおかげ）。
  if (selectedItemsNeedsBag(events) && pools.bag.length > 0) {
    // D3-1: rain 防水 / travel / formality で bag pool の優先順位を整えてから pickBest（除外せず並べ替え）。
    const bagPool = selectBagPool(pools.bag, variant, events, adjustedFormality);
    const bag = pickBest(bagPool);
    if (bag) selectedItems.push(bag);
  }
  if (selectedItemsNeedsAccessory(selectedItems, adjustedFormality) && pools.accessory.length > 0) {
    // D3-2: dress のみ最大 2 件、 それ以外（smart）は 1 件。 cold day は scarf 優先。 subcategory 重複禁止。
    // D4: subcategory 別 eligibility（hat/belt/jewelry/scarf）を ctx で渡し、 tier 別 sub-pool で順番に pick。
    const accCtx = buildAccessoryContext(selectedItems, weather, events, adjustedFormality);
    const accCount = accCtx.baseFormality === "dress" ? 2 : 1;
    const accessories = selectAccessories({
      pool: pools.accessory,
      count: accCount,
      coldDay: isColdDay(weather),
      pick: pickBest,
      ctx: accCtx,
    });
    for (const accessory of accessories) selectedItems.push(accessory);
  }
  // ────────────────────────────────────────────────────────────────────────

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

  // Phase 5-C3: shared learningRecords が渡されたら scoring cache を per-run prime（flag 既定 off では渡らない）。
  // prime の allWardrobe = この wardrobe 参照。 buildCombo が同参照を allWardrobe として getScoringCache に渡すため、
  // per-item は primed cache を再利用する。 渡されなければ現行 loadWornHistory path（退化ゼロ）。
  if (extendedOptions?.rotationRecords && extendedOptions.rotationRecords.length > 0) {
    primeScoringCacheFromRecords(wardrobe, extendedOptions.rotationRecords);
  }

  const month = parseInt(date.split("-")[1], 10);
  const seed = buildSeed(date, events);
  const { needsOuter } = getRecommendedThickness(weather?.temp_max ?? null);
  const recentlyWornIds = new Set(recentlyWornItemIds);

  // カテゴリ別プール
  // D2-1: bag / accessory を pool に追加（型網羅性のため必須）。 buildCombo はまだ参照しない（no-op 段階）。
  //   分類だけ動くが、 selection には影響しない → /plan の見た目は D2-1 時点で不変。
  const pools: Record<CategoryGroup, WardrobeItem[]> = {
    outer: [], tops: [], bottoms: [], shoes: [], bag: [], accessory: [],
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
  if (!main) {
    clearScoringCache(); // 早期 return でも per-run cache を残さない（primed cache の次 run 漏れ防止）
    return null;
  }

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
