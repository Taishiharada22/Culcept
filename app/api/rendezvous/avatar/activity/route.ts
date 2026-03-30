import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getCurrentTimeSlot,
  type ScheduledActivity,
} from "@/lib/rendezvous/avatarScheduler";

/**
 * GET /api/rendezvous/avatar/activity
 * 現在のアバターアクティビティ状態（進行中・次の予定）を取得
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;
    const now = new Date().toISOString();
    const currentSlot = getCurrentTimeSlot();

    // Fetch today's schedule
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { data: activities, error } = await supabaseAdmin
      .from("avatar_activity_schedule")
      .select("*")
      .eq("user_id", userId)
      .gte("scheduled_at", todayStart.toISOString())
      .order("scheduled_at", { ascending: true });

    if (error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const schedule = (activities ?? []) as ScheduledActivity[];

    // Find current active activity
    const currentActivity = schedule.find((a) => a.status === "active") ?? null;

    // Find next pending activity
    const nextActivity =
      schedule.find(
        (a) => a.status === "pending" && a.scheduled_at > now,
      ) ?? null;

    // Count completed today
    const completedToday = schedule.filter(
      (a) => a.status === "completed",
    ).length;

    // Count remaining
    const remainingToday = schedule.filter(
      (a) => a.status === "pending",
    ).length;

    return NextResponse.json({
      ok: true,
      currentTimeSlot: currentSlot,
      currentActivity: currentActivity
        ? {
            id: currentActivity.id,
            activityType: currentActivity.activity_type,
            targetCategory: currentActivity.target_category,
            targetCandidateId: currentActivity.target_candidate_id,
            scheduledAt: currentActivity.scheduled_at,
          }
        : null,
      nextActivity: nextActivity
        ? {
            id: nextActivity.id,
            activityType: nextActivity.activity_type,
            targetCategory: nextActivity.target_category,
            scheduledAt: nextActivity.scheduled_at,
          }
        : null,
      todaySummary: {
        completed: completedToday,
        remaining: remainingToday,
        total: schedule.length,
      },
    });
  } catch (err: any) {
    console.error("[avatar/activity] error:", err);
    return NextResponse.json({ ok: false, error: err.message ?? "Internal error" }, { status: 500 });
  }
}
