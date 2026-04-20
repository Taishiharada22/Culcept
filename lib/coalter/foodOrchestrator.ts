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
  ConversationAnalysis,
  ConversationBrief,
  ConversationTurn,
  FoodFilterTrace,
  FoodHardFilterReason,
  FoodRankOutput,
  PendingAxisDeltas,
  ProposalCard,
  ProposalQualityRecord,
  RankedFoodCandidate,
  RankingAxesPreset,
  RelationshipContext,
  SearchCandidate,
  BookingProviderType,
} from "./types";
import { buildConversationBrief } from "./briefBuilder";
import { parseFoodVenues } from "./foodCatalog";
import { rankFood } from "./foodRanker";
import { __internal as bookingInternal } from "./bookingResolver";
import { buildFoodNarrationFromLogic } from "./narrationTemplate";

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

  // ── Layer 1: FoodVenue catalog ──
  const startedCatalog = Date.now();
  const rawSearchCandidates = input.searchCandidates.length;
  const catalog = parseFoodVenues(input.searchCandidates);
  const parsedVenues = catalog.length;
  const latencyCatalog = Date.now() - startedCatalog;

  // ── Layer 2: foodRanker ──
  const startedRank = Date.now();
  const rankOutput: FoodRankOutput = rankFood({
    brief,
    catalog,
    avoidKeys: input.avoidKeys ?? [],
    profileA: input.profileA,
    profileB: input.profileB,
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
  };

  // ── Observability (CEO 追加条件 #1: food.diagnostics は成功時のみ 1 回) ──
  //   U2 (2026-04-20): movie と grep 互換になるよう
  //   missingWhereRejectCount / insufficientInfoRejectCount を alias として
  //   log にだけ同梱する。FoodDiagnostics 型は変えない（既存テスト契約保持）。
  try {
    console.info(
      "[CoAlter] food.diagnostics",
      JSON.stringify({
        sessionId: input.sessionId ?? null,
        ...diagnostics,
        missingWhereRejectCount: missingWhereDropCount,
        insufficientInfoRejectCount: insufficientInfoDropCount,
      }),
    );
  } catch {
    // log 失敗しても本体には影響させない
  }

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

// テスト用 export
export const __internal = {
  buildFoodClarifyCard,
  round3,
  NOVELTY_USED_ROLES,
};
