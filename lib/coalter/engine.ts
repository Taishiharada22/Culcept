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
} from "./types";
import { loadPairProfiles } from "./profileLoader";
import { fetchRecentMessages, analyzeConversation } from "./conversationParser";
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
  const { data: ledgerRows } = await supabase
    .from("coalter_fairness_ledger")
    .select("session_id, bias_score, decided_at")
    .eq("pair_state_id", pairStateId)
    .order("decided_at", { ascending: false })
    .limit(10);

  const fairnessLedger: FairnessEntry[] = (ledgerRows ?? []).map(
    (r: { session_id: string; bias_score: number; decided_at: string }) => ({
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

  // ── L3: 会話解析（L2と並列で実行） ──
  const [messages, relationship] = await Promise.all([
    fetchRecentMessages(supabase, input.threadId, 20),
    buildRelationshipContext(supabase, pairStateId, profileA, profileB),
  ]);

  // Phase 1.5.4.6: topic anchor を構築（起動直前 or userMessage）
  // 既存セッションに永続化された anchor があれば優先、無ければ新規構築
  const anchor: TopicAnchor | null =
    options?.topicAnchor ?? buildTopicAnchor(messages, input.userMessage);

  const analysis = analyzeConversation(messages, userAId, userBId, {
    topicAnchor: anchor ?? undefined,
  });

  // ── L4: 外部接続（Adaptive RAG） ──
  const searchDecision = decideSearch(analysis);
  const searchCandidates = searchDecision.shouldSearch
    ? await searchAndFilter(searchDecision, profileA, profileB)
    : [];

  // ── L5: 提案生成 ──
  // 2026-04-18: movie テーマは 4-layer 再設計パイプライン (movieOrchestrator) に切替
  // 2026-04-19 Phase B Commit 3: food テーマも 4-layer パイプライン (foodOrchestrator) に切替
  // それ以外のテーマは従来の generateProposal を継続使用
  const useMovieV2 = analysis.theme === "movie";
  const useFoodV2 = analysis.theme === "food";
  let rawProposal: ProposalCard;
  if (useMovieV2) {
    const movieResult = await generateMovieProposalV2({
      turns: messages,
      analysis,
      searchCandidates,
      profileA,
      profileB,
      relationship,
      avoidKeys: options?.avoidKeys,
      pendingDeltas: options?.pendingDeltas,
      sessionId: session.id,
      userId: input.invokedBy,
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
        searchCandidates,
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
        searchCandidates,
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
      searchCandidates,
      relationship,
      input.userMessage,
      options,
    );
  }

  // ── URL付与: LLMが生成した候補に検索結果のURLを紐付け ──
  const withUrls = attachUrlsToCandidates(rawProposal, searchCandidates);

  // ── Phase 1.5: decisionState を付与 ──
  // options があれば pivoting（既に軸を動かしている最中）、なければ draft（初回）
  const decisionState: "draft" | "pivoting" =
    options?.pendingDeltas && Object.keys(options.pendingDeltas).length > 0
      ? "pivoting"
      : "draft";
  const proposalCard: ProposalCard = { ...withUrls, decisionState };

  // ── Phase 1.5: seenCandidateKeys を算出 ──
  const seenCandidateKeys = proposalCard.candidates.map((c) =>
    candidateKey({ title: c.title, url: c.url }),
  );

  // ── 公平性スコアの推定 ──
  // 簡易版: Caring Intensityの差から推定
  // 関心が高い方の好みに寄せた場合 → その方向にbias
  const fairnessBias = (analysis.caringIntensityA - analysis.caringIntensityB) * 0.3;

  // ── Fairness Ledger に書き込み ──
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
