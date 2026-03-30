import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/notifications/sendPush";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BATCH_LIMIT = 100;

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Evening Verification Reminder
 * Runs daily at 9:00 PM JST (12:00 UTC)
 * Find users with unverified prophecies from today and send push reminders
 */
export async function GET(request: Request) {
  // Auth: verify CRON_SECRET
  if (
    request.headers.get("authorization") !==
    `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const details: string[] = [];
  let processed = 0;
  let errors = 0;

  try {
    const today = toISODate(new Date());

    // 1. Get today's pending (unverified) prophecies
    const { data: pendingProphecies, error: fetchError } = await supabase
      .from("stargazer_daily_prophecies")
      .select("user_id")
      .eq("prophecy_date", today)
      .eq("verification_status", "pending")
      .limit(BATCH_LIMIT);

    if (fetchError) {
      console.error(
        "[stargazer-verify] Failed to fetch pending prophecies:",
        fetchError,
      );
      details.push(`Failed to fetch pending prophecies: ${fetchError.message}`);
      return NextResponse.json({ processed: 0, errors: 1, details });
    }

    // Deduplicate user IDs
    const userIds = Array.from(
      new Set((pendingProphecies ?? []).map((r) => r.user_id as string)),
    );
    details.push(
      `Found ${userIds.length} users with unverified prophecies for ${today}`,
    );

    // 2. Send push notification to each user
    for (const userId of userIds) {
      try {
        const result = await sendPushToUser(userId, {
          title: "今日の予言、当たった？",
          body: "今日の行動予言の結果を教えてください",
          url: "/stargazer/prophecy",
          tag: "stargazer-verification",
        });

        if (result.sent) {
          processed++;
          details.push(`User ${userId.slice(0, 8)}... notification sent`);
        } else {
          details.push(
            `User ${userId.slice(0, 8)}... skipped: ${result.reason ?? "unknown"}`,
          );
        }
      } catch (err) {
        console.error(
          `[stargazer-verify] Push failed for user ${userId}:`,
          err,
        );
        details.push(
          `User ${userId.slice(0, 8)}... push error: ${err instanceof Error ? err.message : "unknown"}`,
        );
        errors++;
      }
    }

    console.log(
      `[stargazer-verify] Done: processed=${processed}, errors=${errors}`,
    );

    return NextResponse.json({ processed, errors, details });
  } catch (error) {
    console.error("[stargazer-verify] Cron error:", error);
    details.push(
      `Fatal error: ${error instanceof Error ? error.message : "unknown"}`,
    );
    return NextResponse.json(
      { processed, errors: errors + 1, details },
      { status: 500 },
    );
  }
}
