import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { serializeCard } from "@/lib/rendezvous/serializer";
import { buildMyStyleContextLens, loadMyStyleProfileMap } from "@/lib/rendezvous/myStyleLens";
import { getCounterpartId, getBlockedUserIds, mapCategoryToContext } from "@/lib/rendezvous/helpers";
import type {
  RendezvousCandidate,
  RendezvousUserStateRow,
  RendezvousProfile,
  RendezvousCardDTO,
  RendezvousListTab,
} from "@/lib/rendezvous/types";
import type { ContextType } from "@/lib/rendezvous/questions/types";

const VALID_TABS: RendezvousListTab[] = [
  "new",
  "waiting",
  "saved",
  "conversations",
];
const PAGE_SIZE = 20;

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
    const tab = (url.searchParams.get("tab") ?? "new") as RendezvousListTab;
    const cursor = url.searchParams.get("cursor"); // ISO timestamp
    const context = url.searchParams.get("context") as ContextType | null;

    if (!VALID_TABS.includes(tab)) {
      return NextResponse.json(
        { ok: false, error: "Invalid tab parameter" },
        { status: 400 },
      );
    }

    // Step 1: get my user_states filtered by tab
    let stateFilter: string[];
    if (tab === "new") {
      stateFilter = ["unseen"];
    } else if (tab === "waiting") {
      stateFilter = ["seen", "liked"];
    } else if (tab === "saved") {
      stateFilter = ["saved"];
    } else {
      // conversations - we need to filter by candidate state later
      stateFilter = ["unseen", "seen", "liked", "saved"];
    }

    // Use supabaseAdmin for all DB operations (cross-user profile reads bypass RLS)
    let stateQuery = supabaseAdmin
      .from("rendezvous_user_states")
      .select("*")
      .eq("user_id", userId)
      .in("state", stateFilter)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1);

    // For cursor pagination we filter by the user_state's associated candidate
    // But user_states don't have delivered_at, so we need a two-step approach

    const { data: userStates, error: stateErr } = await stateQuery;

    if (stateErr)
      return NextResponse.json(
        { ok: false, error: stateErr.message },
        { status: 500 },
      );

    if (!userStates || userStates.length === 0) {
      return NextResponse.json({ ok: true, items: [], nextCursor: null });
    }

    const candidateIds = (userStates as RendezvousUserStateRow[]).map(
      (s) => s.candidate_id,
    );

    // Step 2: fetch candidates
    let candidateQuery = supabaseAdmin
      .from("rendezvous_candidates")
      .select("*")
      .in("id", candidateIds)
      .not("state", "in", "(expired,dismissed)")
      .not("delivered_at", "is", null)
      .order("delivered_at", { ascending: false });

    if (cursor) {
      candidateQuery = candidateQuery.lt("delivered_at", cursor);
    }

    const { data: candidates, error: candErr } = await candidateQuery;

    if (candErr)
      return NextResponse.json(
        { ok: false, error: candErr.message },
        { status: 500 },
      );

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ ok: true, items: [], nextCursor: null });
    }

    // For conversations tab: filter to mutual_liked or chat_opened
    let filteredCandidates = candidates as RendezvousCandidate[];
    if (tab === "conversations") {
      filteredCandidates = filteredCandidates.filter(
        (c) => c.state === "mutual_liked" || c.state === "chat_opened",
      );
    }

    // For waiting tab: filter out candidates that are already mutual_liked
    if (tab === "waiting") {
      filteredCandidates = filteredCandidates.filter(
        (c) =>
          c.state !== "mutual_liked" &&
          c.state !== "chat_opened" &&
          c.state !== "expired" &&
          c.state !== "dismissed",
      );
    }

    // Build state map
    const stateMap = new Map<string, RendezvousUserStateRow>();
    for (const s of userStates as RendezvousUserStateRow[]) {
      stateMap.set(s.candidate_id, s);
    }

    // Collect counterpart IDs
    const counterpartIds = new Set<string>();
    for (const c of filteredCandidates) {
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

    // Assemble items
    const enriched = filteredCandidates
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
      .filter((x) => !blockedIds.has(getCounterpartId(x.candidate, userId)));

    const serialized = enriched.map((item) => {
      const counterpartId = getCounterpartId(item.candidate, userId);
      const contextLens = buildMyStyleContextLens({
        selfProfile: myStyleProfileMap.get(userId),
        counterpartProfile: myStyleProfileMap.get(counterpartId),
      });
      return {
        candidate: item.candidate,
        card: serializeCard({
          candidate: item.candidate,
          myState: item.myState,
          counterpartProfile: item.counterpartProfile,
          contextLens,
        }),
      };
    });

    const contextFiltered = context
      ? serialized.filter((entry) => {
          const bestContext = entry.card.contextLens?.bestContext;
          return (bestContext ?? mapCategoryToContext(entry.candidate.category)) === context;
        })
      : serialized;

    // Pagination: take PAGE_SIZE, check if there's more
    const pageItems = contextFiltered.slice(0, PAGE_SIZE);
    const hasMore = contextFiltered.length > PAGE_SIZE;
    const nextCursor = hasMore
      ? pageItems[pageItems.length - 1]?.candidate.delivered_at
      : null;

    const items: RendezvousCardDTO[] = pageItems.map((entry) => entry.card);

    return NextResponse.json({ ok: true, items, nextCursor });
  } catch (err: any) {
    console.error("[rendezvous/list] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
