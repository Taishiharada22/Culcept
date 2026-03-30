// app/(immersive)/stargazer/admin/home-alter/page.tsx
// Home Alter 実運用ダッシュボード — server component with auth guard.

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/isAdmin";
import HomeAlterDashboardClient from "./HomeAlterDashboardClient";

export const dynamic = "force-dynamic";

export default async function HomeAlterAdminPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    redirect("/stargazer");
  }

  const days = 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Fetch judgment events
  const { data: judgments } = await supabase
    .from("stargazer_analytics")
    .select("metadata, created_at")
    .eq("event", "home_alter_judgment")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });

  // Fetch clarify events
  const { data: clarifyEvents } = await supabase
    .from("stargazer_analytics")
    .select("metadata, created_at")
    .eq("event", "home_alter_clarify")
    .gte("created_at", cutoff);

  // Fetch followup events
  const { data: followups } = await supabase
    .from("stargazer_analytics")
    .select("metadata")
    .eq("event", "home_alter_followup")
    .gte("created_at", cutoff);

  // Aggregate
  const shapeDist: Record<string, number> = {};
  const stanceDist: Record<string, number> = {};
  const modeDist: Record<string, number> = {};
  const domainDist: Record<string, number> = {};
  const ambiguityBuckets = { low: 0, mid: 0, high: 0, extreme: 0 };
  const dailyCounts: Record<string, number> = {};

  for (const j of judgments ?? []) {
    const shape = j.metadata?.action_shape ?? "unknown";
    const stance = j.metadata?.decision_stance ?? "unknown";
    shapeDist[shape] = (shapeDist[shape] ?? 0) + 1;
    stanceDist[stance] = (stanceDist[stance] ?? 0) + 1;

    const mode = j.metadata?.response_mode ?? "unknown";
    modeDist[mode] = (modeDist[mode] ?? 0) + 1;

    const domain = j.metadata?.query_domain ?? "unknown";
    domainDist[domain] = (domainDist[domain] ?? 0) + 1;

    const ambig = j.metadata?.ambiguity_score;
    if (typeof ambig === "number") {
      if (ambig < 0.3) ambiguityBuckets.low++;
      else if (ambig < 0.6) ambiguityBuckets.mid++;
      else if (ambig < 0.83) ambiguityBuckets.high++;
      else ambiguityBuckets.extreme++;
    }

    const day = j.created_at?.slice(0, 10) ?? "unknown";
    dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;
  }

  let executedCount = 0;
  let notExecutedCount = 0;
  const satisfactionDist: Record<number, number> = {};
  for (const f of followups ?? []) {
    if (f.metadata?.executed) {
      executedCount++;
      const sat = f.metadata?.satisfaction;
      if (typeof sat === "number") {
        satisfactionDist[sat] = (satisfactionDist[sat] ?? 0) + 1;
      }
    } else {
      notExecutedCount++;
    }
  }

  return (
    <HomeAlterDashboardClient
      data={{
        period: `${days}d`,
        totalJudgments: judgments?.length ?? 0,
        actionShapeDistribution: shapeDist,
        stanceDistribution: stanceDist,
        responseModeDistribution: modeDist,
        queryDomainDistribution: domainDist,
        ambiguityDistribution: ambiguityBuckets,
        dailyUsage: dailyCounts,
        clarifyTotal: clarifyEvents?.length ?? 0,
        followup: {
          total: executedCount + notExecutedCount,
          executed: executedCount,
          notExecuted: notExecutedCount,
          satisfactionDistribution: satisfactionDist,
        },
      }}
    />
  );
}
