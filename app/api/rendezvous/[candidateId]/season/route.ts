import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyCandidateBelongsToUser } from "@/lib/rendezvous/helpers";
import {
  buildSeasonProfile,
  detectSeason,
  type SeasonSignals,
  type SeasonPhase,
} from "@/lib/rendezvous/relationshipSeasons";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

// =============================================================================
// GET /api/rendezvous/[candidateId]/season
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { candidateId } = await params;
    const userId = auth.user.id;

    // Verify user belongs to this candidate pair
    const verified = await verifyCandidateBelongsToUser(
      supabaseAdmin,
      candidateId,
      userId,
    );
    if (!verified) {
      return NextResponse.json(
        { ok: false, error: "Not found" },
        { status: 404 },
      );
    }

    const category = verified.candidate.category as RendezvousCategory;

    // ---- Compute signals from messages ----
    const signals = await computeSignals(candidateId, userId);

    // ---- Load milestones ----
    const milestones = await loadMilestones(candidateId);

    // ---- Load or derive season history ----
    const seasonHistory = await loadSeasonHistory(candidateId);

    // ---- Build profile ----
    const profile = buildSeasonProfile(
      candidateId,
      signals,
      milestones,
      seasonHistory,
      category,
    );

    // ---- Persist current season if changed ----
    await persistCurrentSeason(candidateId, profile.currentSeason, seasonHistory);

    return NextResponse.json({ ok: true, data: profile });
  } catch (err) {
    console.error("[season] error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// =============================================================================
// Signal Computation
// =============================================================================

async function computeSignals(
  candidateId: string,
  userId: string,
): Promise<SeasonSignals> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Fetch recent messages (last 14 days for trend calculation)
  const { data: messages } = await supabaseAdmin
    .from("rendezvous_messages")
    .select("id, sender_id, created_at, body, media_type")
    .eq("candidate_id", candidateId)
    .gte("created_at", fourteenDaysAgo.toISOString())
    .order("created_at", { ascending: true });

  const msgs = messages ?? [];

  // Split into recent 7 days and previous 7 days
  const recent = msgs.filter(
    (m) => new Date(m.created_at) >= sevenDaysAgo,
  );
  const previous = msgs.filter(
    (m) =>
      new Date(m.created_at) >= fourteenDaysAgo &&
      new Date(m.created_at) < sevenDaysAgo,
  );

  // Message frequency (messages per day)
  const recentFreq = recent.length / 7;
  const prevFreq = previous.length / 7;
  const trend = prevFreq > 0 ? (recentFreq - prevFreq) / prevFreq : recentFreq > 0 ? 1 : 0;

  // Average response time (for messages by the other user)
  const responseTimes = computeResponseTimes(msgs, userId);
  const avgResponseTime =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 24; // default 24h if no data

  // Conversation depth: based on message length and question ratio
  const depth = computeConversationDepth(recent);

  // Initiation balance: who starts conversations more
  const balance = computeInitiationBalance(recent, userId);

  // Emotional intensity: emoji and exclamation mark density
  const intensity = computeEmotionalIntensity(recent);

  // Activity engagement
  const engagement = await computeActivityEngagement(candidateId);

  return {
    messageFrequency: recentFreq,
    messageFrequencyTrend: trend,
    averageResponseTime: avgResponseTime,
    conversationDepth: depth,
    initiationBalance: balance,
    activityEngagement: engagement,
    emotionalIntensity: intensity,
  };
}

/**
 * Compute response times in hours between alternating sender messages
 */
function computeResponseTimes(
  messages: { sender_id: string; created_at: string }[],
  userId: string,
): number[] {
  const times: number[] = [];
  for (let i = 1; i < messages.length; i++) {
    // When the other person replies to us, or we reply to them
    if (messages[i].sender_id !== messages[i - 1].sender_id) {
      const diff =
        (new Date(messages[i].created_at).getTime() -
          new Date(messages[i - 1].created_at).getTime()) /
        (1000 * 60 * 60);
      if (diff > 0 && diff < 168) {
        // cap at 1 week
        times.push(diff);
      }
    }
  }
  return times;
}

/**
 * Conversation depth: message length + question ratio
 */
function computeConversationDepth(
  messages: { body?: string | null }[],
): number {
  if (messages.length === 0) return 0;

  let totalLength = 0;
  let questionCount = 0;

  for (const m of messages) {
    const body = m.body ?? "";
    totalLength += body.length;
    if (body.includes("?") || body.includes("\uFF1F")) questionCount++;
  }

  const avgLength = totalLength / messages.length;
  const questionRatio = questionCount / messages.length;

  // Normalize: 50+ chars avg = deep, 20% questions = engaged
  const lengthScore = Math.min(avgLength / 80, 1);
  const questionScore = Math.min(questionRatio / 0.25, 1);

  return Math.min((lengthScore * 0.6 + questionScore * 0.4), 1);
}

/**
 * Who initiates more? Detect "conversations" as messages after 4h+ gap
 */
function computeInitiationBalance(
  messages: { sender_id: string; created_at: string }[],
  userId: string,
): number {
  if (messages.length === 0) return 0;

  let userInitiations = 0;
  let otherInitiations = 0;
  const GAP_MS = 4 * 60 * 60 * 1000; // 4 hours

  // First message is an initiation
  if (messages[0].sender_id === userId) userInitiations++;
  else otherInitiations++;

  for (let i = 1; i < messages.length; i++) {
    const gap =
      new Date(messages[i].created_at).getTime() -
      new Date(messages[i - 1].created_at).getTime();
    if (gap >= GAP_MS) {
      if (messages[i].sender_id === userId) userInitiations++;
      else otherInitiations++;
    }
  }

  const total = userInitiations + otherInitiations;
  if (total === 0) return 0;

  // -1 = they initiate everything, +1 = you initiate everything
  return (userInitiations - otherInitiations) / total;
}

/**
 * Emotional intensity: emoji density + exclamation mark frequency
 */
function computeEmotionalIntensity(
  messages: { body?: string | null }[],
): number {
  if (messages.length === 0) return 0;

  let emojiCount = 0;
  let exclamationCount = 0;
  let totalChars = 0;

  // Simple emoji detection via Unicode ranges
  const emojiRegex =
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu;

  for (const m of messages) {
    const body = m.body ?? "";
    totalChars += body.length;
    const emojis = body.match(emojiRegex);
    if (emojis) emojiCount += emojis.length;
    exclamationCount += (body.match(/[!！]/g) ?? []).length;
  }

  if (totalChars === 0) return 0;

  const emojiDensity = Math.min(emojiCount / messages.length / 3, 1);
  const exclamationDensity = Math.min(exclamationCount / messages.length / 2, 1);

  return Math.min(emojiDensity * 0.6 + exclamationDensity * 0.4, 1);
}

/**
 * Activity engagement from rendezvous_activities table
 */
async function computeActivityEngagement(
  candidateId: string,
): Promise<number> {
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: activities } = await supabaseAdmin
    .from("rendezvous_activities")
    .select("id, status")
    .eq("candidate_id", candidateId)
    .gte("created_at", thirtyDaysAgo);

  if (!activities || activities.length === 0) return 0;

  const completed = activities.filter(
    (a) => a.status === "completed" || a.status === "done",
  ).length;

  return Math.min(completed / activities.length, 1);
}

// =============================================================================
// Milestones
// =============================================================================

async function loadMilestones(
  candidateId: string,
): Promise<{ type: string; reachedAt: string }[]> {
  const { data } = await supabaseAdmin
    .from("chat_milestones")
    .select("milestone_type, reached_at")
    .eq("candidate_id", candidateId)
    .order("reached_at", { ascending: true });

  return (data ?? []).map((r) => ({
    type: r.milestone_type,
    reachedAt: r.reached_at,
  }));
}

// =============================================================================
// Season History (stored in rendezvous_context_states)
// =============================================================================

const SEASON_STATE_KEY = "relationship_season_history";

async function loadSeasonHistory(
  candidateId: string,
): Promise<SeasonPhase[]> {
  const { data } = await supabaseAdmin
    .from("rendezvous_context_states")
    .select("value")
    .eq("candidate_id", candidateId)
    .eq("key", SEASON_STATE_KEY)
    .maybeSingle();

  if (!data?.value) return [];

  try {
    const parsed = typeof data.value === "string"
      ? JSON.parse(data.value)
      : data.value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function persistCurrentSeason(
  candidateId: string,
  currentSeason: string,
  existingHistory: SeasonPhase[],
): Promise<void> {
  const now = new Date().toISOString();
  let history = [...existingHistory];

  // Check if current season matches the last entry
  const lastPhase = history.length > 0 ? history[history.length - 1] : null;

  if (lastPhase && lastPhase.season === currentSeason) {
    // Update duration of current phase
    const startedAt = new Date(lastPhase.startedAt);
    lastPhase.durationDays = Math.round(
      (Date.now() - startedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
  } else {
    // Season changed: close previous phase and open new one
    if (lastPhase && !lastPhase.endedAt) {
      lastPhase.endedAt = now;
      const startedAt = new Date(lastPhase.startedAt);
      lastPhase.durationDays = Math.round(
        (Date.now() - startedAt.getTime()) / (1000 * 60 * 60 * 24),
      );
    }

    // Start new season phase
    history.push({
      season: currentSeason as SeasonPhase["season"],
      startedAt: now,
      endedAt: null,
      durationDays: 0,
      highlights: [],
    });
  }

  // Keep only the last 20 phases to avoid unbounded growth
  if (history.length > 20) {
    history = history.slice(-20);
  }

  await supabaseAdmin
    .from("rendezvous_context_states")
    .upsert(
      {
        candidate_id: candidateId,
        key: SEASON_STATE_KEY,
        value: JSON.stringify(history),
        updated_at: now,
      },
      { onConflict: "candidate_id,key" },
    );
}
