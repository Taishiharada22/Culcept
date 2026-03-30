// app/api/stargazer/decision-engine/route.ts
// POST: 小判断のシミュレーション
//
// Body:
// {
//   "type": "social",
//   "question": "今日の飲み会、行くかどうか迷ってる",
//   "options": ["行く", "行かない"],
//   "context": "仕事の後、疲れている",
//   "urgency": "medium"
// }
//
// Response: DecisionEngineOutput

import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { apiOk, apiUnauthorized, apiBadRequest, apiError } from "@/lib/api/response";
import {
  evaluateDecision,
  type SmallDecisionQuery,
  type SmallDecisionType,
  type DecisionEngineInput,
  type CurrentState,
  type PastDecision,
} from "@/lib/stargazer/decisionEngine";
import { buildDecisionTrace } from "@/lib/stargazer/reasonTrace";

const VALID_TYPES: SmallDecisionType[] = [
  "social",
  "reply",
  "priority",
  "rest",
  "purchase",
  "free",
];

export async function POST(request: NextRequest) {
  try {
    const sb = await supabaseServer();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return apiUnauthorized();
    }

    const body = await request.json();

    // ── フィードバック処理（早期リターン） ──
    if (body.action === "feedback") {
      try {
        const updatePayload: Record<string, unknown> = {
          feedback_at: new Date().toISOString(),
        };
        // 正確性フィードバック (accurate / off / unsure)
        if (body.feedback) updatePayload.feedback_note = body.feedback;
        // 納得感5段階 (1-5)
        if (typeof body.satisfaction === "number" && body.satisfaction >= 1 && body.satisfaction <= 5) {
          updatePayload.satisfaction_rating = body.satisfaction;
        }
        await sb
          .from("stargazer_decision_engine_logs")
          .update(updatePayload)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);
      } catch {
        // ベストエフォート
      }
      return apiOk({ ok: true, message: "フィードバックを記録しました" });
    }

    const { type, question, options, context, urgency, is_preset } = body;

    // バリデーション
    if (!type || !VALID_TYPES.includes(type)) {
      return apiBadRequest(
        `type は ${VALID_TYPES.join(", ")} のいずれかを指定してください`,
      );
    }
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return apiBadRequest("question は必須です");
    }

    const query: SmallDecisionQuery = {
      type,
      question: question.trim(),
      options: Array.isArray(options) ? options.filter((o: unknown) => typeof o === "string" && o.trim()) : undefined,
      context: typeof context === "string" ? context.trim() : undefined,
      urgency: ["low", "medium", "high"].includes(urgency) ? urgency : undefined,
    };

    // ── ユーザーの軸スコアを取得 ──
    const axisScores = await fetchAxisScores(sb, user.id);

    // ── アーキタイプコードを取得 ──
    const archetypeCode = await fetchArchetypeCode(sb, user.id);

    // ── 現在の状態を推定 ──
    const currentState = await estimateCurrentState(sb, user.id);

    // ── 過去の判断パターンを取得（ベストエフォート） ──
    const pastDecisions = await fetchPastDecisions(sb, user.id, type);

    // ── 矛盾マップ（ベストエフォート） ──
    const contradictionMap = await fetchContradictionMap(sb, user.id);

    // ── 後悔パターン・防御パターン（ベストエフォート） ──
    const { regretPatterns, defensePatterns } = await fetchPatterns(sb, user.id);

    const input: DecisionEngineInput = {
      query,
      axisScores,
      archetypeCode,
      contradictionMap,
      defensePatterns,
      regretPatterns,
      currentState,
      pastDecisions,
    };

    const output = evaluateDecision(input);
    const reasonTrace = buildDecisionTrace(input, output);

    // ── 判断ログの保存（ベストエフォート、テーブル未作成時はスキップ） ──
    try {
      await sb.from("stargazer_decision_engine_logs").insert({
        decision_date: new Date().toISOString().split("T")[0],
        user_id: user.id,
        decision_type: type,
        question: query.question,
        options: query.options ?? [],
        context: query.context,
        simulations: output.simulations,
        recommended_option: output.recommended,
        withheld: output.withheld,
        withheld_reason: output.withheldReason,
        blind_spot_warning: output.blindSpotWarning,
        overall_uncertainty: output.overallUncertainty,
        state_snapshot: currentState,
        is_preset: is_preset === true,
      });
    } catch {
      // テーブル未作成時は黙って無視
    }

    return apiOk({ ...output, reasonTrace });
  } catch (err) {
    console.error("[decision-engine] Error:", err);
    return apiError(
      "判断シミュレーションの実行中にエラーが発生しました",
      500,
      { detail: err instanceof Error ? err.message : String(err) },
    );
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Data Fetchers (all best-effort with fallbacks)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type SupabaseClient = Awaited<ReturnType<typeof supabaseServer>>;

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

async function fetchArchetypeCode(
  sb: SupabaseClient,
  userId: string,
): Promise<string> {
  try {
    const { data } = await sb
      .from("stargazer_profiles")
      .select("archetype_code")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.archetype_code) return data.archetype_code as string;
  } catch {
    // fallback
  }
  return "unknown";
}

async function estimateCurrentState(
  sb: SupabaseClient,
  userId: string,
): Promise<CurrentState> {
  // まず daily_state テーブルを参照（あれば）
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await sb
      .from("stargazer_daily_states")
      .select("estimated_energy, estimated_social_battery, estimated_cognitive_load, estimated_stress")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();
    if (data) {
      return {
        energyLevel: (data.estimated_energy as number) ?? 0,
        socialBattery: (data.estimated_social_battery as number) ?? 0.5,
        cognitiveLoad: (data.estimated_cognitive_load as number) ?? 0.3,
        stressLevel: (data.estimated_stress as number) ?? 0.3,
      };
    }
  } catch {
    // テーブル未作成時
  }

  // inner_weather から推定（あれば）
  try {
    const { data } = await sb
      .from("stargazer_inner_weather")
      .select("energy, emotion")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      const energyMap: Record<string, number> = {
        very_low: -0.8,
        low: -0.3,
        moderate: 0.1,
        high: 0.5,
        very_high: 0.8,
      };
      return {
        energyLevel: energyMap[(data.energy as string) ?? ""] ?? 0,
        socialBattery: 0.5,
        cognitiveLoad: 0.3,
        stressLevel: ["anxious", "frustrated", "sad"].includes(
          (data.emotion as string) ?? "",
        )
          ? 0.6
          : 0.3,
      };
    }
  } catch {
    // fallback
  }

  // デフォルト
  return {
    socialBattery: 0.5,
    cognitiveLoad: 0.3,
    energyLevel: 0,
    stressLevel: 0.3,
  };
}

async function fetchPastDecisions(
  sb: SupabaseClient,
  userId: string,
  type: SmallDecisionType,
): Promise<PastDecision[]> {
  try {
    const { data } = await sb
      .from("stargazer_decision_engine_logs")
      .select("decision_type, output_summary, feedback_note, regretted")
      .eq("user_id", userId)
      .eq("decision_type", type)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) {
      return data.map((row: Record<string, unknown>) => ({
        type: (row.decision_type as SmallDecisionType) ?? type,
        chose: ((row.output_summary as Record<string, unknown>)?.recommended as string) ?? "",
        regretted: (row.regretted as boolean) ?? false,
      }));
    }
  } catch {
    // テーブル未作成時
  }
  return [];
}

async function fetchContradictionMap(
  sb: SupabaseClient,
  userId: string,
): Promise<Record<string, { isDual?: boolean; contradictionStrength?: number }>> {
  try {
    const { data } = await sb
      .from("stargazer_profiles")
      .select("contradiction_map")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.contradiction_map && typeof data.contradiction_map === "object") {
      return data.contradiction_map as Record<
        string,
        { isDual?: boolean; contradictionStrength?: number }
      >;
    }
  } catch {
    // fallback
  }
  return {};
}

async function fetchPatterns(
  sb: SupabaseClient,
  userId: string,
): Promise<{ regretPatterns: string[]; defensePatterns: string[] }> {
  try {
    const { data } = await sb
      .from("stargazer_profiles")
      .select("regret_patterns, defense_patterns")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      regretPatterns: Array.isArray(data?.regret_patterns)
        ? (data.regret_patterns as string[])
        : [],
      defensePatterns: Array.isArray(data?.defense_patterns)
        ? (data.defense_patterns as string[])
        : [],
    };
  } catch {
    // fallback
  }
  return { regretPatterns: [], defensePatterns: [] };
}
