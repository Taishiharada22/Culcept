// ============================================================
// Avatar Activity Scheduler
// ============================================================

import type { RendezvousCategory } from "./types";
import type { AvatarConversation } from "./avatarLiveEngine";

// ---------- Types ----------

export type ActivityType =
  | "explore"
  | "continue_conversation"
  | "flash_event"
  | "deep_conversation";

export type TimeSlot =
  | "dawn"
  | "morning"
  | "midday"
  | "afternoon"
  | "evening"
  | "night";

export type ScheduledActivity = {
  id: string;
  user_id: string;
  scheduled_at: string; // ISO 8601
  activity_type: ActivityType;
  target_category: RendezvousCategory;
  target_candidate_id: string | null;
  status: "pending" | "active" | "completed" | "skipped";
};

// ---------- Time Slot Configuration ----------

/** JST-based time slot boundaries (hours) */
const TIME_SLOT_RANGES: Record<TimeSlot, [number, number]> = {
  dawn: [5, 7],
  morning: [7, 11],
  midday: [11, 14],
  afternoon: [14, 17],
  evening: [17, 21],
  night: [21, 25], // 25 = 1:00 next day
};

const TIME_SLOT_ORDER: TimeSlot[] = [
  "dawn",
  "morning",
  "midday",
  "afternoon",
  "evening",
  "night",
];

/** Activity weights per time slot (what's natural when) */
const SLOT_ACTIVITY_WEIGHTS: Record<
  TimeSlot,
  Partial<Record<ActivityType, number>>
> = {
  dawn: { explore: 0.8, deep_conversation: 0.2 },
  morning: { explore: 0.5, continue_conversation: 0.3, deep_conversation: 0.2 },
  midday: { flash_event: 0.5, continue_conversation: 0.3, explore: 0.2 },
  afternoon: { continue_conversation: 0.4, explore: 0.3, deep_conversation: 0.3 },
  evening: { deep_conversation: 0.4, continue_conversation: 0.4, explore: 0.2 },
  night: { deep_conversation: 0.5, continue_conversation: 0.3, explore: 0.2 },
};

// ---------- Functions ----------

/**
 * JST での現在のタイムスロットを返す
 */
export function getCurrentTimeSlot(): TimeSlot {
  const nowJST = getJSTHour();
  return getTimeSlotForHour(nowJST);
}

/**
 * 1日分のアバターアクティビティスケジュールを生成
 */
export function generateDailySchedule(
  userId: string,
  activeConversations: AvatarConversation[],
  candidatePool: { id: string; category: RendezvousCategory }[],
  _category?: RendezvousCategory,
): ScheduledActivity[] {
  const schedule: ScheduledActivity[] = [];
  const today = getJSTDateString();

  // Determine how many activities per slot (2-4 per day total)
  const hasActiveConversations = activeConversations.length > 0;
  const hasCandidates = candidatePool.length > 0;

  // Always schedule at least morning and evening activities
  const slotsToFill: TimeSlot[] = ["morning", "evening"];

  // Add midday if there are active conversations (flash event opportunity)
  if (hasActiveConversations) {
    slotsToFill.push("midday");
  }

  // Add afternoon if there are many candidates
  if (hasCandidates && candidatePool.length >= 3) {
    slotsToFill.push("afternoon");
  }

  for (const slot of slotsToFill) {
    const activityType = pickActivityType(
      slot,
      hasActiveConversations,
      hasCandidates,
    );
    const candidate = pickCandidate(
      activityType,
      activeConversations,
      candidatePool,
    );
    const scheduledTime = getRandomTimeInSlot(slot, today);

    schedule.push({
      id: crypto.randomUUID(),
      user_id: userId,
      scheduled_at: scheduledTime,
      activity_type: activityType,
      target_category: candidate?.category ?? "friendship",
      target_candidate_id: candidate?.id ?? null,
      status: "pending",
    });
  }

  // Sort by scheduled time
  schedule.sort(
    (a, b) =>
      new Date(a.scheduled_at).getTime() -
      new Date(b.scheduled_at).getTime(),
  );

  return schedule;
}

/**
 * 次に実行すべきアクティビティを返す
 */
export function getNextActivity(
  schedule: ScheduledActivity[],
): ScheduledActivity | null {
  const now = new Date().toISOString();
  const pending = schedule
    .filter((a) => a.status === "pending" && a.scheduled_at > now)
    .sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() -
        new Date(b.scheduled_at).getTime(),
    );

  return pending[0] ?? null;
}

/**
 * フラッシュイベント（昼休みの偶然の出会い）をトリガーすべきか判定
 * 条件: 11:30-13:30 JST, ユーザーが最近アクティブ
 */
export function shouldTriggerFlashEvent(
  currentTime: Date,
  userActivity: { lastActiveAt: string | null; activeToday: boolean },
): boolean {
  const jstHour = getJSTHourFromDate(currentTime);
  const jstMinute = getJSTMinuteFromDate(currentTime);

  // 11:30 - 13:30 JST window
  const totalMinutes = jstHour * 60 + jstMinute;
  const inWindow = totalMinutes >= 11 * 60 + 30 && totalMinutes <= 13 * 60 + 30;

  if (!inWindow) return false;

  // User must have been active today
  if (!userActivity.activeToday) return false;

  // If last active was within 2 hours, trigger
  if (userActivity.lastActiveAt) {
    const lastActive = new Date(userActivity.lastActiveAt).getTime();
    const twoHoursAgo = currentTime.getTime() - 2 * 60 * 60 * 1000;
    return lastActive >= twoHoursAgo;
  }

  return false;
}

/**
 * 現在進行中のアクティビティを取得
 */
export function getCurrentActivity(
  schedule: ScheduledActivity[],
): ScheduledActivity | null {
  return (
    schedule.find((a) => a.status === "active") ?? null
  );
}

// ---------- Internal Helpers ----------

function getJSTHour(): number {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCHours();
}

function getJSTHourFromDate(d: Date): number {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCHours();
}

function getJSTMinuteFromDate(d: Date): number {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCMinutes();
}

function getJSTDateString(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function getTimeSlotForHour(hour: number): TimeSlot {
  // Normalize hours > 24 (night slot spans midnight)
  const h = hour >= 25 ? hour - 24 : hour;

  for (const slot of TIME_SLOT_ORDER) {
    const [start, end] = TIME_SLOT_RANGES[slot];
    if (h >= start && h < end) return slot;
    // Handle night slot wrapping
    if (slot === "night" && (h >= 21 || h < 1)) return slot;
  }
  return "night"; // fallback for 1-5 AM
}

function pickActivityType(
  slot: TimeSlot,
  hasActive: boolean,
  hasCandidates: boolean,
): ActivityType {
  const weights = SLOT_ACTIVITY_WEIGHTS[slot];
  const entries = Object.entries(weights) as [ActivityType, number][];

  // Filter out impossible activities
  const filtered = entries.filter(([type]) => {
    if (type === "continue_conversation" && !hasActive) return false;
    if (type === "explore" && !hasCandidates) return false;
    if (type === "flash_event" && slot !== "midday") return false;
    return true;
  });

  if (filtered.length === 0) return "explore";

  // Weighted random selection
  const totalWeight = filtered.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * totalWeight;
  for (const [type, w] of filtered) {
    r -= w;
    if (r <= 0) return type;
  }

  return filtered[0][0];
}

function pickCandidate(
  activityType: ActivityType,
  activeConversations: AvatarConversation[],
  candidatePool: { id: string; category: RendezvousCategory }[],
): { id: string; category: RendezvousCategory } | null {
  if (
    activityType === "continue_conversation" ||
    activityType === "deep_conversation"
  ) {
    if (activeConversations.length > 0) {
      const conv =
        activeConversations[
          Math.floor(Math.random() * activeConversations.length)
        ];
      return { id: conv.candidate_id, category: conv.category };
    }
  }

  if (candidatePool.length > 0) {
    return candidatePool[Math.floor(Math.random() * candidatePool.length)];
  }

  return null;
}

function getRandomTimeInSlot(slot: TimeSlot, dateStr: string): string {
  const [startHour, endHour] = TIME_SLOT_RANGES[slot];
  const rangeMinutes = (endHour - startHour) * 60;
  const offsetMinutes = Math.floor(Math.random() * rangeMinutes);
  const totalMinutes = startHour * 60 + offsetMinutes;

  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;

  // Convert from JST to UTC for storage
  const jstDate = new Date(`${dateStr}T${pad(hours)}:${pad(minutes)}:00+09:00`);
  return jstDate.toISOString();
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
