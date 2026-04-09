import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPartnerGate } from "@/lib/rendezvous/verificationLevel";
import { fetchVerificationProfile } from "@/lib/rendezvous/fetchVerificationProfile";

export const runtime = "nodejs";

/**
 * GET /api/rendezvous/[candidateId]/chat
 * Fetch chat messages for a candidate's thread.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the candidate belongs to this user and is in a chat state
  const { data: candidate } = await supabaseAdmin
    .from("rendezvous_candidates")
    .select("id, user_a, user_b, state")
    .eq("id", candidateId)
    .single();

  if (!candidate) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (candidate.user_a !== user.id && candidate.user_b !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (candidate.state !== "mutual_liked" && candidate.state !== "chat_opened") {
    return NextResponse.json({ error: "Chat not available" }, { status: 400 });
  }

  // Get the chat thread
  const { data: chat } = await supabaseAdmin
    .from("rendezvous_chats")
    .select("thread_id")
    .eq("candidate_id", candidateId)
    .maybeSingle();

  if (!chat?.thread_id) {
    return NextResponse.json({ messages: [], threadId: null });
  }

  // Fetch messages
  const { data: messages, error: msgErr } = await supabaseAdmin
    .from("rendezvous_messages")
    .select("id, sender_id, body, message_type, media_url, media_metadata, created_at")
    .eq("thread_id", chat.thread_id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  // Mark unread messages from counterpart as read (fire-and-forget)
  const readAt = new Date().toISOString();
  supabaseAdmin
    .from("rendezvous_messages")
    .update({ read_at: readAt })
    .eq("thread_id", chat.thread_id)
    .neq("sender_id", user.id)
    .is("read_at", null)
    .then(() => {
      // Broadcast read receipt via Realtime (fire-and-forget)
      supabaseAdmin
        .channel(`chat:${chat.thread_id}`)
        .send({
          type: "broadcast",
          event: "read_receipt",
          payload: { readBy: user.id, readAt },
        })
        .catch(() => {});
    });

  return NextResponse.json({
    messages: messages ?? [],
    threadId: chat.thread_id,
    myUserId: user.id,
  });
}

/**
 * PATCH /api/rendezvous/[candidateId]/chat
 * Mark all messages as read for this candidate.
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get thread
  const { data: chat } = await supabaseAdmin
    .from("rendezvous_chats")
    .select("thread_id")
    .eq("candidate_id", candidateId)
    .maybeSingle();

  if (!chat?.thread_id) {
    return NextResponse.json({ ok: true, marked: 0 });
  }

  // Count unread first
  const { count } = await supabaseAdmin
    .from("rendezvous_messages")
    .select("*", { count: "exact", head: true })
    .eq("thread_id", chat.thread_id)
    .neq("sender_id", user.id)
    .is("read_at", null);

  // Mark as read
  const patchReadAt = new Date().toISOString();
  await supabaseAdmin
    .from("rendezvous_messages")
    .update({ read_at: patchReadAt })
    .eq("thread_id", chat.thread_id)
    .neq("sender_id", user.id)
    .is("read_at", null);

  // Broadcast read receipt via Realtime (fire-and-forget)
  if (count && count > 0) {
    supabaseAdmin
      .channel(`chat:${chat.thread_id}`)
      .send({
        type: "broadcast",
        event: "read_receipt",
        payload: { readBy: user.id, readAt: patchReadAt, count },
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true, marked: count ?? 0, readAt: patchReadAt });
}

/**
 * POST /api/rendezvous/[candidateId]/chat
 * Send a message in the candidate's chat thread.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const messageBody = String(body?.body ?? "").trim();

  if (!messageBody || messageBody.length > 2000) {
    return NextResponse.json(
      { error: "Message body required (max 2000 chars)" },
      { status: 400 },
    );
  }

  // Verify candidate belongs to user
  const { data: candidate } = await supabaseAdmin
    .from("rendezvous_candidates")
    .select("id, user_a, user_b, state, category")
    .eq("id", candidateId)
    .single();

  if (!candidate) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Partner gate check: L3 + review_status=approved required for chat
  if (candidate.category === "partner") {
    const vProfile = await fetchVerificationProfile(supabaseAdmin, user.id);
    const gate = checkPartnerGate("chat", vProfile);
    if (!gate.allowed) {
      return NextResponse.json(
        { ok: false, error: gate.reason, requiredLevel: gate.requiredLevel, currentLevel: gate.currentLevel },
        { status: 403 },
      );
    }
  }

  if (candidate.user_a !== user.id && candidate.user_b !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (candidate.state !== "mutual_liked" && candidate.state !== "chat_opened") {
    return NextResponse.json({ error: "Chat not available" }, { status: 400 });
  }

  // Get thread
  const { data: chat } = await supabaseAdmin
    .from("rendezvous_chats")
    .select("thread_id")
    .eq("candidate_id", candidateId)
    .maybeSingle();

  if (!chat?.thread_id) {
    return NextResponse.json({ error: "No chat thread" }, { status: 400 });
  }

  // Insert message
  const { data: msg, error: insertErr } = await supabaseAdmin
    .from("rendezvous_messages")
    .insert({
      thread_id: chat.thread_id,
      candidate_id: candidateId,
      sender_id: user.id,
      body: messageBody,
      message_type: "text",
    })
    .select("id, sender_id, body, message_type, media_url, media_metadata, created_at")
    .single();

  if (insertErr) {
    console.error("[rendezvous/chat] insert error:", insertErr);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Orbiter Signal: chat_message_sent (fire-and-forget)
  await supabaseAdmin
    .from("orbiter_signals")
    .insert({
      user_id: user.id,
      candidate_id: candidateId,
      signal_type: "chat_message_sent",
      payload: { threadId: chat.thread_id },
    }); // fire-and-forget

  // ── 安全シグナル検出（fire-and-forget） ──
  // メッセージ送受信数をカウントして安全チェック
  Promise.all([
    supabaseAdmin
      .from("rendezvous_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", chat.thread_id)
      .eq("sender_id", user.id),
    supabaseAdmin
      .from("rendezvous_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", chat.thread_id)
      .neq("sender_id", user.id),
  ]).then(async ([sentRes, recvRes]) => {
    const sent = sentRes.count ?? 0;
    const received = recvRes.count ?? 0;
    const { evaluateSafetySignals, determineAction } = await import("@/lib/rendezvous/safetySignals");
    const counterpartId = candidate.user_a === user.id ? candidate.user_b : candidate.user_a;
    const signals = evaluateSafetySignals(user.id, {
      totalSwipes24h: 0,
      likeCount24h: 0,
      passCount24h: 0,
      messageCountPerCandidate: {
        [candidateId]: { sent, received, lastSentAt: new Date().toISOString() },
      },
      reportCount: 0,
      reporterCount: 0,
      mutualLikeCount: 0,
      chatOpenedCount: 1,
      chatRespondedCount: received > 0 ? 1 : 0,
    });
    const action = determineAction(signals);
    if (action !== "none") {
      // 安全シグナルをOrbiterに記録
      await supabaseAdmin
        .from("orbiter_signals")
        .insert({
          user_id: user.id,
          candidate_id: candidateId,
          signal_type: `safety_${action}`,
          payload: { signals: signals.map((s) => s.type), action },
        });

      // ── アクション実行 ──
      if (action === "warn") {
        // ユーザーに警告フラグを立てる（次回チャット表示時にUI側で警告表示）
        await supabaseAdmin
          .from("rendezvous_user_states")
          .update({ safety_warning: true, safety_warning_type: "behavioral_concern" })
          .eq("candidate_id", candidateId)
          .eq("user_id", counterpartId);
      } else if (action === "hold") {
        // チャットを一時停止（24時間クーリングオフ）
        await supabaseAdmin
          .from("rendezvous_candidates")
          .update({
            chat_paused_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            chat_pause_reason: "safety_hold",
          })
          .eq("id", candidateId);
      } else if (action === "block") {
        // 即時ブロック + アカウントフラグ
        await Promise.all([
          supabaseAdmin
            .from("rendezvous_candidates")
            .update({ status: "blocked", blocked_by: "system", blocked_reason: "safety_auto" })
            .eq("id", candidateId),
          supabaseAdmin
            .from("rendezvous_profiles")
            .update({ safety_flag: true, safety_flag_at: new Date().toISOString() })
            .eq("user_id", user.id),
        ]);
      }

      // ── Counselor 通知フック（C7）──
      // warn/hold/block いずれもCounselorに通知し、Dashboard で警告表示可能にする
      const { buildCounselorAlert, notifyCounselorSafety } = await import(
        "@/lib/rendezvous/counselor/safetyBridge"
      );
      const alert = buildCounselorAlert({
        candidateId,
        triggeredByUserId: user.id,
        protectedUserId: counterpartId,
        signals,
        action: action as "warn" | "hold" | "block",
      });
      await notifyCounselorSafety(supabaseAdmin, alert).catch(() => {
        // fail-open: Counselor通知の失敗でチャットを止めない
      });
    }
  }).catch((err) => {
    console.error("[chat] Safety signal evaluation error:", err);
  });

  // Update candidate state to chat_opened if still mutual_liked
  if (candidate.state === "mutual_liked") {
    await supabaseAdmin
      .from("rendezvous_candidates")
      .update({ state: "chat_opened" })
      .eq("id", candidateId)
      .eq("state", "mutual_liked");
  }

  // Push notification to counterpart (fire-and-forget)
  try {
    const counterpartId = candidate.user_a === user.id ? candidate.user_b : candidate.user_a;
    const { data: senderProfile } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    const { notifyNewMessageDelayed } = await import("@/lib/push/sendPushNotification");
    notifyNewMessageDelayed(
      counterpartId,
      senderProfile?.display_name ?? "相手",
      candidateId,
      messageBody,
    ).catch(() => {}); // fire-and-forget via delayed scheduler
  } catch {
    // Push notification failure is non-critical
  }

  return NextResponse.json({ ok: true, message: msg });
}
