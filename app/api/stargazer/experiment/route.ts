// app/api/stargazer/experiment/route.ts
// GET: 今週の実験を取得（なければ lazy 生成）
// POST: 実験を accept（status を proposed → accepted に更新）

import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { apiOk, apiUnauthorized, apiError } from "@/lib/api/response";
import {
  proposeWeeklyExperiment,
  type ExperimentProposalInput,
  type WeeklyExperiment,
} from "@/lib/stargazer/experimentEngine";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { BeliefSet } from "@/lib/stargazer/bayesianAxisUpdater";
import type { ContradictionMap } from "@/lib/stargazer/contradictionEngine";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET: 今週の実験を取得（なければ生成）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function GET() {
  try {
    const sb = await supabaseServer();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return apiUnauthorized();

    const weekStart = getMonday(new Date()).toISOString().slice(0, 10);

    // DB から今週の実験を取得
    let experiment: WeeklyExperiment | null = null;
    try {
      const { data } = await sb
        .from("stargazer_experiments")
        .select("*")
        .eq("user_id", user.id)
        .eq("week_start", weekStart)
        .maybeSingle();

      if (data) {
        experiment = rowToExperiment(data);
      }
    } catch {
      // テーブル未作成時
    }

    // 既存実験がある場合はそのまま返す
    if (experiment) {
      // 計測: viewed
      logMetric(sb, user.id, experiment.id, "viewed");
      return apiOk({ experiment, status: experiment.status });
    }

    // ── lazy 生成 ──
    const input = await buildProposalInput(sb, user.id);
    if (!input) {
      return apiOk({ experiment: null, status: "no_experiment" });
    }

    const proposed = proposeWeeklyExperiment(input);
    if (!proposed) {
      return apiOk({ experiment: null, status: "no_experiment" });
    }

    // DB に保存（ベストエフォート）
    try {
      await sb.from("stargazer_experiments").insert({
        id: proposed.id,
        user_id: user.id,
        week_start: weekStart,
        title: proposed.title,
        description: proposed.description,
        target_axis: proposed.targetAxis,
        target_pattern: proposed.targetPattern,
        difficulty: proposed.difficulty,
        expected_shift: proposed.expectedShift,
        report_prompt: proposed.reportPrompt,
        status: "proposed",
        reason_trace: proposed.reasonTrace ?? null,
      });
    } catch {
      // テーブル未作成時は黙って無視
    }

    // 計測: proposed + viewed
    logMetric(sb, user.id, proposed.id, "proposed");
    logMetric(sb, user.id, proposed.id, "viewed");

    return apiOk({ experiment: proposed, status: "proposed" as const });
  } catch (err) {
    console.error("[experiment] GET error:", err);
    return apiError("実験データの取得に失敗しました", 500);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST: 実験を accept
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(req: NextRequest) {
  try {
    const sb = await supabaseServer();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return apiUnauthorized();

    const { experimentId } = (await req.json()) as { experimentId?: string };
    if (!experimentId) {
      return apiError("experimentId は必須です", 400);
    }

    try {
      await sb
        .from("stargazer_experiments")
        .update({ status: "accepted" })
        .eq("id", experimentId)
        .eq("user_id", user.id)
        .eq("status", "proposed");
    } catch {
      // ベストエフォート
    }

    logMetric(sb, user.id, experimentId, "accepted");

    return apiOk({ ok: true });
  } catch (err) {
    console.error("[experiment] POST error:", err);
    return apiError("実験の承諾に失敗しました", 500);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type SupabaseClient = Awaited<ReturnType<typeof supabaseServer>>;

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

/** DB行 → WeeklyExperiment */
function rowToExperiment(row: Record<string, unknown>): WeeklyExperiment {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    weekStart: row.week_start as string,
    title: row.title as string,
    description: row.description as string,
    targetAxis: row.target_axis as TraitAxisKey,
    targetPattern: row.target_pattern as WeeklyExperiment["targetPattern"],
    difficulty: row.difficulty as WeeklyExperiment["difficulty"],
    expectedShift: row.expected_shift as WeeklyExperiment["expectedShift"],
    reportPrompt: row.report_prompt as string,
    status: row.status as WeeklyExperiment["status"],
    reasonTrace: row.reason_trace as WeeklyExperiment["reasonTrace"],
  };
}

/** Phase 1: blindSpotAxes 自動選出のみ */
async function buildProposalInput(
  sb: SupabaseClient,
  userId: string,
): Promise<ExperimentProposalInput | null> {
  try {
    // axis_beliefs + total_sessions を取得（実在するカラムのみ）
    const { data: profile } = await sb
      .from("stargazer_profiles")
      .select("axis_beliefs, dimensions, total_sessions")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile) return null;

    const beliefs: BeliefSet = (profile.axis_beliefs as BeliefSet) ?? {};
    const dims = (profile.dimensions as Record<string, number>) ?? {};
    // contradiction_map は stargazer_profiles にないため空で代用
    const contradictionMap: ContradictionMap = {};
    const archetypeCode = "unknown"; // Phase 1 では未使用

    // 観測深度: stargazer_observations の件数をカウント
    let totalObs = 0;
    try {
      const { count } = await sb
        .from("stargazer_observations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      totalObs = count ?? 0;
    } catch {
      // fallback: total_sessions を代用
      totalObs = (profile.total_sessions as number) ?? 0;
    }

    // blindSpotAxes: axis_beliefs があればprecision低い軸、なければ dimensions で
    // score が 0 に近い（=まだ分化していない）上位3軸を自動選出
    let blindSpotAxes: TraitAxisKey[];
    const beliefEntries = Object.entries(beliefs).filter(([, b]) => b && typeof b.precision === "number");

    if (beliefEntries.length > 0) {
      blindSpotAxes = beliefEntries
        .filter(([, b]) => b.precision < 2.0)
        .sort((a, b) => (a[1]?.precision ?? 0) - (b[1]?.precision ?? 0))
        .slice(0, 3)
        .map(([k]) => k as TraitAxisKey);
    } else {
      // axis_beliefs 未整備時: dimensions の |score| が小さい軸 = 盲点候補
      blindSpotAxes = Object.entries(dims)
        .filter(([, v]) => typeof v === "number")
        .sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))
        .slice(0, 3)
        .map(([k]) => k as TraitAxisKey);
    }

    // 過去の実験を取得（重複防止）
    let recentExperiments: WeeklyExperiment[] = [];
    try {
      const { data } = await sb
        .from("stargazer_experiments")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (data) {
        recentExperiments = data.map(rowToExperiment);
      }
    } catch {
      // テーブル未作成時
    }

    return {
      userId,
      axisBeliefs: beliefs,
      contradictionMap,
      archetypeCode,
      avoidancePatterns: [], // Phase 1: 後回し
      fixationPatterns: [],  // Phase 1: 後回し
      blindSpotAxes,
      recentExperiments,
      observationDepth: totalObs,
      totalSessions: totalObs,
    };
  } catch {
    return null;
  }
}

/** 計測イベント（ベストエフォート） */
function logMetric(
  sb: SupabaseClient,
  userId: string,
  experimentId: string,
  eventType: string,
): void {
  void sb.from("stargazer_experiment_metrics")
    .insert({ user_id: userId, experiment_id: experimentId, event_type: eventType })
    .then(() => {});
}
