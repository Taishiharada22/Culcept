import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCounterpartId, getBlockedUserIds } from "@/lib/rendezvous/helpers";
import type {
  RendezvousCandidate,
  RendezvousUserStateRow,
  RendezvousProfile,
  RendezvousCategory,
} from "@/lib/rendezvous/types";
import { getSeasonalWeightModifier } from "@/lib/rendezvous/seasonalMatching";

// ============================================================
// GET /api/rendezvous/explore
// Return next batch of candidates for the card stack
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const userId = auth.user.id;
    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") ?? "10", 10), 1),
      30,
    );
    const categoryFilter = url.searchParams.get("category") as
      | RendezvousCategory
      | null;

    const now = new Date().toISOString();

    // ---------- Fetch candidates ----------
    let query = supabaseAdmin
      .from("rendezvous_candidates")
      .select("*")
      .not("state", "in", "(expired,dismissed)")
      .not("delivered_at", "is", null)
      .lte("delivered_at", now)
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order("overall_score", { ascending: false });

    if (categoryFilter) {
      query = query.eq("category", categoryFilter);
    }

    const { data: allCandidates, error: candErr } = await query;
    if (candErr)
      return NextResponse.json(
        { ok: false, error: candErr.message },
        { status: 500 },
      );

    if (!allCandidates || allCandidates.length === 0) {
      return NextResponse.json({
        ok: true,
        candidates: [],
        dailySwipeCount: 0,
      });
    }

    const candidateIds = allCandidates.map(
      (c: RendezvousCandidate) => c.id,
    );

    // ---------- Fetch user states (to exclude already-swiped) ----------
    const { data: userStates } = await supabaseAdmin
      .from("rendezvous_user_states")
      .select("*")
      .eq("user_id", userId)
      .in("candidate_id", candidateIds);

    const stateMap = new Map<string, RendezvousUserStateRow>();
    for (const s of (userStates ?? []) as RendezvousUserStateRow[]) {
      stateMap.set(s.candidate_id, s);
    }

    // Exclude already-swiped (liked, passed, muted)
    const swipedStates = new Set(["liked", "passed", "muted"]);
    const unswiped = (allCandidates as RendezvousCandidate[]).filter((c) => {
      const state = stateMap.get(c.id);
      if (!state) return true; // no state = not yet seen
      return !swipedStates.has(state.state);
    });

    // ---------- Blocked users ----------
    const blockedIds = await getBlockedUserIds(supabaseAdmin, userId);
    const filtered = unswiped.filter(
      (c) => !blockedIds.has(getCounterpartId(c, userId)),
    );

    // ---------- Counterpart profiles ----------
    const counterpartIds = new Set<string>();
    for (const c of filtered) {
      counterpartIds.add(getCounterpartId(c, userId));
    }

    const { data: profiles } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("*")
      .in("user_id", Array.from(counterpartIds));

    const profileMap = new Map<string, RendezvousProfile>();
    for (const p of (profiles ?? []) as RendezvousProfile[]) {
      profileMap.set(p.user_id, p);
    }

    // ---------- Avatar conversation highlights ----------
    // Try to fetch from avatar_conversations table if it exists
    let avatarHighlightMap = new Map<string, { highlight: string; score: number }>();
    try {
      const { data: avatarConversations } = await supabaseAdmin
        .from("avatar_conversations")
        .select("candidate_id, highlight_text, conversation_score")
        .in("candidate_id", filtered.map((c) => c.id))
        .order("created_at", { ascending: false });

      if (avatarConversations) {
        for (const ac of avatarConversations) {
          if (!avatarHighlightMap.has(ac.candidate_id)) {
            avatarHighlightMap.set(ac.candidate_id, {
              highlight: ac.highlight_text ?? "",
              score: ac.conversation_score ?? 0,
            });
          }
        }
      }
    } catch {
      // Table might not exist yet; continue without highlights
    }

    // ---------- Build response ----------
    // Sort by: overall_score × 季節ウェイト修正
    const seasonalMod = getSeasonalWeightModifier(new Date());
    const categoryAffinityBoost = seasonalMod.categoryAffinity ?? 1;
    const sorted = filtered
      .map((c) => {
        const base = c.overall_score ?? 0;
        // 季節修正: categoryAffinity修正係数でスコア微調整
        const adjusted = base * categoryAffinityBoost;
        return { candidate: c, adjustedScore: adjusted };
      })
      .sort((a, b) => b.adjustedScore - a.adjustedScore)
      .slice(0, limit)
      .map((x) => x.candidate);

    const candidates = sorted.map((c) => {
      const counterpartId = getCounterpartId(c, userId);
      const profile = profileMap.get(counterpartId);
      const avatarData = avatarHighlightMap.get(c.id);

      // Derive resonance level from overall_score (0-3)
      const score = c.overall_score ?? 0;
      const resonanceLevel =
        score >= 80 ? 3 : score >= 60 ? 2 : score >= 40 ? 1 : 0;

      // Build bridge prediction from reason_texts
      const bridgePrediction =
        c.reason_texts && c.reason_texts.length > 0
          ? c.reason_texts[0]
          : null;

      // Core phrase from label or public_mood_summary
      const corePhrase =
        c.label ??
        profile?.public_mood_summary ??
        "まだ言葉にならない共鳴";

      return {
        candidateId: c.id,
        displayName: profile?.display_name ?? "?",
        photoUrl: profile?.avatar_asset_url ?? null,
        age: null, // age is not in rendezvous_profiles; omit
        area: null, // area is not in rendezvous_profiles; omit
        corePhrase,
        resonanceLevel,
        avatarHighlight: avatarData?.highlight ?? null,
        avatarConversationScore: avatarData?.score ?? 0,
        bridgePrediction,
        category: c.category,
      };
    });

    // ---------- Daily swipe count ----------
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: dailySwipeCount } = await supabaseAdmin
      .from("rendezvous_user_states")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("state", ["liked", "passed"])
      .gte("updated_at", todayStart.toISOString());

    return NextResponse.json({
      ok: true,
      candidates,
      dailySwipeCount: dailySwipeCount ?? 0,
    });
  } catch (err: any) {
    console.error("[rendezvous/explore GET] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

// ============================================================
// POST /api/rendezvous/explore
// Record a swipe decision
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const userId = auth.user.id;
    const body = await request.json();
    const { candidateId, direction } = body as {
      candidateId: string;
      direction: "right" | "left" | "up";
    };

    if (!candidateId || !direction) {
      return NextResponse.json(
        { ok: false, error: "Missing candidateId or direction" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();

    // Map direction to user state
    const stateFromDirection: Record<string, string> = {
      right: "liked",
      up: "liked", // super resonance = liked with flag
      left: "passed",
    };
    const newState = stateFromDirection[direction] ?? "passed";
    const isSuperResonance = direction === "up";

    // ---------- Upsert user state ----------
    const statePayload: Record<string, any> = {
      candidate_id: candidateId,
      user_id: userId,
      state: newState,
      updated_at: now,
    };

    if (newState === "liked") {
      statePayload.liked_at = now;
    } else if (newState === "passed") {
      statePayload.passed_at = now;
    }

    const { error: stateErr } = await supabaseAdmin
      .from("rendezvous_user_states")
      .upsert(statePayload, {
        onConflict: "candidate_id,user_id",
      });

    if (stateErr) {
      console.error("[explore POST] state upsert error:", stateErr);
      return NextResponse.json(
        { ok: false, error: stateErr.message },
        { status: 500 },
      );
    }

    // ---------- Check for mutual interest ----------
    let matchCreated = false;
    if (newState === "liked") {
      // Fetch the candidate to find the other user
      const { data: candidate } = await supabaseAdmin
        .from("rendezvous_candidates")
        .select("*")
        .eq("id", candidateId)
        .single();

      if (candidate) {
        const otherUserId =
          candidate.user_a === userId
            ? candidate.user_b
            : candidate.user_a;

        // Check if the other user also liked
        const { data: otherState } = await supabaseAdmin
          .from("rendezvous_user_states")
          .select("state")
          .eq("candidate_id", candidateId)
          .eq("user_id", otherUserId)
          .single();

        if (otherState?.state === "liked") {
          // Mutual! Update candidate state
          await supabaseAdmin
            .from("rendezvous_candidates")
            .update({
              state: "mutual_liked",
              matched_at: now,
              updated_at: now,
            })
            .eq("id", candidateId);

          matchCreated = true;
        } else {
          // Update candidate state to reflect one-sided like
          const updateField =
            candidate.user_a === userId ? "a_liked" : "b_liked";
          await supabaseAdmin
            .from("rendezvous_candidates")
            .update({
              state: updateField as any,
              updated_at: now,
            })
            .eq("id", candidateId);
        }
      }
    }

    // ---------- Record implicit observation ----------
    try {
      await supabaseAdmin.from("implicit_observatory_events").insert({
        user_id: userId,
        event_type: "swipe_decision",
        metadata: {
          candidate_id: candidateId,
          direction,
          is_super_resonance: isSuperResonance,
          timestamp: now,
        },
        created_at: now,
      });
    } catch {
      // Silent fail - observatory table might not exist
    }

    return NextResponse.json({
      ok: true,
      matchCreated,
      isSuperResonance,
    });
  } catch (err: any) {
    console.error("[rendezvous/explore POST] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
