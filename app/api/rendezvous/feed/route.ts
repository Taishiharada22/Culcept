import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { serializeCard } from "@/lib/rendezvous/serializer";
import { buildMyStyleContextLens, loadMyStyleProfileMap } from "@/lib/rendezvous/myStyleLens";
import { getCounterpartId, getBlockedUserIds } from "@/lib/rendezvous/helpers";
import type {
  RendezvousCandidate,
  RendezvousUserStateRow,
  RendezvousProfile,
  RendezvousCardDTO,
} from "@/lib/rendezvous/types";

export async function GET(request: NextRequest) {
  try {
    // Auth via supabaseServer (user-scoped)
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
      Math.max(parseInt(url.searchParams.get("limit") ?? "3", 10), 1),
      50,
    );

    const now = new Date().toISOString();

    // Use supabaseAdmin for all DB operations (cross-user profile reads bypass RLS)
    const { data: candidates, error: candErr } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("*")
      .not("state", "in", "(expired,dismissed)")
      .not("delivered_at", "is", null)
      .lte("delivered_at", now)
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order("delivered_at", { ascending: false });

    if (candErr)
      return NextResponse.json(
        { ok: false, error: candErr.message },
        { status: 500 },
      );

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({
        ok: true,
        items: [],
        summary: {
          newCount: 0,
          waitingCount: 0,
          openedConversationCount: 0,
        },
      });
    }

    const candidateIds = candidates.map(
      (c: RendezvousCandidate) => c.id,
    );

    // Fetch my user states for all candidates
    const { data: userStates, error: stateErr } = await supabaseAdmin
      .from("rendezvous_user_states")
      .select("*")
      .eq("user_id", userId)
      .in("candidate_id", candidateIds);

    if (stateErr)
      return NextResponse.json(
        { ok: false, error: stateErr.message },
        { status: 500 },
      );

    const stateMap = new Map<string, RendezvousUserStateRow>();
    for (const s of (userStates ?? []) as RendezvousUserStateRow[]) {
      stateMap.set(s.candidate_id, s);
    }

    // Collect counterpart user IDs
    const counterpartIds = new Set<string>();
    for (const c of candidates as RendezvousCandidate[]) {
      counterpartIds.add(getCounterpartId(c, userId));
    }

    // Fetch counterpart profiles
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("*")
      .in("user_id", Array.from(counterpartIds));

    if (profErr)
      return NextResponse.json(
        { ok: false, error: profErr.message },
        { status: 500 },
      );

    const profileMap = new Map<string, RendezvousProfile>();
    for (const p of (profiles ?? []) as RendezvousProfile[]) {
      profileMap.set(p.user_id, p);
    }

    const myStyleProfileMap = await loadMyStyleProfileMap(
      supabaseAdmin,
      [userId, ...Array.from(counterpartIds)],
    );

    // Fetch blocked user IDs
    const blockedIds = await getBlockedUserIds(supabaseAdmin, userId);

    // Sort: unseen first, then by delivered_at desc
    const enriched = (candidates as RendezvousCandidate[])
      .map((c) => {
        const myState = stateMap.get(c.id);
        const counterpartId = getCounterpartId(c, userId);
        const counterpartProfile = profileMap.get(counterpartId);
        return { candidate: c, myState, counterpartProfile };
      })
      .filter(
        (
          x,
        ): x is {
          candidate: RendezvousCandidate;
          myState: RendezvousUserStateRow;
          counterpartProfile: RendezvousProfile;
        } => !!x.myState && !!x.counterpartProfile,
      )
      .filter((x) => !blockedIds.has(getCounterpartId(x.candidate, userId)))
      .sort((a, b) => {
        const aUnseen = a.myState.state === "unseen" ? 0 : 1;
        const bUnseen = b.myState.state === "unseen" ? 0 : 1;
        if (aUnseen !== bUnseen) return aUnseen - bUnseen;
        const aTime = a.candidate.delivered_at ?? "";
        const bTime = b.candidate.delivered_at ?? "";
        return bTime.localeCompare(aTime);
      });

    // Summary counts (over all, not just limited)
    let newCount = 0;
    let waitingCount = 0;
    let openedConversationCount = 0;
    for (const item of enriched) {
      if (item.myState.state === "unseen") newCount++;
      if (
        item.myState.state === "seen" ||
        item.myState.state === "liked"
      )
        waitingCount++;
      if (
        item.candidate.state === "mutual_liked" ||
        item.candidate.state === "chat_opened"
      )
        openedConversationCount++;
    }

    // Apply limit
    const limited = enriched.slice(0, limit);

    const items: RendezvousCardDTO[] = limited.map((item) => {
      const counterpartId = getCounterpartId(item.candidate, userId);
      const contextLens = buildMyStyleContextLens({
        selfProfile: myStyleProfileMap.get(userId),
        counterpartProfile: myStyleProfileMap.get(counterpartId),
      });
      return serializeCard({
        candidate: item.candidate,
        myState: item.myState,
        counterpartProfile: item.counterpartProfile,
        contextLens,
      });
    });

    return NextResponse.json({
      ok: true,
      items,
      summary: { newCount, waitingCount, openedConversationCount },
    });
  } catch (err: any) {
    console.error("[rendezvous/feed] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
