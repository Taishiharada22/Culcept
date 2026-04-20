/**
 * CoAlter 5層パイプライン統合エンジン
 *
 * L1: profileLoader       — 双方のプロフィールロード
 * L2: relationshipLayer   — 関係性メタデータ構築
 * L3: conversationParser  — 会話解析
 * L4: webConnector        — Adaptive RAG（Web検索）
 * L5: proposalGenerator   — 提案生成（LLM）
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CoAlterInput,
  CoAlterOutput,
  CoAlterSession,
  RelationshipContext,
  FairnessEntry,
  SearchCandidate,
  ProposalCard,
  PendingAxisDeltas,
  CoAlterCard,
  CoAlterMode,
  ConversationTheme,
} from "./types";
import { loadPairProfiles } from "./profileLoader";
import {
  fetchRecentMessages,
  analyzeConversation,
  detectContradiction,
  detectStall,
  detectMisread,
} from "./conversationParser";
import { decideSearch, searchAndFilter } from "./webConnector";
import { generateProposal } from "./proposalGenerator";
import { generateMovieProposalV2 } from "./movieOrchestrator";
import {
  generateFoodProposalV2,
  emitFoodOrchestratorError,
} from "./foodOrchestrator";
import { candidateKey } from "./axes";
import { buildTopicAnchor } from "./topicScope";
import type { TopicAnchor } from "./types";
import {
  dispatchCoAlter,
  EMOTION_HEAT_LOW,
} from "./coalterDispatch";
import {
  applySoftThemeContinuity,
  hasMovieEvidenceInMessages,
} from "./themeContinuity";
import { buildConditionQuestionFromAnalysis } from "./primaryQuestionGuard";

// ─────────────────────────────────────────────
// L2: 関係理解（簡易版。Phase 1では最小限）
// ─────────────────────────────────────────────

async function buildRelationshipContext(
  supabase: SupabaseClient,
  pairStateId: string,
  profileA: { userId: string; communicationStyle: Record<string, number | null> },
  profileB: { userId: string; communicationStyle: Record<string, number | null> },
): Promise<RelationshipContext> {
  // 共通点と摩擦点を45軸スコアの差分から計算
  const commonGround: string[] = [];
  const frictionPoints: string[] = [];

  const axisLabels: Record<string, string> = {
    directVsDiplomatic: "コミュニケーションの直接さ",
    conflictStyle: "対立スタイル",
    attachmentStyle: "愛着スタイル",
    reassuranceNeed: "安心の求め方",
    emotionalVariability: "感情の振れ幅",
  };

  for (const [key, label] of Object.entries(axisLabels)) {
    const a = profileA.communicationStyle[key];
    const b = profileB.communicationStyle[key];
    if (a !== null && b !== null) {
      const diff = Math.abs(a - b);
      if (diff < 0.2) commonGround.push(label);
      if (diff > 0.5) frictionPoints.push(label);
    }
  }

  // Fairness Ledger の読み込み
  //
  // [M1 C3] session_id IS NULL の行 = activate 時の onboarding seed (bias_score=0)。
  //   読み取り側は null を許容する (FairnessEntry.sessionId: string | null)。
  //   将来、実 session 由来だけ欲しい集計を足すときは
  //   `WHERE session_id IS NOT NULL` を付けるのが既定。
  const { data: ledgerRows } = await supabase
    .from("coalter_fairness_ledger")
    .select("session_id, bias_score, decided_at")
    .eq("pair_state_id", pairStateId)
    .order("decided_at", { ascending: false })
    .limit(10);

  const fairnessLedger: FairnessEntry[] = (ledgerRows ?? []).map(
    (r: { session_id: string | null; bias_score: number; decided_at: string }) => ({
      sessionId: r.session_id,
      biasScore: r.bias_score,
      decidedAt: r.decided_at,
    }),
  );

  // 過去のセッション数
  const { count } = await supabase
    .from("coalter_sessions")
    .select("id", { count: "exact", head: true })
    .eq("pair_state_id", pairStateId);

  return {
    commonGround,
    frictionPoints,
    fairnessLedger,
    pastSessionCount: count ?? 0,
  };
}

// ─────────────────────────────────────────────
// メインパイプライン
// ─────────────────────────────────────────────

/**
 * CoAlter 5層パイプラインを実行する。
 *
 * @param supabase - Supabase client（認証済み）
 * @param input - 起動入力
 * @param session - 作成済みセッション
 * @param pairStateId - ペア状態ID
 * @param userAId - ユーザーA ID
 * @param userBId - ユーザーB ID
 * @returns CoAlterOutput
 */
export async function runCoAlterPipeline(
  supabase: SupabaseClient,
  input: CoAlterInput,
  session: CoAlterSession,
  pairStateId: string,
  userAId: string,
  userBId: string,
  options?: {
    pendingDeltas?: PendingAxisDeltas;
    avoidKeys?: string[];
    /** Phase 1.5.4.6: 永続化済み anchor（UI からの上書き / 再起動ケース） */
    topicAnchor?: TopicAnchor;
  },
): Promise<CoAlterOutput> {
  const startTime = Date.now();

  // ── L1: 双方のプロフィールロード ──
  const { profileA, profileB } = await loadPairProfiles(
    supabase,
    userAId,
    userBId,
  );

  // ── L3: 会話解析（L2 + previousState と並列で実行） ──
  // previousState は Phase 6.C の router 入力に使うが、
  // 2026-04-19 CEO 採用案 A (soft theme continuity) で theme 補正にも使うため
  // analyzeConversation より前に取得しておく。
  const [messages, relationship, previousState] = await Promise.all([
    fetchRecentMessages(supabase, input.threadId, 20),
    buildRelationshipContext(supabase, pairStateId, profileA, profileB),
    fetchPreviousCoAlterState(supabase, pairStateId),
  ]);

  // Phase 1.5.4.6: topic anchor を構築（起動直前 or userMessage）
  // 既存セッションに永続化された anchor があれば優先、無ければ新規構築
  const anchor: TopicAnchor | null =
    options?.topicAnchor ?? buildTopicAnchor(messages, input.userMessage);

  const analysisOriginal = analyzeConversation(messages, userAId, userBId, {
    topicAnchor: anchor ?? undefined,
  });

  // ── 2026-04-19 CEO 採用案 A: Soft Theme Continuity ──
  // 前回 invoke の theme が movie で、今回の検出が曖昧 (general) かつ
  // 直近 window に movie evidence が残り、他テーマ evidence が明確でない場合のみ
  // theme=movie を維持する。永久 sticky ではない。
  const continuity = applySoftThemeContinuity({
    detectedTheme: analysisOriginal.theme,
    previousTheme: previousState.previousTheme,
    messages,
  });
  const analysis = continuity.stickyApplied
    ? { ...analysisOriginal, theme: continuity.theme }
    : analysisOriginal;

  // ── L4: 外部接続（Adaptive RAG） ──
  //
  // Phase 6.C (2026-04-19): dispatch が negotiate / clarify を選ぶ場合は
  // 外部検索も L5 も走らせない（無駄な webConnector 呼び出しを避ける）。
  // searchDecision の計算自体は安いので telemetry 用に先行実行。
  // searchCandidates は buildDecisionCard クロージャ内で初回 lazy 取得。
  const searchDecision = decideSearch(analysis);
  let searchCandidates: SearchCandidate[] | null = null;
  const ensureSearchCandidates = async (): Promise<SearchCandidate[]> => {
    if (searchCandidates !== null) return searchCandidates;
    searchCandidates = searchDecision.shouldSearch
      ? await searchAndFilter(searchDecision, profileA, profileB)
      : [];
    return searchCandidates;
  };

  // ── L5: 提案生成 ──
  // 2026-04-18: movie テーマは 4-layer 再設計パイプライン (movieOrchestrator) に切替
  // 2026-04-19 Phase B Commit 3: food テーマも 4-layer パイプライン (foodOrchestrator) に切替
  // それ以外のテーマは従来の generateProposal を継続使用
  //
  // Phase 6.C: 既存 decision executor は **buildDecisionCard クロージャ** に退避。
  //   dispatchCoAlter が callback として呼び出す。decision 非破壊のため内部ロジックは変更しない。
  const useMovieV2 = analysis.theme === "movie";
  const useFoodV2 = analysis.theme === "food";
  const buildDecisionCard = async (): Promise<ProposalCard> => {
    const searchCands = await ensureSearchCandidates();
    let rawProposal: ProposalCard;
    if (useMovieV2) {
      const movieResult = await generateMovieProposalV2({
        turns: messages,
        analysis,
        searchCandidates: searchCands,
        profileA,
        profileB,
        relationship,
        avoidKeys: options?.avoidKeys,
        pendingDeltas: options?.pendingDeltas,
        sessionId: session.id,
        userId: input.invokedBy,
        avoidClarifyKey: previousState.previousClarifyKey,
      });
      rawProposal = movieResult.card;

      // observability v1: 4-layer 品質監査を記録（失敗は握りつぶす、メインフローに影響させない）
      supabase
        .from("coalter_proposal_quality")
        .insert({
          session_id: session.id,
          brief_source: movieResult.telemetry.briefSource,
          brief_confidence: movieResult.telemetry.briefConfidence,
          catalog_count: movieResult.telemetry.catalogCount,
          ranked_count: movieResult.telemetry.rankedCount,
          ranking_axes_preset: movieResult.telemetry.rankingAxesPreset,
          narration_mode: movieResult.telemetry.narrationMode,
          llm_success_layer0: movieResult.telemetry.llmSuccessLayer0,
          llm_success_layer3: movieResult.telemetry.llmSuccessLayer3,
          latency_ms_total: movieResult.telemetry.latencyMsTotal,
          latency_ms_catalog: movieResult.telemetry.latencyMsCatalog,
          latency_ms_rank: movieResult.telemetry.latencyMsRank,
          latency_ms_narration: movieResult.telemetry.latencyMsNarration,
        })
        .then(
          () => {},
          () => {},
        );
    } else if (useFoodV2) {
      // Phase B Commit 3 (2026-04-19): food 4-layer パイプライン
      //
      // CEO 追加条件 #1: diagnostics 二重発火禁止
      //   - 成功時: foodOrchestrator 内で food.diagnostics を 1 回 emit
      //   - 失敗時: food.orchestrator.error を emit + generateProposal に fallback
      //            （food.diagnostics は emit しない）
      try {
        const foodResult = await generateFoodProposalV2({
          turns: messages,
          analysis,
          searchCandidates: searchCands,
          profileA,
          profileB,
          relationship,
          avoidKeys: options?.avoidKeys,
          pendingDeltas: options?.pendingDeltas,
          sessionId: session.id,
          userId: input.invokedBy,
        });
        rawProposal = foodResult.card;

        // observability: coalter_proposal_quality 記録 (movie と同パターン)
        supabase
          .from("coalter_proposal_quality")
          .insert({
            session_id: session.id,
            brief_source: foodResult.telemetry.briefSource,
            brief_confidence: foodResult.telemetry.briefConfidence,
            catalog_count: foodResult.telemetry.catalogCount,
            ranked_count: foodResult.telemetry.rankedCount,
            ranking_axes_preset: foodResult.telemetry.rankingAxesPreset,
            narration_mode: foodResult.telemetry.narrationMode,
            llm_success_layer0: foodResult.telemetry.llmSuccessLayer0,
            llm_success_layer3: foodResult.telemetry.llmSuccessLayer3,
            latency_ms_total: foodResult.telemetry.latencyMsTotal,
            latency_ms_catalog: foodResult.telemetry.latencyMsCatalog,
            latency_ms_rank: foodResult.telemetry.latencyMsRank,
            latency_ms_narration: foodResult.telemetry.latencyMsNarration,
          })
          .then(
            () => {},
            () => {},
          );
      } catch (err) {
        // CEO 追加条件 #1: 失敗時は error を emit、成功時の food.diagnostics は出さない
        emitFoodOrchestratorError(err, session.id);
        rawProposal = await generateProposal(
          profileA,
          profileB,
          analysis,
          searchCands,
          relationship,
          input.userMessage,
          options,
        );
      }
    } else {
      rawProposal = await generateProposal(
        profileA,
        profileB,
        analysis,
        searchCands,
        relationship,
        input.userMessage,
        options,
      );
    }

    // ── URL付与: LLMが生成した候補に検索結果のURLを紐付け ──
    let withUrls = attachUrlsToCandidates(rawProposal, searchCands);

    // ── 2026-04-19 CEO 採用案 C + D: Legacy path の verified-only guard ──
    // movieV2 / foodV2 を通らず legacy generateProposal を通った場合、
    // 映画文脈 (前回 invoke = movie OR 直近に movie evidence) では
    // 「検証可能 URL を持たない候補」を落とす。
    // movieV2 は catalog ベースで既に担保されているので対象外。
    // 全滅した場合は candidates=[] にして safe fallback summary を置く。
    // さらに D (primaryQuestionGuard) で「何を観るか」系の破綻質問を排除し、
    // 埋まっていない条件スロット (where/when/how) の 1 問だけを返す。
    if (!useMovieV2 && !useFoodV2) {
      const movieContext =
        previousState.previousTheme === "movie" ||
        hasMovieEvidenceInMessages(messages);
      if (movieContext) {
        const safeQ = buildConditionQuestionFromAnalysis(
          analysis,
          "movie",
          previousState.previousClarifyKey,
        );
        withUrls = sanitizeLegacyMovieCandidates(
          withUrls,
          safeQ,
          previousState.previousClarifyKey,
        );
      }
    }

    // ── Phase 1.5: decisionState を付与 ──
    // options があれば pivoting（既に軸を動かしている最中）、なければ draft（初回）
    const decisionState: "draft" | "pivoting" =
      options?.pendingDeltas && Object.keys(options.pendingDeltas).length > 0
        ? "pivoting"
        : "draft";
    return { ...withUrls, decisionState };
  };

  // ── Phase 6.C: dispatch (gate → router → modifier → executor) ──
  //
  // CEO 条件:
  //  #1 decision 非破壊: buildDecisionCard はそのまま callback として渡す
  //  #2 G6 movie 先行: dispatch 内部で theme !== "movie" は decision fallback
  //  #3 RouterTrace 永続化: 呼び出し側 (invoke route) が metadata へ書く
  //  #4 card.mode discriminated union で UI 分岐
  const contradictionSignal = detectContradiction(messages, userAId, userBId);
  const stallSignal = detectStall(messages);
  // Phase A misread detector (2026-04-19 CEO 採用案 A): CoAlter-local regex 実装。
  // Phase B で Intent Translation 結果の永続化版に差し替える (types.ts MisreadSignal
  // コメント参照)。Phase 2 凍結 6 項目には触れない。
  const misreadSignal = detectMisread(messages, userAId, userBId);
  // previousState は上の Promise.all で取得済み。router 入力として再利用する。
  const dispatchResult = await dispatchCoAlter({
    gate: { consent: "active", emotionHeat: EMOTION_HEAT_LOW },
    router: {
      previousMode: previousState.previousMode,
      previousClarifyTurns: previousState.previousClarifyTurns,
      previousNegotiateNoProposal: previousState.previousNegotiateNoProposal,
      misread: misreadSignal,
      contradiction: contradictionSignal,
      stall: stallSignal,
      ambiguityResponseMode: null, // Stargazer 連携は Phase 6.D 以降
    },
    emotionHeat: EMOTION_HEAT_LOW, // detector 未実装
    materials: {
      theme: analysis.theme,
      userAId,
      userBId,
      recentTurns: messages,
      rerankedProposals: [], // ranker 連携は Phase 6.D 以降。0 件は negotiate 正常系
    },
    buildDecisionCard,
  });

  // ── proposalCard (後方互換射影) ──
  // - decision: DecisionCard はそのまま ProposalCard 互換
  // - negotiate / clarify: placeholder (summary / closing のみ、candidates=[])
  const proposalCard: ProposalCard = projectToProposalCard(dispatchResult.card);

  // ── Phase 1.5: seenCandidateKeys を算出 ──
  const seenCandidateKeys = proposalCard.candidates.map((c) =>
    candidateKey({ title: c.title, url: c.url }),
  );

  // ── 公平性スコアの推定 ──
  // 簡易版: Caring Intensityの差から推定
  // 関心が高い方の好みに寄せた場合 → その方向にbias
  const fairnessBias = (analysis.caringIntensityA - analysis.caringIntensityB) * 0.3;

  // ── Fairness Ledger に書き込み ──
  //
  // [M1 C3] この insert は session 確定後なので session_id は必ず非 null。
  //   null が入るのは activate route の onboarding seed (bias_score=0) のみ。
  //   両者は `session_id IS NULL` で識別できる。
  await supabase.from("coalter_fairness_ledger").insert({
    pair_state_id: pairStateId,
    session_id: session.id,
    bias_score: fairnessBias,
  });

  // ── セッションを completed に更新 + topic anchor 永続化（Phase 1.5.4.6） ──
  await supabase
    .from("coalter_sessions")
    .update({
      state: "completed",
      ended_at: new Date().toISOString(),
      topic_anchor_message_id: anchor?.messageId ?? null,
      topic_anchor_text: anchor?.text ?? null,
      topic_anchor_scope: anchor
        ? {
            theme: anchor.detectedScope.theme,
            timeRef: anchor.detectedScope.timeRef,
            placeRef: anchor.detectedScope.placeRef,
            confidence: anchor.detectedScope.confidence,
            anchorConfidence: anchor.confidence,
            source: anchor.source,
          }
        : null,
    })
    .eq("id", session.id);

  return {
    sessionId: session.id,
    proposalCard,
    seenCandidateKeys,
    topicAnchor: anchor,
    // Phase 6.C: 3-mode 統一出力 + trace
    card: dispatchResult.card,
    routerTrace: dispatchResult.trace,
    gateResult: dispatchResult.gate,
    executorFallbackReason: dispatchResult.executorFallbackReason,
    _internal: {
      searchDecision,
      caringIntensityA: analysis.caringIntensityA,
      caringIntensityB: analysis.caringIntensityB,
      fairnessBias,
      processingTimeMs: Date.now() - startTime,
    },
  };
}

// ─────────────────────────────────────────────
// Phase 6.C: helpers (projection + previous state fetch)
// ─────────────────────────────────────────────

/**
 * CoAlterCard を ProposalCard 形に射影する（後方互換用）。
 *
 * - decision: DecisionCard はそのまま ProposalCard + mode なので同形
 * - negotiate: NegotiateCard を summary/closing のみの stub に落とす
 *   - candidates は empty、reasoning は pieExpansion の要約
 * - clarify: ClarifyCard を summary/closing のみの stub に落とす
 *
 * 新規クライアントは `card` (discriminated union) を直接見ること。
 */
function projectToProposalCard(card: CoAlterCard): ProposalCard {
  if (card.mode === "decision") {
    // DecisionCard = ProposalCard & { mode }
    // ProposalCard が期待する形から mode を抜いた残りを返す
    const { mode: _mode, ...rest } = card;
    return rest;
  }
  if (card.mode === "negotiate") {
    // negotiate は proposals をそのまま candidates に流す（0 件可）
    const pieSummary = [
      card.pieExpansion.axisShift,
      card.pieExpansion.timeShift,
      card.pieExpansion.placeShift,
    ]
      .filter((v): v is string => v !== null)
      .join(" / ");
    return {
      summary: card.summary,
      priorities: {
        userA: card.interests.a.nonNegotiable[0] ?? "",
        userB: card.interests.b.nonNegotiable[0] ?? "",
        common: null,
      },
      candidates: card.proposals,
      reasoning: pieSummary || "方向性を整理中",
      closing: card.closing,
    };
  }
  // clarify
  return {
    summary: card.summary,
    priorities: { userA: "", userB: "", common: null },
    candidates: [],
    reasoning:
      card.pointList.facts.length > 0
        ? `事実: ${card.pointList.facts.join(" / ")}`
        : "論点整理中",
    closing: card.closing,
  };
}

/**
 * 前回の CoAlter セッションの trace から、router の previousMode 系の入力を復元する。
 *
 * - previousMode: 直前の coalter メッセージの metadata.card.mode または metadata.routerTrace.selectedMode
 * - previousClarifyTurns: 末尾の連続 clarify ターン数（最大 3 遡る）
 * - previousNegotiateNoProposal: 直前が negotiate かつ proposals=0
 * - previousTheme: 直前 invoke の card.theme（2026-04-19 soft theme continuity 用）
 *
 * 取れなければすべて初期値（null / 0 / false / null）。
 */
async function fetchPreviousCoAlterState(
  supabase: SupabaseClient,
  pairStateId: string,
): Promise<{
  previousMode: CoAlterMode | null;
  previousClarifyTurns: number;
  previousNegotiateNoProposal: boolean;
  previousTheme: ConversationTheme | null;
  /**
   * 2026-04-19 CEO 採用案 E: Loop guard
   *   直前 invoke の missingConstraints[0].key（= 直前 CoAlter がユーザーに投げた
   *   condition question の key）。同じ key を連続で再投出しないために使う。
   */
  previousClarifyKey: string | null;
}> {
  // 直近 3 件の coalter role メッセージを取得（session 単位で最新のもの）
  const { data: sessions } = await supabase
    .from("coalter_sessions")
    .select("id")
    .eq("pair_state_id", pairStateId)
    .order("created_at", { ascending: false })
    .limit(3);

  if (!sessions || sessions.length === 0) {
    return {
      previousMode: null,
      previousClarifyTurns: 0,
      previousNegotiateNoProposal: false,
      previousTheme: null,
      previousClarifyKey: null,
    };
  }

  const sessionIds = (sessions as Array<{ id: string }>).map((s) => s.id);
  const { data: msgs } = await supabase
    .from("coalter_messages")
    .select("session_id, metadata, created_at")
    .eq("role", "coalter")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: false })
    .limit(3);

  if (!msgs || msgs.length === 0) {
    return {
      previousMode: null,
      previousClarifyTurns: 0,
      previousNegotiateNoProposal: false,
      previousTheme: null,
      previousClarifyKey: null,
    };
  }

  type MsgRow = { metadata: Record<string, unknown> | null };
  const rows = msgs as MsgRow[];

  // 直前ターン
  const last = rows[0]?.metadata ?? {};
  const lastCard = (last as { card?: { mode?: string; theme?: string } }).card;
  const lastTrace = (last as { routerTrace?: { selectedMode?: string } }).routerTrace;
  const previousMode =
    (lastCard?.mode as CoAlterMode | undefined) ??
    (lastTrace?.selectedMode as CoAlterMode | undefined) ??
    null;

  // previousClarifyTurns: 末尾から clarify が続いている数を数える
  let previousClarifyTurns = 0;
  for (const r of rows) {
    const c = (r.metadata as { card?: { mode?: string } } | null)?.card;
    if (c?.mode === "clarify") {
      previousClarifyTurns++;
    } else {
      break;
    }
  }

  // previousNegotiateNoProposal: 直前が negotiate かつ proposals=0
  const lastNegotiateCard = (last as {
    card?: { mode?: string; proposals?: unknown[] };
  }).card;
  const previousNegotiateNoProposal =
    lastNegotiateCard?.mode === "negotiate" &&
    Array.isArray(lastNegotiateCard.proposals) &&
    lastNegotiateCard.proposals.length === 0;

  // previousTheme: 直前 invoke の card.theme（decision / clarify / negotiate いずれも書き込まれうる）
  // 直前ターンに theme が無ければ直近 3 件を遡って最初に見つかったものを採用する。
  // （clarify / negotiate で theme が欠落していても、少し前の decision 由来の theme を拾える）
  const ALLOWED_THEMES: ReadonlySet<ConversationTheme> = new Set([
    "movie",
    "food",
    "travel",
    "schedule",
    "gift",
    "activity",
    "general",
  ]);
  let previousTheme: ConversationTheme | null = null;
  for (const r of rows) {
    const c = (r.metadata as { card?: { theme?: string } } | null)?.card;
    const t = c?.theme;
    if (typeof t === "string" && ALLOWED_THEMES.has(t as ConversationTheme)) {
      previousTheme = t as ConversationTheme;
      break;
    }
  }

  // E: previousClarifyKey — 直前 invoke が何らかの condition question を
  // missingConstraints[0] として提示していたら、その key を拾う。
  // 直前ターンに無ければ直近 3 件を遡って最初に見つかったものを採用する。
  let previousClarifyKey: string | null = null;
  for (const r of rows) {
    const c = (r.metadata as {
      card?: { missingConstraints?: Array<{ key?: string }> };
    } | null)?.card;
    const mc = c?.missingConstraints;
    if (Array.isArray(mc) && mc.length > 0) {
      const k = mc[0]?.key;
      if (typeof k === "string" && k.length > 0) {
        previousClarifyKey = k;
        break;
      }
    }
  }

  return {
    previousMode: (previousMode as CoAlterMode | null) ?? null,
    previousClarifyTurns,
    previousNegotiateNoProposal,
    previousTheme,
    previousClarifyKey,
  };
}

// ─────────────────────────────────────────────
// 2026-04-19 CEO 採用案 C: Legacy movie candidate sanitizer
// ─────────────────────────────────────────────

/**
 * Legacy generateProposal（LLM のみの path）が吐いた候補を、
 * 映画文脈 (`previousTheme === "movie"` or `hasMovieEvidenceInMessages`) では
 * 「検証可能な URL」を持つものだけに絞る。
 *
 * movieOrchestrator (useMovieV2=true) は catalog ベースで検証済みなので対象外。
 * legacy path は LLM が作品名を幻覚する経路 (sanity #3 session f2cd5a44 実測) のため
 * 構造で出さないことを強制する。
 *
 * - 1 件以上残れば remaining candidates だけの新カードを返す
 * - 全滅した場合は candidates=[] + safe fallback summary/reasoning を設定
 *   （movieOrchestrator の rankedCount=0 fallback と同じ思想）
 */
function sanitizeLegacyMovieCandidates(
  card: ProposalCard,
  safeQuestion: import("./types").PrimaryUnresolvedQuestion | null,
  avoidKey: string | null = null,
): ProposalCard {
  // E: safeQuestion=null + avoidKey あり = 全優先が潰れた = 撤退
  const isRetreat = !safeQuestion && !!avoidKey;
  const retreatSummary =
    "条件を何度か確認したけれど、まだ決め切れるほどは揃っていませんでした。少し会話に戻して、行きやすい場所や時間帯がはっきりしたら、また CoAlter を呼んでみてください。";

  if (!card.candidates || card.candidates.length === 0) {
    // 既に 0 件。D: 条件質問を summary に差し込む（破綻質問は出さない）
    if (safeQuestion) {
      return {
        ...card,
        summary: `今の情報だと候補を絞りきれませんでした。${safeQuestion.question}`,
        missingConstraints: [
          {
            key: safeQuestion.key,
            question: safeQuestion.question,
            priority: 1,
            slot: safeQuestion.slot,
          },
        ],
      };
    }
    if (isRetreat) {
      return {
        ...card,
        summary: retreatSummary,
        missingConstraints: [],
      };
    }
    return card;
  }
  const verified = card.candidates.filter(
    (c) => typeof c.url === "string" && c.url.length > 0,
  );
  if (verified.length === card.candidates.length) {
    return card; // 全件 URL あり、sanitizer は no-op
  }
  if (verified.length === 0) {
    // 全滅 → safe fallback + 条件質問（or 撤退）
    const base: ProposalCard = {
      ...card,
      candidates: [],
      summary: safeQuestion
        ? `今の情報だと候補を絞りきれませんでした。${safeQuestion.question}`
        : isRetreat
          ? retreatSummary
          : "今の情報だけだと具体的な映画候補を自信を持って出せませんでした。上映館や時間帯をもう少し聞いてから戻ります。",
      reasoning:
        "検証可能な出典のある候補が揃わなかったため、作品名を推測で出すのを避けました。",
    };
    if (safeQuestion) {
      base.missingConstraints = [
        {
          key: safeQuestion.key,
          question: safeQuestion.question,
          priority: 1,
          slot: safeQuestion.slot,
        },
      ];
    } else if (isRetreat) {
      base.missingConstraints = [];
    }
    return base;
  }
  // 部分生存: rank を詰め直して返す（順序は保つ）
  const repacked = verified.map((c, idx) => ({ ...c, rank: idx + 1 }));
  return { ...card, candidates: repacked };
}

// ─────────────────────────────────────────────
// URL付与: 検索結果のURLをLLM候補にマッチング
// ─────────────────────────────────────────────

/**
 * LLMが生成した候補タイトルを検索結果のタイトルとファジーマッチして
 * URLを自動付与する。ワンクリックで確認できるリンクを提供するため。
 */
function attachUrlsToCandidates(
  proposal: ProposalCard,
  searchCandidates: SearchCandidate[],
): ProposalCard {
  if (searchCandidates.length === 0) return proposal;

  const updatedCandidates = proposal.candidates.map((c) => {
    if (c.url) return c; // 既にURLがある場合はスキップ

    // タイトルの類似度でマッチング
    const match = findBestUrlMatch(c.title, searchCandidates);
    return match ? { ...c, url: match } : { ...c, url: null };
  });

  return { ...proposal, candidates: updatedCandidates };
}

/** 候補タイトルに最も近い検索結果のURLを返す */
function findBestUrlMatch(
  candidateTitle: string,
  searchCandidates: SearchCandidate[],
): string | null {
  const normalizedTitle = candidateTitle.toLowerCase().replace(/[\s　]/g, "");

  let bestUrl: string | null = null;
  let bestScore = 0;

  for (const sc of searchCandidates) {
    if (!sc.url) continue;
    const normalizedSearch = sc.title.toLowerCase().replace(/[\s　]/g, "");

    // 完全一致 or 部分一致でスコアリング
    if (normalizedSearch === normalizedTitle) {
      return sc.url; // 完全一致
    }

    // 部分一致: 候補タイトルが検索タイトルに含まれる、またはその逆
    let score = 0;
    if (normalizedSearch.includes(normalizedTitle)) {
      score = normalizedTitle.length / normalizedSearch.length;
    } else if (normalizedTitle.includes(normalizedSearch)) {
      score = normalizedSearch.length / normalizedTitle.length;
    } else {
      // 単語レベルでの一致度（2文字以上の共通部分）
      const titleChars = new Set(normalizedTitle.split(""));
      const searchChars = new Set(normalizedSearch.split(""));
      const intersection = [...titleChars].filter((c) => searchChars.has(c));
      score = intersection.length / Math.max(titleChars.size, searchChars.size) * 0.5;
    }

    if (score > bestScore && score > 0.3) {
      bestScore = score;
      bestUrl = sc.url;
    }
  }

  return bestUrl;
}
