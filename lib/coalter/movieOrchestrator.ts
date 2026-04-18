/**
 * CoAlter Movie Orchestrator (2026-04-18)
 *
 * 4-layer pipeline thin integration:
 *
 *   Layer 0: briefBuilder (LLM + parser fallback)
 *   Layer 1: movieCatalog (logic, 既存)
 *   Layer 2: movieRanker (logic)
 *   Layer 3: narrationTemplate (logic) → narrationEnricher (LLM prose)
 *
 * 設計原則:
 *  - LLM 失敗は想定内。どの段階で落ちても最低限の提案カードが返る
 *  - 事実（作品・劇場・時刻）は logic 側が権威。LLM は書き換えできない
 *  - 候補 0 件 → primaryUnresolvedQuestion ベースで clarify 応答
 *  - 品質は絶対に落とさない（CEO方針）
 */

import "server-only";

import type {
  CoAlterPersonProfile,
  ConversationAnalysis,
  ConversationBrief,
  ConversationTurn,
  ProposalCard,
  ProposalQualityRecord,
  RankedCandidate,
  RelationshipContext,
  SearchCandidate,
  PendingAxisDeltas,
} from "./types";
import { buildConversationBrief } from "./briefBuilder";
import { parseMovieScreenings } from "./movieCatalog";
import { rankMovies } from "./movieRanker";
import { buildNarrationFromLogic } from "./narrationTemplate";
import { enrichNarration } from "./narrationEnricher";

export interface MovieOrchestratorInput {
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

export interface MovieOrchestratorOutput {
  card: ProposalCard;
  telemetry: Omit<ProposalQualityRecord, "sessionId" | "userAction">;
  /** ranked candidates (engine の seenCandidateKeys / URL 紐付けで利用) */
  ranked: RankedCandidate[];
  /** brief の primary question（clarify にも使える） */
  primaryQuestion: ConversationBrief["primaryUnresolvedQuestion"];
  /**
   * Phase A.5 観測カウンタ (DB には永続化しない観測用・未 migration)。
   * 「where 欠け」によって drop された作品数と、catalog 段階で title だけ
   * 取れて theater が null のままだった件数を見る。これが多い場合は
   * 検索クエリ / theater 補完ロジックに bug がある可能性が高い。
   */
  diagnostics: {
    catalogCount: number;
    rankedCount: number;
    missingWhereRejectCount: number;
    titleWithoutTheaterCount: number;
  };
}

/**
 * movie テーマ専用の 4-layer パイプライン。
 * engine.ts 側から theme === "movie" の時に呼ばれる想定。
 */
export async function generateMovieProposalV2(
  input: MovieOrchestratorInput,
): Promise<MovieOrchestratorOutput> {
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

  // ── Layer 1: MovieScreening catalog ──
  const startedCatalog = Date.now();
  const catalog = parseMovieScreenings(input.searchCandidates);
  const latencyCatalog = Date.now() - startedCatalog;

  // ── Layer 2: movieRanker ──
  const startedRank = Date.now();
  const rankOutput = rankMovies({
    brief,
    catalog,
    avoidKeys: input.avoidKeys ?? [],
    profileA: input.profileA,
    profileB: input.profileB,
  });
  const latencyRank = Date.now() - startedRank;

  // ── Layer 3: narration ──
  const logicCard = buildNarrationFromLogic({
    ranked: rankOutput.ranked,
    brief,
    profileA: input.profileA,
    profileB: input.profileB,
    relationship: input.relationship,
    alternatives: rankOutput.alternatives,
    searchCandidates: input.searchCandidates,
  });

  const startedNarration = Date.now();
  let finalCard = logicCard;
  let llmSuccessLayer3 = false;
  let narrationMode: ProposalQualityRecord["narrationMode"] = "logic_template";

  if (rankOutput.ranked.length > 0) {
    const enriched = await enrichNarration({
      baseCard: logicCard,
      ranked: rankOutput.ranked,
      brief,
      timeoutMs: input.llmTimeoutMs ?? 3500,
      userId: input.userId,
      sessionId: input.sessionId,
    });
    if (enriched.llmSuccess) {
      finalCard = enriched.card;
      llmSuccessLayer3 = true;
      narrationMode = "llm";
    }
  }
  const latencyNarration = Date.now() - startedNarration;

  // ── 候補 0 件 fallback: clarify 誘導 ──
  if (rankOutput.ranked.length === 0) {
    finalCard = {
      ...finalCard,
      summary: brief.primaryUnresolvedQuestion
        ? `今の情報だと候補を絞りきれませんでした。${brief.primaryUnresolvedQuestion.question}`
        : "まだ条件が揃っていないので、もう少し話してから候補を出します。",
      reasoning: "今の条件では適切な候補が絞れなかったため、追加の情報をもらいに戻りました。",
      candidates: [],
      theme: "movie",
    };
    if (brief.primaryUnresolvedQuestion) {
      finalCard = {
        ...finalCard,
        missingConstraints: [
          {
            key: brief.primaryUnresolvedQuestion.key,
            question: brief.primaryUnresolvedQuestion.question,
            priority: 1,
            slot: brief.primaryUnresolvedQuestion.slot,
          },
        ],
      };
    }
  }

  // ── validation meta を付与 ──
  finalCard = {
    ...finalCard,
    validation: {
      rejectedCount: rankOutput.filterTrace.length,
      rejectReasons: [],
      fallbackToClarify: rankOutput.ranked.length === 0,
      hardConstraintsCount: brief.hardConstraints.filter((c) => c.strength === "hard").length,
      providerFailure:
        briefResult.llmSuccess === false &&
        llmSuccessLayer3 === false &&
        rankOutput.ranked.length === 0,
    },
  };

  const telemetry: Omit<ProposalQualityRecord, "sessionId" | "userAction"> = {
    briefSource: brief.source,
    briefConfidence: brief.confidence,
    catalogCount: catalog.length,
    rankedCount: rankOutput.ranked.length,
    rankingAxesPreset: brief.rankingAxes.preset,
    narrationMode,
    llmSuccessLayer0: briefResult.llmSuccess,
    llmSuccessLayer3,
    latencyMsTotal: Date.now() - startedTotal,
    latencyMsCatalog: latencyCatalog,
    latencyMsRank: latencyRank,
    latencyMsNarration: latencyNarration,
  };

  // Phase A.5 diagnostics (未 migration。将来的に coalter_proposal_quality に列追加する場合は CEO 承認)
  const missingWhereRejectCount = rankOutput.filterTrace.filter((t) =>
    t.reasons.includes("missing_where"),
  ).length;
  const titleWithoutTheaterCount = catalog.filter((c) => c.title && !c.theater)
    .length;
  const diagnostics = {
    catalogCount: catalog.length,
    rankedCount: rankOutput.ranked.length,
    missingWhereRejectCount,
    titleWithoutTheaterCount,
  };

  // 観測用 console（server-side）。sessionId があれば紐付けて grep しやすくする。
  try {
    console.info(
      "[CoAlter] movie.diagnostics",
      JSON.stringify({ sessionId: input.sessionId ?? null, ...diagnostics }),
    );
  } catch {
    // log 失敗しても本体には影響させない
  }

  return {
    card: finalCard,
    telemetry,
    ranked: rankOutput.ranked,
    primaryQuestion: brief.primaryUnresolvedQuestion,
    diagnostics,
  };
}
