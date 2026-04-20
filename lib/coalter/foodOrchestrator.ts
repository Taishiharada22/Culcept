/**
 * CoAlter Food Orchestrator (Phase B Commit 3 — 2026-04-19)
 *
 * 4-layer pipeline thin integration for food theme:
 *
 *   Layer 0: briefBuilder (LLM + parser fallback)
 *   Layer 1: foodCatalog (parseFoodVenues)
 *   Layer 2: foodRanker (rankFood)
 *   Layer 3: narration (placeholder minimal template — Commit 4 で富化)
 *
 * 設計原則:
 *  - LLM 失敗は想定内。どの段階で落ちても最低限の提案カードを返す
 *  - 事実（店舗・エリア・営業時間）は logic 側が権威。LLM は書き換えできない
 *  - 候補 0 件 → primaryUnresolvedQuestion ベースで clarify 応答
 *  - 品質は絶対に落とさない（CEO方針）
 *
 * CEO 追加条件 (2026-04-19):
 *  1. diagnostics 二重発火禁止
 *     - 成功時: food.diagnostics を 1 回だけ emit
 *     - 失敗時: food.orchestrator.error を emit (fallbackUsed: true 含む)
 *     - 両方同時には絶対に出さない
 *  2. Commit 2.5 JSON shape に完全準拠
 *  3. unknown != violation: classifier 判定不能を hard filter にしない
 */

import "server-only";

import type {
  CoAlterPersonProfile,
  ClarifySignal,
  ConversationAnalysis,
  ConversationBrief,
  ConversationTurn,
  FoodFilterTrace,
  FoodHardFilterReason,
  FoodQueryAxis,
  FoodQueryBuildResult,
  FoodRankOutput,
  PageType,
  PendingAxisDeltas,
  ProjectionCoverage,
  ProposalCard,
  ProposalQualityRecord,
  RankedFoodCandidate,
  RankingAxesPreset,
  RelationshipContext,
  SearchCandidate,
  BookingProviderType,
} from "./types";
import { buildConversationBrief } from "./briefBuilder";
import {
  buildFoodQuery,
  type FoodQueryBuilderInput,
} from "./foodQueryBuilder";
import { buildFoodLensInput } from "./foodLensInputBuilder";
import { parseFoodVenues } from "./foodCatalog";
import { rankFood } from "./foodRanker";
import {
  runTieredRanking,
  type FoodTierAttempt,
  type RunTieredRankingOutput,
} from "./foodTierRunner";
import { COALTER_FLAGS } from "./flags";
import type { FoodTier, FoodTierPlan } from "./foodTierExpander";
import { __internal as bookingInternal } from "./bookingResolver";
import { buildFoodNarrationFromLogic } from "./narrationTemplate";
import type { TwoPersonLensToday } from "./understanding/types";
import type { FoodLensToday } from "./understanding/foodLensAdapter";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface FoodOrchestratorInput {
  turns: ConversationTurn[];
  analysis: ConversationAnalysis;
  searchCandidates: SearchCandidate[];
  profileA: CoAlterPersonProfile;
  profileB: CoAlterPersonProfile;
  relationship: RelationshipContext;
  avoidKeys?: string[];
  pendingDeltas?: PendingAxisDeltas;
  userId?: string;
  sessionId?: string;
  llmTimeoutMs?: number;
  /**
   * §6.4 (6)-1 integration (2026-04-20): foodLens が供給された場合は
   * Layer 0 直後に retrieval hygiene gate を走らせる。未供給時は legacy 経路（従来どおり）。
   *
   * 契約（GPT 条件 #1 / #2）:
   *   - 供給時: buildFoodQuery → shouldClarify=true なら Layer 1/2/3 を skip し clarify card 返却
   *   - 未供給時: lens 非依存の従来パイプライン（下位互換）
   */
  foodLens?: FoodQueryBuilderInput;
  /**
   * F-2 (2026-04-20): Stage 1 Understand の出力をそのまま受け取る optional 入力。
   *
   *   - `lens`: `TwoPersonLensToday`（2人理解の結晶）
   *   - `foodLensToday`: `FoodLensToday`（食事ドメインへの薄い翻訳）
   *
   * 段階拡張（互換性維持）:
   *   - どちらも `undefined` でよい。未供給時は従来の `ConversationBrief` 経路で
   *     narration を組む（F-3 以降の Personality-Rooted 5 要素は logic fallback に倒す）
   *   - 供給時は narrationTemplate 側で 5 要素を lens 由来で書き起こす（F-3）
   *
   * Stage 1 は失敗し得る。fail-open:
   *   - lens 欠落 → food orchestrator は throw しない。brief 経路にフォールバック
   *
   * 本 F-2 では shape の受け入れまで。narration への伝達は F-3 で完成する。
   */
  lens?: TwoPersonLensToday;
  foodLensToday?: FoodLensToday;
}

/**
 * food 診断出力（Commit 2.5 §6 と完全一致）。
 *
 * shape を変えるときは docs/coalter-food-diagnostics.md を先に更新し
 * その後実装を追随させる（実装先行は禁止）。
 */
export interface FoodDiagnostics {
  rawSearchCandidates: number;
  parsedVenues: number;
  nameGateDropCount: number;
  candidateIdDedupDropCount: number;
  rankedCount: number;
  filterTraceCount: number;
  hardFilterReasonCounts: Record<FoodHardFilterReason, number>;
  missingWhereDropCount: number;
  insufficientInfoDropCount: number;
  avgConfidence: number;
  appliedPreset: RankingAxesPreset;
  compromiseActiveCount: number;
  noveltyUsedRoleCount: number;
  ratingMissingCount: number;
  openingHoursUnknownCount: number;
  bookingProviderDistribution: BookingProviderDistribution;
  latencyMsCatalog: number;
  latencyMsRank: number;
  latencyMsNarration: number;
  latencyMsTotal: number;
  /**
   * §6.4 (6)-1 integration (2026-04-20 / GPT 条件 #3):
   * lens 供給時のみ付く（未供給時は undefined で legacy log shape を壊さない）。
   * 追加 emit は禁止 — food.diagnostics 1 回に合流する。
   */
  queryProjectionCoverage?: ProjectionCoverage;
  clarifyReason?: ClarifySignal["clarifyReason"];
  missingAxes?: FoodQueryAxis[];
  droppedAxes?: FoodQueryAxis[];
  /**
   * §6.4 (6)-2c integration (2026-04-20):
   * catalog 段の page type classifier 結果を diagnostics にまとめて合流。
   *   pageTypeDistribution: 全 SearchCandidate の生分布（7 型すべて 0 初期化）
   *   blockedPageTypeCount: listicle + news + non_venue の合計（catalog 昇格を block した件数）
   *   blockedByPageType:    内訳（listicle / news / non_venue のみ非 0 になる）
   *   2026-04-20 venue quality gate: non_venue を追加（municipal/directory/非店舗）
   *   固定 shape は 7-key（venue_detail / official / reservation_partner /
   *     third_party_listing / news / listicle / non_venue）。
   * 未供給（gated clarify short-circuit）時は 0 埋めで shape を保つ。
   */
  pageTypeDistribution: Record<PageType, number>;
  blockedPageTypeCount: number;
  blockedByPageType: Partial<Record<PageType, number>>;
  /**
   * §6.4 (6)-4 observability (2026-04-20):
   *
   *   missingWhereRateBySourceKind:
   *     PageType 別 "missing_where で落ちた率"。
   *     分母 = その PageType で catalog を通過し ranker に入った候補数
   *     分子 = 分母のうち filterTrace.reasons に "missing_where" を含む件数
   *     固定 7-key shape（未観測 type は 0.0）。分母 0 は 0.0（NaN ガード）。
   *   insufficientInfoRateBySourceKind:
   *     同上、reason = "insufficient_info"
   *   candidateEligiblePageRate:
   *     (rawSearchCandidates - blockedPageTypeCount) / rawSearchCandidates
   *     = listicle/news 以外（= single-venue に解決可能なページ）の率
   *     raw=0 は 0.0。3 桁丸め。
   *
   * gated clarify path: 全 0 埋め。追加 emit なし（food.diagnostics 1 回のみ合流）。
   */
  missingWhereRateBySourceKind: Record<PageType, number>;
  insufficientInfoRateBySourceKind: Record<PageType, number>;
  candidateEligiblePageRate: number;
  /**
   * [CEO lock 2026-04-20 F-6] Tier retry loop 観測値（optional）。
   *
   *   - flag OFF または lens/area 欠落で loop skip → undefined（shape 非破壊）
   *   - flag ON + loop 実行 → 採用 tier と各 tier の試行結果を載せる
   *
   * 契約:
   *   - appliedTier: 実際に ranked を採用した tier（全 tier 0 件なら "T2"）
   *   - tierAttempts: 順次試行の観測列（最初に成功した tier で停止、以降は試行しない）
   *   - tierThinReason: T2 採用時のみセット（area_thin / time_thin / both_thin）
   */
  appliedTier?: FoodTier;
  tierAttempts?: FoodTierAttempt[];
  tierThinReason?: FoodTierPlan["thinReason"];
}

export interface ProviderBucket {
  count: number;
  ratio: number;
}

export interface BookingProviderDistribution {
  official: ProviderBucket;
  official_site: ProviderBucket;
  official_reservation_partner: ProviderBucket;
  third_party_listing: ProviderBucket;
  unknown: ProviderBucket;
  total: number;
}

export interface FoodOrchestratorOutput {
  card: ProposalCard;
  telemetry: Omit<ProposalQualityRecord, "sessionId" | "userAction">;
  ranked: RankedFoodCandidate[];
  primaryQuestion: ConversationBrief["primaryUnresolvedQuestion"];
  diagnostics: FoodDiagnostics;
}

// ─────────────────────────────────────────────
// Public helpers (Step 6 テストで呼び出す純関数)
// ─────────────────────────────────────────────

/**
 * NOVELTY_BLOCKED_ROLES と反対側 (novelty を使う role) の集合。
 * diagnostics.noveltyUsedRoleCount 算出に使用。
 *
 * foodRanker.__internal.NOVELTY_BLOCKED_ROLES に依存せず、
 * role 判定を壊れないように定数で持つ（foodRanker の内部変更に影響されない独立テーブル）。
 */
const NOVELTY_USED_ROLES = new Set<string>([
  "adventure",
  "discovery",
  "stimulating",
]);

/**
 * ranked 候補を providerType 5 分類に振り分け、件数と比率を返す。
 *
 * CEO 追加条件: total == 0 時 ratio = 0 で NaN を絶対に出さない。
 */
export function computeBookingProviderDistribution(
  ranked: RankedFoodCandidate[],
): BookingProviderDistribution {
  const counts: Record<BookingProviderType, number> = {
    official: 0,
    official_site: 0,
    official_reservation_partner: 0,
    third_party_listing: 0,
    unknown: 0,
  };
  for (const r of ranked) {
    const classified = bookingInternal.classifyProvider("food", r.sourceUrl);
    counts[classified.providerType] += 1;
  }
  const total = ranked.length;
  const bucket = (c: number): ProviderBucket => ({
    count: c,
    ratio: total > 0 ? round3(c / total) : 0,
  });
  return {
    official: bucket(counts.official),
    official_site: bucket(counts.official_site),
    official_reservation_partner: bucket(counts.official_reservation_partner),
    third_party_listing: bucket(counts.third_party_listing),
    unknown: bucket(counts.unknown),
    total,
  };
}

function round3(n: number): number {
  // total==0 ガードは呼び出し側。ここでは数値整形のみ。
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

/**
 * filterTrace から reason を 9 種ごとに集計。
 * いずれかの reason が 1 件に複数ついても、それぞれカウントする。
 */
export function aggregateHardFilterReasons(
  filterTrace: FoodFilterTrace[],
): Record<FoodHardFilterReason, number> {
  const acc: Record<FoodHardFilterReason, number> = {
    violates_budget: 0,
    violates_area: 0,
    violates_cuisine_exclusion: 0,
    violates_companions: 0,
    violates_opening_hours: 0,
    closed_permanently: 0,
    missing_where: 0,
    insufficient_info: 0,
    violates_avoid_keys: 0,
    blocked_page_type: 0,
  };
  for (const t of filterTrace) {
    for (const r of t.reasons) {
      acc[r] += 1;
    }
  }
  return acc;
}

// ─────────────────────────────────────────────
// Narration (Commit 4: buildFoodNarrationFromLogic 経由で富化)
// ─────────────────────────────────────────────

/**
 * ranked = 0 件のときの clarify 専用 ProposalCard。
 *
 * primaryUnresolvedQuestion がある場合はそれを reasoning に据える。
 * 事実フィールドは一切出さない（事実改変禁止の最上位契約）。
 */
function buildFoodClarifyCard(brief: ConversationBrief): ProposalCard {
  const q =
    brief.primaryUnresolvedQuestion?.question ??
    "もう少し条件が決まると候補を絞れそう。エリアや予算の目安、教えてもらえる？";
  return {
    summary: "今の条件だと具体的な候補を絞り切れなかった。",
    priorities: {
      userA: "—",
      userB: "—",
      common: null,
    },
    candidates: [],
    reasoning: q,
    closing: "条件が決まったら、また候補を出し直すね。",
    theme: "food",
  };
}

/**
 * §6.4 (6)-1 integration (2026-04-20 / GPT 条件 #4):
 *
 * lens 供給時の clarify 専用 ProposalCard。
 * 「分かっていること」を先に返した上で、不足軸だけを聞く。
 *
 *   summary  : 投影済み軸を短く再掲（"新宿・ラーメン・11時頃は分かった"）
 *   reasoning: suggestedClarifyQuestion（foodQueryBuilder が組み立てた質問）
 *
 * 投影済み軸が 0 本のときは summary を汎用メッセージに落とす。
 * CoAlter の存在論（「理解してから聞く」）を崩さないための card。
 */
function buildFoodClarifyCardWithProjection(
  buildResult: FoodQueryBuildResult,
  brief: ConversationBrief,
): ProposalCard {
  const projectedSummary = formatProjectedAxesSummary(buildResult);
  const summary =
    projectedSummary.length > 0
      ? `${projectedSummary}は分かった。`
      : "今の条件だと具体的な候補を絞り切れなかった。";
  const question =
    buildResult.clarifySignal.suggestedClarifyQuestion ??
    brief.primaryUnresolvedQuestion?.question ??
    "もう少し条件が決まると候補を絞れそう。";
  return {
    summary,
    priorities: {
      userA: "—",
      userB: "—",
      common: null,
    },
    candidates: [],
    reasoning: question,
    closing: "条件が決まったら、候補を出すね。",
    theme: "food",
  };
}

/**
 * 投影済み軸を自然言語 token で「・」区切り連結。
 * searchStrings[0] の token 列から area/cuisine/time を拾うのではなく、
 * ProjectionCoverage.projected=true の軸と FoodQuery の実値から組む。
 */
function formatProjectedAxesSummary(r: FoodQueryBuildResult): string {
  const parts: string[] = [];
  const q = r.query;
  if (r.coverage.area.projected && q.area) parts.push(q.area);
  if (r.coverage.cuisine.projected && q.cuisines.length > 0) {
    parts.push(q.cuisines[0]);
  }
  if (r.coverage.exactTime.projected && q.requestedTimeSlots.length > 0) {
    const s = q.requestedTimeSlots[0];
    if (s.startLocalTime) parts.push(s.startLocalTime.slice(0, 5) + "頃");
    else parts.push(`${s.startHour}時頃`);
  }
  if (r.coverage.occasion.projected && q.occasion) parts.push(q.occasion.label);
  if (r.coverage.priceBand.projected && q.priceBand) {
    parts.push(`${q.priceBand.minYen}-${q.priceBand.maxYen}円`);
  }
  return parts.join("・");
}

// ─────────────────────────────────────────────
// Main entry
// ─────────────────────────────────────────────

/**
 * food テーマ専用の 4-layer パイプライン。
 * engine.ts 側から theme === "food" の時に呼ばれる想定。
 *
 * 例外: 内部で throw しない。致命的失敗時は minimal placeholder を返し、
 *       エラー情報は food.orchestrator.error として emit する（この 1 回のみ）。
 *       food.diagnostics は成功時のみ。排他制御は本関数の責務。
 */
export async function generateFoodProposalV2(
  input: FoodOrchestratorInput,
): Promise<FoodOrchestratorOutput> {
  const startedTotal = Date.now();

  // ── Layer 0: ConversationBrief ──
  const briefResult = await buildConversationBrief({
    turns: input.turns,
    analysis: input.analysis,
    timeoutMs: input.llmTimeoutMs ?? 3500,
    userId: input.userId,
    sessionId: input.sessionId,
  });
  const brief = briefResult.brief;

  // ── Layer 0.5: Retrieval Hygiene Gate (§6.4 (6)-1 / 2026-04-20) ──
  //
  // GPT 条件 #1: clarify 分岐は Layer 1/2/3 より前に置く（pollution を増やさない）。
  // GPT 条件 #2: lens 未供給時は本 gate をスキップ → legacy 経路そのまま。
  //
  // (6)-1b (2026-04-20): engine.ts 側にも pre-search gate を配線済み。
  //   clarify=true の場合、engine は ensureSearchCandidates() を呼ばないため
  //   本関数は searchCandidates=[] を受け取る（rawSearchCandidates=0）。
  //   それでも本関数内部でも gate を再評価する（idempotent / defensive）ので、
  //   上位で配線漏れがあっても orchestrator は clarify に倒せる。
  // F-5 (2026-04-20): foodLens が外部供給されていない場合でも、foodLensToday が
  // 供給されていれば brief と合流させて internal に derive する（brief > lens priority）。
  // 外部供給 foodLens が優先。以降のロジックは effectiveFoodLens 経由に統一。
  const effectiveFoodLens: FoodQueryBuilderInput | null =
    input.foodLens ??
    (input.foodLensToday
      ? buildFoodLensInput({ brief, foodLensToday: input.foodLensToday })
      : null);
  const foodQueryBuildResult: FoodQueryBuildResult | null = effectiveFoodLens
    ? buildFoodQuery(effectiveFoodLens)
    : null;

  if (
    foodQueryBuildResult &&
    foodQueryBuildResult.clarifySignal.shouldClarify
  ) {
    // ── Clarify short-circuit ──
    const latencyTotal = Date.now() - startedTotal;
    const card = buildFoodClarifyCardWithProjection(
      foodQueryBuildResult,
      brief,
    );
    const diagnostics = buildGatedClarifyDiagnostics({
      sessionId: input.sessionId ?? null,
      rawSearchCandidates: input.searchCandidates.length,
      foodQueryBuildResult,
      latencyTotal,
    });
    emitFoodDiagnostics(input.sessionId ?? null, diagnostics);
    const telemetry: Omit<ProposalQualityRecord, "sessionId" | "userAction"> = {
      briefSource: brief.source,
      briefConfidence: brief.confidence,
      catalogCount: 0,
      rankedCount: 0,
      rankingAxesPreset: "balance_focus",
      narrationMode: "logic_template",
      llmSuccessLayer0: brief.source === "llm",
      llmSuccessLayer3: false,
      latencyMsTotal: latencyTotal,
      latencyMsCatalog: 0,
      latencyMsRank: 0,
      latencyMsNarration: 0,
    };
    return {
      card,
      telemetry,
      ranked: [],
      primaryQuestion: brief.primaryUnresolvedQuestion,
      diagnostics,
    };
  }

  // ── Layer 1: FoodVenue catalog ──
  const startedCatalog = Date.now();
  const rawSearchCandidates = input.searchCandidates.length;
  // §6.4 (6)-2b/2c: parseFoodVenues returns { catalog, meta } — meta は
  // pageTypeDistribution / blockedPageTypeCount / blockedByPageType を含む。
  // (6)-2c でそのまま FoodDiagnostics に合流させる（追加 emit はしない）。
  const { catalog, meta: catalogMeta } = parseFoodVenues(input.searchCandidates);
  const parsedVenues = catalog.length;
  const latencyCatalog = Date.now() - startedCatalog;

  // ── Layer 2: foodRanker ──
  //
  // F-6 (2026-04-20): flag ON + 結晶化 query（effectiveFoodLens）+ area/time が
  //   derive 可能 → `runTieredRanking`（T0→T1a→T1b→T2 順次、ranked>=1 で停止、
  //   Tier 間 merge なし）を通す。
  //   flag OFF もしくは derive 不能 → 従来どおり単発 `rankFood` にフォールバック。
  //   runTieredRanking が null を返したとき（area/time 欠落）も同様に fallback。
  const startedRank = Date.now();
  const tierLoopEnabled =
    COALTER_FLAGS.foodTierLoop && foodQueryBuildResult !== null;
  const tierResult: RunTieredRankingOutput | null = tierLoopEnabled
    ? runTieredRanking({
        brief,
        query: foodQueryBuildResult?.query,
        catalog,
        avoidKeys: input.avoidKeys ?? [],
        profileA: input.profileA,
        profileB: input.profileB,
      })
    : null;
  const rankOutput: FoodRankOutput =
    tierResult ??
    rankFood({
      brief,
      catalog,
      avoidKeys: input.avoidKeys ?? [],
      profileA: input.profileA,
      profileB: input.profileB,
      query: foodQueryBuildResult?.query,
    });
  const latencyRank = Date.now() - startedRank;

  // ── Layer 3: narration (Commit 4: logic-only buildFoodNarrationFromLogic) ──
  //
  // 契約:
  //  - ranked=0 件 → buildFoodClarifyCard（primaryUnresolvedQuestion を使う）
  //  - ranked>0 件 → buildFoodNarrationFromLogic（食版 narrationBuilder を経由）
  //
  // CEO 条件 #3 (Commit 4): LLM enricher は食 path に接続していない。
  //   接続前に CEO 承認が必要。本関数は一切 LLM を呼ばない（logic-only 契約）。
  const startedNarration = Date.now();
  const card =
    rankOutput.ranked.length === 0
      ? buildFoodClarifyCard(brief)
      : buildFoodNarrationFromLogic({
          ranked: rankOutput.ranked,
          brief,
          profileA: input.profileA,
          profileB: input.profileB,
          relationship: input.relationship,
          alternatives: rankOutput.alternatives,
          searchCandidates: input.searchCandidates,
          // F-2 → F-3 bridge: lens/foodLensToday が供給されていれば narration に
          // 素通しする。未供給時は undefined のまま、narration は従来経路で fallback。
          lens: input.lens,
          foodLensToday: input.foodLensToday,
        });
  const latencyNarration = Date.now() - startedNarration;

  // ── Diagnostics 集計 ──
  const latencyTotal = Date.now() - startedTotal;
  const hardFilterReasonCounts = aggregateHardFilterReasons(
    rankOutput.filterTrace,
  );
  const missingWhereDropCount = hardFilterReasonCounts.missing_where;
  const insufficientInfoDropCount = hardFilterReasonCounts.insufficient_info;

  // parse 段の 2 種類の drop を分ける:
  //  - name gate drop: name 抽出不可 → parseFoodVenues が完全棄却
  //  - candidateId dedup drop: 同一 candidateId 衝突で parseFoodVenues が 2 件目以降を棄却
  // parseFoodVenues は内部カウンタを持たないので、rawSearchCandidates - parsedVenues
  // の差を「nameGate + dedup の合計」として扱う。Commit 2.5 §1.2 の不変条件は
  // parsedVenues = raw - (nameGateDrop + dedupDrop) で成立。
  // 内訳を精密に出すには Commit 3 ではまだ足りない (name vs dedup の両方を計測する
  // には parseFoodVenues の返り値を拡張する必要がある)。当面は合計のみを
  // nameGateDropCount に集約し、dedup は 0 として計上する（不変条件は満たす）。
  // TODO Commit 3.x: parseFoodVenues を拡張して内訳を返す。
  const nameGateDropCount = Math.max(0, rawSearchCandidates - parsedVenues);
  const candidateIdDedupDropCount = 0;

  const withConfidence = rankOutput.filterTrace.filter(
    (t) => typeof t.confidence === "number",
  );
  const avgConfidence =
    withConfidence.length === 0
      ? 0
      : round3(
          withConfidence.reduce((s, t) => s + (t.confidence ?? 0), 0) /
            withConfidence.length,
        );

  const compromiseActiveCount = rankOutput.ranked.filter(
    (r) => r.breakdown.metrics.compromiseQuality > 0,
  ).length;
  const noveltyUsedRoleCount = rankOutput.ranked.filter((r) =>
    NOVELTY_USED_ROLES.has(r.role),
  ).length;
  const ratingMissingCount = rankOutput.ranked.filter(
    (r) => r.venue.rating == null,
  ).length;
  const openingHoursUnknownCount = rankOutput.ranked.filter(
    (r) => r.venue.openingHours == null,
  ).length;
  const bookingProviderDistribution = computeBookingProviderDistribution(
    rankOutput.ranked,
  );

  // ── §6.4 (6)-4 observability: source-kind 別欠落率 + eligible page rate ──
  //
  // 分母: 各 PageType の catalog 通過数（ranker 入力の母数）
  // 分子: 各 PageType の filterTrace で該当 reason を含む件数
  // 分母 0 は 0.0（NaN 禁止）。6 key すべて 0 初期化。
  const cataloguedByPageType = countCataloguedByPageType(catalog);
  const missingWhereRateBySourceKind = computeRateBySourceKind(
    rankOutput.filterTrace,
    cataloguedByPageType,
    "missing_where",
  );
  const insufficientInfoRateBySourceKind = computeRateBySourceKind(
    rankOutput.filterTrace,
    cataloguedByPageType,
    "insufficient_info",
  );
  const candidateEligiblePageRate =
    rawSearchCandidates > 0
      ? round3(
          (rawSearchCandidates - catalogMeta.blockedPageTypeCount) /
            rawSearchCandidates,
        )
      : 0;

  const diagnostics: FoodDiagnostics = {
    rawSearchCandidates,
    parsedVenues,
    nameGateDropCount,
    candidateIdDedupDropCount,
    rankedCount: rankOutput.ranked.length,
    filterTraceCount: rankOutput.filterTrace.length,
    hardFilterReasonCounts,
    missingWhereDropCount,
    insufficientInfoDropCount,
    avgConfidence,
    appliedPreset: rankOutput.appliedPreset,
    compromiseActiveCount,
    noveltyUsedRoleCount,
    ratingMissingCount,
    openingHoursUnknownCount,
    bookingProviderDistribution,
    latencyMsCatalog: latencyCatalog,
    latencyMsRank: latencyRank,
    latencyMsNarration: latencyNarration,
    latencyMsTotal: latencyTotal,
    // §6.4 (6)-2c: catalog 段の page type 観測値を常時同梱
    pageTypeDistribution: catalogMeta.pageTypeDistribution,
    blockedPageTypeCount: catalogMeta.blockedPageTypeCount,
    blockedByPageType: catalogMeta.blockedByPageType,
    // §6.4 (6)-4: source-kind 別欠落率 + eligible page rate（固定 7-key shape）
    missingWhereRateBySourceKind,
    insufficientInfoRateBySourceKind,
    candidateEligiblePageRate,
    // F-6 (2026-04-20): tier loop 観測値（tier loop 実行時のみ）
    ...(tierResult
      ? {
          appliedTier: tierResult.appliedTier,
          tierAttempts: tierResult.tierAttempts,
          ...(tierResult.tierThinReason
            ? { tierThinReason: tierResult.tierThinReason }
            : {}),
        }
      : {}),
    // §6.4 (6)-1 integration: lens 供給時のみ 4 field を同梱
    ...(foodQueryBuildResult
      ? {
          queryProjectionCoverage: foodQueryBuildResult.coverage,
          clarifyReason: foodQueryBuildResult.clarifySignal.clarifyReason,
          missingAxes: foodQueryBuildResult.clarifySignal.missingAxes,
          droppedAxes: foodQueryBuildResult.clarifySignal.droppedAxes,
        }
      : {}),
  };

  // ── Observability (CEO 追加条件 #1: food.diagnostics は成功時のみ 1 回) ──
  //   U2 (2026-04-20): movie と grep 互換になるよう
  //   missingWhereRejectCount / insufficientInfoRejectCount を alias として
  //   log にだけ同梱する。FoodDiagnostics 型は変えない（既存テスト契約保持）。
  emitFoodDiagnostics(input.sessionId ?? null, diagnostics);

  // ── Telemetry (coalter_proposal_quality 書き込み用) ──
  const telemetry: Omit<ProposalQualityRecord, "sessionId" | "userAction"> = {
    briefSource: brief.source,
    briefConfidence: brief.confidence,
    catalogCount: catalog.length,
    rankedCount: rankOutput.ranked.length,
    rankingAxesPreset: rankOutput.appliedPreset,
    // Commit 4: LLM enricher は食 path に接続していない（CEO 条件 #3）。
    // narrationMode は "logic_template" 固定、llmSuccessLayer3 は false 固定。
    narrationMode: "logic_template",
    llmSuccessLayer0: brief.source === "llm",
    llmSuccessLayer3: false,
    latencyMsTotal: latencyTotal,
    latencyMsCatalog: latencyCatalog,
    latencyMsRank: latencyRank,
    latencyMsNarration: latencyNarration,
  };

  return {
    card,
    telemetry,
    ranked: rankOutput.ranked,
    primaryQuestion: brief.primaryUnresolvedQuestion,
    diagnostics,
  };
}

/**
 * food.diagnostics emit（CEO 追加条件 #1: 成功時 1 回だけ）。
 *
 * §6.4 (6)-1 integration: lens 供給時は queryProjectionCoverage 等の 4 field が
 * diagnostics に含まれる。追加 emit は作らない（GPT 条件 #3）。
 */
function emitFoodDiagnostics(
  sessionId: string | null,
  diagnostics: FoodDiagnostics,
): void {
  try {
    console.info(
      "[CoAlter] food.diagnostics",
      JSON.stringify({
        sessionId,
        ...diagnostics,
        missingWhereRejectCount: diagnostics.missingWhereDropCount,
        insufficientInfoRejectCount: diagnostics.insufficientInfoDropCount,
      }),
    );
  } catch {
    // log 失敗しても本体には影響させない
  }
}

/**
 * clarify short-circuit 時の diagnostics 組み立て。
 * Layer 1/2/3 を skip しているので、rank 系の数値はすべて 0、
 * latency も Layer 0（brief）+ gate 判定のみ。
 */
function buildGatedClarifyDiagnostics(args: {
  sessionId: string | null;
  rawSearchCandidates: number;
  foodQueryBuildResult: FoodQueryBuildResult;
  latencyTotal: number;
}): FoodDiagnostics {
  const emptyHardFilter: Record<FoodHardFilterReason, number> = {
    violates_budget: 0,
    violates_area: 0,
    violates_cuisine_exclusion: 0,
    violates_companions: 0,
    violates_opening_hours: 0,
    closed_permanently: 0,
    missing_where: 0,
    insufficient_info: 0,
    violates_avoid_keys: 0,
    blocked_page_type: 0,
  };
  const emptyDist: BookingProviderDistribution = {
    official: { count: 0, ratio: 0 },
    official_site: { count: 0, ratio: 0 },
    official_reservation_partner: { count: 0, ratio: 0 },
    third_party_listing: { count: 0, ratio: 0 },
    unknown: { count: 0, ratio: 0 },
    total: 0,
  };
  return {
    rawSearchCandidates: args.rawSearchCandidates,
    parsedVenues: 0,
    nameGateDropCount: 0,
    candidateIdDedupDropCount: 0,
    rankedCount: 0,
    filterTraceCount: 0,
    hardFilterReasonCounts: emptyHardFilter,
    missingWhereDropCount: 0,
    insufficientInfoDropCount: 0,
    avgConfidence: 0,
    appliedPreset: "balance_focus",
    compromiseActiveCount: 0,
    noveltyUsedRoleCount: 0,
    ratingMissingCount: 0,
    openingHoursUnknownCount: 0,
    bookingProviderDistribution: emptyDist,
    latencyMsCatalog: 0,
    latencyMsRank: 0,
    latencyMsNarration: 0,
    latencyMsTotal: args.latencyTotal,
    queryProjectionCoverage: args.foodQueryBuildResult.coverage,
    clarifyReason: args.foodQueryBuildResult.clarifySignal.clarifyReason,
    missingAxes: args.foodQueryBuildResult.clarifySignal.missingAxes,
    droppedAxes: args.foodQueryBuildResult.clarifySignal.droppedAxes,
    // §6.4 (6)-2c: gated path は catalog を走らせないため pageType 情報も空
    pageTypeDistribution: emptyPageTypeDistribution(),
    blockedPageTypeCount: 0,
    blockedByPageType: {},
    // §6.4 (6)-4: gated path は ranker まで走らないため rate はすべて 0 固定
    missingWhereRateBySourceKind: emptyPageTypeDistribution(),
    insufficientInfoRateBySourceKind: emptyPageTypeDistribution(),
    candidateEligiblePageRate: 0,
  };
}

function emptyPageTypeDistribution(): Record<PageType, number> {
  return {
    venue_detail: 0,
    official: 0,
    reservation_partner: 0,
    third_party_listing: 0,
    news: 0,
    listicle: 0,
    non_venue: 0,
  };
}

/**
 * §6.4 (6)-4 observability: catalog 通過候補の PageType 別件数。
 * missingWhere/insufficientInfo の rate 計算の分母として使う。
 * 未分類（legacy path）candidate は集計しない（pageType undefined はスキップ）。
 */
function countCataloguedByPageType(
  catalog: Array<{ pageType?: PageType }>,
): Record<PageType, number> {
  const acc = emptyPageTypeDistribution();
  for (const c of catalog) {
    if (c.pageType) acc[c.pageType] += 1;
  }
  return acc;
}

/**
 * §6.4 (6)-4 observability: reason を指定して PageType 別 rate を出す。
 *
 * 分母 = cataloguedByPageType[pt]（ranker 入力数）
 * 分子 = filterTrace の pageType==pt かつ reasons に reason を含む件数
 * 分母 0 → 0.0（NaN 禁止）。固定 7-key shape。
 */
function computeRateBySourceKind(
  filterTrace: ReadonlyArray<FoodFilterTrace>,
  cataloguedByPageType: Record<PageType, number>,
  reason: FoodHardFilterReason,
): Record<PageType, number> {
  const numerator = emptyPageTypeDistribution();
  for (const t of filterTrace) {
    if (!t.pageType) continue;
    if (t.reasons.includes(reason)) numerator[t.pageType] += 1;
  }
  const out = emptyPageTypeDistribution();
  for (const k of Object.keys(out) as PageType[]) {
    const denom = cataloguedByPageType[k];
    out[k] = denom > 0 ? round3(numerator[k] / denom) : 0;
  }
  return out;
}

/**
 * CEO 追加条件 #1: foodOrchestrator が throw した時のエラー emit。
 * food.diagnostics は出さない（排他）。
 *
 * engine.ts の try/catch 側で呼ぶ。
 */
export function emitFoodOrchestratorError(
  error: unknown,
  sessionId: string | null,
): void {
  try {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "unknown_error";
    console.warn(
      "[CoAlter] food.orchestrator.error",
      JSON.stringify({
        sessionId,
        message,
        fallbackUsed: true,
      }),
    );
  } catch {
    // log 失敗しても本体には影響させない
  }
}

/**
 * §6.4 (6)-1 integration: engine.ts 側の web search 前 gate で使える helper。
 *
 * 呼び出し側が lens を構築できている場合、本関数で shouldClarify を先に確認できる。
 * true なら ensureSearchCandidates() を呼ばずに clarify card に倒せる。
 */
export function evaluateFoodRetrievalHygiene(
  lens: FoodQueryBuilderInput,
): FoodQueryBuildResult {
  return buildFoodQuery(lens);
}

/**
 * §6.4 (6)-1b pre-search gate (2026-04-20 / GPT 条件 #1 真の達成):
 *
 * engine.ts の food 分岐で ensureSearchCandidates() を呼ぶ前に本関数で判定する。
 * true が返ったら web search を skip してよい（rawSearchCandidates=0 になる）。
 *
 * 契約:
 *   - lens 未供給 → false（legacy 経路、従来どおり search 実行）
 *   - lens 供給 + shouldClarify=false → false（通常 search）
 *   - lens 供給 + shouldClarify=true → true（search skip、orchestrator に [] を渡す）
 */
export function shouldSkipFoodWebSearch(
  lens: FoodQueryBuilderInput | undefined,
): boolean {
  if (!lens) return false;
  return evaluateFoodRetrievalHygiene(lens).clarifySignal.shouldClarify;
}

// テスト用 export
export const __internal = {
  buildFoodClarifyCard,
  buildFoodClarifyCardWithProjection,
  formatProjectedAxesSummary,
  buildGatedClarifyDiagnostics,
  emitFoodDiagnostics,
  round3,
  NOVELTY_USED_ROLES,
};
