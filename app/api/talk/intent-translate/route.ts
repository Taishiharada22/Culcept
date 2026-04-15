import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { reconstructIntent } from "@/lib/talk/intentTranslation";
import type {
  IntentTranslationProfile,
  ConversationTurn,
  SenderPastPattern,
  BubbleHintDecision,
  RelationshipMeta,
} from "@/lib/talk/intentTranslation";
import {
  INTENT_TRANSLATION_AXES,
  MAX_BUBBLE_HINTS_PER_DAY,
  BUBBLE_HINT_COOLDOWN_MS,
} from "@/lib/talk/intentTranslation";

// ============================================================
// POST /api/talk/intent-translate
//
// 受信側の「意図翻訳」API — Phase 2
// 受信メッセージの送信者意図を推定し、💭バブル表示を判定する。
//
// Body:
//   messageId: string         — 受信メッセージID
//   threadId: string          — トークのスレッドID
//   senderUserId: string      — 送信者のユーザーID
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
    messageId: string;
    threadId: string;
    senderUserId: string;
    /** クライアント側で管理する💭表示状態 */
    bubbleState?: { hintsShownToday: number; lastHintAt: string | null };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { messageId, threadId, senderUserId } = body;

  if (!messageId || !threadId || !senderUserId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // 💭表示の日次制限・cooldown チェック
  const bubbleState = body.bubbleState ?? { hintsShownToday: 0, lastHintAt: null };
  const dailyLimitReached = bubbleState.hintsShownToday >= MAX_BUBBLE_HINTS_PER_DAY;
  const inBubbleCooldown = bubbleState.lastHintAt
    ? (Date.now() - new Date(bubbleState.lastHintAt).getTime()) < BUBBLE_HINT_COOLDOWN_MS
    : false;

  // ── 受信メッセージ本文を取得 ──
  const { data: messageRow } = await supabase
    .from("talk_messages")
    .select("body")
    .eq("id", messageId)
    .single();

  if (!messageRow?.body) {
    return NextResponse.json({ error: "message_not_found" }, { status: 404 });
  }

  // ── プロファイル取得（送信者 + 受信者=自分） ──
  const [senderProfile, receiverProfile] = await Promise.all([
    fetchIntentProfile(supabase, senderUserId),
    fetchIntentProfile(supabase, user.id),
  ]);

  if (!senderProfile || !receiverProfile) {
    return NextResponse.json({
      error: "profile_incomplete",
      detail: "双方の Stargazer プロファイルが必要です",
    }, { status: 422 });
  }

  // ── 会話履歴（直近5ターン） ──
  const conversationContext = await fetchRecentTurns(supabase, threadId, 5);

  // ── 送信者の過去パターン（同一スレッド内の類似短文） ──
  const senderPastPatterns = await fetchSenderPatterns(supabase, threadId, senderUserId);

  // ── 関係メタデータ — 温度差+rupture を実データから算出 ──
  const relationshipMeta = await computeRelationshipMeta(supabase, threadId, senderUserId, user.id);

  // ── Intent Reconstruction 実行 ──
  const result = await reconstructIntent({
    receivedMessage: messageRow.body,
    senderProfile,
    receiverProfile,
    conversationContext,
    senderPastPatterns,
    relationshipMeta,
  });

  // ── 日次制限・cooldown をエンジン結果に上書き ──
  let finalBubbleHint: BubbleHintDecision = result.bubbleHint;
  if (result.bubbleHint.show && dailyLimitReached) {
    finalBubbleHint = { ...result.bubbleHint, show: false, skipReason: "daily_limit_reached" };
  } else if (result.bubbleHint.show && inBubbleCooldown) {
    finalBubbleHint = { ...result.bubbleHint, show: false, skipReason: "cooldown" };
  }

  // 💭を表示した場合、クライアントに更新状態を返す
  const updatedBubbleState = finalBubbleHint.show
    ? { hintsShownToday: bubbleState.hintsShownToday + 1, lastHintAt: new Date().toISOString() }
    : bubbleState;

  return NextResponse.json({
    primaryIntent: result.primaryIntent,
    alternativeIntents: result.alternativeIntents,
    contextNote: result.contextNote,
    senderStyleNote: result.senderStyleNote,
    suggestAskSender: result.suggestAskSender,
    confidence: result.confidence,
    bubbleHint: finalBubbleHint,
    bubbleState: updatedBubbleState,
    ambiguousExpressions: result.ambiguousExpressions,
    keigoShift: result.keigoShift,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ヘルパー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchIntentProfile(supabase: any, userId: string): Promise<IntentTranslationProfile | null> {
  // personality_dimensions → stargazer_axis_snapshots にフォールバック
  const { data: rows } = await supabase
    .from("personality_dimensions")
    .select("dimension, score")
    .eq("user_id", userId)
    .in("dimension", INTENT_TRANSLATION_AXES);

  let scores: Record<string, number> = {};

  if (rows && rows.length >= 5) {
    for (const row of rows as Array<{ dimension: string; score: number }>) {
      scores[row.dimension] = row.score;
    }
  } else {
    // フォールバック: stargazer_axis_snapshots から最新スコアを取得
    const { data: snapshots } = await supabase
      .from("stargazer_axis_snapshots")
      .select("axis_id, score")
      .eq("user_id", userId)
      .in("axis_id", INTENT_TRANSLATION_AXES)
      .order("created_at", { ascending: false });

    if (!snapshots || snapshots.length === 0) return null;

    // 各軸の最新スコアのみ採用（重複排除）
    for (const s of snapshots as Array<{ axis_id: string; score: number }>) {
      if (!(s.axis_id in scores)) {
        scores[s.axis_id] = s.score;
      }
    }
    if (Object.keys(scores).length < 5) return null;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchSenderPatterns(supabase: any, threadId: string, senderUserId: string): Promise<SenderPastPattern[]> {
  // 送信者の短文メッセージ（曖昧になりやすい）の過去パターンを取得
  // 前後1件のメッセージを context として取得し、outcome を推定する
  const { data: messages } = await supabase
    .from("talk_messages")
    .select("id, sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (!messages) return [];

  const allMsgs = messages as Array<{ id: string; sender_id: string; body: string; created_at: string }>;

  // 送信者の短文を探し、前後のメッセージから文脈と結果を構築
  const patterns: SenderPastPattern[] = [];

  for (let i = 0; i < allMsgs.length; i++) {
    const msg = allMsgs[i];
    if (msg.sender_id !== senderUserId) continue;
    if (!msg.body || msg.body.length > 15) continue;

    // 直前のメッセージ = context
    const prev = i > 0 ? allMsgs[i - 1] : null;
    const contextSummary = prev
      ? `相手の「${prev.body?.slice(0, 20)}${(prev.body?.length ?? 0) > 20 ? "..." : ""}」への返答`
      : "会話の冒頭";

    // 直後のメッセージ = outcome（相手がどう反応したか）
    const next = i < allMsgs.length - 1 ? allMsgs[i + 1] : null;
    const outcome = next && next.sender_id !== senderUserId
      ? `相手の反応: 「${next.body?.slice(0, 25)}${(next.body?.length ?? 0) > 25 ? "..." : ""}」`
      : "相手の反応なし";

    patterns.push({ message: msg.body, contextSummary, outcome });
  }

  // 直近3件を返す
  return patterns.slice(-3);
}

/**
 * 会話データから RelationshipMeta を実算出する。
 * （intent-check と同一ロジック）
 */
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
