// app/api/ceo/dashboard/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isCeoEmail } from "@/lib/auth/isCeo";
import { getRetentionMetrics, getFeaturePopularity } from "@/lib/stargazer/analytics";
import {
  getRecentSkillRuns,
  getSkillSummary,
  getLastRunBySkill,
  type SkillRun,
  type SkillSummaryResult,
} from "@/lib/ceo/skillTelemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── helpers ──

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function todayStartISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function toLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export async function GET(req: NextRequest) {
  // ── CEO認証 ──
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user || !isCeoEmail(auth.user.email)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  // データ取得: service_role でRLSバイパス（全ユーザーの集計データを取得するため）
  const db = supabaseAdmin;

  const range = req.nextUrl.searchParams.get("range") === "30" ? 30 : 7;
  const skillRangeParam = req.nextUrl.searchParams.get("skillRange");
  const skillRange: 0 | 7 | 30 = skillRangeParam === "7" ? 7 : skillRangeParam === "30" ? 30 : 0;
  const now = new Date();
  const sinceISO = daysAgoISO(range);
  const prevSinceISO = daysAgoISO(range * 2);

  // Skill time ranges
  const skillSinceISO = skillRange === 0 ? todayStartISO() : daysAgoISO(skillRange);
  const skillPrevSinceISO = skillRange === 0 ? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })() : daysAgoISO(skillRange * 2);
  const skillPrevUntilISO = skillSinceISO;

  // ── 並列データ取得 ──
  const [
    healthRes,
    totalProfilesRes,
    todaySignupsRes,
    totalObservationsRes,
    rendezvousProfilesRes,
    retention,
    featurePopularity,
    signupsTsRes,
    observationsTsRes,
    analyticsTsRes,
    rendezvousTsRes,
    prevSignupsRes,
    prevObservationsRes,
    prevRendezvousRes,
    recentSkillRuns,
    skillSummary,
    prevSkillSummary,
    lastRunBySkillRes,
  ] = await Promise.allSettled([
    fetch(new URL("/api/health", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"), {
      cache: "no-store",
    }).then((r) => r.json()),
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", todayStartISO()),
    db.from("stargazer_observations").select("id", { count: "exact", head: true }),
    db.from("rendezvous_profiles").select("id", { count: "exact", head: true }),
    getRetentionMetrics(30),
    getFeaturePopularity(range),
    db.from("profiles").select("created_at").gte("created_at", sinceISO).order("created_at"),
    db.from("stargazer_observations").select("created_at").gte("created_at", sinceISO).order("created_at"),
    db.from("stargazer_analytics").select("user_id, created_at").gte("created_at", sinceISO).order("created_at"),
    db.from("rendezvous_profiles").select("created_at").gte("created_at", sinceISO).order("created_at"),
    db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", prevSinceISO).lt("created_at", sinceISO),
    db.from("stargazer_observations").select("id", { count: "exact", head: true }).gte("created_at", prevSinceISO).lt("created_at", sinceISO),
    db.from("rendezvous_profiles").select("id", { count: "exact", head: true }).gte("created_at", prevSinceISO).lt("created_at", sinceISO),
    getRecentSkillRuns(30),
    getSkillSummary({ sinceISO: skillSinceISO }),
    getSkillSummary({ sinceISO: skillPrevSinceISO, untilISO: skillPrevUntilISO }),
    getLastRunBySkill(),
  ]);

  // ── settled helpers ──
  function val<T>(r: PromiseSettledResult<T>, fb: T): T {
    return r.status === "fulfilled" ? r.value : fb;
  }
  function cnt(r: PromiseSettledResult<{ count: number | null }>): number {
    return r.status === "fulfilled" ? (r.value as any)?.count ?? 0 : 0;
  }
  function rows(r: PromiseSettledResult<{ data: any[] | null }>): any[] {
    return r.status === "fulfilled" ? (r.value as any)?.data ?? [] : [];
  }

  const health = val(healthRes, { ok: false, services: {}, responseMs: null });

  // ── Build daily time-series ──
  function buildDailyCounts(rawRows: { created_at: string }[]): Record<string, number> {
    const map: Record<string, number> = {};
    for (const r of rawRows) {
      const day = r.created_at.slice(0, 10);
      map[day] = (map[day] ?? 0) + 1;
    }
    return map;
  }

  function buildDailyUniques(rawRows: { user_id: string; created_at: string }[]): Record<string, number> {
    const map: Record<string, Set<string>> = {};
    for (const r of rawRows) {
      const day = r.created_at.slice(0, 10);
      if (!map[day]) map[day] = new Set();
      map[day].add(r.user_id);
    }
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(map)) out[k] = v.size;
    return out;
  }

  const signupsByDay = buildDailyCounts(rows(signupsTsRes));
  const observationsByDay = buildDailyCounts(rows(observationsTsRes));
  const dauByDay = buildDailyUniques(rows(analyticsTsRes));
  const rendezvousByDay = buildDailyCounts(rows(rendezvousTsRes));

  const kpiTrends: { date: string; label: string; signups: number; observations: number; dau: number; rendezvous: number }[] = [];
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    kpiTrends.push({
      date: key,
      label: toLabel(d.toISOString()),
      signups: signupsByDay[key] ?? 0,
      observations: observationsByDay[key] ?? 0,
      dau: dauByDay[key] ?? 0,
      rendezvous: rendezvousByDay[key] ?? 0,
    });
  }

  const curSignups = Object.values(signupsByDay).reduce((a, b) => a + b, 0);
  const curObservations = Object.values(observationsByDay).reduce((a, b) => a + b, 0);
  const curRendezvous = Object.values(rendezvousByDay).reduce((a, b) => a + b, 0);

  const prevSignups = cnt(prevSignupsRes);
  const prevObservations = cnt(prevObservationsRes);
  const prevRendezvous = cnt(prevRendezvousRes);

  function delta(cur: number, prev: number): number | null {
    if (prev === 0) return cur > 0 ? 100 : null;
    return Math.round(((cur - prev) / prev) * 100);
  }

  // ── Skill data ──
  const emptySkill: SkillSummaryResult = { totalCount: 0, successCount: 0, successRate: 0, avgDurationMs: 0, failureCount: 0, autoCloseCount: 0, failedSkills: [], bySkill: [] };
  const skillData = val(skillSummary, emptySkill);
  const prevSkillData = val(prevSkillSummary, emptySkill);
  const lastRunBySkill = val(lastRunBySkillRes, {} as Record<string, { executedAt: string; status: string; durationMs: number | null; summary: string | null }>);
  const recentRuns = val(recentSkillRuns, [] as SkillRun[]);

  // Running skill detection (started > 10min ago, no finish)
  const runningRuns = recentRuns.filter((r) => r.status === "running");
  const staleThresholdMs = 10 * 60 * 1000;
  const autoCloseThresholdMs = 30 * 60 * 1000;
  const staleRuns = runningRuns.filter(
    (r) => now.getTime() - new Date(r.executed_at).getTime() > staleThresholdMs,
  );

  // 30分以上 running のジョブは自動クローズ（プロセスが死んで finish されなかった）
  const zombieRuns = runningRuns.filter(
    (r) => now.getTime() - new Date(r.executed_at).getTime() > autoCloseThresholdMs,
  );
  if (zombieRuns.length > 0) {
    await Promise.allSettled(
      zombieRuns.map((r) =>
        db
          .from("ceo_skill_runs")
          .update({
            status: "error",
            summary: `自動クローズ: ${Math.round((now.getTime() - new Date(r.executed_at).getTime()) / 60000)}分間応答なし`,
            finished_at: now.toISOString(),
          })
          .eq("id", r.id)
          .eq("status", "running"),
      ),
    );
  }

  // ── Engagement metrics ──
  const totalUsers = cnt(totalProfilesRes);
  const totalObservations = cnt(totalObservationsRes);
  const retentionData = val(retention, { dau: 0, wau: 0, mau: 0, period: { start: "", end: "" } });
  const observationsPerUser = totalUsers > 0 ? Math.round((totalObservations / totalUsers) * 10) / 10 : 0;
  const engagementRate = totalUsers > 0 ? Math.round((retentionData.dau / totalUsers) * 100) : 0;

  // ── Alerts (structured, deduplicated) ──
  const alerts: { level: "error" | "warn" | "info"; source: string; message: string; detail?: string }[] = [];

  if (!health.ok) {
    alerts.push({ level: "error", source: "system", message: "システムヘルスチェック異常" });
  }
  // アラートは「最新 run が失敗しているスキル」のみ表示
  // 過去に失敗があっても直近が成功していればアラート不要
  if (skillData.failureCount > 0) {
    for (const name of skillData.failedSkills) {
      const lastRun = lastRunBySkill[name];
      if (lastRun?.status === "error") {
        alerts.push({
          level: "error",
          source: "skill",
          message: `${name} 失敗`,
          detail: lastRun?.summary ?? undefined,
        });
      }
    }
  }
  if (skillData.autoCloseCount > 0) {
    alerts.push({
      level: "info",
      source: "skill",
      message: `${skillData.autoCloseCount}件のジョブを自動回収（応答なし）`,
    });
  }
  if (staleRuns.length > 0) {
    for (const r of staleRuns) {
      const mins = Math.round((now.getTime() - new Date(r.executed_at).getTime()) / 60000);
      alerts.push({
        level: "warn",
        source: "skill",
        message: `${r.skill_name} が${mins}分間実行中（スタック疑い）`,
      });
    }
  }
  if (alerts.length === 0) {
    alerts.push({ level: "info", source: "system", message: "異常なし" });
  }

  // ── Overall status derivation ──
  const hasErrors = alerts.some((a) => a.level === "error");
  const hasWarnings = alerts.some((a) => a.level === "warn");
  const overallStatus: "healthy" | "warning" | "critical" =
    hasErrors ? "critical" : hasWarnings ? "warning" : "healthy";

  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    range,
    overallStatus,
    actionCount: alerts.filter((a) => a.level !== "info").length,
    overview: {
      health: health.ok ? "healthy" : "degraded",
      services: health.services ?? {},
      responseMs: health.responseMs ?? null,
    },
    metrics: {
      totalUsers,
      todaySignups: cnt(todaySignupsRes),
      totalObservations,
      rendezvousProfiles: cnt(rendezvousProfilesRes),
    },
    engagement: {
      observationsPerUser,
      engagementRate,
    },
    deltas: {
      signups: delta(curSignups, prevSignups),
      observations: delta(curObservations, prevObservations),
      rendezvous: delta(curRendezvous, prevRendezvous),
    },
    retention: retentionData,
    kpiTrends,
    featurePopularity: val(featurePopularity, []),
    skills: {
      summary: skillData,
      prevSummary: prevSkillData,
      recentRuns: recentRuns.slice(0, 30),
      lastRunBySkill,
      runningCount: runningRuns.length,
      staleCount: staleRuns.length,
      skillRange,
    },
    alerts,
  });
}
