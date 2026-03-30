// app/api/stargazer/experiment/report/route.ts
// POST: 実験結果の報告 → BeliefSet 微小更新

import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { apiOk, apiUnauthorized, apiError } from "@/lib/api/response";
import {
  updateFromExperimentResult,
  type ExperimentReport,
  type ExperimentOutcome,
  type WeeklyExperiment,
} from "@/lib/stargazer/experimentEngine";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { BeliefSet } from "@/lib/stargazer/bayesianAxisUpdater";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST: 実験結果の報告
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VALID_OUTCOMES = new Set<ExperimentOutcome>([
  "did_it",
  "tried_but_different",
  "could_not",
  "skipped",
]);

export async function POST(req: NextRequest) {
  try {
    const sb = await supabaseServer();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return apiUnauthorized();

    // ── リクエスト解析 ──
    const body = await req.json();
    const {
      experimentId,
      outcome,
      reflection,
      surpriseLevel,
      wouldRepeat,
    } = body as {
      experimentId?: string;
      outcome?: string;
      reflection?: string;
      surpriseLevel?: number;
      wouldRepeat?: boolean;
    };

    if (!experimentId || !outcome) {
      return apiError("experimentId と outcome は必須です", 400);
    }
    if (!VALID_OUTCOMES.has(outcome as ExperimentOutcome)) {
      return apiError("無効な outcome です", 400);
    }
    const sl = surpriseLevel ?? 3;
    if (sl < 1 || sl > 5) {
      return apiError("surpriseLevel は 1〜5 です", 400);
    }

    // ── 実験を取得 ──
    let experiment: WeeklyExperiment | null = null;
    try {
      const { data } = await sb
        .from("stargazer_experiments")
        .select("*")
        .eq("id", experimentId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        experiment = rowToExperiment(data);
      }
    } catch {
      // テーブル未作成時
    }

    if (!experiment) {
      return apiError("実験が見つかりません", 404);
    }
    if (experiment.status === "completed") {
      return apiError("この実験は既に報告済みです", 400);
    }

    // ── Report オブジェクト ──
    const report: ExperimentReport = {
      experimentId,
      outcome: outcome as ExperimentOutcome,
      reflection: reflection ?? undefined,
      surpriseLevel: sl as 1 | 2 | 3 | 4 | 5,
      wouldRepeat: wouldRepeat ?? false,
    };

    // ── BeliefSet 取得 ──
    let beliefs: BeliefSet = {} as BeliefSet;
    try {
      const { data: profile } = await sb
        .from("stargazer_profiles")
        .select("axis_beliefs")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile?.axis_beliefs) {
        beliefs = profile.axis_beliefs as BeliefSet;
      }
    } catch {
      // ベストエフォート
    }

    // ── モデル更新（微小） ──
    const { updatedBeliefs, modelUpdate } = updateFromExperimentResult(
      beliefs,
      experiment,
      report,
    );

    // ── DB 書き戻し（ベストエフォート） ──
    // 1. BeliefSet 更新
    try {
      await sb
        .from("stargazer_profiles")
        .update({ axis_beliefs: updatedBeliefs })
        .eq("user_id", user.id);
    } catch {
      // ベストエフォート
    }

    // 2. 実験ステータス更新
    try {
      await sb
        .from("stargazer_experiments")
        .update({ status: "completed" })
        .eq("id", experimentId)
        .eq("user_id", user.id);
    } catch {
      // ベストエフォート
    }

    // 3. 報告レコード保存
    try {
      await sb.from("stargazer_experiment_reports").insert({
        experiment_id: experimentId,
        user_id: user.id,
        outcome: report.outcome,
        reflection: report.reflection ?? null,
        surprise_level: report.surpriseLevel,
        would_repeat: report.wouldRepeat,
        model_update: modelUpdate,
        insight_generated: modelUpdate.insightGenerated,
      });
    } catch {
      // ベストエフォート
    }

    // 4. 計測
    logMetric(sb, user.id, experimentId, report.outcome === "skipped" ? "skipped" : "completed");

    return apiOk({
      modelUpdate,
      insightMessage: modelUpdate.insightGenerated,
    });
  } catch (err) {
    console.error("[experiment/report] POST error:", err);
    return apiError("実験結果の報告に失敗しました", 500);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type SupabaseClient = Awaited<ReturnType<typeof supabaseServer>>;

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
