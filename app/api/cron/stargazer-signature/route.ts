import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  generatePsycheSignature,
  type SignatureInput,
} from "@/lib/stargazer/psycheSignature";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BATCH_LIMIT = 100;
const MIN_OBSERVATIONS = 7;

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Weekly Signature Update
 * Runs every Monday at 7:00 AM JST (Sunday 22:00 UTC)
 * For users with 7+ observations, regenerate Psyche Signature
 */
export async function GET(request: Request) {
  // Auth: verify CRON_SECRET
  if (
    request.headers.get("authorization") !==
    `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const details: string[] = [];
  let processed = 0;
  let errors = 0;

  try {
    const now = new Date();
    const today = toISODate(now);
    const weekAgo = toISODate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

    // 1. Get users with MIN_OBSERVATIONS+ observations
    // Try RPC first, fallback to direct query
    const { data: qualifiedUsers, error: rpcError } = await supabase
      .rpc("get_users_with_observation_count", {
        min_count: MIN_OBSERVATIONS,
        max_users: BATCH_LIMIT,
      })
      .select("user_id");

    let userIds: string[] = [];
    if (rpcError || !qualifiedUsers) {
      console.warn(
        "[stargazer-signature] RPC fallback: querying observations directly",
        rpcError?.message,
      );

      const { data: allObs } = await supabase
        .from("stargazer_observations")
        .select("user_id")
        .limit(5000);

      if (allObs) {
        const counts = new Map<string, number>();
        for (const row of allObs) {
          const uid = row.user_id as string;
          counts.set(uid, (counts.get(uid) ?? 0) + 1);
        }
        userIds = Array.from(counts.entries())
          .filter(([, count]) => count >= MIN_OBSERVATIONS)
          .map(([uid]) => uid)
          .slice(0, BATCH_LIMIT);
      }
    } else {
      const rows = Array.isArray(qualifiedUsers)
        ? qualifiedUsers
        : [qualifiedUsers];
      userIds = rows.map((r: { user_id: string }) => r.user_id);
    }

    details.push(
      `Found ${userIds.length} users with ${MIN_OBSERVATIONS}+ observations`,
    );

    for (const userId of userIds) {
      try {
        // 2a. Fetch core star profile
        const { data: coreStar } = await supabase
          .from("stargazer_core_star")
          .select("archetype_code, axis_scores, observation_depth")
          .eq("user_id", userId)
          .maybeSingle();

        if (!coreStar?.archetype_code || !coreStar?.axis_scores) {
          details.push(`User ${userId.slice(0, 8)}... skipped (no core star)`);
          continue;
        }

        // 2b. Fetch weather history for the past week
        const { data: weatherHistory } = await supabase
          .from("stargazer_inner_weather")
          .select("date, weather_type")
          .eq("user_id", userId)
          .gte("date", weekAgo)
          .order("date", { ascending: true });

        // 2c. Fetch prophecy accuracy
        const { data: prophecies } = await supabase
          .from("stargazer_daily_prophecies")
          .select("verification_status")
          .eq("user_id", userId)
          .in("verification_status", [
            "correct",
            "partially_correct",
            "wrong",
          ]);

        let prophecyAccuracy = 0;
        if (prophecies && prophecies.length > 0) {
          const correct = prophecies.filter(
            (p) => p.verification_status === "correct",
          ).length;
          const partial = prophecies.filter(
            (p) => p.verification_status === "partially_correct",
          ).length;
          prophecyAccuracy = (correct + partial * 0.5) / prophecies.length;
        }

        // 2d. Build signature input
        const signatureInput: SignatureInput = {
          archetypeCode: coreStar.archetype_code,
          axisScores: coreStar.axis_scores as Record<string, number>,
          weatherHistory: (weatherHistory ?? []).map((w) => ({
            date: w.date as string,
            type: w.weather_type as string,
          })),
          blindSpotDrops: 0,
          prophecyAccuracy,
          mapProgress: coreStar.observation_depth ?? 0.3,
          discoveries: [],
          period: "weekly" as const,
          periodStart: weekAgo,
          periodEnd: today,
        };

        // 2e. Generate signature
        const signature = generatePsycheSignature(signatureInput);

        // 2f. Insert to stargazer_psyche_signature (singular, JSONB storage)
        const { error: upsertError } = await supabase
          .from("stargazer_psyche_signature")
          .insert({
            user_id: userId,
            signature_type: "weekly",
            period_start: weekAgo,
            period_end: today,
            signature_data: signature,
            highlights: {
              mostExtremeAxis: signature.mostExtremeAxis ?? null,
              biggestContradiction: signature.biggestContradiction ?? null,
              topDiscoveries: signature.topDiscoveries,
            },
            share_token: signature.shareToken,
          });

        if (upsertError) {
          console.error(
            `[stargazer-signature] Upsert failed for user ${userId}:`,
            upsertError,
          );
          details.push(
            `User ${userId.slice(0, 8)}... upsert failed: ${upsertError.message}`,
          );
          errors++;
        } else {
          processed++;
          details.push(`User ${userId.slice(0, 8)}... signature updated`);
        }
      } catch (err) {
        console.error(`[stargazer-signature] Error for user ${userId}:`, err);
        details.push(
          `User ${userId.slice(0, 8)}... error: ${err instanceof Error ? err.message : "unknown"}`,
        );
        errors++;
      }
    }

    console.log(
      `[stargazer-signature] Done: processed=${processed}, errors=${errors}`,
    );

    return NextResponse.json({ processed, errors, details });
  } catch (error) {
    console.error("[stargazer-signature] Cron error:", error);
    details.push(
      `Fatal error: ${error instanceof Error ? error.message : "unknown"}`,
    );
    return NextResponse.json(
      { processed, errors: errors + 1, details },
      { status: 500 },
    );
  }
}
