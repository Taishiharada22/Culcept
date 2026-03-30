// app/stargazer/admin/page.tsx
// Stargazer admin analytics dashboard — server component with auth guard.

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/isAdmin";
import AdminDashboardClient from "./AdminDashboardClient";
import {
  getRetentionMetrics,
  getFeaturePopularity,
} from "@/lib/stargazer/analytics";

export const dynamic = "force-dynamic";

export default async function StargazerAdminPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    redirect("/stargazer");
  }

  // --- Fetch all data server-side (no API roundtrip needed) ---
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
    getRetentionMetrics(30),
    getFeaturePopularity(30),
    supabase
      .from("stargazer_profiles")
      .select("user_id", { count: "exact", head: true }),
    supabase.from("stargazer_profiles").select("total_sessions"),
    supabase
      .from("stargazer_analytics")
      .select("user_id")
      .gte("created_at", todayIso),
    supabase.from("stargazer_prediction_accuracy").select("accuracy"),
    supabase
      .from("stargazer_analytics")
      .select("event")
      .in("event", ["whisper_shown", "whisper_clicked", "alter_turn"]),
    supabase.from("stargazer_profiles").select("depth_phase"),
  ]);

  // Aggregate
  const totalObservations = (totalObservationsRes.data ?? []).reduce(
    (sum: number, row: { total_sessions?: number | null }) =>
      sum + (row.total_sessions ?? 0),
    0,
  );

  const todayUniqueUsers = new Set(
    (todayActiveRes.data ?? []).map(
      (r: { user_id: string }) => r.user_id,
    ),
  ).size;

  const accuracyRows = (prophecyAccuracyRes.data ?? []) as {
    accuracy?: number | null;
  }[];
  const avgAccuracy =
    accuracyRows.length > 0
      ? accuracyRows.reduce((s, r) => s + (r.accuracy ?? 0), 0) /
        accuracyRows.length
      : 0;

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

  return (
    <AdminDashboardClient
      data={{
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
      }}
    />
  );
}
