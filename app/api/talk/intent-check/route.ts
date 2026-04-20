import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  simulateReading,
  resolveInterventionLevel,
  updateCooldownAfterActive,
  resetConsecutiveActive,
  createFreshCooldownState,
  fetchIntentProfile,
} from "@/lib/talk/intentTranslation";
import type {
  ConversationTurn,
  RelationshipMeta,
  InterventionCooldownState,
} from "@/lib/talk/intentTranslation";

// ============================================================
// POST /api/talk/intent-check
//
// 送信前の「伝わり方チェック」API
// トーク画面の送信ボタン横 🔮 アイコンから呼ばれる。
//
// Body:
//   message: string        — 送信予定テキスト
//   threadId: string        — トークのスレッドID
//   receiverUserId: string  — 受信者のユーザーID
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
    message: string;
    threadId: string;
    receiverUserId: string;
    cooldownState?: InterventionCooldownState;
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

  const { message, threadId, receiverUserId } = body;

  if (!message?.trim() || !threadId || !receiverUserId) {
    return NextResponse.json({
      ok: false,
      code: "missing_fields",
      details: {
        hasMessage: !!message?.trim(),
        hasThreadId: !!threadId,
        hasReceiverUserId: !!receiverUserId,
        receivedKeys: Object.keys(body),
      },
    }, { status: 400 });
  }

  // Cooldown 状態: クライアントから受け取るか、新規作成
  const cooldown: InterventionCooldownState = body.cooldownState ?? createFreshCooldownState();

  // ── プロファイル取得（RLSバイパス: 他ユーザーのプロファイルも読む必要あり） ──
  const [senderProfile, receiverProfile] = await Promise.all([
    fetchIntentProfile(supabaseAdmin, user.id),
    fetchIntentProfile(supabaseAdmin, receiverUserId),
  ]);

  if (!senderProfile || !receiverProfile) {
    // プロファイル不足 → 200 + skipped で graceful skip
    // intent-check: sender = 自分(user.id), receiver = 相手(receiverUserId)
    return NextResponse.json({
      ok: true,
      skipped: true,
      skipReason: "profile_incomplete",
      interventionLevel: "none" as const,
      misreadRisk: 0,
      selfHasProfile: !!senderProfile,
      counterpartHasProfile: !!receiverProfile,
    });
  }

  // ── 会話履歴取得（直近5ターン）— admin でRLSバイパス ──
  const conversationContext = await fetchRecentTurns(supabaseAdmin, threadId, 5);

  // ── 関係メタデータ — 温度差+rupture を実データから算出 ──
  const relationshipMeta = await computeRelationshipMeta(supabaseAdmin, threadId, user.id, receiverUserId);

  // ── Reading Simulation 実行 ──
  const result = await simulateReading({
    message,
    senderProfile,
    receiverProfile,
    conversationContext,
    relationshipMeta,
  });

  // ── Cooldown を考慮した最終介入レベル ──
  const finalLevel = resolveInterventionLevel(result.interventionLevel, cooldown);
  const updatedCooldown = finalLevel === "active"
    ? updateCooldownAfterActive(cooldown)
    : resetConsecutiveActive(cooldown);

  return NextResponse.json({
    ok: true,
    misreadRisk: result.misreadRisk,
    interventionLevel: finalLevel,
    rawInterventionLevel: result.interventionLevel,
    gapDetected: result.gapDetected,
    gapType: result.gapType,
    senderIntent: result.senderIntent,
    receiverInterpretations: result.receiverInterpretations,
    rewriteSuggestion: result.rewriteSuggestion,
    confidence: result.confidence,
    ambiguousExpressions: result.ambiguousExpressions,
    keigoShift: result.keigoShift,
    cooldownState: updatedCooldown,
    riskFactors: result.riskFactors,
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

/**
 * 会話データから RelationshipMeta を実算出する。
 *
 * temperatureDelta: 直近14日間の双方のメッセージ長平均比から温度差を推定
 *   - temperatureGapDetector と同じ考え方（メッセージ長 = 投資量の proxy）
 * recentRupture: 直近10件に withdrawal パターンが含まれるか
 *   - ruptureDetection の WITHDRAWAL_PATTERNS と同系統のパターンを使用
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

  // 直近14日のメッセージを取得（温度差計算用）
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

  // ── temperatureDelta: メッセージ長平均の差を正規化 ──
  const aMsgs = msgs.filter(m => m.sender_id === userA);
  const bMsgs = msgs.filter(m => m.sender_id === userB);

  let temperatureDelta: number | undefined;
  if (aMsgs.length >= 2 && bMsgs.length >= 2) {
    const avgA = aMsgs.reduce((s, m) => s + (m.body?.length ?? 0), 0) / aMsgs.length;
    const avgB = bMsgs.reduce((s, m) => s + (m.body?.length ?? 0), 0) / bMsgs.length;
    const maxAvg = Math.max(avgA, avgB, 1);
    temperatureDelta = (avgA - avgB) / maxAvg; // -1 ~ +1
  }

  // ── recentRupture: 直近10件に withdrawal シグナルが含まれるか ──
  const last10 = msgs.slice(0, 10);
  const recentRupture = last10.some(m => m.body && WITHDRAWAL_SIGNALS.test(m.body));

  return {
    category: "unknown",
    temperatureDelta,
    recentRupture,
  };
}
