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
import { sanitizePrimaryQuestion } from "./primaryQuestionGuard";

// [D-1-d 2026-05-11] curator shadow 起動経路の依存。flag OFF 時は dead import。
import { COALTER_FLAGS } from "./flags";
import { deriveMovieQuery } from "./movie/queryDerivation";
import {
  buildCandidatePool,
  type CandidateSource,
} from "./movie/candidatePool";
import { curate, type CuratorLLMClient } from "./movie/curator";
import type {
  PersonalLens,
  TwoPersonLensToday,
  UserId,
} from "./understanding/types";

// [D-2-e2 2026-05-11] COALTER_THREE_STAGE grand kill switch path。
// flag OFF 時は dead import (本体 call flow 1 bit 不変)。
import { runThreeStageScaffoldPath } from "./movie/threeStageOrchestratorAdapter";

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
  /**
   * 2026-04-19 CEO 採用案 E: 直前 invoke で既にユーザーに投げた
   * condition question の key（missingConstraints[0].key）。
   * 同じ key を連続で再投出しないために primaryQuestionGuard に渡す。
   */
  avoidClarifyKey?: string | null;
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
    /** Phase A.6 追加 (2026-04-19): input.searchCandidates.length。0 なら webConnector 経路の問題 */
    searchCandidatesCount: number;
    catalogCount: number;
    rankedCount: number;
    missingWhereRejectCount: number;
    titleWithoutTheaterCount: number;
    /** Phase A.6 P1: "上映終了 / 古すぎるリリース年" で drop した件数 */
    staleReleaseRejectCount: number;
    /** Phase A.6 P1: catalog 段階で status="ended" と判定された件数 */
    endedStatusCount: number;
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

  // ───────────────────────────────────────────────────
  // [D-2-e2 2026-05-11] COALTER_THREE_STAGE grand kill switch (Step D Phase M2)
  // ───────────────────────────────────────────────────
  // - flag default OFF (本番影響ゼロ、CEO 採用)
  // - flag OFF 時は本ブロック全体を skip、既存 4-layer pipeline に流れる
  //   (call flow が 1 bit も変化しない、CEO 採用 D-1-d と同精神)
  // - flag ON 時のみ runThreeStageScaffoldPath (stub deps + placeholder) で早期 return
  // - stub / placeholder は scaffold 限定 (実 fetcher / 実 LLM / M0 lens 接続は D-2-e3)
  // - rollback: env COALTER_THREE_STAGE=false → Production redeploy で即復帰
  if (COALTER_FLAGS.threeStageEnabled) {
    return runThreeStageScaffoldPath(input, startedTotal);
  }

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
      // Phase 3B Layer 2-C: analysis.emotionTags を enricher へ propagate。
      // 軽い補助信号として LLM prompt にのみ届き、user-facing prose には漏らさない
      // (narrationEnricher 側で SYSTEM_PROMPT 制約 + FORBIDDEN check で担保)。
      emotionTags: input.analysis.emotionTags,
    });
    if (enriched.llmSuccess) {
      finalCard = enriched.card;
      llmSuccessLayer3 = true;
      narrationMode = "llm";
    }
  }
  const latencyNarration = Date.now() - startedNarration;

  // ── 候補 0 件 fallback: clarify 誘導 ──
  //
  // 2026-04-19 CEO 採用案 D: Primary Question Guard
  //   LLM briefBuilder が slot="what" / 「何を観るか」型の破綻質問を出す事故あり
  //   (thread 18eeb9ff 実測)。sanitizePrimaryQuestion で破綻を排除し、埋まっていない
  //   条件スロット (where/when/how) の 1 問だけを返すように logic で上書きする。
  if (rankOutput.ranked.length === 0) {
    const guarded = sanitizePrimaryQuestion(
      brief.primaryUnresolvedQuestion,
      brief,
      "movie",
      input.avoidClarifyKey ?? null,
    );
    const safeQuestion = guarded.question;
    // E: avoidClarifyKey を指定したのに question=null が返った = 全優先が潰れた
    // → 撤退 summary に落とす（同じ質問のループを断ち切る）
    const isRetreat =
      !safeQuestion && (guarded.reason === "loop_avoided" || !!input.avoidClarifyKey);
    finalCard = {
      ...finalCard,
      summary: safeQuestion
        ? `今の情報だと候補を絞りきれませんでした。${safeQuestion.question}`
        : isRetreat
          ? "条件を何度か確認したけれど、まだ決め切れるほどは揃っていませんでした。少し会話に戻して、行きやすい場所や時間帯がはっきりしたら、また CoAlter を呼んでみてください。"
          : "まだ条件が揃っていないので、もう少し話してから候補を出します。",
      reasoning:
        "今の条件では適切な候補が絞れなかったため、追加の情報をもらいに戻りました。",
      candidates: [],
      theme: "movie",
    };
    if (safeQuestion) {
      finalCard = {
        ...finalCard,
        missingConstraints: [
          {
            key: safeQuestion.key,
            question: safeQuestion.question,
            priority: 1,
            slot: safeQuestion.slot,
          },
        ],
      };
    } else {
      // E: 撤退時は missingConstraints を空にする (同じ key が引き継がれないように)
      finalCard = { ...finalCard, missingConstraints: [] };
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
  // Phase A.6 P1 diagnostics
  const staleReleaseRejectCount = rankOutput.filterTrace.filter((t) =>
    t.reasons.includes("stale_release"),
  ).length;
  const endedStatusCount = catalog.filter((c) => c.status === "ended").length;
  const diagnostics = {
    // Phase A.6 追加 (2026-04-19): 0件 diagnostics 連発の切り分け用
    //   searchCandidatesCount=0 かつ catalogCount=0 → webConnector 経路の問題
    //   searchCandidatesCount>0 かつ catalogCount=0 → parseMovieScreenings 側の問題
    searchCandidatesCount: input.searchCandidates.length,
    catalogCount: catalog.length,
    rankedCount: rankOutput.ranked.length,
    missingWhereRejectCount,
    titleWithoutTheaterCount,
    staleReleaseRejectCount,
    endedStatusCount,
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

  // ───────────────────────────────────────────────────
  // [D-1-d 2026-05-11] D-1-c curator shadow 起動 (Step D Phase M1 wiring)
  // ───────────────────────────────────────────────────
  // - flag default OFF (本番影響ゼロ、CEO 採用必須条件 1-2)
  // - flag ON 時のみ fire-and-forget で shadow 起動 (本流 return 値に 1 bit も
  //   影響しない、CEO 採用必須条件 3)
  // - shadow 失敗は内部 try/catch + 呼び出し側 .catch(() => {}) の二重防御
  //   (CEO 採用必須条件 4: fail-open、Bug-1 §2.3 失敗独立 5 条文の精神)
  // - CEO 採用 (X1): 3 source = 空配列 stub、CEO 採用必須条件 6 (実 candidate
  //   fetch なし)
  // - CEO 採用 (Y1): LLM client = 空 stub、CEO 採用必須条件 5 (実 LLM 接続なし)
  // - CEO 採用必須条件 7: telemetry / persistence / console log 追加なし
  if (COALTER_FLAGS.movieCuratorLiveEnabled) {
    void runMovieCuratorShadow().catch(() => {});
  }

  return {
    card: finalCard,
    telemetry,
    ranked: rankOutput.ranked,
    primaryQuestion: brief.primaryUnresolvedQuestion,
    diagnostics,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// [D-1-d 2026-05-11] D-1-c curator shadow runner (movieOrchestrator.ts inline)
// ═══════════════════════════════════════════════════════════════════════════
//
// CEO 採用方針 (handover §5 / D-1-d 設計レビュー §13):
//   - 接続点: P1 (4-layer pipeline 完了後、return 直前)
//   - candidate source: X1 (3 source = 空配列 stub)
//   - LLM client: Y1 (空 stub)
//   - helper 配置: movieOrchestrator.ts inline
//
// 経路 verify が目的: deriveMovieQuery → buildCandidatePool → curate が
// 例外なく動くことを shadow で確認するだけ。実 LLM / API / candidate fetch なし。
// 結果は破棄 (CEO 採用必須条件 7: telemetry / persistence / console log 追加なし)。
//
// 完全置換 (実接続 + observability) は D-2-e (COALTER_THREE_STAGE) で別 phase。

async function runMovieCuratorShadow(): Promise<void> {
  try {
    const lens = buildPlaceholderLens();
    const query = deriveMovieQuery(lens);

    const emptySource: CandidateSource = async () => [];
    const pool = await buildCandidatePool(
      { query },
      {
        rankingSource: emptySource,
        exaSource: emptySource,
        personalityHistorySource: emptySource,
      },
    );

    const stubLLM: CuratorLLMClient = async () => "";
    await curate(
      { lens, query, candidatePool: pool.filteredPool },
      { llmClient: stubLLM },
    );
    // 結果は破棄 (CEO 採用条件 7: telemetry / persistence / console log 追加なし)
  } catch {
    // 二重防御 fail-open (CEO 採用条件 4)
  }
}

/**
 * D-1-d shadow 用 minimal placeholder lens。
 *
 *   実 lens は B-5 (engine.ts の `runMovieShadowUnderstanding`) で別途生成され
 *   movieOrchestrator には渡されていない。D-1-d shadow は経路 verify が目的
 *   なので、curator が動作する最小骨格を構築する。pool は空、LLM は空 stub
 *   なので curator は fallback narration を返すだけ (実害ゼロ)。
 *
 *   computedAt は固定値 ("1970-01-01T...") で決定論を維持 (test の reproducibility)。
 */
function buildPlaceholderLens(): TwoPersonLensToday {
  const emptyPersonalLens: PersonalLens = {
    userId: "shadow-placeholder" as UserId,
    displayName: "shadow",
    coreDecisionPrinciples: [],
    currentEmotionalHue: "",
    todaySensitivities: [],
    comfortPathways: [],
    sourcedFrom: { stargazer: [], alter: [], behavioral: [] },
  };
  return {
    personalLenses: { a: emptyPersonalLens, b: emptyPersonalLens },
    relationalLens: {
      temperature: "neutral",
      dominantDynamic: "",
      careAxes: [],
      avoidElements: [],
      interactionPace: "steady",
    },
    todayReading: {
      mode: "maintain",
      energyBudget: "mid",
      timeBudget: "limited",
      implicitIntent: "",
      latentNeeds: [],
      confidence: 0.3,
    },
    fairnessAdjustment: {
      favorSide: null,
      rationale: null,
      strength: 0,
      basedOnSessionCount: 0,
    },
    understanding_confidence: 0.3,
    dataGaps: [],
    computedAt: "1970-01-01T00:00:00.000Z",
    lensVersion: "1.0.0",
  };
}
