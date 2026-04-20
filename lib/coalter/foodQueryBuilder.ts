/**
 * CoAlter Food Query Builder (§6.4 (6)-1 / 2026-04-20)
 *
 * docs/coalter-food-three-stage-design.md rev 3 §1 原則 9
 * (Retrieval Hygiene & Constraint Projection) の実装。
 *
 * 責務（単一モジュールに束ねる、CEO 条件 4）:
 *   (a) constraint projection    — FoodQueryBuilderInput → 検索クエリ文字列群
 *   (b) coverage 算出            — 軸別 (presentInInput / projected / sourceAxis)
 *   (c) clarify 判断材料          — reason / missing / projected / dropped / question
 *   (d) source priority hint     — (6)-2 page type classifier への入力
 *
 * 契約:
 *   - 純関数。副作用・外部 I/O を持たない
 *   - presentInInput=false かつ projected=true は契約違反として throw する
 *   - critical axis 欠落 (area / exactTime) は summary score に関係なく clarify
 *   - dropped axis = presentInInput=true && projected=false。今回の本丸の観測対象
 *
 * 入力 FoodQueryBuilderInput は FoodLensToday に対する subset contract。
 * step (2) foodLensAdapter.ts が FoodLensToday → このシェイプへマッピングする。
 * この builder は understanding/ に依存しない（decoupled）。
 */

import "server-only";

import type {
  ClarifySignal,
  CoverageAxisState,
  FoodOccasion,
  FoodQuery,
  FoodQueryAxis,
  FoodQueryBuildResult,
  PageType,
  ProjectionCoverage,
  RequestedTimeSlot,
  SourcePriorityHint,
} from "./types";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

/**
 * 軸別ウェイト。summaryScore = Σ (weight × projected).
 * area と exactTime が critical axes（計 0.50）。
 * 合計 1.00（不変）。
 */
const WEIGHTS: Record<FoodQueryAxis, number> = {
  area: 0.25,
  exactTime: 0.25,
  cuisine: 0.2,
  moodAtmosphere: 0.15,
  occasion: 0.1,
  priceBand: 0.05,
};

/**
 * critical axes — これが欠落した場合は summary score に関係なく clarify に倒す。
 * 理由: area / exactTime は検索の成立に必須で、欠落したまま走らせると
 *       retrieval が pollution で埋まる（handoff 2026-04-19 の Pattern A/B）。
 */
const CRITICAL_AXES: readonly FoodQueryAxis[] = ["area", "exactTime"] as const;

/**
 * 閾値。summaryScore がこれ未満かつ critical 以外の欠落がある場合 clarify。
 */
const COVERAGE_THRESHOLD = 0.4;

/**
 * direct candidate 昇格を block する page type。
 * (6)-2 classifier が判定した結果を rank 段で enforce する際の入力。
 */
const BLOCKED_PAGE_TYPES: readonly PageType[] = ["listicle", "news"] as const;

/**
 * 日本の食事検索で preferred な domain。順序が優先順。
 * 予約 partner 系は本日時点では明示順位を付けない（(6)-2 で classifier 側が judge）。
 */
const DEFAULT_PREFERRED_DOMAINS: readonly string[] = [
  "tabelog.com",
  "retty.me",
  "gurunavi.com",
  "hotpepper.jp",
] as const;

const ALL_AXES: readonly FoodQueryAxis[] = [
  "area",
  "cuisine",
  "exactTime",
  "occasion",
  "moodAtmosphere",
  "priceBand",
] as const;

// ─────────────────────────────────────────────
// Input (FoodLensToday subset contract)
// ─────────────────────────────────────────────

/**
 * foodQueryBuilder の入力。
 * step (2) foodLensAdapter.ts が FoodLensToday からこの形へマッピングする。
 * （本 builder は understanding/ への依存を持たない — decoupled）
 *
 * 各 *Source フィールドは narration 由来引用・telemetry 用の lens-side field path。
 * 例: "foodContext.hungerLevel" / "relationalLens.temperature".
 */
export interface FoodQueryBuilderInput {
  area: string | null;
  areaSource?: string;

  cuisineHints: string[];
  cuisineSource?: string;

  excludeCuisines: string[];

  priceBand: { minYen: number; maxYen: number } | null;
  priceBandSource?: string;

  requestedTimeSlots: RequestedTimeSlot[];
  targetLocalTime: string | null;
  timeWindow: FoodQuery["timeWindow"];
  exactTimeSource?: string;

  occasion: FoodOccasion | null;
  occasionSource?: string;

  atmosphere: FoodQuery["atmosphere"];
  moodTags: string[];
  moodAtmosphereSource?: string;

  reservationUrgency: FoodQuery["reservationUrgency"];
}

// ─────────────────────────────────────────────
// Token formatters (pure)
// ─────────────────────────────────────────────

/**
 * RequestedTimeSlot[] → 検索クエリ用時刻 token。
 *
 * 優先順:
 *   (a) startLocalTime / endLocalTime 両方 present なら分単位を使う
 *   (b) それ以外は startHour / endHour の時単位
 *
 * "HH:MM" の末尾 5 文字を抽出。ISO の場合は "T" 以降を取り "HH:MM" に丸める。
 * flexMinutes は搜索 token としては使わず、下流の Tier expansion で参照する。
 */
function formatTimeToken(slots: RequestedTimeSlot[]): string | null {
  if (slots.length === 0) return null;
  const s = slots[0];
  if (s.startLocalTime && s.endLocalTime) {
    const a = extractHHMM(s.startLocalTime);
    const b = extractHHMM(s.endLocalTime);
    return a === b ? a : `${a}-${b}`;
  }
  if (s.startHour === s.endHour) return `${s.startHour}時`;
  return `${s.startHour}-${s.endHour}時`;
}

function extractHHMM(raw: string): string {
  const part = raw.includes("T") ? raw.split("T")[1] : raw;
  return part.slice(0, 5);
}

/**
 * 雰囲気 3 軸 → 検索 token。
 * "either" はスキップ。concrete 軸が 1 つもない場合は null。
 */
function formatAtmosphereToken(a: FoodQuery["atmosphere"]): string | null {
  const parts: string[] = [];
  if (a.quietness === "quiet") parts.push("静か");
  else if (a.quietness === "lively") parts.push("賑やか");
  if (a.density === "private") parts.push("個室");
  else if (a.density === "spacious") parts.push("ゆったり");
  if (a.lighting === "warm_low") parts.push("雰囲気");
  return parts.length > 0 ? parts.join(" ") : null;
}

function formatPriceToken(
  p: FoodQueryBuilderInput["priceBand"],
): string | null {
  if (!p) return null;
  return `${p.minYen}-${p.maxYen}円`;
}

function formatOccasionToken(o: FoodOccasion | null): string | null {
  if (!o) return null;
  if (o.confidence === "none") return null;
  const label = o.label.trim();
  return label.length > 0 ? label : null;
}

// ─────────────────────────────────────────────
// Presence detection (pure)
// ─────────────────────────────────────────────

function atmospherePresent(a: FoodQuery["atmosphere"]): boolean {
  return (
    a.quietness !== "either" ||
    a.density !== "either" ||
    a.lighting !== "either"
  );
}

// ─────────────────────────────────────────────
// Search string builder
// ─────────────────────────────────────────────

interface TokenBag {
  areaToken: string | null;
  timeToken: string | null;
  atmoToken: string | null;
  priceToken: string | null;
  occasionToken: string | null;
  cuisines: string[];
}

function buildSearchStrings(tokens: TokenBag): string[] {
  const { areaToken, timeToken, atmoToken, priceToken, occasionToken, cuisines } =
    tokens;
  const strings: string[] = [];

  // s1: area + cuisine[0] + exactTime
  const s1 = [areaToken, cuisines[0] ?? null, timeToken]
    .filter((t): t is string => !!t && t.trim().length > 0)
    .join(" ");
  if (s1.length > 0) strings.push(s1);

  // s2: area + cuisine[0] + atmosphere（atmosphere が concrete なときだけ）
  if (atmoToken) {
    const s2 = [areaToken, cuisines[0] ?? null, atmoToken]
      .filter((t): t is string => !!t && t.trim().length > 0)
      .join(" ");
    if (s2.length > 0) strings.push(s2);
  }

  // s3: area + cuisine[1 or 0] + occasion + price（occasion か price があるときだけ）
  if (occasionToken || priceToken) {
    const cuisineAlt = cuisines[1] ?? cuisines[0] ?? null;
    const s3 = [areaToken, cuisineAlt, occasionToken, priceToken]
      .filter((t): t is string => !!t && t.trim().length > 0)
      .join(" ");
    if (s3.length > 0) strings.push(s3);
  }

  // dedupe (完全一致の searchString は 1 本に)
  return Array.from(new Set(strings));
}

// ─────────────────────────────────────────────
// Coverage
// ─────────────────────────────────────────────

function computeSummaryScore(c: ProjectionCoverage): number {
  const score =
    WEIGHTS.area * (c.area.projected ? 1 : 0) +
    WEIGHTS.exactTime * (c.exactTime.projected ? 1 : 0) +
    WEIGHTS.cuisine * (c.cuisine.projected ? 1 : 0) +
    WEIGHTS.moodAtmosphere * (c.moodAtmosphere.projected ? 1 : 0) +
    WEIGHTS.occasion * (c.occasion.projected ? 1 : 0) +
    WEIGHTS.priceBand * (c.priceBand.projected ? 1 : 0);
  return Math.round(score * 1000) / 1000;
}

function assertCoverageContract(c: ProjectionCoverage): void {
  for (const axis of ALL_AXES) {
    const s = c[axis];
    if (!s.presentInInput && s.projected) {
      throw new Error(
        `[foodQueryBuilder] contract violation: axis "${axis}" projected without presentInInput`,
      );
    }
  }
}

// ─────────────────────────────────────────────
// Clarify signal
// ─────────────────────────────────────────────

const AXIS_LABEL: Record<FoodQueryAxis, string> = {
  area: "どこで",
  exactTime: "何時頃",
  cuisine: "どんなジャンル",
  occasion: "どんなシーン",
  moodAtmosphere: "どんな雰囲気",
  priceBand: "予算",
};

function buildClarifyQuestion(targetAxes: FoodQueryAxis[]): string {
  if (targetAxes.length === 0) return "もう少し条件を教えてもらえますか？";
  if (targetAxes.length === 1) {
    return `${AXIS_LABEL[targetAxes[0]]}がいいですか？`;
  }
  // 最大 2 軸を聞く（3 軸以上は質問過多）
  const top = targetAxes.slice(0, 2);
  return `${top.map((a) => AXIS_LABEL[a]).join("と")}、教えてもらえますか？`;
}

function buildClarifySignal(c: ProjectionCoverage): ClarifySignal {
  const missingAxes = ALL_AXES.filter((a) => !c[a].presentInInput);
  const projectedAxes = ALL_AXES.filter((a) => c[a].projected);
  const droppedAxes = ALL_AXES.filter(
    (a) => c[a].presentInInput && !c[a].projected,
  );

  // (1) critical axis 欠落は summary 無視で clarify
  const criticalMissing = CRITICAL_AXES.filter((a) => !c[a].presentInInput);
  if (criticalMissing.length > 0) {
    return {
      shouldClarify: true,
      clarifyReason: "critical_axis_missing",
      missingAxes: [...missingAxes],
      projectedAxes: [...projectedAxes],
      droppedAxes: [...droppedAxes],
      suggestedClarifyQuestion: buildClarifyQuestion([...criticalMissing]),
    };
  }

  // (2) summary score が閾値未満
  if (c.summaryScore < COVERAGE_THRESHOLD) {
    // 欠落 axes を優先、なければ dropped から hint
    const hinted = missingAxes.length > 0 ? missingAxes : droppedAxes;
    return {
      shouldClarify: true,
      clarifyReason: "coverage_below_threshold",
      missingAxes: [...missingAxes],
      projectedAxes: [...projectedAxes],
      droppedAxes: [...droppedAxes],
      suggestedClarifyQuestion: buildClarifyQuestion([...hinted]),
    };
  }

  // (3) 正常
  return {
    shouldClarify: false,
    clarifyReason: null,
    missingAxes: [...missingAxes],
    projectedAxes: [...projectedAxes],
    droppedAxes: [...droppedAxes],
    suggestedClarifyQuestion: null,
  };
}

// ─────────────────────────────────────────────
// Source priority hint
// ─────────────────────────────────────────────

function buildSourcePriorityHint(): SourcePriorityHint {
  // 初期版: reservationUrgency による分岐は (6)-2 classifier 導入後に追加する
  // （本 turn では rank churn を避けるため固定）
  return {
    preferredDomains: [...DEFAULT_PREFERRED_DOMAINS],
    blockedPageTypes: [...BLOCKED_PAGE_TYPES],
    preferVenueDetail: true,
  };
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

/**
 * FoodQueryBuilderInput → FoodQueryBuildResult。
 *
 * 入力を書き換えない（pure）。入力の array はコピーして出力する。
 */
export function buildFoodQuery(
  input: FoodQueryBuilderInput,
): FoodQueryBuildResult {
  // ── normalize ──
  const area = normalizeString(input.area);
  const cuisines = uniqueNonEmpty(input.cuisineHints).slice(0, 3);
  const excludeCuisines = uniqueNonEmpty(input.excludeCuisines);
  const moodTags = uniqueNonEmpty(input.moodTags);

  // ── tokens ──
  const tokens: TokenBag = {
    areaToken: area,
    timeToken: formatTimeToken(input.requestedTimeSlots),
    atmoToken: atmospherePresent(input.atmosphere)
      ? formatAtmosphereToken(input.atmosphere)
      : null,
    priceToken: formatPriceToken(input.priceBand),
    occasionToken: formatOccasionToken(input.occasion),
    cuisines,
  };

  const searchStrings = buildSearchStrings(tokens);

  // ── presence detection ──
  const areaPresent = area !== null;
  const cuisinePresent = cuisines.length > 0;
  const exactTimePresent = input.requestedTimeSlots.length > 0;
  const occasionPresent =
    input.occasion !== null && input.occasion.confidence !== "none";
  // moodAtmosphere axis: concrete atmosphere が primary / moodTags だけでも present
  //   （moodTags present && atmo all-either は dropped axis として observable になる）
  const moodAtmoPresent =
    atmospherePresent(input.atmosphere) || moodTags.length > 0;
  const priceBandPresent = input.priceBand !== null;

  // ── projection detection ──
  const areaProjected =
    areaPresent &&
    tokens.areaToken !== null &&
    searchStrings.some((s) => s.includes(tokens.areaToken!));
  const cuisineProjected =
    cuisinePresent && searchStrings.some((s) => cuisines.some((c) => s.includes(c)));
  const exactTimeProjected =
    exactTimePresent &&
    tokens.timeToken !== null &&
    searchStrings.some((s) => s.includes(tokens.timeToken!));
  const occasionProjected =
    occasionPresent &&
    tokens.occasionToken !== null &&
    searchStrings.some((s) => s.includes(tokens.occasionToken!));
  const moodAtmoProjected =
    moodAtmoPresent &&
    tokens.atmoToken !== null &&
    searchStrings.some((s) => s.includes(tokens.atmoToken!));
  const priceBandProjected =
    priceBandPresent &&
    tokens.priceToken !== null &&
    searchStrings.some((s) => s.includes(tokens.priceToken!));

  // ── coverage ──
  const coverage: ProjectionCoverage = {
    area: makeAxisState(areaPresent, areaProjected, input.areaSource),
    cuisine: makeAxisState(cuisinePresent, cuisineProjected, input.cuisineSource),
    exactTime: makeAxisState(
      exactTimePresent,
      exactTimeProjected,
      input.exactTimeSource,
    ),
    occasion: makeAxisState(occasionPresent, occasionProjected, input.occasionSource),
    moodAtmosphere: makeAxisState(
      moodAtmoPresent,
      moodAtmoProjected,
      input.moodAtmosphereSource,
    ),
    priceBand: makeAxisState(
      priceBandPresent,
      priceBandProjected,
      input.priceBandSource,
    ),
    summaryScore: 0,
  };
  coverage.summaryScore = computeSummaryScore(coverage);

  // contract check (fail-fast)
  assertCoverageContract(coverage);

  // ── clarify ──
  const clarifySignal = buildClarifySignal(coverage);

  // ── source priority ──
  const sourcePriorityHint = buildSourcePriorityHint();

  // ── final FoodQuery ──
  const query: FoodQuery = {
    cuisines,
    excludeCuisines,
    priceBand: input.priceBand,
    area,
    timeWindow: input.timeWindow,
    requestedTimeSlots: [...input.requestedTimeSlots],
    targetLocalTime: input.targetLocalTime,
    occasion: input.occasion,
    atmosphere: { ...input.atmosphere },
    moodTags,
    reservationUrgency: input.reservationUrgency,
  };

  return {
    query,
    searchStrings,
    coverage,
    clarifySignal,
    sourcePriorityHint,
  };
}

// ─────────────────────────────────────────────
// Helpers (pure)
// ─────────────────────────────────────────────

function normalizeString(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function uniqueNonEmpty(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const t = raw.trim();
    if (t.length === 0) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function makeAxisState(
  presentInInput: boolean,
  projected: boolean,
  source: string | undefined,
): CoverageAxisState {
  return {
    presentInInput,
    projected,
    sourceAxis: source ?? null,
  };
}

// ─────────────────────────────────────────────
// Test-only exports
// ─────────────────────────────────────────────

export const __internal = {
  WEIGHTS,
  CRITICAL_AXES,
  COVERAGE_THRESHOLD,
  BLOCKED_PAGE_TYPES,
  DEFAULT_PREFERRED_DOMAINS,
  ALL_AXES,
  AXIS_LABEL,
  formatTimeToken,
  formatAtmosphereToken,
  formatPriceToken,
  formatOccasionToken,
  atmospherePresent,
  buildSearchStrings,
  computeSummaryScore,
  buildClarifySignal,
  buildClarifyQuestion,
  buildSourcePriorityHint,
  normalizeString,
  uniqueNonEmpty,
};
