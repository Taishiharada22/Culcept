import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCounterpartId } from "@/lib/rendezvous/helpers";
import { serializeCard } from "@/lib/rendezvous/serializer";
import type {
  RendezvousCandidate,
  RendezvousUserStateRow,
  RendezvousProfile,
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

    // Use supabaseAdmin for all DB operations (cross-user reads bypass RLS)
    const { data: candidates, error: candErr } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("*")
      .in("state", ["mutual_liked", "chat_opened"])
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order("matched_at", { ascending: false });

    if (candErr)
      return NextResponse.json(
        { ok: false, error: candErr.message },
        { status: 500 },
      );

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ ok: true, conversations: [] });
    }

    const candidateIds = (candidates as RendezvousCandidate[]).map(
      (c) => c.id,
    );

    // Fetch chats for these candidates
    const { data: chats, error: chatErr } = await supabaseAdmin
      .from("rendezvous_chats")
      .select("*")
      .in("candidate_id", candidateIds);

    if (chatErr)
      return NextResponse.json(
        { ok: false, error: chatErr.message },
        { status: 500 },
      );

    const chatMap = new Map<string, { thread_id: string; opened_at: string }>();
    for (const c of chats ?? []) {
      chatMap.set(c.candidate_id, {
        thread_id: c.thread_id,
        opened_at: c.opened_at,
      });
    }

    // Fetch my user states
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

    // Collect counterpart IDs
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

    // Fetch unread counts per candidate
    const unreadCountMap = new Map<string, number>();
    try {
      for (const cid of candidateIds) {
        const { count } = await supabaseAdmin
          .from("rendezvous_messages")
          .select("*", { count: "exact", head: true })
          .eq("candidate_id", cid)
          .neq("sender_id", userId)
          .is("read_at", null);
        unreadCountMap.set(cid, count ?? 0);
      }
    } catch {
      // read_at column may not exist yet; ignore
    }

    // Assemble conversation items
    const conversations = (candidates as RendezvousCandidate[])
      .map((c) => {
        const myState = stateMap.get(c.id);
        const counterpartId = getCounterpartId(c, userId);
        const counterpartProfile = profileMap.get(counterpartId);
        const chat = chatMap.get(c.id);

        if (!myState || !counterpartProfile) return null;

        const card = serializeCard({
          candidate: c,
          myState,
          counterpartProfile,
        });

        return {
          ...card,
          threadId: chat?.thread_id ?? null,
          chatOpenedAt: chat?.opened_at ?? null,
          matchedAt: c.matched_at,
          unreadCount: unreadCountMap.get(c.id) ?? 0,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, conversations });
  } catch (err: any) {
    console.error("[rendezvous/conversations] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
