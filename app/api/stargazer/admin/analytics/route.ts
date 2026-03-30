// app/api/stargazer/admin/analytics/route.ts
// Stargazer admin analytics — aggregate metrics for the management dashboard.

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/isAdmin";
import {
  getRetentionMetrics,
  getFeaturePopularity,
} from "@/lib/stargazer/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !isAdminEmail(user.email)) {
      return NextResponse.json(
        { error: "forbidden" },
        { status: 403 },
      );
    }

    // --- Parallel data fetching ---
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    const [
      retention,
      popularity,
      totalUsersRes,
      totalObservationsRes,
      todayActiveRes,
      prophecyAccuracyRes,
      whisperFunnelRes,
      phaseDistributionRes,
    ] = await Promise.all([
      // 1. Retention metrics (DAU/WAU/MAU)
      getRetentionMetrics(30),

      // 2. Feature popularity
      getFeaturePopularity(30),

      // 3. Total Stargazer users
      supabase
        .from("stargazer_profiles")
        .select("user_id", { count: "exact", head: true }),

      // 4. Total observations (sum of total_sessions)
      supabase
        .from("stargazer_profiles")
        .select("total_sessions"),

      // 5. Today's active users
      supabase
        .from("stargazer_analytics")
        .select("user_id")
        .gte("created_at", todayIso),

      // 6. Prophecy accuracy rate
      supabase
        .from("stargazer_prediction_accuracy")
        .select("accuracy"),

      // 7. Shadow Whisper funnel
      supabase
        .from("stargazer_analytics")
        .select("event")
        .in("event", ["whisper_shown", "whisper_clicked", "alter_turn"]),

      // 8. Phase distribution
      supabase
        .from("stargazer_profiles")
        .select("depth_phase"),
    ]);

    // --- Aggregate total observations ---
    const totalObservations = (totalObservationsRes.data ?? []).reduce(
      (sum: number, row: { total_sessions?: number | null }) =>
        sum + (row.total_sessions ?? 0),
      0,
    );

    // --- Today's unique active users ---
    const todayUniqueUsers = new Set(
      (todayActiveRes.data ?? []).map(
        (r: { user_id: string }) => r.user_id,
      ),
    ).size;

    // --- Prophecy accuracy average ---
    const accuracyRows = (prophecyAccuracyRes.data ?? []) as {
      accuracy?: number | null;
    }[];
    const avgAccuracy =
      accuracyRows.length > 0
        ? accuracyRows.reduce((s, r) => s + (r.accuracy ?? 0), 0) /
          accuracyRows.length
        : 0;

    // --- Shadow Whisper funnel ---
    const whisperEvents = (whisperFunnelRes.data ?? []) as {
      event: string;
    }[];
    const whisperShown = whisperEvents.filter(
      (e) => e.event === "whisper_shown",
    ).length;
    const whisperClicked = whisperEvents.filter(
      (e) => e.event === "whisper_clicked",
    ).length;
    const alterTurns = whisperEvents.filter(
      (e) => e.event === "alter_turn",
    ).length;

    // --- Phase distribution ---
    const phaseRows = (phaseDistributionRes.data ?? []) as {
      depth_phase?: string | null;
    }[];
    const phaseDistribution: Record<string, number> = {
      surface: 0,
      awakening: 0,
      maturity: 0,
      deep: 0,
    };
    for (const row of phaseRows) {
      const phase = row.depth_phase ?? "surface";
      phaseDistribution[phase] = (phaseDistribution[phase] ?? 0) + 1;
    }

    return NextResponse.json({
      kpi: {
        totalUsers: totalUsersRes.count ?? 0,
        totalObservations,
        todayActiveUsers: todayUniqueUsers,
        avgProphecyAccuracy: Math.round(avgAccuracy * 100) / 100,
      },
      retention,
      popularity,
      whisperFunnel: {
        shown: whisperShown,
        clicked: whisperClicked,
        alterTurns,
      },
      phaseDistribution,
    });
  } catch (err) {
    console.error("[api/stargazer/admin/analytics] error:", err);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 },
    );
  }
}
