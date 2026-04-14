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
} from "./types";
import { loadPairProfiles } from "./profileLoader";
import { fetchRecentMessages, analyzeConversation } from "./conversationParser";
import { decideSearch, searchAndFilter } from "./webConnector";
import { generateProposal } from "./proposalGenerator";

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

  const analysis = analyzeConversation(messages, userAId, userBId);

  // ── L4: 外部接続（Adaptive RAG） ──
  const searchDecision = decideSearch(analysis);
  const searchCandidates = searchDecision.shouldSearch
    ? await searchAndFilter(searchDecision, profileA, profileB)
    : [];

  // ── L5: 提案生成 ──
  const proposalCard = await generateProposal(
    profileA,
    profileB,
    analysis,
    searchCandidates,
    relationship,
    input.userMessage,
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

  // ── セッションを completed に更新 ──
  await supabase
    .from("coalter_sessions")
    .update({ state: "completed", ended_at: new Date().toISOString() })
    .eq("id", session.id);

  return {
    sessionId: session.id,
    proposalCard,
    _internal: {
      searchDecision,
      caringIntensityA: analysis.caringIntensityA,
      caringIntensityB: analysis.caringIntensityB,
      fairnessBias,
      processingTimeMs: Date.now() - startTime,
    },
  };
}
