import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { trackCronRun } from "@/lib/ceo/withSkillTelemetry";
import {
  summarizeAlterSession,
  saveAlterSessionSummary,
} from "@/lib/stargazer/alterMemory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BATCH_LIMIT = 20;
const MIN_MESSAGES = 4;
const STALE_MINUTES = 30;

/**
 * GET /api/cron/stargazer-alter-summarize
 *
 * Hourly cron: find Alter sessions that have ended (no new messages in 30+ min),
 * have at least 4 messages, and no summary yet. Summarize and save.
 */
export async function GET(request: Request) {
  const t = await trackCronRun("stargazer-alter-summarize");

  // Auth: verify CRON_SECRET
  if (
    request.headers.get("authorization") !==
    `Bearer ${process.env.CRON_SECRET}`
  ) {
    await t.finish({ ok: false, summary: "unauthorized" });
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
    const cutoff = new Date(
      Date.now() - STALE_MINUTES * 60 * 1000,
    ).toISOString();

    // Find sessions with enough messages whose last message is old enough
    // and that don't already have a summary
    const { data: candidateSessions, error: queryError } = await supabase
      .rpc("find_unsummarized_alter_sessions", {
        p_cutoff: cutoff,
        p_min_messages: MIN_MESSAGES,
        p_limit: BATCH_LIMIT,
      })
      .select("*");

    // If the RPC doesn't exist yet, fall back to a manual query approach
    if (queryError) {
      details.push(`RPC unavailable (${queryError.message}), using fallback query`);

      // Fallback: find distinct (user_id, session_id) pairs from dialogues
      // that have no matching summary
      const { data: recentDialogues } = await supabase
        .from("stargazer_alter_dialogues")
        .select("user_id, session_id, created_at")
        .lt("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(500);

      if (!recentDialogues || recentDialogues.length === 0) {
        return NextResponse.json({
          ok: true,
          message: "No sessions to process",
          processed: 0,
          errors: 0,
          details,
        });
      }

      // Group by user_id + session_id, count messages, find latest
      const sessionMap = new Map<
        string,
        { userId: string; sessionId: string; count: number; latestAt: string }
      >();

      for (const d of recentDialogues) {
        const key = `${d.user_id}::${d.session_id}`;
        const existing = sessionMap.get(key);
        if (existing) {
          existing.count++;
          if (d.created_at > existing.latestAt) {
            existing.latestAt = d.created_at;
          }
        } else {
          sessionMap.set(key, {
            userId: d.user_id,
            sessionId: d.session_id,
            count: 1,
            latestAt: d.created_at,
          });
        }
      }

      // Filter: at least MIN_MESSAGES and latest message before cutoff
      const candidates = Array.from(sessionMap.values())
        .filter((s) => s.count >= MIN_MESSAGES && s.latestAt < cutoff)
        .slice(0, BATCH_LIMIT);

      // Check which ones already have summaries
      const sessionIds = candidates.map((c) => c.sessionId);
      const userIds = [...new Set(candidates.map((c) => c.userId))];

      const { data: existingSummaries } = await supabase
        .from("stargazer_alter_session_summaries")
        .select("user_id, session_id")
        .in("user_id", userIds)
        .in("session_id", sessionIds);

      const summaryKeys = new Set(
        (existingSummaries ?? []).map(
          (s: { user_id: string; session_id: string }) =>
            `${s.user_id}::${s.session_id}`,
        ),
      );

      const unsummarized = candidates.filter(
        (c) => !summaryKeys.has(`${c.userId}::${c.sessionId}`),
      );

      for (const candidate of unsummarized) {
        try {
          const result = await processSession(
            supabase,
            candidate.userId,
            candidate.sessionId,
          );
          if (result) {
            processed++;
            details.push(
              `Summarized session ${candidate.sessionId} for user ${candidate.userId.slice(0, 8)}...`,
            );
          }
        } catch (e) {
          errors++;
          details.push(
            `Error on session ${candidate.sessionId}: ${e instanceof Error ? e.message : "unknown"}`,
          );
        }
      }
    } else if (candidateSessions && candidateSessions.length > 0) {
      // RPC path
      for (const row of candidateSessions) {
        try {
          const result = await processSession(
            supabase,
            row.user_id,
            row.session_id,
          );
          if (result) {
            processed++;
            details.push(
              `Summarized session ${row.session_id} for user ${String(row.user_id).slice(0, 8)}...`,
            );
          }
        } catch (e) {
          errors++;
          details.push(
            `Error on session ${row.session_id}: ${e instanceof Error ? e.message : "unknown"}`,
          );
        }
      }
    }

    await t.finish({ ok: errors === 0, summary: `processed=${processed}, errors=${errors}` });
    return NextResponse.json({
      ok: true,
      processed,
      errors,
      details: details.slice(0, 50),
    });
  } catch (error) {
    console.error("[cron/stargazer-alter-summarize] Fatal error:", error);
    await t.finish({ ok: false, summary: error instanceof Error ? error.message : "fatal" });
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
        processed,
        errors,
        details: details.slice(0, 50),
      },
      { status: 500 },
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processSession(
  supabase: any,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  // Fetch all messages for this session
  const { data: messages } = await supabase
    .from("stargazer_alter_dialogues")
    .select("role, alter_mode, message, created_at")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true }) as { data: Array<{ role: string; alter_mode: string | null; message: string; created_at: string }> | null };

  if (!messages || messages.length < MIN_MESSAGES) return false;

  const summary = await summarizeAlterSession(
    messages.map((m) => ({
      role: m.role,
      content: m.message,
      mode: m.alter_mode ?? undefined,
    })),
    userId,
  );

  if (!summary) return false;

  summary.sessionId = sessionId;

  return saveAlterSessionSummary(userId, summary);
}
