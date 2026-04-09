import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { BehaviorSignals } from "./counselor/selfDiscoveryFeedback";

// ============================================================
// Behavior Signal Collector
//
// チャットメッセージから行動シグナルを算出する。
// Self-Discovery Feedback のギャップ検出に使用。
//
// 設計根拠（Part 2 §1.4）:
//   ユーザーの自己報告と行動観測データのズレが
//   最も価値の高い観測データ。
//
// 参照: app/api/rendezvous/[candidateId]/season/route.ts
//   既存の computeResponseTimes / computeInitiationBalance パターンを再利用。
// ============================================================

/**
 * candidateId のチャットメッセージから BehaviorSignals を算出する。
 * メッセージが不足している場合は null を返す。
 */
export async function collectBehaviorSignals(params: {
  candidateId: string;
  userId: string;
}): Promise<BehaviorSignals | null> {
  const { candidateId, userId } = params;

  // 直近14日分のメッセージを取得
  const fourteenDaysAgo = new Date(
    Date.now() - 14 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: messages } = await supabaseAdmin
    .from("rendezvous_messages")
    .select("id, sender_id, created_at, body")
    .eq("candidate_id", candidateId)
    .gte("created_at", fourteenDaysAgo)
    .order("created_at", { ascending: true });

  const msgs = messages ?? [];
  if (msgs.length < 4) {
    // メッセージ不足 — シグナル算出に最低限の会話が必要
    return null;
  }

  // ── 返信時間（前半 vs 後半）──
  const midpoint = Math.floor(msgs.length / 2);
  const firstHalf = msgs.slice(0, midpoint);
  const secondHalf = msgs.slice(midpoint);

  const replyTimesFirst = computeReplyTimes(firstHalf, userId);
  const replyTimesSecond = computeReplyTimes(secondHalf, userId);

  const avgReplyTimeFirstHalf =
    replyTimesFirst.length > 0
      ? replyTimesFirst.reduce((a, b) => a + b, 0) / replyTimesFirst.length
      : undefined;
  const avgReplyTimeSecondHalf =
    replyTimesSecond.length > 0
      ? replyTimesSecond.reduce((a, b) => a + b, 0) / replyTimesSecond.length
      : undefined;

  // ── 質問数（? / ？ を含むメッセージ）──
  const userMsgs = msgs.filter((m) => m.sender_id === userId);
  const otherMsgs = msgs.filter((m) => m.sender_id !== userId);

  const questionCount = countQuestions(userMsgs);
  const counterpartQuestionCount = countQuestions(otherMsgs);

  // ── 絵文字使用率 ──
  const emojiRate = computeEmojiRate(userMsgs);

  // ── 主導権比率（4h+ ギャップ後の発言者）──
  const initiativeRatio = computeInitiativeRatio(msgs, userId);

  return {
    avgReplyTimeFirstHalf,
    avgReplyTimeSecondHalf,
    questionCount,
    counterpartQuestionCount,
    emojiRate,
    initiativeRatio,
  };
}

// ── 内部ヘルパー ──

/**
 * 交互の送信者間の返信時間を秒単位で算出する。
 */
function computeReplyTimes(
  messages: { sender_id: string; created_at: string }[],
  userId: string,
): number[] {
  const times: number[] = [];
  for (let i = 1; i < messages.length; i++) {
    // ユーザーが相手に返信した場合のみ計測
    if (
      messages[i].sender_id === userId &&
      messages[i - 1].sender_id !== userId
    ) {
      const diffSec =
        (new Date(messages[i].created_at).getTime() -
          new Date(messages[i - 1].created_at).getTime()) /
        1000;
      // 1秒〜24時間の範囲のみ有効
      if (diffSec > 1 && diffSec < 86400) {
        times.push(diffSec);
      }
    }
  }
  return times;
}

/**
 * ? または ？ を含むメッセージ数をカウント。
 */
function countQuestions(
  messages: { body?: string | null }[],
): number {
  return messages.filter((m) => {
    const body = m.body ?? "";
    return body.includes("?") || body.includes("\uFF1F");
  }).length;
}

/**
 * ユーザーメッセージの絵文字使用率（0-1）。
 */
function computeEmojiRate(
  messages: { body?: string | null }[],
): number {
  if (messages.length === 0) return 0;

  const emojiRegex =
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu;

  let messagesWithEmoji = 0;
  for (const m of messages) {
    const body = m.body ?? "";
    if (emojiRegex.test(body)) {
      messagesWithEmoji++;
    }
    // Reset regex lastIndex for global flag
    emojiRegex.lastIndex = 0;
  }

  return messagesWithEmoji / messages.length;
}

/**
 * 主導権比率: 4h+ ギャップ後の最初の発言者をカウント。
 * 0 = 完全受動, 0.5 = バランス, 1 = 完全能動。
 */
function computeInitiativeRatio(
  messages: { sender_id: string; created_at: string }[],
  userId: string,
): number {
  if (messages.length === 0) return 0.5;

  const GAP_MS = 4 * 60 * 60 * 1000; // 4 hours
  let userInitiations = 0;
  let totalInitiations = 0;

  // 最初のメッセージも initiation としてカウント
  totalInitiations++;
  if (messages[0].sender_id === userId) userInitiations++;

  for (let i = 1; i < messages.length; i++) {
    const gap =
      new Date(messages[i].created_at).getTime() -
      new Date(messages[i - 1].created_at).getTime();
    if (gap >= GAP_MS) {
      totalInitiations++;
      if (messages[i].sender_id === userId) userInitiations++;
    }
  }

  if (totalInitiations === 0) return 0.5;
  return userInitiations / totalInitiations;
}
