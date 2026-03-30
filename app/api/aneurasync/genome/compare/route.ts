// app/api/aneurasync/genome/compare/route.ts
// Compare two users' genomes — requires mutual Rendezvous match

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  assemblePersonaGenome,
  buildGenomeVisualizationData,
  type GenomeAssemblyInput,
  type DimensionScore,
  type PersonalityInsight,
  type SyncLevel,
  type OrbitSnapshotRow,
} from "@/lib/aneurasync/personaGenome";
import { buildComparativeData } from "@/lib/aneurasync/genomeComparison";

export async function GET(req: NextRequest) {
  try {
    const partnerId = req.nextUrl.searchParams.get("partnerId");
    if (!partnerId) {
      return NextResponse.json({ error: "partnerId required" }, { status: 400 });
    }

    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify mutual match via rendezvous_matches
    const { data: match } = await supabase
      .from("rendezvous_matches")
      .select("id")
      .or(`and(user_a.eq.${user.id},user_b.eq.${partnerId}),and(user_a.eq.${partnerId},user_b.eq.${user.id})`)
      .eq("status", "matched")
      .limit(1)
      .maybeSingle();

    if (!match) {
      return NextResponse.json(
        { error: "Mutual match required to compare genomes" },
        { status: 403 },
      );
    }

    // Build my genome
    const myViz = await buildUserGenomeVisualization(user.id, supabase);

    // Build partner genome via admin (bypass RLS)
    const admin = supabaseAdmin;
    const partnerViz = await buildUserGenomeVisualization(partnerId, admin);

    // Get partner display name
    const { data: partnerProfile } = await admin
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", partnerId)
      .maybeSingle();

    const comparison = buildComparativeData(
      myViz,
      partnerViz,
      partnerProfile?.display_name ?? "パートナー",
      partnerProfile?.avatar_url ?? null,
    );

    return NextResponse.json({ ok: true, comparison });
  } catch (err) {
    console.error("[genome/compare] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * Build GenomeVisualizationData for a given user ID.
 * Uses the provided supabase client (either user-scoped or admin).
 */
async function buildUserGenomeVisualization(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
) {
  const [
    bodyProfileRes,
    styleVectorRes,
    dimensionsRes,
    insightsRes,
    syncLevelRes,
    coreStarRes,
    tasteLayersRes,
    prefProfileRes,
    orbitSnapshotsRes,
    swipeCountRes,
    preMatchesRes,
  ] = await Promise.all([
    client.from("body_profiles").select("*").eq("user_id", userId).maybeSingle(),
    client.from("style_vectors").select("*").eq("user_id", userId).maybeSingle(),
    client.from("personality_dimensions").select("*").eq("user_id", userId),
    client.from("personality_insights").select("*").eq("user_id", userId).limit(20),
    client.from("sync_levels").select("*").eq("user_id", userId).maybeSingle(),
    client.from("core_stars").select("*").eq("user_id", userId).maybeSingle(),
    client.from("taste_layers").select("*").eq("user_id", userId).order("period_start", { ascending: false }).limit(3),
    client.from("preference_profiles").select("*").eq("user_id", userId).maybeSingle(),
    client.from("orbit_snapshots").select("*").eq("user_id", userId).order("captured_at", { ascending: false }).limit(20),
    client.from("swipe_events").select("id", { count: "exact", head: true }).eq("user_id", userId),
    client.from("rendezvous_matches").select("id", { count: "exact", head: true })
      .or(`user_a.eq.${userId},user_b.eq.${userId}`).eq("status", "matched"),
  ]);

  const bodyProfile = bodyProfileRes.data;
  const styleVector = styleVectorRes.data;
  const dimensions = (dimensionsRes.data ?? []) as DimensionScore[];
  const insights = (insightsRes.data ?? []) as PersonalityInsight[];
  const syncLevel = syncLevelRes.data as SyncLevel | null;
  const coreStar = coreStarRes.data;
  const tasteLayers = tasteLayersRes.data ?? [];
  const prefProfile = prefProfileRes.data;
  const orbitSnapshots = (orbitSnapshotsRes.data ?? []) as OrbitSnapshotRow[];

  const input: GenomeAssemblyInput = {
    userId,
    bodyProfile,
    styleVector,
    dimensions,
    insights,
    syncLevel,
    tasteLayers,
    prefProfile,
    swipeStats: swipeCountRes.count ? { total: swipeCountRes.count, likes: 0, saves: 0, purchaseIntents: 0 } : null,
    matchScoresAsTarget: preMatchesRes.count ? [{ people_fit_to_me: preMatchesRes.count }] : [],
    orbitSnapshots,
    facePhenotype: null,
  };

  const genome = assemblePersonaGenome(input);
  return buildGenomeVisualizationData(genome);
}
