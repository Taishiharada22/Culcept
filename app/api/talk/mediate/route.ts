import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { mediate } from "@/lib/talk/intentTranslation";
import type {
  IntentTranslationProfile,
  ConversationTurn,
  RelationshipMeta,
} from "@/lib/talk/intentTranslation";
import {
  INTENT_TRANSLATION_AXES,
  MAX_MEDIATIONS_PER_DAY,
  MEDIATION_COOLDOWN_MS,
} from "@/lib/talk/intentTranslation";

// ============================================================
// POST /api/talk/mediate
//
// 共同 Alter 仲介 API — Phase 3
// 二人の会話のエスカレーションを検知し、NVC ベースの仲介提案を返す。
//
// Body:
//   threadId: string          — トークのスレッドID
//   messageId: string         — 仲介トリガーとなったメッセージID
//   mediationState?: {        — クライアント側管理の仲介状態
//     mediationsToday: number
//     lastMediationAt: string | null
//   }
// ============================================================

export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    threadId: string;
    messageId: string;
    mediationState?: { mediationsToday: number; lastMediationAt: string | null };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { threadId, messageId } = body;

  if (!threadId || !messageId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // ── 日次制限・cooldown チェック ──
  const mediationState = body.mediationState ?? { mediationsToday: 0, lastMediationAt: null };
  if (mediationState.mediationsToday >= MAX_MEDIATIONS_PER_DAY) {
    return NextResponse.json({
      decision: { shouldMediate: false, reason: "daily_limit", urgency: "low" },
      mediationState,
    });
  }
  if (mediationState.lastMediationAt) {
    const elapsed = Date.now() - new Date(mediationState.lastMediationAt).getTime();
    if (elapsed < MEDIATION_COOLDOWN_MS) {
      return NextResponse.json({
        decision: { shouldMediate: false, reason: "cooldown", urgency: "low" },
        mediationState,
      });
    }
  }

  // ── メッセージ取得 ──
  const { data: messageRow } = await supabase
    .from("talk_messages")
    .select("sender_id, body")
    .eq("id", messageId)
    .single();

  if (!messageRow?.body) {
    return NextResponse.json({ error: "message_not_found" }, { status: 404 });
  }

  // ── スレッドの参加者を特定 ──
  const { data: threadMembers } = await supabase
    .from("talk_threads")
    .select("user_a, user_b")
    .eq("id", threadId)
    .single();

  if (!threadMembers) {
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  }

  const { user_a: userA, user_b: userB } = threadMembers as { user_a: string; user_b: string };

  // ── プロファイル取得 ──
  const [profileA, profileB] = await Promise.all([
    fetchIntentProfile(supabase, userA),
    fetchIntentProfile(supabase, userB),
  ]);

  if (!profileA || !profileB) {
    return NextResponse.json({
      error: "profile_incomplete",
      detail: "双方の Stargazer プロファイルが必要です",
    }, { status: 422 });
  }

  // ── 会話履歴（直近10ターン — 仲介には Phase 1/2 より多く必要） ──
  const conversationContext = await fetchRecentTurns(supabase, threadId, 10);

  // ── 関係メタデータ ──
  const relationshipMeta = await computeRelationshipMeta(supabase, threadId, userA, userB);

  // ── 仲介実行 ──
  const result = await mediate({
    threadId,
    latestMessage: {
      senderId: messageRow.sender_id,
      body: messageRow.body,
    },
    profileA,
    profileB,
    conversationContext,
    relationshipMeta,
  });

  // 仲介が発動した場合、クライアント側の状態を更新
  const updatedMediationState = result.decision.shouldMediate && result.forSender
    ? { mediationsToday: mediationState.mediationsToday + 1, lastMediationAt: new Date().toISOString() }
    : mediationState;

  return NextResponse.json({
    forSender: result.forSender,
    forReceiver: result.forReceiver,
    sharedInsight: result.sharedInsight,
    nvcAnalysis: result.nvcAnalysis,
    escalation: result.escalation,
    decision: result.decision,
    confidence: result.confidence,
    mediationState: updatedMediationState,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ヘルパー（intent-check / intent-translate と共通パターン）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchIntentProfile(supabase: any, userId: string): Promise<IntentTranslationProfile | null> {
  const { data: rows } = await supabase
    .from("personality_dimensions")
    .select("dimension, score")
    .eq("user_id", userId)
    .in("dimension", INTENT_TRANSLATION_AXES);

  if (!rows || rows.length < 5) return null;

  const scores: Record<string, number> = {};
  for (const row of rows as Array<{ dimension: string; score: number }>) {
    scores[row.dimension] = row.score;
  }

  return {
    userId,
    direct_vs_diplomatic: scores.direct_vs_diplomatic ?? 0,
    attachment_style: scores.attachment_style ?? 0,
    reassurance_need: scores.reassurance_need ?? 0,
    emotional_variability: scores.emotional_variability ?? 0,
    conflict_style: scores.conflict_style ?? 0,
    public_private_gap: scores.public_private_gap ?? 0,
    intimacy_pace: scores.intimacy_pace ?? 0,
    boundary_awareness: scores.boundary_awareness ?? 0,
    self_disclosure_depth: scores.self_disclosure_depth ?? 0,
    emotional_regulation: scores.emotional_regulation ?? 0,
    relational_investment: scores.relational_investment ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchRecentTurns(supabase: any, threadId: string, limit: number): Promise<ConversationTurn[]> {
  const { data: messages } = await supabase
    .from("talk_messages")
    .select("sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!messages) return [];

  return (messages as Array<{ sender_id: string; body: string; created_at: string }>)
    .reverse()
    .map(m => ({
      senderId: m.sender_id,
      body: m.body ?? "",
      createdAt: m.created_at,
    }));
}

const WITHDRAWAL_SIGNALS = /(?:もういい|いい加減にし|勝手にし|好きにし|知らない|放っておいて|一人にして|疲れた|無理|しんどい)/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeRelationshipMeta(
  supabase: any,
  threadId: string,
  userA: string,
  userB: string,
): Promise<RelationshipMeta> {
  const fallback: RelationshipMeta = { category: "unknown" };

  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentMsgs } = await supabase
    .from("talk_messages")
    .select("sender_id, body, created_at")
    .eq("thread_id", threadId)
    .gte("created_at", twoWeeksAgo)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!recentMsgs || recentMsgs.length < 4) return fallback;

  const msgs = recentMsgs as Array<{ sender_id: string; body: string; created_at: string }>;

  const aMsgs = msgs.filter(m => m.sender_id === userA);
  const bMsgs = msgs.filter(m => m.sender_id === userB);

  let temperatureDelta: number | undefined;
  if (aMsgs.length >= 2 && bMsgs.length >= 2) {
    const avgA = aMsgs.reduce((s, m) => s + (m.body?.length ?? 0), 0) / aMsgs.length;
    const avgB = bMsgs.reduce((s, m) => s + (m.body?.length ?? 0), 0) / bMsgs.length;
    const maxAvg = Math.max(avgA, avgB, 1);
    temperatureDelta = (avgA - avgB) / maxAvg;
  }

  const last10 = msgs.slice(0, 10);
  const recentRupture = last10.some(m => m.body && WITHDRAWAL_SIGNALS.test(m.body));

  return {
    category: "unknown",
    temperatureDelta,
    recentRupture,
  };
}
