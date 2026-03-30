import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyCandidateBelongsToUser } from "@/lib/rendezvous/helpers";
import {
  detectNaturalRhythm,
  shouldSuggestAbsence,
  generateReunionExperience,
  type AbsenceState,
  type AbsenceSuggestion,
} from "@/lib/rendezvous/absenceDesign";

export const runtime = "nodejs";

// =============================================================================
// GET /api/rendezvous/[candidateId]/absence
// =============================================================================

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

  // Verify candidate belongs to user
  const verified = await verifyCandidateBelongsToUser(
    supabaseAdmin,
    candidateId,
    user.id,
  );
  if (!verified) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { candidate } = verified;

  // Fetch recent messages
  const { data: chatRow } = await supabaseAdmin
    .from("rendezvous_chats")
    .select("thread_id")
    .eq("candidate_id", candidateId)
    .maybeSingle();

  let messages: Array<{ created_at: string; sender_id: string }> = [];

  if (chatRow?.thread_id) {
    const { data: msgs } = await supabaseAdmin
      .from("rendezvous_messages")
      .select("created_at, sender_id")
      .eq("thread_id", chatRow.thread_id)
      .order("created_at", { ascending: true })
      .limit(300);
    messages = msgs ?? [];
  }

  // Check active absence
  const { data: activeAbsence } = await supabaseAdmin
    .from("rendezvous_absences")
    .select("*")
    .eq("candidate_id", candidateId)
    .eq("user_id", user.id)
    .is("actual_ended_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date();
  const isInAbsence = !!activeAbsence;
  const reunionReady =
    isInAbsence && activeAbsence.ends_at
      ? new Date(activeAbsence.ends_at) <= now
      : false;

  // Natural rhythm
  const naturalRhythm = detectNaturalRhythm(messages, user.id);

  const state: AbsenceState = {
    isInAbsence,
    currentAbsence: isInAbsence
      ? {
          type: activeAbsence.absence_type as AbsenceSuggestion["type"],
          suggestedHours: activeAbsence.ends_at
            ? Math.round(
                (new Date(activeAbsence.ends_at).getTime() -
                  new Date(activeAbsence.started_at).getTime()) /
                  (1000 * 60 * 60),
              )
            : 0,
          reason: "",
          poeticMessage: "",
          reunionHint: "",
          priority: 0,
        }
      : null,
    startedAt: activeAbsence?.started_at ?? null,
    endsAt: activeAbsence?.ends_at ?? null,
    reunionReady,
    naturalRhythm,
  };

  // Generate suggestion if not currently in absence
  let suggestion: AbsenceSuggestion | null = null;
  if (!isInAbsence) {
    // Find last absence end time
    const { data: lastAbsenceRow } = await supabaseAdmin
      .from("rendezvous_absences")
      .select("actual_ended_at")
      .eq("candidate_id", candidateId)
      .eq("user_id", user.id)
      .not("actual_ended_at", "is", null)
      .order("actual_ended_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch season if available
    const { data: seasonRow } = await supabaseAdmin
      .from("rendezvous_seasons")
      .select("current_season")
      .eq("candidate_id", candidateId)
      .maybeSingle();

    suggestion = shouldSuggestAbsence(
      messages,
      user.id,
      lastAbsenceRow?.actual_ended_at ?? null,
      seasonRow?.current_season ?? undefined,
    );
  }

  return NextResponse.json({
    ok: true,
    state,
    ...(suggestion ? { suggestion } : {}),
  });
}

// =============================================================================
// POST /api/rendezvous/[candidateId]/absence
// =============================================================================

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

  // Verify candidate belongs to user
  const verified = await verifyCandidateBelongsToUser(
    supabaseAdmin,
    candidateId,
    user.id,
  );
  if (!verified) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body?.action as string;

  // ---- Accept absence ----
  if (action === "accept") {
    const absenceType = body?.absenceType as string;
    const hours = Number(body?.hours ?? 12);

    if (!absenceType) {
      return NextResponse.json(
        { error: "absenceType required" },
        { status: 400 },
      );
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + hours * 60 * 60 * 1000);

    const { error: insertErr } = await supabaseAdmin
      .from("rendezvous_absences")
      .insert({
        candidate_id: candidateId,
        user_id: user.id,
        absence_type: absenceType,
        started_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
        accepted: true,
      });

    if (insertErr) {
      console.error("[absence] insert error:", insertErr);
      return NextResponse.json(
        { error: insertErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  }

  // ---- End absence ----
  if (action === "end") {
    // Find active absence
    const { data: activeAbsence } = await supabaseAdmin
      .from("rendezvous_absences")
      .select("*")
      .eq("candidate_id", candidateId)
      .eq("user_id", user.id)
      .is("actual_ended_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!activeAbsence) {
      return NextResponse.json(
        { error: "No active absence" },
        { status: 400 },
      );
    }

    const now = new Date();
    const { error: updateErr } = await supabaseAdmin
      .from("rendezvous_absences")
      .update({ actual_ended_at: now.toISOString() })
      .eq("id", activeAbsence.id);

    if (updateErr) {
      console.error("[absence] update error:", updateErr);
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 },
      );
    }

    // Generate reunion experience
    const durationHours =
      (now.getTime() - new Date(activeAbsence.started_at).getTime()) /
      (1000 * 60 * 60);

    const reunion = generateReunionExperience(
      activeAbsence.absence_type,
      durationHours,
      verified.candidate.category ?? "friendship",
    );

    return NextResponse.json({ ok: true, reunion });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
