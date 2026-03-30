import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createEncounterIfEligible } from "@/lib/rendezvous/createEncounter";

/**
 * POST /api/internal/rendezvous/encounters/stargazer-affinity
 * Cron: Stargazerの性格軸類似度に基づいてencounterを生成
 *
 * ロジック:
 * 1. Rendezvous有効ユーザーの最新axis_snapshotsを取得
 * 2. ペアごとのコサイン類似度を計算
 * 3. 閾値超えのペアにencounterを生成
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // 1. Get all Rendezvous-enabled users
    const { data: profiles } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("user_id")
      .eq("is_enabled", true)
      .eq("is_paused", false)
      .limit(500);

    if (!profiles || profiles.length < 2) {
      return NextResponse.json({ ok: true, created: 0, message: "Not enough users" });
    }

    const userIds = profiles.map((p: any) => p.user_id);

    // 2. Get latest axis snapshots for these users
    const { data: snapshots } = await supabaseAdmin
      .from("stargazer_axis_snapshots")
      .select("user_id, axis_id, score")
      .in("user_id", userIds)
      .order("created_at", { ascending: false });

    if (!snapshots || snapshots.length === 0) {
      return NextResponse.json({ ok: true, created: 0, message: "No stargazer data" });
    }

    // Build per-user axis vectors (latest score per axis)
    const userVectors = new Map<string, Map<string, number>>();
    for (const s of snapshots) {
      if (!userVectors.has(s.user_id)) {
        userVectors.set(s.user_id, new Map());
      }
      const axes = userVectors.get(s.user_id)!;
      if (!axes.has(s.axis_id)) {
        axes.set(s.axis_id, s.score);
      }
    }

    // Filter users who have enough axes
    const MIN_AXES = 5;
    const usersWithData = [...userVectors.entries()]
      .filter(([, axes]) => axes.size >= MIN_AXES)
      .map(([userId, axes]) => ({ userId, axes }));

    if (usersWithData.length < 2) {
      return NextResponse.json({ ok: true, created: 0, message: "Not enough stargazer data" });
    }

    // 3. Compute pairwise similarity and create encounters
    let created = 0;
    let skipped = 0;
    const MAX_ENCOUNTERS = 50;
    const SIMILARITY_THRESHOLD = 0.65;

    // Build pairs sorted by estimated affinity
    const pairs: { a: number; b: number; sim: number }[] = [];

    for (let i = 0; i < usersWithData.length; i++) {
      for (let j = i + 1; j < usersWithData.length; j++) {
        const sim = cosineSimilarity(usersWithData[i].axes, usersWithData[j].axes);
        if (sim >= SIMILARITY_THRESHOLD) {
          pairs.push({ a: i, b: j, sim });
        }
      }
    }

    // Sort by similarity descending, take top N
    pairs.sort((x, y) => y.sim - x.sim);

    for (const pair of pairs.slice(0, MAX_ENCOUNTERS)) {
      if (created >= MAX_ENCOUNTERS) break;

      const result = await createEncounterIfEligible(
        supabaseAdmin,
        usersWithData[pair.a].userId,
        usersWithData[pair.b].userId,
        "schedule_overlap", // Using schedule_overlap for affinity-based seeding
        {
          coarseContext: `Stargazer性格類似度: ${Math.round(pair.sim * 100)}%`,
          rawSignalScore: pair.sim,
        },
      );

      if (result.created) {
        created++;
      } else {
        skipped++;
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      skipped,
      totalPairsEvaluated: pairs.length,
      usersWithData: usersWithData.length,
    });
  } catch (err: any) {
    console.error("[stargazer-affinity] error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

/**
 * コサイン類似度: 共通軸のみで計算
 */
function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  let commonCount = 0;

  for (const [axis, scoreA] of a) {
    const scoreB = b.get(axis);
    if (scoreB !== undefined) {
      dotProduct += scoreA * scoreB;
      normA += scoreA * scoreA;
      normB += scoreB * scoreB;
      commonCount++;
    }
  }

  if (commonCount < 3 || normA === 0 || normB === 0) return 0;

  const sim = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  // Normalize from [-1, 1] to [0, 1]
  return (sim + 1) / 2;
}
