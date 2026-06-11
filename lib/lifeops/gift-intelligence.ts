/**
 * Life Ops A-6 — Gift Intelligence（**pure 契約・no-DB・no-UI・no-通知・no-購入・no-外部API・no-LLM分類**・barrel 非 export）
 *
 * 設計: docs/life-ops-relationship-gift-intelligence-mini-design.md §2・§5〜§10・§14
 *
 * 役割: Tier A（同意済み蒸留）/ Tier B（構造化入力）/ Tier C（偵察結果）を **DesireSignal に統一**し、
 *   多段 pure パイプライン（suppression→sanitize→freshness scoring→hard constraints→戦略別生成→重複回避→portfolio）で
 *   **理由コード付き GiftRecommendation N 選**を出す。商品 descriptor/searchQuery は **定数カタログ合成のみ**（live 検索/価格/在庫/購入なし）。
 *
 * 厳守:
 *   - **closed vocabulary**: category は GiftInterest（19 値）に sanitize（free text/raw note 流入不可）。confidence は source から導出。
 *   - **生データ非開示**: 出力は蒸留された理由コード→定数文言のみ。personRef は presenter に渡らない。**感情を推定・断定しない**。
 *   - pure・deterministic・横エンジン非 import・suppression（手動）尊重・fail-closed（不正 personRef→空）。
 */

import {
  evaluateSuppression,
  getTouchpointSpec,
  isOpaquePersonRef,
  type RelationKind,
  type RelationshipSuppression,
  type RelationshipTouchpointId,
} from "./relationship-model";

// ── ギフト関心カテゴリ（closed vocabulary・19 値）──

export const GIFT_INTEREST_VALUES = [
  "coffee", "tea", "sweets", "alcohol", "cooking", "outdoor", "sports", "beauty", "fashion",
  "gadgets", "books", "music", "travel", "gaming", "plants", "stationery", "home_goods", "wellness", "flowers",
] as const;
export type GiftInterest = (typeof GIFT_INTEREST_VALUES)[number];
const INTEREST_SET = new Set<string>(GIFT_INTEREST_VALUES);

/** カテゴリ → 商品記述/検索語（**定数のみ**・free text 合成不可）。 */
const GIFT_CATALOG_HINTS: Record<GiftInterest, { readonly descriptor: string; readonly query: string }> = {
  coffee: { descriptor: "コーヒー器具やスペシャルティ豆", query: "コーヒー ギフト" },
  tea: { descriptor: "お茶・紅茶のセット", query: "紅茶 ギフト" },
  sweets: { descriptor: "上質な菓子の詰め合わせ", query: "スイーツ ギフト" },
  alcohol: { descriptor: "好みに合うお酒", query: "お酒 ギフト" },
  cooking: { descriptor: "料理が楽しくなる道具", query: "キッチン ギフト" },
  outdoor: { descriptor: "アウトドアで使える道具", query: "アウトドア ギフト" },
  sports: { descriptor: "運動まわりのギア", query: "スポーツ ギフト" },
  beauty: { descriptor: "スキンケア・美容のアイテム", query: "コスメ ギフト" },
  fashion: { descriptor: "身につける小物", query: "ファッション小物 ギフト" },
  gadgets: { descriptor: "便利なガジェット", query: "ガジェット ギフト" },
  books: { descriptor: "読書まわりのアイテム", query: "本 ギフト" },
  music: { descriptor: "音楽まわりのアイテム", query: "音楽 ギフト" },
  travel: { descriptor: "旅行で使える実用アイテム", query: "トラベルグッズ ギフト" },
  gaming: { descriptor: "ゲームまわりのアイテム", query: "ゲーム ギフト" },
  plants: { descriptor: "グリーン・植物", query: "観葉植物 ギフト" },
  stationery: { descriptor: "上質な文房具", query: "文房具 ギフト" },
  home_goods: { descriptor: "暮らしを整える日用品の上質版", query: "日用品 上質 ギフト" },
  wellness: { descriptor: "リラックス・セルフケア用品", query: "リラックスグッズ ギフト" },
  flowers: { descriptor: "季節の花", query: "花 ギフト" },
};

// ── desire signal（CEO DTO 準拠）──

export type DesireSignalSource =
  | "wishlist" | "later_candidate" | "recent_habit" | "upcoming_plan"
  | "style_profile" | "consumable_cycle" | "manual_structured_hint" | "scouting_result";
export type DesireFreshness = "fresh" | "recent" | "stale";
export type SignalStrength = "strong" | "medium" | "weak";
export type SignalConfidence = "high" | "medium" | "low";

export interface DesireSignal {
  readonly source: DesireSignalSource;
  readonly category: string; // sanitize で GiftInterest に制限
  readonly freshness: DesireFreshness;
  readonly strength: SignalStrength;
  readonly confidence: SignalConfidence;
}

/** confidence は source から導出（入力値を信用しない）: wishlist=高 / 行動事実・聞いた話=中 / 推測=低。 */
const SOURCE_CONFIDENCE: Record<DesireSignalSource, SignalConfidence> = {
  wishlist: "high",
  later_candidate: "medium",
  consumable_cycle: "medium",
  manual_structured_hint: "medium",
  scouting_result: "medium",
  recent_habit: "low",
  upcoming_plan: "low",
  style_profile: "low",
};
const SOURCES = new Set<string>(Object.keys(SOURCE_CONFIDENCE));
const FRESHNESS = new Set<string>(["fresh", "recent", "stale"]);
const STRENGTH = new Set<string>(["strong", "medium", "weak"]);

/** 不正 source/category/enum を drop・confidence を source から再導出（free text 流入遮断）。 */
export function sanitizeDesireSignals(signals: readonly DesireSignal[]): readonly DesireSignal[] {
  return signals
    .filter((s) => SOURCES.has(s.source) && INTEREST_SET.has(s.category) && FRESHNESS.has(s.freshness) && STRENGTH.has(s.strength))
    .map((s) => ({ ...s, confidence: SOURCE_CONFIDENCE[s.source] }));
}

/** desire half-life: ≤14日=fresh / ≤60日=recent / それ以上=stale。 */
export function freshnessFromDaysSince(days: number): DesireFreshness {
  if (days <= 14) return "fresh";
  if (days <= 60) return "recent";
  return "stale";
}

const FRESHNESS_W: Record<DesireFreshness, number> = { fresh: 1.0, recent: 0.6, stale: 0.2 };
const STRENGTH_W: Record<SignalStrength, number> = { strong: 1.0, medium: 0.6, weak: 0.3 };
const CONFIDENCE_W: Record<SignalConfidence, number> = { high: 1.0, medium: 0.7, low: 0.4 };

/** signal スコア（鮮度×強さ×確度）。stale×strong×high(0.2) < fresh×strong×low(0.4)＝今の関心が勝つ。 */
export function desireSignalScore(s: DesireSignal): number {
  return FRESHNESS_W[s.freshness] * STRENGTH_W[s.strength] * CONFIDENCE_W[s.confidence];
}

// ── Tier A / Tier B 入力 → DesireSignal への統一 ──

/** Tier A: 同意済み・蒸留済みの相手属性（縦は同意成立画面を知らない＝consentScopeId は opaque）。 */
export interface ConsentedDistilledProfile {
  readonly personRef: string;
  readonly consentScopeId: string;
  readonly desireSignals: readonly DesireSignal[];
  readonly styleFitCategories?: readonly string[]; // style/color から蒸留された「合うカテゴリ」
  readonly ownedCategories?: readonly string[]; // 重複回避（持ち物カテゴリ・蒸留）
}

/** Tier A → signals（蒸留属性のみ・sanitize 済で返す）。 */
export function distilledProfileToSignals(profile: ConsentedDistilledProfile): readonly DesireSignal[] {
  const style: DesireSignal[] = (profile.styleFitCategories ?? [])
    .filter((c) => INTEREST_SET.has(c))
    .map((category) => ({ source: "style_profile", category, freshness: "recent", strength: "medium", confidence: "low" }) as const);
  return [...sanitizeDesireSignals(profile.desireSignals), ...style];
}

/** Tier B: 非ユーザー相手の構造化プロファイル（closed vocabulary のみ・free text 不可）。 */
export interface PartnerStructuredProfile {
  readonly personRef: string;
  readonly relationKind: RelationKind;
  readonly ageRange?: "teens" | "twenties" | "thirties" | "forties" | "fifties_plus" | null;
  readonly interests?: readonly string[];
  readonly knownNeeds?: readonly string[]; // 「欲しがっていた」と知っているカテゴリ
  readonly dislikedCategories?: readonly string[];
}

/** Tier B → signals（interests=中強度・knownNeeds=強。語彙外は drop）。 */
export function partnerProfileToSignals(profile: PartnerStructuredProfile): readonly DesireSignal[] {
  if (!isOpaquePersonRef(profile.personRef)) return [];
  const mk = (category: string, strength: SignalStrength): DesireSignal =>
    ({ source: "manual_structured_hint", category, freshness: "recent", strength, confidence: "medium" });
  return sanitizeDesireSignals([
    ...(profile.knownNeeds ?? []).map((c) => mk(c, "strong")),
    ...(profile.interests ?? []).map((c) => mk(c, "medium")),
  ]);
}

// ── occasion frame / budget ──

export type GiftStrategy = "safe" | "easy" | "surprise" | "premium" | "experience";
export type BudgetBand = "low" | "middle" | "high" | "premium";

export interface GiftOccasionFrame {
  readonly touchpointId: RelationshipTouchpointId;
  readonly relationKind: RelationKind;
  readonly budgetBand: BudgetBand;
  readonly formality: "casual" | "standard" | "formal";
}

const HIGH_BUDGET_OCCASIONS = new Set<string>(["marriage", "childbirth", "new_home", "opening_business"]);
const CLOSE_RELATIONS = new Set<RelationKind>(["family", "close_friend"]);

/** 関係×イベントの既定予算帯（注入で上書き可・fallback=middle）。 */
export function defaultBudgetBand(relationKind: RelationKind, touchpointId: RelationshipTouchpointId): BudgetBand {
  if (HIGH_BUDGET_OCCASIONS.has(touchpointId)) return "high";
  if (touchpointId === "birthday" || touchpointId === "anniversary") {
    if (relationKind === "partner") return "high";
    if (CLOSE_RELATIONS.has(relationKind)) return "middle";
    return "low";
  }
  const group = getTouchpointSpec(touchpointId)?.group;
  if (group === "reciprocity") return "low";
  return "middle";
}

// ── 推薦 DTO（CEO 準拠）──

export interface GiftRecommendation {
  readonly strategy: GiftStrategy;
  readonly productDescriptor: string; // 定数カタログ合成のみ
  readonly searchQuery: string; // 検索語（deep-link 化は後続 gate）
  readonly budgetBand: BudgetBand;
  readonly reasonCodes: readonly string[];
  readonly confidence: SignalConfidence;
  readonly riskFlags: readonly string[];
}

export interface GiftIntelligenceInput {
  readonly personRef: string;
  readonly frame: GiftOccasionFrame;
  readonly signals: readonly DesireSignal[]; // Tier A/B/C 統一済
  readonly dislikedCategories?: readonly string[]; // 苦手・過去に微妙だったもの
  readonly ownedCategories?: readonly string[];
  readonly pastGiftCategories?: readonly string[]; // 重複回避
  readonly suppression?: RelationshipSuppression;
}

// 戦略別の signal source（safe=確実系 / surprise=推測系）
const SAFE_SOURCES = new Set<DesireSignalSource>(["wishlist", "manual_structured_hint", "scouting_result"]);
const SURPRISE_SOURCES = new Set<DesireSignalSource>(["later_candidate", "recent_habit", "upcoming_plan", "style_profile", "consumable_cycle"]);
const EASY_POOL: readonly GiftInterest[] = ["sweets", "flowers", "tea"]; // 消えもの

interface ScoredCategory {
  readonly category: GiftInterest;
  readonly score: number;
  readonly top: DesireSignal;
}

/** source 集合ごとの per-category 最高スコア（決定的・先勝ち安定）。 */
function scoreCategories(signals: readonly DesireSignal[], sources: ReadonlySet<DesireSignalSource>): ScoredCategory[] {
  const best = new Map<GiftInterest, ScoredCategory>();
  for (const s of signals) {
    if (!sources.has(s.source)) continue;
    const category = s.category as GiftInterest;
    const score = desireSignalScore(s);
    const prev = best.get(category);
    if (!prev || score > prev.score) best.set(category, { category, score, top: s });
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score);
}

/** stale 由来の推薦は強く出さない（confidence を low に降格）。 */
function recommendationConfidence(top: DesireSignal): SignalConfidence {
  return top.freshness === "stale" ? "low" : top.confidence;
}

/**
 * A-6: 多段 pure パイプライン → GiftRecommendation N 選（既定 5）。
 *   不正 personRef / 非 gift touchpoint / suppression → 空（fail-closed）。戦略分散（safe/easy/surprise/experience/premium）。
 */
export function recommendGifts(input: GiftIntelligenceInput, maxCount = 5): readonly GiftRecommendation[] {
  // stage 1-2: personRef 検証・touchpoint 適合
  if (!isOpaquePersonRef(input.personRef)) return [];
  const spec = getTouchpointSpec(input.frame.touchpointId);
  if (!spec?.giftRelevant) return [];
  // stage 3: suppression（手動・安全側）
  if (input.suppression && !evaluateSuppression(input.frame.touchpointId, input.suppression).allowed) return [];
  // stage 4-5: sanitize + hard constraints（disliked/owned は候補から除外）
  const blocked = new Set([...(input.dislikedCategories ?? []), ...(input.ownedCategories ?? [])]);
  const past = new Set(input.pastGiftCategories ?? []);
  const clean = sanitizeDesireSignals(input.signals).filter((s) => !blocked.has(s.category));
  const lowSignal = clean.length === 0;
  const occasionCode = `occasion_${input.frame.touchpointId}`;

  const rec = (
    strategy: GiftStrategy,
    category: GiftInterest | null,
    descriptor: string,
    query: string,
    codes: readonly string[],
    confidence: SignalConfidence,
    risk: readonly string[]
  ): GiftRecommendation => ({
    strategy,
    productDescriptor: descriptor,
    searchQuery: query,
    budgetBand: strategy === "premium" ? "premium" : input.frame.budgetBand,
    reasonCodes: [...codes, occasionCode],
    confidence,
    riskFlags: [...risk, ...(category && past.has(category) ? ["repeat_gift"] : [])],
  });

  // stage 6-7: 戦略別候補生成 + 過去贈答の重複回避（重複カテゴリは次点へ）
  const notPast = (xs: ScoredCategory[]) => xs.find((x) => !past.has(x.category)) ?? null;
  const safeTop = notPast(scoreCategories(clean, SAFE_SOURCES));
  const surprisePool = scoreCategories(clean, SURPRISE_SOURCES).filter((x) => x.category !== safeTop?.category);
  const surpriseTop = notPast(surprisePool);

  const out: GiftRecommendation[] = [];
  if (safeTop) {
    const h = GIFT_CATALOG_HINTS[safeTop.category];
    out.push(rec("safe", safeTop.category, h.descriptor, h.query, ["strategy_safe", `signal_${safeTop.top.source}`], recommendationConfidence(safeTop.top), []));
  }
  const easyCat = EASY_POOL.find((c) => !blocked.has(c) && !past.has(c));
  if (easyCat) {
    const h = GIFT_CATALOG_HINTS[easyCat];
    out.push(rec("easy", easyCat, h.descriptor, h.query, ["strategy_easy"], "medium", lowSignal ? ["low_signal"] : []));
  }
  if (surpriseTop) {
    const h = GIFT_CATALOG_HINTS[surpriseTop.category];
    out.push(rec("surprise", surpriseTop.category, h.descriptor, h.query, ["strategy_surprise", `signal_${surpriseTop.top.source}`], recommendationConfidence(surpriseTop.top), []));
  }
  // experience: 一緒の時間（travel 関心があれば体験寄せ・なければ食事）
  const hasTravel = clean.some((s) => s.category === "travel");
  out.push(
    hasTravel
      ? rec("experience", null, "日帰り温泉や小旅行の体験ギフト", "体験ギフト 温泉", ["strategy_experience", "signal_upcoming_plan"], "medium", [])
      : rec("experience", null, "少し特別な食事の時間", "レストラン ギフト ディナー", ["strategy_experience"], "medium", lowSignal ? ["low_signal"] : [])
  );
  // premium: 節目 or 高予算のみ
  if (input.frame.budgetBand === "high" || input.frame.budgetBand === "premium") {
    const top = safeTop ?? surpriseTop;
    if (top) {
      const h = GIFT_CATALOG_HINTS[top.category];
      out.push(rec("premium", top.category, `ワンランク上の${h.descriptor}`, `${h.query} 高級`, ["strategy_premium", `signal_${top.top.source}`], recommendationConfidence(top.top), ["high_cost"]));
    }
  }
  // stage 8-10: portfolio（戦略分散のまま N 選）
  return out.slice(0, Math.max(0, maxCount));
}

// ── presenter（code → 定数文言のみ・低圧・感情を断定しない・personRef を受けない）──

const GIFT_REASON_TEXT: Record<string, string> = {
  strategy_safe: "外しにくい確実な方向です",
  strategy_easy: "消えもの中心で、気軽に渡せます",
  strategy_surprise: "最近の関心から推測した、少し攻めた案です",
  strategy_experience: "ものではなく、一緒の時間そのものを贈れます",
  strategy_premium: "節目に合わせて、少し格を上げています",
  signal_wishlist: "ご本人が欲しいものとして残している方向に沿っています",
  signal_later_candidate: "気になりつつ後回しにしている様子がうかがえる分野です",
  signal_recent_habit: "最近始めたことに合いそうです",
  signal_upcoming_plan: "近い予定の流れに合いそうです",
  signal_style_profile: "好みの雰囲気に合いそうです",
  signal_consumable_cycle: "普段使いのものが切れる頃合いです",
  signal_manual_structured_hint: "あなたが知っている好みに沿っています",
  signal_scouting_result: "以前それとなく聞いた話に沿っています",
};

/** reasonCodes → 低圧の根拠文（未知 code は表示しない・感情断定なし）。 */
export function giftReasonTexts(reasonCodes: readonly string[]): readonly string[] {
  return reasonCodes.map((c) => GIFT_REASON_TEXT[c]).filter((s): s is string => typeof s === "string");
}
