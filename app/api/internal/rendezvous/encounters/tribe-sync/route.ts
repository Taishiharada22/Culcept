import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createEncounterIfEligible } from "@/lib/rendezvous/createEncounter";

/**
 * POST /api/internal/rendezvous/encounters/tribe-sync
 * Cron: 同じTribeに所属するユーザー間でencounterを生成
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Get all tribes with 2+ members
    const { data: tribes, error: tribeErr } = await supabaseAdmin
      .from("tribe_memberships")
      .select("tribe_id")
      .limit(1000);

    if (tribeErr) {
      return NextResponse.json({ ok: false, error: tribeErr.message }, { status: 500 });
    }

    // Group by tribe
    const tribeMap = new Map<string, string[]>();
    for (const row of tribes ?? []) {
      const members = tribeMap.get(row.tribe_id) ?? [];
      members.push(row.tribe_id); // will get user_ids below
      tribeMap.set(row.tribe_id, members);
    }

    // Get distinct tribe IDs with 2+ members
    const { data: tribeGroups } = await supabaseAdmin.rpc("get_tribe_pairs_for_encounter", {});

    // Fallback: manual aggregation if RPC doesn't exist
    const { data: allMemberships } = await supabaseAdmin
      .from("tribe_memberships")
      .select("tribe_id, user_id, tribe_name")
      .order("tribe_id");

    if (!allMemberships || allMemberships.length === 0) {
      return NextResponse.json({ ok: true, encounters: 0, message: "No tribe memberships" });
    }

    // Group members by tribe
    const membersByTribe = new Map<string, { userId: string; tribeName: string | null }[]>();
    for (const m of allMemberships) {
      const list = membersByTribe.get(m.tribe_id) ?? [];
      list.push({ userId: m.user_id, tribeName: m.tribe_name });
      membersByTribe.set(m.tribe_id, list);
    }

    let created = 0;
    let skipped = 0;
    const MAX_ENCOUNTERS_PER_RUN = 100;

    for (const [tribeId, members] of membersByTribe) {
      if (members.length < 2) continue;
      if (created >= MAX_ENCOUNTERS_PER_RUN) break;

      const tribeName = members[0].tribeName ?? tribeId;

      // Create encounters for each pair (limit pairs per tribe)
      for (let i = 0; i < members.length && created < MAX_ENCOUNTERS_PER_RUN; i++) {
        for (let j = i + 1; j < members.length && created < MAX_ENCOUNTERS_PER_RUN; j++) {
          const result = await createEncounterIfEligible(
            supabaseAdmin,
            members[i].userId,
            members[j].userId,
            "community_overlap",
            {
              coarseContext: `共同所属Tribe: ${tribeName}`,
              rawSignalScore: 0.55,
            },
          );

          if (result.created) {
            created++;
          } else {
            skipped++;
          }
        }
      }
    }

    return NextResponse.json({ ok: true, created, skipped });
  } catch (err: any) {
    console.error("[tribe-sync] error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
