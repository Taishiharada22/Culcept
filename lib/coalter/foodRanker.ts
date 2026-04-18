/**
 * CoAlter Layer 2: Food Ranker — Phase B Commit 2 (2026-04-18)
 *
 * Brief + Catalog<FoodVenue> → RankedFoodCandidate[]
 *
 * 設計:
 *  - 9 種の hard filter で違反候補を除外（明確な違反のみ、不明は通す）
 *  - 9 metric（0-1）を候補ごとに算出
 *  - preset ごとに role-specific scoring
 *  - 役割ごとに 1 候補 → 最大 3 件
 *  - alternatives は 0-2 件（役割外上位）
 *
 * 実装ガード（CEO 方針）:
 *  1. novelty は balance / safety に入れない（sourceDomain proxy の偏り防止）
 *  2. quietnessFit（静か/盛り上がる）と moodMatch（他の mood）を二重化しない
 *  3. compromiseQuality は balance preset のみ、重み <= 0.15、aFocus/bFocus には入れない
 *  4. ratingFit 欠損は 0.5 中立（0 扱いで公式サイトを不利にしない）
 *  5. openingHours 不明は violates_opening_hours にしない
 */

import type {
  ActivityCandidate,
  BriefMood,
  ConversationBrief,
  CoAlterPersonProfile,
  FoodFilterTrace,
  FoodHardFilterReason,
  FoodMetrics,
  FoodRankInput,
  FoodRankOutput,
  FoodScoreBreakdown,
  FoodVenue,
  RankedFoodAlternative,
  RankedFoodCandidate,
  RankingAxesPreset,
  RankingRole,
  SelectionRationale,
} from "./types";

// ─────────────────────────────────────────────
// Preset / role
// ─────────────────────────────────────────────

const PRESET_ROLES: Record<RankingAxesPreset, RankingRole[]> = {
  balance_focus: ["balance", "aFocus", "bFocus"],
  safety_adventure_discovery: ["safety", "adventure", "discovery"],
  calm_stimulating_nostalgic: ["calm", "stimulating", "nostalgic"],
};

/**
 * 実装ガード #1: novelty を使わない role の明示的ホワイトリスト。
 * この role に novelty が混入した場合、role scoring は禁止される。
 */
const NOVELTY_BLOCKED_ROLES: Set<RankingRole> = new Set<RankingRole>([
  "balance",
  "safety",
  "aFocus",
  "bFocus",
]);

/** mood 語彙の分割（実装ガード #2: quietness と moodMatch の責務分離） */
const QUIETNESS_MOODS = new Set<BriefMood>(["静か", "盛り上がる"]);
const GENERIC_MOODS = new Set<BriefMood>([
  "重すぎない",
  "会話が続く",
  "癒し",
  "刺激",
  "ノスタルジア",
  "軽め",
  "非日常",
  "安心",
]);

// ─────────────────────────────────────────────
// 食事系「既知商用ドメイン」（novelty proxy で使用）
// foodCatalog の KNOWN_FOOD_DOMAINS と一致させる
// ─────────────────────────────────────────────

const COMMERCIAL_FOOD_DOMAINS = new Set<string>([
  "tabelog.com",
  "retty.me",
  "hotpepper.jp",
  "r.gnavi.co.jp",
  "gnavi.co.jp",
  "opentable.jp",
  "tablecheck.com",
  "ikyu.com",
]);

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function hasHardConstraint(
  brief: ConversationBrief,
  predicate: (c: ConversationBrief["hardConstraints"][number]) => boolean,
): boolean {
  return brief.hardConstraints.some(
    (c) => c.strength === "hard" && predicate(c),
  );
}

/** rating 文字列から数値抽出（「食べログ 3.52」「★4.2」→ 3.52 / 4.2） */
export function parseRatingValue(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d\.\d{1,2})/);
  return m ? Number(m[1]) : null;
}

/** priceBand 文字列から大体の円価格レンジを抽出（「¥3,000〜¥3,999」→ [3000, 3999]） */
export function parsePriceBand(s: string | null): { lo: number; hi: number } | null {
  if (!s) return null;
  const nums = [...s.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)/g)]
    .map((m) => Number(m[1].replace(/,/g, "")))
    .filter((n) => n >= 500 && n <= 100000);
  if (nums.length === 0) return null;
  if (nums.length === 1) return { lo: nums[0], hi: nums[0] };
  return { lo: Math.min(...nums), hi: Math.max(...nums) };
}

/** brief.hardConstraints から budget 上限を取り出す（円、失敗なら null） */
function extractBudgetCeiling(brief: ConversationBrief): number | null {
  for (const c of brief.hardConstraints) {
    if (c.kind !== "budget" || c.strength !== "hard") continue;
    const m = c.sourceText.match(/(\d{1,3}(?:,\d{3})+|\d+)/);
    if (!m) continue;
    const n = Number(m[1].replace(/,/g, ""));
    if (n >= 500 && n <= 100000) return n;
  }
  return null;
}

/** area が venue.area / station に含まれるか（簡易） */
function venueMatchesArea(venue: FoodVenue, area: string): boolean {
  const targets = [venue.area, venue.station].filter(
    (s): s is string => !!s,
  );
  return targets.some((t) => t.includes(area));
}

/** openingHours 文字列から 開始〜終了の時間帯を取り出す（「17:00〜24:00」→ [17, 24]） */
function parseHoursRange(s: string | null): { open: number; close: number } | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2}):(\d{2})\s*[〜~～\-–]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const open = Number(m[1]);
  const close = Number(m[3]);
  if (open < 0 || open > 29 || close < 0 || close > 29) return null;
  return { open, close };
}

function timeSlotWindow(
  slot: "morning" | "afternoon" | "evening" | "night",
): { start: number; end: number } {
  if (slot === "morning") return { start: 6, end: 11 };
  if (slot === "afternoon") return { start: 11, end: 17 };
  if (slot === "evening") return { start: 17, end: 20 };
  return { start: 20, end: 26 }; // night
}

function hoursOverlap(
  hours: { open: number; close: number },
  win: { start: number; end: number },
): boolean {
  // close が 24 以下扱い（深夜越しは 24+h 表記を期待するが未対応分は open < close と仮定）
  const close = hours.close < hours.open ? hours.close + 24 : hours.close;
  return hours.open < win.end && close > win.start;
}

// ─────────────────────────────────────────────
// Hard filter (9 種)
// ─────────────────────────────────────────────

function violatesBudget(venue: FoodVenue, brief: ConversationBrief): boolean {
  const ceiling = extractBudgetCeiling(brief);
  if (ceiling === null) return false;
  const band = parsePriceBand(venue.priceBand);
  if (!band) return false; // 不明は通す
  return band.lo > ceiling;
}

function violatesArea(venue: FoodVenue, brief: ConversationBrief): boolean {
  if (!brief.area) return false;
  // area / station どちらも null は missing_where で別途落ちる。ここでは matching 責務のみ
  if (!venue.area && !venue.station) return false;
  return !venueMatchesArea(venue, brief.area);
}

function violatesCuisineExclusion(
  venue: FoodVenue,
  brief: ConversationBrief,
): boolean {
  const exclusions = brief.hardConstraints.filter(
    (c) => c.kind === "exclusion" && c.strength === "hard",
  );
  if (exclusions.length === 0) return false;
  const text = [venue.name, venue.snippet, venue.area ?? "", venue.station ?? ""]
    .join(" ")
    .toLowerCase();
  return exclusions.some((ex) => {
    const keyword = ex.sourceText.replace(/(?:じゃない|以外|ではない|NG|抜き)/g, "").trim();
    if (!keyword || keyword.length < 2) return false;
    return text.includes(keyword.toLowerCase());
  });
}

function violatesCompanions(
  _venue: FoodVenue,
  brief: ConversationBrief,
): boolean {
  // Commit 2 では companion 情報が venue 側に無いため、構造だけ用意して false を返す。
  // 将来 venue.seatLayout 等を足したら実装する。
  return hasHardConstraint(brief, (c) => c.kind === "companions") && false;
}

function violatesOpeningHours(
  venue: FoodVenue,
  brief: ConversationBrief,
): boolean {
  // 実装ガード #5: openingHours 不明は通す
  const hours = parseHoursRange(venue.openingHours);
  if (!hours) return false;
  const slot = brief.approximateTime.timeSlot;
  if (!slot) return false;
  const win = timeSlotWindow(slot);
  return !hoursOverlap(hours, win);
}

function isClosedPermanently(venue: FoodVenue): boolean {
  const text = [venue.name, venue.snippet].join(" ");
  return /閉店|閉業|廃業/.test(text);
}

function isMissingWhere(venue: FoodVenue): boolean {
  return venue.station === null && venue.area === null;
}

function isInsufficientInfo(candidate: ActivityCandidate<FoodVenue>): boolean {
  return candidate.confidence < 0.1;
}

/** 1 候補の hard filter 結果 */
interface HardFilterStep {
  candidate: ActivityCandidate<FoodVenue>;
  reasons: FoodHardFilterReason[];
  missingFields: string[];
}

export function hardFilterOne(
  candidate: ActivityCandidate<FoodVenue>,
  brief: ConversationBrief,
  avoidKeys: Set<string>,
): HardFilterStep {
  const venue = candidate.entity;
  const reasons: FoodHardFilterReason[] = [];
  const missingFields: string[] = [];

  if (violatesBudget(venue, brief)) reasons.push("violates_budget");
  if (violatesArea(venue, brief)) reasons.push("violates_area");
  if (violatesCuisineExclusion(venue, brief)) reasons.push("violates_cuisine_exclusion");
  if (violatesCompanions(venue, brief)) reasons.push("violates_companions");
  if (violatesOpeningHours(venue, brief)) reasons.push("violates_opening_hours");
  if (isClosedPermanently(venue)) reasons.push("closed_permanently");
  if (isMissingWhere(venue)) reasons.push("missing_where");
  if (isInsufficientInfo(candidate)) reasons.push("insufficient_info");
  if (avoidKeys.has(candidate.candidateId)) reasons.push("violates_avoid_keys");

  // missing fields の observability
  if (!venue.station) missingFields.push("station");
  if (!venue.area) missingFields.push("area");
  if (!venue.priceBand) missingFields.push("priceBand");
  if (!venue.openingHours) missingFields.push("openingHours");
  if (!venue.rating) missingFields.push("rating");

  return { candidate, reasons, missingFields };
}

// ─────────────────────────────────────────────
// Metrics (9 種、全て 0-1)
// ─────────────────────────────────────────────

function overlapScore(keywords: string[], text: string): number {
  if (keywords.length === 0) return 0.35;
  const hit = keywords.filter((k) => k && text.toLowerCase().includes(k.toLowerCase())).length;
  return clamp01(hit / Math.max(3, keywords.length));
}

/**
 * quietnessFit は 静か / 盛り上がる mood のみ担当。
 *
 * - 「静か」希望 + venue snippet に「静か」系語彙あり → 1
 * - 「盛り上がる」希望 + venue snippet に「にぎやか」系語彙あり → 1
 * - mood 側に 静か/盛り上がる が無ければ 0.5 中立
 */
function scoreQuietnessFit(venue: FoodVenue, brief: ConversationBrief): number {
  const quietMoods = brief.mood.filter((m) => QUIETNESS_MOODS.has(m));
  if (quietMoods.length === 0) return 0.5;
  const text = `${venue.name} ${venue.snippet}`.toLowerCase();
  const wantsQuiet = quietMoods.includes("静か");
  const wantsLively = quietMoods.includes("盛り上がる");
  const quietHit = /静か|落ち着い|静謐|穏やか|個室|カウンター/.test(text);
  const livelyHit = /賑やか|にぎやか|活気|ガヤガヤ|立ち飲み/.test(text);
  if (wantsQuiet && quietHit) return 1;
  if (wantsLively && livelyHit) return 1;
  if (wantsQuiet && livelyHit) return 0.2;
  if (wantsLively && quietHit) return 0.2;
  return 0.5;
}

/**
 * novelty: sourceDomain proxy。confidence とは独立。
 *
 * - 既知商用ドメイン（tabelog 等）= 0.3（多数に露出済み → 新規性低）
 * - それ以外（indie blog / 個人ブログ / 専門サイト）= 0.7
 *
 * 将来拡張: session 履歴（avoidKeys + past session venue keys）で減衰。
 */
function scoreNovelty(candidate: ActivityCandidate<FoodVenue>): number {
  return COMMERCIAL_FOOD_DOMAINS.has(candidate.sourceDomain) ? 0.3 : 0.7;
}

/**
 * ratingFit: 食べログ 3.5 を 1 に正規化（3.0 で 0.5、2.5 で 0）。
 *
 * 実装ガード #4: rating 欠損は 0.5 中立（公式サイトが不利にならない）。
 */
function scoreRatingFit(venue: FoodVenue): number {
  const r = parseRatingValue(venue.rating);
  if (r === null) return 0.5;
  // 食べログの 3.5 以上は良店、3.0 で中立、2.5 で最低相当
  return clamp01((r - 2.5) / 1.0);
}

/**
 * budgetFit: budget 制約があれば「範囲内かつ上限に近いほど良い」で評価。
 *
 * - budget 制約なし or priceBand 不明 → 0.5 中立
 * - band 上限が ceiling 以下 → (ceiling - band.hi) / ceiling を使って 1 に寄せる
 * - band 下限が ceiling 超え → 0.2（hard filter で落ちるが念のため低値）
 */
function scoreBudgetFit(venue: FoodVenue, brief: ConversationBrief): number {
  const ceiling = extractBudgetCeiling(brief);
  if (ceiling === null) return 0.5;
  const band = parsePriceBand(venue.priceBand);
  if (!band) return 0.5;
  if (band.lo > ceiling) return 0.2;
  // 範囲内。上限に近いほどいい（ceiling いっぱい使い切る方が体験に寄与する前提）
  const ratio = band.hi / ceiling;
  return clamp01(ratio >= 1 ? 1 : 0.5 + ratio * 0.5);
}

/**
 * areaFit: area 指定と venue の距離感。
 *
 * - area 指定なし → 0.5 中立
 * - station / area どちらかが指定 area を含む → 1
 * - どちらも無い → 0.3（missing_where で hard filter される前提の下限値）
 * - どちらもあるが含まない → 0.2
 */
function scoreAreaFit(venue: FoodVenue, brief: ConversationBrief): number {
  if (!brief.area) return 0.5;
  if (!venue.area && !venue.station) return 0.3;
  if (venueMatchesArea(venue, brief.area)) return 1;
  return 0.2;
}

/** cuisine match: profile.interests が venue.name + snippet と一致 */
function scoreCuisineMatch(
  profile: CoAlterPersonProfile,
  venue: FoodVenue,
): number {
  const text = `${venue.name} ${venue.snippet}`;
  return overlapScore(profile.interests, text);
}

/**
 * moodMatch: QUIETNESS_MOODS を除く mood 全体との整合。
 *
 * brief.mood に該当 mood が無い → 0.5 中立
 */
function scoreMoodMatch(venue: FoodVenue, brief: ConversationBrief): number {
  const relevantMoods = brief.mood.filter((m) => GENERIC_MOODS.has(m));
  if (relevantMoods.length === 0) return 0.5;
  const text = `${venue.name} ${venue.snippet}`.toLowerCase();
  const hits = relevantMoods.filter((m) => matchMoodKeyword(m, text)).length;
  return clamp01(hits / relevantMoods.length);
}

function matchMoodKeyword(mood: BriefMood, text: string): boolean {
  const map: Partial<Record<BriefMood, RegExp>> = {
    癒し: /癒し|ほっ|落ち着/,
    刺激: /刺激|新感覚|エッジ|斬新/,
    "重すぎない": /軽め|カジュアル|気軽/,
    "会話が続く": /会話|くつろ|ゆったり/,
    ノスタルジア: /老舗|レトロ|昭和|ノスタル/,
    軽め: /軽め|カジュアル|手軽/,
    非日常: /非日常|特別|隠れ家|秘密/,
    安心: /定評|人気|実績|老舗/,
  };
  const re = map[mood];
  return re ? re.test(text) : false;
}

/**
 * compromiseQuality (balance preset 専用、active 条件付き)。
 *
 * active = max(prefA, prefB) >= 0.5 && |prefA - prefB| >= 0.2
 * prefA = 0.6 * cuisineMatchA + 0.4 * moodMatch
 * prefB = 0.6 * cuisineMatchB + 0.4 * moodMatch
 * （moodMatch は共有、divergence は cuisine 差からのみ）
 */
function scoreCompromiseQuality(
  cuisineMatchA: number,
  cuisineMatchB: number,
  moodMatch: number,
): number {
  const prefA = 0.6 * cuisineMatchA + 0.4 * moodMatch;
  const prefB = 0.6 * cuisineMatchB + 0.4 * moodMatch;
  const diff = Math.abs(prefA - prefB);
  const peak = Math.max(prefA, prefB);
  const active = peak >= 0.5 && diff >= 0.2;
  if (!active) return 0;
  return clamp01(1 - diff);
}

export function scoreFoodMetrics(
  candidate: ActivityCandidate<FoodVenue>,
  brief: ConversationBrief,
  profileA: CoAlterPersonProfile,
  profileB: CoAlterPersonProfile,
): FoodMetrics {
  const venue = candidate.entity;
  const budgetFit = scoreBudgetFit(venue, brief);
  const areaFit = scoreAreaFit(venue, brief);
  const quietnessFit = scoreQuietnessFit(venue, brief);
  const novelty = scoreNovelty(candidate);
  const cuisineMatchA = scoreCuisineMatch(profileA, venue);
  const cuisineMatchB = scoreCuisineMatch(profileB, venue);
  const moodMatch = scoreMoodMatch(venue, brief);
  const ratingFit = scoreRatingFit(venue);
  const compromiseQuality = scoreCompromiseQuality(
    cuisineMatchA,
    cuisineMatchB,
    moodMatch,
  );
  return {
    budgetFit,
    areaFit,
    quietnessFit,
    novelty,
    cuisineMatchA,
    cuisineMatchB,
    moodMatch,
    ratingFit,
    compromiseQuality,
  };
}

// ─────────────────────────────────────────────
// Role scoring
// 実装ガード: balance/safety/aFocus/bFocus には novelty を入れない
// ─────────────────────────────────────────────

export function foodRoleScore(role: RankingRole, m: FoodMetrics): number {
  switch (role) {
    case "balance": {
      // 実装ガード #1 準拠: novelty なし
      const avg =
        (m.budgetFit +
          m.areaFit +
          m.ratingFit +
          m.cuisineMatchA +
          m.cuisineMatchB +
          m.moodMatch) /
        6;
      return 0.85 * avg + 0.15 * m.compromiseQuality;
    }
    case "aFocus":
      return (
        0.5 * m.cuisineMatchA +
        0.3 * m.moodMatch +
        0.2 * m.ratingFit
      );
    case "bFocus":
      return (
        0.5 * m.cuisineMatchB +
        0.3 * m.moodMatch +
        0.2 * m.ratingFit
      );
    case "safety":
      // 実装ガード #1 準拠: novelty なし
      return (
        0.4 * m.ratingFit +
        0.3 * m.budgetFit +
        0.3 * m.areaFit
      );
    case "adventure":
      return 0.6 * m.novelty + 0.4 * m.moodMatch;
    case "discovery":
      return (
        0.4 * m.novelty +
        0.3 * m.cuisineMatchA +
        0.3 * m.cuisineMatchB
      );
    case "calm":
      return 0.6 * m.quietnessFit + 0.4 * m.moodMatch;
    case "stimulating":
      return 0.5 * m.moodMatch + 0.5 * m.novelty;
    case "nostalgic":
      return (
        0.3 * m.cuisineMatchA +
        0.3 * m.cuisineMatchB +
        0.4 * m.moodMatch
      );
  }
}

/** 実装ガード assertion: novelty が role スコアに寄与しないかを動的に判定する dev only helper。
 *  true = novelty 未使用 (スコア変動なし) / false = novelty 使用 (スコア変動あり)。
 *  NOVELTY_BLOCKED_ROLES の想定と実装ずれを逆方向からも検出できるように、role に関わらず
 *  zero-novelty vs full-novelty の差分で判定する。 */
export function __assertNoveltyNotUsedIn(role: RankingRole): boolean {
  const zero: FoodMetrics = {
    budgetFit: 0.5,
    areaFit: 0.5,
    quietnessFit: 0.5,
    novelty: 0,
    cuisineMatchA: 0.5,
    cuisineMatchB: 0.5,
    moodMatch: 0.5,
    ratingFit: 0.5,
    compromiseQuality: 0,
  };
  const full: FoodMetrics = { ...zero, novelty: 1 };
  return Math.abs(foodRoleScore(role, zero) - foodRoleScore(role, full)) < 1e-9;
}

// ─────────────────────────────────────────────
// Rationale 構築
// ─────────────────────────────────────────────

function buildRationale(
  candidate: ActivityCandidate<FoodVenue>,
  m: FoodMetrics,
  role: RankingRole,
  brief: ConversationBrief,
  profileA: CoAlterPersonProfile,
  profileB: CoAlterPersonProfile,
): SelectionRationale {
  const venue = candidate.entity;
  const text = `${venue.name} ${venue.snippet}`;
  const matchedInterestsA = profileA.interests.filter((k) => k && text.includes(k));
  const matchedInterestsB = profileB.interests.filter((k) => k && text.includes(k));
  const matchedValuesA = profileA.values.filter((k) => k && text.includes(k));
  const matchedValuesB = profileB.values.filter((k) => k && text.includes(k));

  const appealedAxis: RankingRole[] = [role];
  if (m.ratingFit >= 0.7 && role !== "safety") appealedAxis.push("safety");
  if (m.novelty >= 0.7 && role !== "adventure" && role !== "discovery") {
    appealedAxis.push("adventure");
  }

  let tradeoff: string | null = null;
  if (!venue.priceBand) tradeoff = "価格帯は店頭で確認が必要";
  else if (!venue.openingHours) tradeoff = "営業時間は要確認";
  else if (m.areaFit < 0.4 && brief.area) {
    tradeoff = `${brief.area}からは少し離れる`;
  }

  let contingencyHint: string | null = null;
  if (!venue.rating) contingencyHint = "公式サイト由来。第三者評価は未確認";

  return {
    matchedInterestsA,
    matchedInterestsB,
    matchedValuesA,
    matchedValuesB,
    appealedAxis,
    tradeoff,
    contingencyHint,
  };
}

// ─────────────────────────────────────────────
// Main: rankFood
// ─────────────────────────────────────────────

export function rankFood(input: FoodRankInput): FoodRankOutput {
  const { brief, catalog, avoidKeys, profileA, profileB } = input;
  const preset = brief.rankingAxes.preset;
  const roles = PRESET_ROLES[preset];
  const avoidSet = new Set(avoidKeys);

  // 1) Hard filter
  const filterTrace: FoodFilterTrace[] = [];
  const passed: Array<{
    candidate: ActivityCandidate<FoodVenue>;
    metrics: FoodMetrics;
    roleScores: Record<RankingRole, number>;
  }> = [];

  for (const candidate of catalog) {
    const step = hardFilterOne(candidate, brief, avoidSet);
    if (step.reasons.length > 0) {
      filterTrace.push({
        candidateId: candidate.candidateId,
        venueName: candidate.entity.name || null,
        reasons: step.reasons,
        confidence: candidate.confidence,
        missingFields: step.missingFields,
      });
      continue;
    }
    const metrics = scoreFoodMetrics(candidate, brief, profileA, profileB);
    const roleScores: Partial<Record<RankingRole, number>> = {};
    for (const role of roles) roleScores[role] = foodRoleScore(role, metrics);
    passed.push({
      candidate,
      metrics,
      roleScores: roleScores as Record<RankingRole, number>,
    });
  }

  const afterHard = passed.length;

  // 2) Role 採用: 役割ごとに最高スコアの候補。同一 candidateId は被らない
  const usedIds = new Set<string>();
  const ranked: RankedFoodCandidate[] = [];
  for (const role of roles) {
    const sorted = [...passed].sort(
      (a, b) => (b.roleScores[role] ?? 0) - (a.roleScores[role] ?? 0),
    );
    const pick = sorted.find((p) => !usedIds.has(p.candidate.candidateId));
    if (!pick) continue;
    usedIds.add(pick.candidate.candidateId);

    const axisScores: Partial<Record<RankingRole, number>> = {};
    for (const r of roles) axisScores[r] = pick.roleScores[r] ?? 0;

    const breakdown: FoodScoreBreakdown = {
      metrics: pick.metrics,
      roleScores: pick.roleScores,
      assignedRole: role,
    };

    ranked.push({
      candidateKey: pick.candidate.candidateId,
      role,
      venue: pick.candidate.entity,
      sourceUrl: pick.candidate.sourceUrl,
      sourceDomain: pick.candidate.sourceDomain,
      confidence: pick.candidate.confidence,
      axisScores,
      totalScore: pick.roleScores[role] ?? 0,
      rationale: buildRationale(
        pick.candidate,
        pick.metrics,
        role,
        brief,
        profileA,
        profileB,
      ),
      breakdown,
    });
  }

  // 3) Alternatives（役割外上位、上限 2 件）
  const adoptedIds = new Set(ranked.map((r) => r.candidateKey));
  const alternatives = buildAlternatives(passed, roles, adoptedIds);

  return {
    ranked,
    alternatives,
    filterTrace,
    appliedPreset: preset,
    counts: {
      inputCatalog: catalog.length,
      afterHardFilter: afterHard,
      afterDiversity: ranked.length,
    },
  };
}

function buildAlternatives(
  passed: Array<{
    candidate: ActivityCandidate<FoodVenue>;
    metrics: FoodMetrics;
    roleScores: Record<RankingRole, number>;
  }>,
  roles: RankingRole[],
  adoptedIds: Set<string>,
): RankedFoodAlternative[] {
  const residual = passed.filter((p) => !adoptedIds.has(p.candidate.candidateId));
  if (residual.length === 0) return [];

  const scored = residual.map((p) => {
    let topRole: RankingRole = roles[0];
    let topScore = -Infinity;
    for (const r of roles) {
      const s = p.roleScores[r] ?? 0;
      if (s > topScore) {
        topScore = s;
        topRole = r;
      }
    }
    return { ...p, topRole, topScore };
  });

  scored.sort((a, b) => b.topScore - a.topScore);

  const seen = new Set<string>();
  const picked: typeof scored = [];
  for (const s of scored) {
    if (seen.has(s.candidate.candidateId)) continue;
    seen.add(s.candidate.candidateId);
    picked.push(s);
    if (picked.length >= 2) break;
  }

  return picked.map((p) => ({
    candidateKey: p.candidate.candidateId,
    venue: p.candidate.entity,
    sourceUrl: p.candidate.sourceUrl,
    reason: buildAlternativeReason(p.topRole, p.metrics),
    topRole: p.topRole,
    topRoleScore: p.topScore,
  }));
}

function buildAlternativeReason(
  topRole: RankingRole,
  m: FoodMetrics,
): string {
  if (m.ratingFit < 0.4 && m.novelty >= 0.6) return "評価は控えめだが新しさが強み";
  if (m.cuisineMatchA >= 0.7 && m.cuisineMatchB < 0.3) return "A の好み寄りの候補";
  if (m.cuisineMatchB >= 0.7 && m.cuisineMatchA < 0.3) return "B の好み寄りの候補";
  const roleLabel: Record<RankingRole, string> = {
    balance: "折り合い枠",
    aFocus: "A の好み寄り",
    bFocus: "B の好み寄り",
    safety: "安心枠",
    adventure: "冒険枠",
    discovery: "新規性枠",
    calm: "落ち着き寄り",
    stimulating: "刺激寄り",
    nostalgic: "ノスタルジア寄り",
  };
  return `${roleLabel[topRole]}としてもあり得た候補`;
}

// テスト用 export
export const __internal = {
  PRESET_ROLES,
  NOVELTY_BLOCKED_ROLES,
  QUIETNESS_MOODS,
  GENERIC_MOODS,
  COMMERCIAL_FOOD_DOMAINS,
  parsePriceBand,
  parseHoursRange,
  extractBudgetCeiling,
  hoursOverlap,
  timeSlotWindow,
  scoreCompromiseQuality,
  scoreBudgetFit,
  scoreAreaFit,
  scoreQuietnessFit,
  scoreNovelty,
  scoreRatingFit,
  scoreMoodMatch,
};
