import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPushToUser } from "@/lib/notifications/sendPush";
import {
  generateNewCandidateNotification,
  generateMutualLikeNotification,
} from "@/lib/rendezvous/notificationTemplates";

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

    // Fetch pending notifications that are due
    const { data: notifications, error: fetchErr } = await supabase
      .from("rendezvous_notifications")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(100);

    if (fetchErr)
      return NextResponse.json(
        { ok: false, error: fetchErr.message },
        { status: 500 },
      );

    if (!notifications || notifications.length === 0) {
      return NextResponse.json({ ok: true, dispatched: 0 });
    }

    let dispatched = 0;

    for (const notification of notifications) {
      try {
        const candidateId = notification.candidate_id;
        const notificationType = notification.notification_type;

        // For new_candidate notifications, update the candidate's delivered_at
        if (notificationType === "new_candidate") {
          // Check if candidate is still active
          const { data: candidate } = await supabase
            .from("rendezvous_candidates")
            .select("id, state, delivered_at")
            .eq("id", candidateId)
            .single();

          if (!candidate || candidate.state === "expired" || candidate.state === "dismissed") {
            // Skip - mark notification as cancelled
            await supabase
              .from("rendezvous_notifications")
              .update({ status: "cancelled", sent_at: now })
              .eq("id", notification.id);
            continue;
          }

          // Set delivered_at if not already set
          if (!candidate.delivered_at) {
            await supabase
              .from("rendezvous_candidates")
              .update({
                delivered_at: now,
                state: "delivered",
              })
              .eq("id", candidateId)
              .eq("state", "candidate_generated");
          }
        }

        // Mark notification as sent
        const { error: updateErr } = await supabase
          .from("rendezvous_notifications")
          .update({
            status: "sent",
            sent_at: now,
          })
          .eq("id", notification.id);

        if (updateErr) {
          console.error(
            `[rendezvous/notifications/dispatch] failed to update notification ${notification.id}:`,
            updateErr,
          );
          continue;
        }

        // Update user state last_notified_at
        await supabase
          .from("rendezvous_user_states")
          .update({ last_notified_at: now })
          .eq("candidate_id", candidateId)
          .eq("user_id", notification.user_id);

        // Generate contextual notification text using templates
        let notifTitle: string;
        let notifBody: string;

        if (notificationType === "mutual_like") {
          // Fetch candidate category for template
          const { data: candData } = await supabase
            .from("rendezvous_candidates")
            .select("category")
            .eq("id", candidateId)
            .single();
          const mutual = generateMutualLikeNotification(
            (candData?.category as any) ?? "friendship",
          );
          notifTitle = mutual.title;
          notifBody = mutual.body;
        } else if (notificationType === "new_candidate") {
          const { data: candData } = await supabase
            .from("rendezvous_candidates")
            .select("category, reason_codes")
            .eq("id", candidateId)
            .single();
          const { data: eventData } = candData
            ? await supabase
                .from("encounter_events")
                .select("trigger_type")
                .eq("candidate_id", candidateId)
                .maybeSingle()
            : { data: null };
          const newNotif = generateNewCandidateNotification(
            (candData?.category as any) ?? "friendship",
            eventData?.trigger_type as any,
            candData?.reason_codes as any,
          );
          notifTitle = newNotif.title;
          notifBody = newNotif.body;
        } else {
          notifTitle = "Rendezvousの通知";
          notifBody = "Rendezvousに更新があります";
        }

        await supabase.from("notifications").insert({
          user_id: notification.user_id,
          type: `rendezvous_${notificationType}`,
          title: notifTitle,
          body: notifBody,
          link: `/rendezvous/${candidateId}`,
          data: { candidateId, notificationType },
          read_at: null,
        });

        // Send push notification (fire-and-forget)
        sendPushToUser(notification.user_id, {
          title: notifTitle,
          body: notifBody,
          url: `/rendezvous/${candidateId}`,
          tag: `rendezvous_${notificationType}`,
        }).catch((e) =>
          console.error(`[dispatch] push failed for ${notification.user_id}:`, e),
        );

        dispatched++;
      } catch (innerErr: any) {
        console.error(
          `[rendezvous/notifications/dispatch] notification ${notification.id} failed:`,
          innerErr,
        );
      }
    }

    return NextResponse.json({ ok: true, dispatched });
  } catch (err: any) {
    console.error("[rendezvous/notifications/dispatch] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
