// lib/ceo/skillTelemetry.ts
import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

export interface SkillRunInput {
  skillName: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export interface SkillRun {
  id: string;
  skill_name: string;
  target_type: string | null;
  target_id: string | null;
  status: "running" | "success" | "error";
  duration_ms: number | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  executed_at: string;
  finished_at: string | null;
}

/** Skill発動を記録し、runIdを返す */
export async function startSkillRun(input: SkillRunInput): Promise<string | null> {
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("ceo_skill_runs")
      .insert({
        skill_name: input.skillName,
        target_type: input.targetType ?? null,
        target_id: input.targetId ?? null,
        metadata: input.metadata ?? {},
        status: "running",
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[skillTelemetry] start failed:", error.message);
      return null;
    }
    return data.id;
  } catch {
    return null;
  }
}

/** Skill完了を記録 */
export async function finishSkillRun(
  runId: string,
  result: { status: "success" | "error"; durationMs: number; summary?: string },
): Promise<void> {
  try {
    const supabase = await supabaseServer();
    await supabase
      .from("ceo_skill_runs")
      .update({
        status: result.status,
        duration_ms: result.durationMs,
        summary: result.summary ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
  } catch {
    // best-effort
  }
}

/** 直近のskill runを取得 */
export async function getRecentSkillRuns(limit = 20): Promise<SkillRun[]> {
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("ceo_skill_runs")
      .select("*")
      .order("executed_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as SkillRun[];
  } catch {
    return [];
  }
}

/** Skill別の最終実行時刻と状態を取得 */
export async function getLastRunBySkill(): Promise<
  Record<string, { executedAt: string; status: string; durationMs: number | null; summary: string | null }>
> {
  try {
    const supabase = await supabaseServer();
    // Get distinct skill names first, then latest run for each
    const { data, error } = await supabase
      .from("ceo_skill_runs")
      .select("skill_name, status, duration_ms, summary, executed_at")
      .order("executed_at", { ascending: false })
      .limit(200);
    if (error || !data) return {};

    const result: Record<string, { executedAt: string; status: string; durationMs: number | null; summary: string | null }> = {};
    for (const row of data) {
      if (!result[row.skill_name]) {
        result[row.skill_name] = {
          executedAt: row.executed_at,
          status: row.status,
          durationMs: row.duration_ms,
          summary: row.summary,
        };
      }
    }
    return result;
  } catch {
    return {};
  }
}

export interface SkillSummaryResult {
  totalCount: number;
  successCount: number;
  successRate: number;
  avgDurationMs: number;
  failureCount: number;
  autoCloseCount: number;
  failedSkills: string[];
  bySkill: { skill_name: string; count: number; successCount: number; avgMs: number }[];
}

const EMPTY_SUMMARY: SkillSummaryResult = {
  totalCount: 0,
  successCount: 0,
  successRate: 0,
  avgDurationMs: 0,
  autoCloseCount: 0,
  failureCount: 0,
  failedSkills: [],
  bySkill: [],
};

/**
 * Skill集計。sinceISO〜untilISO の範囲で集計する。
 * sinceISO 省略時は今日0時から。untilISO 省略時は現在まで。
 */
export async function getSkillSummary(opts?: {
  sinceISO?: string;
  untilISO?: string;
}): Promise<SkillSummaryResult> {
  try {
    const supabase = await supabaseServer();
    const since = opts?.sinceISO ?? (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    })();

    let query = supabase
      .from("ceo_skill_runs")
      .select("skill_name, status, duration_ms, executed_at")
      .gte("executed_at", since)
      .order("executed_at", { ascending: false });

    if (opts?.untilISO) {
      query = query.lt("executed_at", opts.untilISO);
    }

    const { data, error } = await query;

    if (error || !data) return { ...EMPTY_SUMMARY };

    // 自動クローズ（ゾンビ回収）は実失敗と区別する
    const isAutoClose = (r: { summary: string | null }) =>
      r.summary?.startsWith("自動クローズ") ?? false;

    const total = data.length;
    const successes = data.filter((r) => r.status === "success").length;
    const realFailures = data.filter((r) => r.status === "error" && !isAutoClose(r));
    const autoCloseCount = data.filter((r) => r.status === "error" && isAutoClose(r)).length;
    const failures = realFailures.length;
    const completed = successes + failures; // running・自動クローズを除外した完了済み件数
    const durations = data.filter((r) => r.duration_ms != null).map((r) => r.duration_ms as number);
    const avgMs = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

    // Failed skill names (自動クローズは除外)
    const failedSkills = Array.from(
      new Set(realFailures.map((r) => r.skill_name)),
    );

    // Per-skill breakdown
    const skillMap = new Map<string, { count: number; successCount: number; totalMs: number; msCount: number }>();
    for (const row of data) {
      const s = skillMap.get(row.skill_name) ?? { count: 0, successCount: 0, totalMs: 0, msCount: 0 };
      s.count++;
      if (row.status === "success") s.successCount++;
      if (row.duration_ms != null) {
        s.totalMs += row.duration_ms;
        s.msCount++;
      }
      skillMap.set(row.skill_name, s);
    }

    const bySkill = Array.from(skillMap.entries())
      .map(([name, s]) => ({
        skill_name: name,
        count: s.count,
        successCount: s.successCount,
        avgMs: s.msCount > 0 ? Math.round(s.totalMs / s.msCount) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalCount: total,
      successCount: successes,
      successRate: completed > 0 ? Math.round((successes / completed) * 100) : 0,
      avgDurationMs: avgMs,
      failureCount: failures,
      autoCloseCount,
      failedSkills,
      bySkill,
    };
  } catch {
    return { ...EMPTY_SUMMARY };
  }
}
