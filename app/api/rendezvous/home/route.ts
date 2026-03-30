import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildVitalityState } from "@/lib/rendezvous/avatarVitality";

// =============================================================================
// GET /api/rendezvous/home
// Aggregated home screen data — single request for performance.
// =============================================================================

// Stage mapping from DB state to UI stage
const STATE_TO_STAGE: Record<string, string> = {
  avatar_contact: "spark",
  revealed: "kindling",
  conversation: "flame",
  deep_conversation: "glow",
  constellation: "constellation",
};

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const userId = auth.user.id;
    const now = new Date();

    // -----------------------------------------------------------------------
    // Parallel queries for all sections
    // -----------------------------------------------------------------------
    const [
      candidatesResult,
      storiesResult,
      animaResult,
      feedResult,
      journeyEventsResult,
    ] = await Promise.all([
      // Active candidates (relationships)
      supabaseAdmin
        .from("rendezvous_candidates")
        .select("id, category, state, user_a, user_b, delivered_at, updated_at, created_at")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .not("state", "in", "(expired,dismissed)")
        .not("delivered_at", "is", null)
        .order("updated_at", { ascending: false })
        .limit(20),

      // Stories: recent avatar conversation summaries
      supabaseAdmin
        .from("rendezvous_candidates")
        .select("id, category, state, user_a, user_b, delivered_at, avatar_summary, updated_at")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .not("avatar_summary", "is", null)
        .order("updated_at", { ascending: false })
        .limit(10),

      // Anima whisper: today's insight
      supabaseAdmin
        .from("rendezvous_anima_insights")
        .select("id, message, subtext, emotional_tone")
        .eq("user_id", userId)
        .gte("created_at", new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString())
        .order("created_at", { ascending: false })
        .limit(1),

      // Feed: recent activity across categories
      supabaseAdmin
        .from("rendezvous_candidates")
        .select("id, category, state, user_a, user_b, delivered_at, updated_at")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .not("state", "in", "(expired,dismissed)")
        .order("updated_at", { ascending: false })
        .limit(3),

      // Avatar journey events (vitality)
      supabaseAdmin
        .from("avatar_journey_events")
        .select("id, event_type, emotion_state, narrative_ja, candidate_id, time_slot, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    // -----------------------------------------------------------------------
    // Gather counterpart user IDs for profile lookups
    // -----------------------------------------------------------------------
    const allCandidates = [
      ...(candidatesResult.data ?? []),
      ...(storiesResult.data ?? []),
      ...(feedResult.data ?? []),
    ];

    const counterpartIds = new Set<string>();
    for (const c of allCandidates) {
      const otherId = c.user_a === userId ? c.user_b : c.user_a;
      if (otherId) counterpartIds.add(otherId);
    }

    // Fetch profiles for counterparts
    let profileMap: Record<string, { display_name: string; avatar_url: string | null }> = {};
    if (counterpartIds.size > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("rendezvous_profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", Array.from(counterpartIds));

      if (profiles) {
        for (const p of profiles) {
          profileMap[p.user_id] = {
            display_name: p.display_name ?? "???",
            avatar_url: p.avatar_url ?? null,
          };
        }
      }
    }

    // Helper
    function getCounterpart(c: { user_a: string; user_b: string }) {
      const otherId = c.user_a === userId ? c.user_b : c.user_a;
      return {
        id: otherId,
        ...(profileMap[otherId] ?? { display_name: "???", avatar_url: null }),
      };
    }

    // -----------------------------------------------------------------------
    // 1. Avatar Status
    // -----------------------------------------------------------------------
    const activeCandidates = candidatesResult.data ?? [];
    const activeConversations = activeCandidates.filter(
      (c) => c.state === "conversation" || c.state === "deep_conversation",
    ).length;

    const avatarStatus = {
      activeConversations,
      nextActivityIn: activeConversations > 0 ? "" : "2時間",
    };

    // -----------------------------------------------------------------------
    // 2. Stories
    // -----------------------------------------------------------------------
    const rawStories = storiesResult.data ?? [];
    const stories = rawStories.map((s) => {
      const cp = getCounterpart(s);
      return {
        id: s.id,
        candidateId: s.id,
        name: cp.display_name,
        avatarUrl: cp.avatar_url,
        category: s.category ?? "friendship",
        summary: s.avatar_summary ?? "",
        read: false, // TODO: track read state
        createdAt: s.updated_at ?? s.delivered_at ?? "",
      };
    });

    // -----------------------------------------------------------------------
    // 3. Anima Whisper
    // -----------------------------------------------------------------------
    const animaRow = animaResult.data?.[0] ?? null;
    const animaWhisper = animaRow
      ? {
          id: animaRow.id,
          message: animaRow.message ?? "",
          subtext: animaRow.subtext ?? null,
          tone: animaRow.emotional_tone ?? "warm",
        }
      : null;

    // -----------------------------------------------------------------------
    // 4. Active Relationships (with unread counts)
    // -----------------------------------------------------------------------
    // Fetch unread message counts per candidate (best-effort)
    const unreadMap = new Map<string, number>();
    try {
      const chatCandidateIds = activeCandidates
        .filter((c: any) => c.state === "mutual_liked" || c.state === "chat_opened")
        .map((c: any) => c.id);

      if (chatCandidateIds.length > 0) {
        for (const cid of chatCandidateIds) {
          const { count } = await supabaseAdmin
            .from("rendezvous_messages")
            .select("*", { count: "exact", head: true })
            .eq("candidate_id", cid)
            .neq("sender_id", userId)
            .is("read_at", null);
          if (count && count > 0) unreadMap.set(cid, count);
        }
      }
    } catch {
      // read_at column may not exist yet
    }

    const activeRelationships = activeCandidates.map((c) => {
      const cp = getCounterpart(c);
      const updatedAt = c.updated_at ? new Date(c.updated_at) : null;
      const isRecent =
        updatedAt && now.getTime() - updatedAt.getTime() < 24 * 60 * 60 * 1000;

      return {
        candidateId: c.id,
        name: cp.display_name,
        avatarUrl: cp.avatar_url,
        stage: STATE_TO_STAGE[c.state] ?? "spark",
        lastActivityRecent: !!isRecent,
        category: c.category ?? "friendship",
        unreadCount: unreadMap.get(c.id) ?? 0,
      };
    });

    // -----------------------------------------------------------------------
    // 5. Recommended Next Action (simple heuristic)
    // -----------------------------------------------------------------------
    let recommendedAction = null;
    if (activeCandidates.length === 0) {
      recommendedAction = {
        id: "explore",
        icon: "\u{1F50D}",
        title: "新しい出会いを探す",
        description: "アバターがあなたに合いそうな人を探しています。プロフィールを充実させてマッチング精度を上げましょう。",
        actionPath: "/rendezvous/settings",
      };
    } else {
      // Find the candidate with the most recent activity
      const latest = activeCandidates[0];
      if (latest) {
        const cp = getCounterpart(latest);
        recommendedAction = {
          id: "continue",
          icon: "\u{1F4AC}",
          title: `${cp.display_name}との会話を続ける`,
          description: "関係を深めるために、次のステップに進みましょう。",
          actionPath: `/rendezvous/${latest.id}`,
        };
      }
    }

    // -----------------------------------------------------------------------
    // 6. Feed Preview
    // -----------------------------------------------------------------------
    const rawFeed = feedResult.data ?? [];
    const feedPreview = rawFeed.map((f) => {
      const cp = getCounterpart(f);
      const stateLabel =
        f.state === "avatar_contact"
          ? "アバターが接触中"
          : f.state === "revealed"
            ? "プロフィール公開済み"
            : f.state === "conversation"
              ? "会話進行中"
              : "関係が進展中";

      return {
        id: f.id,
        type: f.state ?? "unknown",
        title: `${cp.display_name}との${stateLabel}`,
        description: stateLabel,
        category: f.category ?? "friendship",
        createdAt: f.updated_at ?? "",
      };
    });

    // -----------------------------------------------------------------------
    // 7. Avatar Journey Events (vitality)
    // -----------------------------------------------------------------------
    const rawJourneyEvents = journeyEventsResult.data ?? [];
    const journeyEvents = rawJourneyEvents.map((e: any) => ({
      id: e.id,
      eventType: e.event_type,
      emotion: e.emotion_state,
      narrative: e.narrative_ja,
      candidateId: e.candidate_id,
      timeSlot: e.time_slot,
      createdAt: e.created_at,
    }));

    const vitality = buildVitalityState(journeyEvents);

    // -----------------------------------------------------------------------
    // Response
    // -----------------------------------------------------------------------
    return NextResponse.json({
      avatarStatus,
      stories,
      animaWhisper,
      activeRelationships,
      recommendedAction,
      feedPreview,
      journeyEvents,
      avatarEmotion: vitality.currentEmotion,
      avatarPulse: vitality.activityPulse,
    });
  } catch (err: unknown) {
    console.error("[rendezvous/home]", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
