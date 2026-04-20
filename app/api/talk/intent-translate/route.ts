import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  reconstructIntent,
  fetchIntentProfile,
} from "@/lib/talk/intentTranslation";
import type {
  ConversationTurn,
  SenderPastPattern,
  BubbleHintDecision,
  RelationshipMeta,
} from "@/lib/talk/intentTranslation";
import {
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
    return NextResponse.json({
      ok: false,
      code: "unauthorized",
      details: { reason: "No authenticated user session" },
    }, { status: 401 });
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
    return NextResponse.json({
      ok: false,
      code: "invalid_body",
      details: { reason: "Request body is not valid JSON" },
    }, { status: 400 });
  }

  const { messageId, threadId, senderUserId } = body;

  if (!messageId || !threadId || !senderUserId) {
    return NextResponse.json({
      ok: false,
      code: "missing_fields",
      details: {
        hasMessageId: !!messageId,
        hasThreadId: !!threadId,
        hasSenderUserId: !!senderUserId,
        receivedKeys: Object.keys(body),
        receivedValues: {
          messageId: messageId ?? null,
          threadId: threadId ?? null,
          senderUserId: senderUserId ?? null,
        },
      },
    }, { status: 400 });
  }

  // 自分自身のメッセージに対して呼ばれていないか確認
  if (senderUserId === user.id) {
    return NextResponse.json({
      ok: false,
      code: "self_message_translate",
      details: {
        reason: "Cannot translate own message — intent-translate is for received messages only",
        senderUserId,
        currentUserId: user.id,
        messageId,
        threadId,
      },
    }, { status: 422 });
  }

  // 💭表示の日次制限・cooldown チェック
  const bubbleState = body.bubbleState ?? { hintsShownToday: 0, lastHintAt: null };
  const dailyLimitReached = bubbleState.hintsShownToday >= MAX_BUBBLE_HINTS_PER_DAY;
  const inBubbleCooldown = bubbleState.lastHintAt
    ? (Date.now() - new Date(bubbleState.lastHintAt).getTime()) < BUBBLE_HINT_COOLDOWN_MS
    : false;

  // ── 受信メッセージ本文を取得（admin: RLSバイパス） ──
  const { data: messageRow, error: msgError } = await supabaseAdmin
    .from("talk_messages")
    .select("body, sender_id")
    .eq("id", messageId)
    .single();

  if (!messageRow?.body) {
    return NextResponse.json({
      ok: false,
      code: "message_not_found",
      details: {
        messageId,
        threadId,
        dbError: msgError?.message ?? null,
        hasRow: !!messageRow,
        hasBody: !!messageRow?.body,
        actualSenderId: messageRow?.sender_id ?? null,
        expectedSenderId: senderUserId,
      },
    }, { status: 404 });
  }

  // sender_id 整合性チェック（DB上の送信者 ≠ リクエストの senderUserId なら不整合）
  if (messageRow.sender_id && messageRow.sender_id !== senderUserId) {
    return NextResponse.json({
      ok: false,
      code: "sender_mismatch",
      details: {
        reason: "Message sender_id does not match provided senderUserId",
        messageId,
        actualSenderId: messageRow.sender_id,
        providedSenderUserId: senderUserId,
        currentUserId: user.id,
      },
    }, { status: 422 });
  }

  // ── プロファイル取得（RLSバイパス: 他ユーザーのプロファイルも読む必要あり） ──
  const [senderProfile, receiverProfile] = await Promise.all([
    fetchIntentProfile(supabaseAdmin, senderUserId),
    fetchIntentProfile(supabaseAdmin, user.id),
  ]);

  if (!senderProfile || !receiverProfile) {
    // プロファイル不足 → 200 + skipped で graceful skip
    // intent-translate: sender = 相手(senderUserId), receiver = 自分(user.id)
    return NextResponse.json({
      ok: true,
      skipped: true,
      skipReason: "profile_incomplete",
      bubbleHint: { show: false, skipReason: "profile_incomplete" },
      bubbleState: body.bubbleState ?? { hintsShownToday: 0, lastHintAt: null },
      selfHasProfile: !!receiverProfile,       // receiver = 自分
      counterpartHasProfile: !!senderProfile,   // sender = 相手
    });
  }

  // ── 会話履歴（直近5ターン）— admin でRLSバイパス ──
  const conversationContext = await fetchRecentTurns(supabaseAdmin, threadId, 5);

  // ── 送信者の過去パターン（同一スレッド内の類似短文） ──
  const senderPastPatterns = await fetchSenderPatterns(supabaseAdmin, threadId, senderUserId);

  // ── 関係メタデータ — 温度差+rupture を実データから算出 ──
  const relationshipMeta = await computeRelationshipMeta(supabaseAdmin, threadId, senderUserId, user.id);

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
    ok: true,
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
