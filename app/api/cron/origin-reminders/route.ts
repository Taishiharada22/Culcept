import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  sendMorningTaskReminder,
  sendEveningJournalReminder,
  sendOnThisDayReminder,
  sendHabitReminder,
} from "@/lib/origin/dailyOrbit/notifications";

/**
 * GET /api/cron/origin-reminders
 * Vercel Cron: twice daily (8:00 morning, 20:00 evening JST).
 * Sends push reminders for Origin users.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const hour = now.toLocaleString("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", hour12: false });
  const hourNum = parseInt(hour, 10);
  const isMorning = hourNum >= 7 && hourNum <= 9;
  const isEvening = hourNum >= 19 && hourNum <= 21;

  if (!isMorning && !isEvening) {
    return NextResponse.json({ ok: true, message: "not in notification window" });
  }

  const today = now.toISOString().slice(0, 10);
  let sent = 0;

  // Get active Origin users (had orbit state updated in last 7 days)
  const { data: users } = await supabaseAdmin
    .from("origin_daily_orbit_state")
    .select("user_id, state")
    .gte("updated_at", new Date(Date.now() - 7 * 86400000).toISOString())
    .limit(100);

  if (!users || users.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  for (const user of users) {
    try {
      const state = user.state as Record<string, unknown> | null;
      if (!state) continue;

      if (isMorning) {
        // Morning: task reminder
        const entries = (state.entries ?? {}) as Record<string, { tasks: { completed: boolean }[] }>;
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = yesterday.toISOString().slice(0, 10);
        const yesterdayEntry = entries[yesterdayKey];
        const pendingCount = yesterdayEntry?.tasks.filter((t) => !t.completed).length ?? 0;

        await sendMorningTaskReminder(user.user_id, pendingCount);
        sent++;

        // On This Day check
        const oneYearAgo = new Date(now);
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const otdDate = oneYearAgo.toISOString().slice(0, 10);
        const { data: otdEntry } = await supabaseAdmin
          .from("origin_journal_entries")
          .select("body, title")
          .eq("user_id", user.user_id)
          .eq("date", otdDate)
          .single();
        if (otdEntry?.body) {
          await sendOnThisDayReminder(user.user_id, "1年前", otdEntry.body.slice(0, 80));
          sent++;
        }
      }

      if (isEvening) {
        // Evening: journal reminder
        type CronTask = { completed: boolean; text: string; recurrence?: { pattern: string } };
        const entries = (state.entries ?? {}) as Record<string, { tasks: CronTask[] }>;
        const todayEntry = entries[today];
        const completedCount = todayEntry?.tasks.filter((t: CronTask) => t.completed).length ?? 0;
        await sendEveningJournalReminder(user.user_id, completedCount);
        sent++;

        // Habit reminders: find uncompleted recurring tasks
        if (todayEntry) {
          const uncompletedHabits = todayEntry.tasks.filter(
            (t: CronTask) => !t.completed && t.recurrence,
          );
          for (const habit of uncompletedHabits.slice(0, 2)) {
            await sendHabitReminder(user.user_id, habit.text, 0);
            sent++;
          }
        }
      }
    } catch {
      // Skip individual user failures
    }
  }

  return NextResponse.json({ ok: true, sent });
}
