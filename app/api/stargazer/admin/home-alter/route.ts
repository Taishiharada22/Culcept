/**
 * Home Alter 実運用ダッシュボード API
 *
 * 指標:
 *   1. action_shape 分布
 *   2. 提案実行率
 *   3. 実行後の満足度分布
 *   4. 日次利用数
 *   5. response_mode 分布 (conclude/branch/clarify)
 *   6. query_domain 分布 (romance/work/friend/family/self/general)
 *   7. 曖昧性スコア分布
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/isAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email)) {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    }

    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get("days") ?? "30", 10);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // 1. action_shape 分布
    const { data: judgments } = await supabase
      .from("stargazer_analytics")
      .select("metadata, created_at")
      .eq("event", "home_alter_judgment")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });

    const shapeDist: Record<string, number> = {};
    const stanceDist: Record<string, number> = {};
    const dailyCounts: Record<string, number> = {};
    const modeDist: Record<string, number> = {};
    const domainDist: Record<string, number> = {};
    const ambiguityBuckets: Record<string, number> = { "0-0.3": 0, "0.3-0.6": 0, "0.6-0.8": 0, "0.8-1.0": 0 };

    for (const j of judgments ?? []) {
      const shape = j.metadata?.action_shape ?? "unknown";
      const stance = j.metadata?.decision_stance ?? "unknown";
      shapeDist[shape] = (shapeDist[shape] ?? 0) + 1;
      stanceDist[stance] = (stanceDist[stance] ?? 0) + 1;

      const day = j.created_at?.slice(0, 10) ?? "unknown";
      dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;

      // Ambiguity Engine metrics
      const mode = j.metadata?.response_mode ?? "unknown";
      modeDist[mode] = (modeDist[mode] ?? 0) + 1;

      const domain = j.metadata?.query_domain ?? "unknown";
      domainDist[domain] = (domainDist[domain] ?? 0) + 1;

      const ambig = j.metadata?.ambiguity_score;
      if (typeof ambig === "number") {
        if (ambig < 0.3) ambiguityBuckets["0-0.3"]++;
        else if (ambig < 0.6) ambiguityBuckets["0.3-0.6"]++;
        else if (ambig < 0.8) ambiguityBuckets["0.6-0.8"]++;
        else ambiguityBuckets["0.8-1.0"]++;
      }
    }

    // 2. フォローアップ（提案実行率 + 満足度）
    const { data: followups } = await supabase
      .from("stargazer_analytics")
      .select("metadata")
      .eq("event", "home_alter_followup")
      .gte("created_at", cutoff);

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

    const totalFollowups = executedCount + notExecutedCount;
    const executionRate =
      totalFollowups > 0 ? Math.round((executedCount / totalFollowups) * 100) : null;

    // 3. ユニークユーザー数
    const uniqueUsers = new Set(
      (judgments ?? []).map((j) => j.metadata?.user_id).filter(Boolean),
    );

    // 4. clarify イベント集計
    const { data: clarifyEvents } = await supabase
      .from("stargazer_analytics")
      .select("metadata")
      .eq("event", "home_alter_clarify")
      .gte("created_at", cutoff);

    const clarifyDomains: Record<string, number> = {};
    for (const c of clarifyEvents ?? []) {
      const d = c.metadata?.query_domain ?? "unknown";
      clarifyDomains[d] = (clarifyDomains[d] ?? 0) + 1;
    }

    return NextResponse.json({
      period: `${days}d`,
      totalJudgments: judgments?.length ?? 0,
      uniqueUsers: uniqueUsers.size || (judgments?.length ? "N/A (no user_id in metadata)" : 0),
      actionShapeDistribution: shapeDist,
      stanceDistribution: stanceDist,
      dailyUsage: dailyCounts,
      // Ambiguity Engine metrics
      responseModeDistribution: modeDist,
      queryDomainDistribution: domainDist,
      ambiguityDistribution: ambiguityBuckets,
      clarify: {
        total: clarifyEvents?.length ?? 0,
        domainBreakdown: clarifyDomains,
      },
      followup: {
        total: totalFollowups,
        executed: executedCount,
        notExecuted: notExecutedCount,
        executionRate: executionRate !== null ? `${executionRate}%` : "N/A",
        satisfactionDistribution: satisfactionDist,
      },
    });
  } catch (error) {
    console.error("[admin/home-alter] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
