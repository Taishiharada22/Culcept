// app/api/stargazer/daily-intervention/route.ts
// GET: 現在のフェーズの介入を取得
// クエリパラメータ: phase=morning|noon|evening|night
//
// Response: { state: DailyState, intervention: PhaseIntervention }

import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { apiOk, apiUnauthorized, apiError } from "@/lib/api/response";
import {
  generateIntervention,
  type InterventionPhase,
  type YesterdayState,
  type ChallengeResult,
  type PhaseIntervention,
} from "@/lib/stargazer/dailyIntervention";
import { buildInterventionTrace } from "@/lib/stargazer/reasonTrace";

const VALID_PHASES: InterventionPhase[] = ["morning", "noon", "evening", "night"];

export async function GET(request: NextRequest) {
  try {
    const sb = await supabaseServer();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return apiUnauthorized();
    }

    // フェーズの取得（クエリパラメータ or 自動判定）
    const phaseParam = request.nextUrl.searchParams.get("phase");
    const phase: InterventionPhase = VALID_PHASES.includes(
      phaseParam as InterventionPhase,
    )
      ? (phaseParam as InterventionPhase)
      : autoDetectPhase();

    // ── 軸スコアを取得 ──
    const axisScores = await fetchAxisScores(sb, user.id);

    // ── 昨日の状態を取得（ベストエフォート） ──
    const yesterdayState = await fetchYesterdayState(sb, user.id);

    // ── 朝の介入結果を取得（noon以降で必要） ──
    let morningIntervention: PhaseIntervention | undefined;
    if (phase !== "morning") {
      morningIntervention = await fetchPhaseCache(sb, user.id, "morning");
    }

    // ── 保留中の判断を取得（evening で必要） ──
    let pendingDecisions: string[] | undefined;
    if (phase === "evening") {
      pendingDecisions = await fetchPendingDecisions(sb, user.id);
    }

    // ── Self vs Oracle 結果（night で必要） ──
    let challengeResult: ChallengeResult | undefined;
    if (phase === "night") {
      challengeResult = await fetchTodayChallengeResult(sb, user.id);
    }

    const today = new Date().toISOString().split("T")[0];

    const result = generateIntervention({
      userId: user.id,
      date: today,
      phase,
      axisScores,
      yesterdayState,
      morningIntervention,
      pendingDecisions,
      challengeResult,
    });

    // ── 介入結果をキャッシュ（ベストエフォート） ──
    try {
      await sb.from("stargazer_daily_interventions").upsert(
        {
          user_id: user.id,
          intervention_date: today,
          phase,
          message: typeof result.intervention === "object"
            ? JSON.stringify(result.intervention)
            : String(result.intervention),
          estimated_state: {
            estimatedEnergy: result.state.estimatedEnergy,
            estimatedSocialBattery: result.state.estimatedSocialBattery,
            estimatedCognitiveLoad: result.state.estimatedCognitiveLoad,
            estimatedStress: result.state.estimatedStress,
          },
          vulnerability_score: result.state.vulnerabilityScore ?? 0,
          suggestions: result.intervention?.suggestions ?? [],
          warnings: result.intervention?.warnings ?? [],
        },
        { onConflict: "user_id,intervention_date,phase" },
      );
    } catch {
      // テーブル未作成時は黙って無視
    }

    // ── Reason Trace 生成 ──
    const reasonTrace = buildInterventionTrace(
      {
        phase,
        estimatedEnergy: result.state.estimatedEnergy,
        estimatedSocialBattery: result.state.estimatedSocialBattery,
        estimatedCognitiveLoad: result.state.estimatedCognitiveLoad,
        estimatedStress: result.state.estimatedStress,
        vulnerabilityScore: result.state.vulnerabilityScore,
        vulnerabilityFactors: result.state.vulnerabilityFactors,
      },
      result.intervention?.message ?? "",
    );

    return apiOk({
      phase,
      state: result.state,
      intervention: result.intervention,
      reasonTrace,
    });
  } catch (err) {
    console.error("[daily-intervention] Error:", err);
    return apiError("介入データの生成中にエラーが発生しました", 500, {
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type SupabaseClient = Awaited<ReturnType<typeof supabaseServer>>;

function autoDetectPhase(): InterventionPhase {
  // JST (UTC+9) で判定
  const now = new Date();
  const jstHour = (now.getUTCHours() + 9) % 24;

  if (jstHour >= 5 && jstHour < 11) return "morning";
  if (jstHour >= 11 && jstHour < 16) return "noon";
  if (jstHour >= 16 && jstHour < 21) return "evening";
  return "night";
}

async function fetchAxisScores(
  sb: SupabaseClient,
  userId: string,
): Promise<Record<string, number>> {
  try {
    const { data } = await sb
      .from("stargazer_profiles")
      .select("axis_scores")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.axis_scores && typeof data.axis_scores === "object") {
      return data.axis_scores as Record<string, number>;
    }
  } catch {
    // fallback
  }
  return {};
}

async function fetchYesterdayState(
  sb: SupabaseClient,
  userId: string,
): Promise<YesterdayState | undefined> {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];

    const { data } = await sb
      .from("stargazer_daily_interventions")
      .select("estimated_state, message")
      .eq("user_id", userId)
      .eq("intervention_date", dateStr)
      .eq("phase", "night")
      .maybeSingle();

    if (data?.estimated_state) {
      const snap = data.estimated_state as Record<string, number>;
      return {
        energyLevel: snap.estimatedEnergy,
        socialBattery: snap.estimatedSocialBattery,
        stressLevel: snap.estimatedStress,
        cognitiveLoad: snap.estimatedCognitiveLoad,
      };
    }
  } catch {
    // テーブル未作成時
  }
  return undefined;
}

async function fetchPhaseCache(
  sb: SupabaseClient,
  userId: string,
  phase: InterventionPhase,
): Promise<PhaseIntervention | undefined> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await sb
      .from("stargazer_daily_interventions")
      .select("message")
      .eq("user_id", userId)
      .eq("intervention_date", today)
      .eq("phase", phase)
      .maybeSingle();

    if (data?.message) {
      return (typeof data.message === "string" ? JSON.parse(data.message) : data.message) as PhaseIntervention;
    }
  } catch {
    // テーブル未作成時
  }
  return undefined;
}

async function fetchPendingDecisions(
  sb: SupabaseClient,
  userId: string,
): Promise<string[] | undefined> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await sb
      .from("stargazer_decision_engine_logs")
      .select("question")
      .eq("user_id", userId)
      .gte("created_at", today)
      .is("feedback_note", null)
      .limit(5);

    if (data && data.length > 0) {
      return data.map((row: Record<string, unknown>) => row.question as string);
    }
  } catch {
    // テーブル未作成時
  }
  return undefined;
}

async function fetchTodayChallengeResult(
  sb: SupabaseClient,
  userId: string,
): Promise<ChallengeResult | undefined> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await sb
      .from("stargazer_self_vs_oracle_challenges")
      .select("oracle_correct_count, user_correct_count, status")
      .eq("user_id", userId)
      .eq("challenge_date", today)
      .eq("status", "verified")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const oracleCount = (data.oracle_correct_count as number) ?? 0;
      const userCount = (data.user_correct_count as number) ?? 0;
      return {
        oracleWasRight: oracleCount > userCount,
        selfWasRight: userCount >= oracleCount,
        insight: undefined,
      };
    }
  } catch {
    // テーブル未作成時
  }
  return undefined;
}
