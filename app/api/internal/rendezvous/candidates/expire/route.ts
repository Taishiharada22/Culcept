import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeUserPair } from "@/lib/rendezvous/helpers";

export async function POST(request: NextRequest) {
  try {
    // Auth via CRON_SECRET
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const supabase = supabaseAdmin;
    const now = new Date().toISOString();

    // Fetch candidates that are past their expiry and not already in a terminal state
    const { data: expired, error: fetchErr } = await supabase
      .from("rendezvous_candidates")
      .select("id, user_a, user_b")
      .lt("expires_at", now)
      .not("state", "in", "(expired,dismissed,chat_opened)")
      .limit(200);

    if (fetchErr)
      return NextResponse.json(
        { ok: false, error: fetchErr.message },
        { status: 500 },
      );

    if (!expired || expired.length === 0) {
      return NextResponse.json({ ok: true, expiredCount: 0 });
    }

    let expiredCount = 0;

    for (const candidate of expired) {
      try {
        // Update candidate to expired
        const { error: updateErr } = await supabase
          .from("rendezvous_candidates")
          .update({ state: "expired" })
          .eq("id", candidate.id);

        if (updateErr) {
          console.error(
            `[rendezvous/candidates/expire] failed to expire candidate ${candidate.id}:`,
            updateErr,
          );
          continue;
        }

        // Update both user_states to expired
        const { error: statesErr } = await supabase
          .from("rendezvous_user_states")
          .update({ state: "expired" })
          .eq("candidate_id", candidate.id)
          .not("state", "in", "(liked,passed)");

        if (statesErr) {
          console.error(
            `[rendezvous/candidates/expire] failed to update user_states for ${candidate.id}:`,
            statesErr,
          );
        }

        // Cancel any pending notifications for this candidate
        await supabase
          .from("rendezvous_notifications")
          .update({ status: "cancelled" })
          .eq("candidate_id", candidate.id)
          .eq("status", "pending");

        // Create expired_cooldown suppression (7 days)
        const [userLow, userHigh] = normalizeUserPair(
          candidate.user_a,
          candidate.user_b,
        );
        const cooldownUntil = new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString();

        await supabase.from("rendezvous_suppressions").insert({
          user_low: userLow,
          user_high: userHigh,
          suppression_type: "expired_cooldown",
          until_at: cooldownUntil,
        });

        // Log
        await supabase.from("rendezvous_candidate_logs").insert({
          candidate_id: candidate.id,
          event_type: "expired",
          payload: { expired_at: now },
        });

        expiredCount++;
      } catch (innerErr: any) {
        console.error(
          `[rendezvous/candidates/expire] candidate ${candidate.id} failed:`,
          innerErr,
        );
      }
    }

    return NextResponse.json({ ok: true, expiredCount });
  } catch (err: any) {
    console.error("[rendezvous/candidates/expire] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
