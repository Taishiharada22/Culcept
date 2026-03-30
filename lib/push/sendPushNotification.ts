/**
 * Push Notification 送信ユーティリティ
 * まずVAPID Web Push（lib/notifications/sendPush.ts）で実配信を試行。
 * VAPID未設定の場合はDBキューにフォールバック。
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPushToUser as sendRealPush } from "@/lib/notifications/sendPush";
import { scheduleDelayedNotification } from "@/lib/rendezvous/notificationScheduler";

export type PushPayload = {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
  data?: Record<string, string>;
};

/**
 * 特定ユーザーに通知を送信
 * 1. VAPID Web Push で実配信を試行
 * 2. VAPID未設定 or サブスクリプション無しの場合、DBキューにフォールバック
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  // Try real VAPID push first
  try {
    const result = await sendRealPush(userId, {
      title: payload.title,
      body: payload.body,
      url: payload.url,
      tag: payload.tag,
    });

    if (result.sent) {
      return { sent: 1, failed: 0 };
    }

    // If VAPID not configured or no subscription, fall through to DB queue
    if (result.reason !== "vapid_not_configured" && result.reason !== "no_subscription") {
      // Other failures (push_disabled, quiet_hours, etc.) — respect user preference
      return { sent: 0, failed: 0 };
    }
  } catch {
    // Real push failed — fall through to DB queue
  }

  // Fallback: DB queue for client polling
  try {
    await supabaseAdmin.from("rendezvous_notifications").insert({
      user_id: userId,
      notification_type: "push_queued",
      payload,
      status: "pending",
      scheduled_for: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
    return { sent: 1, failed: 0 };
  } catch (err) {
    console.warn("[push] DB queue fallback error:", err);
    return { sent: 0, failed: 1 };
  }
}

/**
 * Rendezvous 新マッチ通知（即時送信）
 */
export async function notifyNewMatch(
  userId: string,
  counterpartName: string,
  candidateId: string,
): Promise<void> {
  await sendPushToUser(userId, {
    title: "新しい交差を検出",
    body: `${counterpartName}との軌道が交差しました`,
    url: `/rendezvous/${candidateId}`,
    tag: `match-${candidateId}`,
  });
}

/**
 * Rendezvous 新マッチ通知（遅延版）
 * Rendezvous のコア原則: 片想い完全非表示、遅延通知(3h-24h)
 * notifyNewMatch の代わりにこちらを使うことで、ユーザー設定に応じた
 * ディレイを挿入してから通知を配信する。
 */
export async function notifyNewMatchDelayed(
  userId: string,
  counterpartName: string,
  candidateId: string,
): Promise<void> {
  await scheduleDelayedNotification(userId, "match_reveal", {
    candidateId,
    payload: { counterpartName },
  });
}

/**
 * Rendezvous 新メッセージ通知（即時送信）
 */
export async function notifyNewMessage(
  userId: string,
  senderName: string,
  candidateId: string,
  preview: string,
): Promise<void> {
  await sendPushToUser(userId, {
    title: senderName,
    body: preview.length > 60 ? preview.slice(0, 57) + "..." : preview,
    url: `/rendezvous/${candidateId}?chat=1`,
    tag: `msg-${candidateId}`,
  });
}

/**
 * Rendezvous 新メッセージ通知（遅延版）
 * ユーザー設定に応じたディレイで配信。リアルタイム性より
 * 「急かされない体験」を優先する。
 */
export async function notifyNewMessageDelayed(
  userId: string,
  senderName: string,
  candidateId: string,
  preview: string,
): Promise<void> {
  await scheduleDelayedNotification(userId, "message_received", {
    candidateId,
    payload: { senderName, preview: preview.slice(0, 60) },
  });
}

/**
 * Rendezvous Anima インサイト通知
 */
export async function notifyAnimaInsight(
  userId: string,
  insightPreview: string,
): Promise<void> {
  await sendPushToUser(userId, {
    title: "Anima からの手紙",
    body: insightPreview.length > 60 ? insightPreview.slice(0, 57) + "..." : insightPreview,
    url: "/rendezvous",
    tag: "anima-insight",
  });
}

// ═══ Stargazer Notifications ═══

/**
 * Stargazer 朝の予言配信
 */
export async function notifyDailyProphecy(
  userId: string,
  predictionPreview: string,
): Promise<void> {
  await sendPushToUser(userId, {
    title: "今日の行動予言",
    body: predictionPreview.length > 60 ? predictionPreview.slice(0, 57) + "..." : predictionPreview,
    url: "/stargazer/prophecy",
    tag: "stargazer-prophecy",
  });
}

/**
 * Stargazer 見えない自分配信
 */
export async function notifyBlindSpotDrop(
  userId: string,
  dropTitle: string,
): Promise<void> {
  await sendPushToUser(userId, {
    title: "見えない自分",
    body: dropTitle,
    url: "/stargazer/blind-spot",
    tag: "stargazer-blind-spot",
  });
}

/**
 * Stargazer 予言検証リマインダー
 */
export async function notifyVerificationReminder(
  userId: string,
): Promise<void> {
  await sendPushToUser(userId, {
    title: "今日の予言、当たった？",
    body: "今日の行動予言の結果を教えてください",
    url: "/stargazer/prophecy",
    tag: "stargazer-verification",
  });
}

/**
 * Stargazer 似た星の共鳴通知
 */
export async function notifyGhostResonance(
  userId: string,
  patternName: string,
): Promise<void> {
  await sendPushToUser(userId, {
    title: "似た星の共鳴を検出",
    body: `${patternName}と同じパターンを持つ誰かが近くにいます`,
    url: "/stargazer/ghost",
    tag: "stargazer-ghost",
  });
}

/**
 * Stargazer 朝の一問リマインダー（毎朝8時）
 */
export async function notifyMorningQuestion(
  userId: string,
  questionPreview: string,
): Promise<void> {
  await sendPushToUser(userId, {
    title: "🔭 今朝のあなたへ",
    body: questionPreview.length > 80 ? questionPreview.slice(0, 77) + "..." : questionPreview,
    url: "/stargazer",
    tag: "stargazer-morning",
  });
}

/**
 * Stargazer 消えるインサイト通知（インサイト生成時）
 */
export async function notifyVanishingInsight(
  userId: string,
  insightPreview: string,
  expiresInHours: number,
): Promise<void> {
  const preview = insightPreview.length > 60 ? insightPreview.slice(0, 57) + "..." : insightPreview;
  await sendPushToUser(userId, {
    title: "発見が届いています",
    body: `${preview}（残り${expiresInHours}時間で消えます）`,
    url: "/stargazer",
    tag: "stargazer-vanishing-insight",
  });
}

/**
 * Stargazer 精度低下警告（3日以上未観測）
 */
export async function notifyAccuracyDecay(
  userId: string,
  percentageLost: number,
  currentLevel: number,
): Promise<void> {
  await sendPushToUser(userId, {
    title: "精度が下がり始めています",
    body: `観測が途絶え、理解度が${percentageLost}%低下しました（現在${currentLevel}%）`,
    url: "/stargazer",
    tag: "stargazer-accuracy-decay",
  });
}

/**
 * Stargazer Alter余韻メッセージ（セッション後2-4時間）
 */
export async function notifyAlterAfterglow(
  userId: string,
  afterglowPreview: string,
): Promise<void> {
  await sendPushToUser(userId, {
    title: "Alter からのメッセージ",
    body: afterglowPreview.length > 80 ? afterglowPreview.slice(0, 77) + "..." : afterglowPreview,
    url: "/stargazer/alter",
    tag: "stargazer-alter-afterglow",
  });
}

/**
 * Stargazer 連続観測ストリーク通知（マイルストーン達成時）
 */
export async function notifyStreakMilestone(
  userId: string,
  streakDays: number,
  levelName: string,
): Promise<void> {
  await sendPushToUser(userId, {
    title: "連続観測を達成",
    body: `${streakDays}日連続の観測を達成しました — ${levelName}`,
    url: "/stargazer",
    tag: "stargazer-streak",
  });
}

/**
 * Stargazer 理解度マイルストーン達成
 */
export async function notifyUnderstandingMilestone(
  userId: string,
  percentage: number,
  milestoneName: string,
): Promise<void> {
  await sendPushToUser(userId, {
    title: "理解度が深まりました",
    body: `理解度${percentage}%に到達 — ${milestoneName}`,
    url: "/stargazer",
    tag: "stargazer-understanding",
  });
}

/**
 * Stargazer 修正宣言通知（理解の修正が発生した時）
 */
export async function notifyRevisionAvailable(
  userId: string,
  revisionPreview: string,
): Promise<void> {
  await sendPushToUser(userId, {
    title: "あなたの理解が更新されました",
    body: revisionPreview.length > 80 ? revisionPreview.slice(0, 77) + "..." : revisionPreview,
    url: "/stargazer",
    tag: "stargazer-revision",
  });
}

/**
 * Stargazer 予報的中フォローアップ
 */
export async function notifyPredictionHit(
  userId: string,
  predictionText: string,
  hitRate: number,
): Promise<void> {
  const preview = predictionText.length > 50 ? predictionText.slice(0, 47) + "..." : predictionText;
  await sendPushToUser(userId, {
    title: "予測が的中しました",
    body: `「${preview}」— 現在の的中率${hitRate}%`,
    url: "/stargazer/prophecy",
    tag: "stargazer-prediction-hit",
  });
}
