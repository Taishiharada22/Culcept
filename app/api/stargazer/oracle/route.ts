import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  generateOracleResponse,
  type OracleInput,
} from "@/lib/stargazer/decisionOracle";
import { resolveArchetype } from "@/lib/stargazer/archetypeResolver";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { ArchetypeCode } from "@/lib/stargazer/archetypeTypes";

// ---------------------------------------------------------------------------
// POST — 新しい予測を生成し、DB に永続化
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { decision, options, context } = body as {
      decision: string;
      options?: string[];
      context?: string;
    };

    if (!decision?.trim()) {
      return NextResponse.json(
        { error: "decision is required" },
        { status: 400 },
      );
    }

    // ── ユーザーのプロフィールデータ取得（並列） ──
    const [
      { data: resolvedTypeRow },
      { data: profileRow },
      { data: starMapRow },
      { data: dailyStateRow },
    ] = await Promise.all([
      supabase
        .from("stargazer_resolved_types")
        .select("axis_scores, archetype_code, confidence")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("stargazer_profiles")
        .select("dimensions, stage")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("stargazer_star_maps")
        .select("core_traits, observation_depth")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("stargazer_daily_states")
        .select("inner_weather")
        .eq("user_id", user.id)
        .order("observation_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // ── axisScores の構築（resolvedType > profile.dimensions > starMap.core_traits） ──
    const axisScores: Partial<Record<TraitAxisKey, number>> = {};

    // 低優先: starMap core_traits
    if (starMapRow?.core_traits && typeof starMapRow.core_traits === "object") {
      for (const [k, v] of Object.entries(
        starMapRow.core_traits as Record<string, unknown>,
      )) {
        if (typeof v === "number") {
          axisScores[k as TraitAxisKey] = v;
        }
      }
    }

    // 中優先: profile.dimensions
    if (profileRow?.dimensions && typeof profileRow.dimensions === "object") {
      for (const [k, v] of Object.entries(
        profileRow.dimensions as Record<string, unknown>,
      )) {
        if (typeof v === "number") {
          axisScores[k as TraitAxisKey] = v;
        }
      }
    }

    // 高優先: resolvedType.axis_scores
    if (
      resolvedTypeRow?.axis_scores &&
      typeof resolvedTypeRow.axis_scores === "object"
    ) {
      for (const [k, v] of Object.entries(
        resolvedTypeRow.axis_scores as Record<string, unknown>,
      )) {
        if (typeof v === "number") {
          axisScores[k as TraitAxisKey] = v;
        }
      }
    }

    // ── アーキタイプ解決 ──
    const archetypeResult = resolveArchetype(
      axisScores as Record<TraitAxisKey, number>,
    );
    const archetypeCode = (archetypeResult?.code ?? "PEA") as ArchetypeCode;

    // Shadow: 各レイヤーを反転（shadowInference.ts と同じロジック）
    const l1Flip: Record<string, string> = { P: "B", B: "H", H: "P" };
    const l2Flip: Record<string, string> = { E: "I", I: "S", S: "E" };
    const l3Flip: Record<string, string> = { A: "D", D: "W", W: "A" };
    const shadowCode = (
      (l1Flip[archetypeCode[0]] ?? "B") +
      (l2Flip[archetypeCode[1]] ?? "I") +
      (l3Flip[archetypeCode[2]] ?? "W")
    ) as ArchetypeCode;

    // ── 観測深度 ──
    const observationDepth =
      typeof starMapRow?.observation_depth === "number"
        ? starMapRow.observation_depth
        : 0;

    // ── Oracle 応答生成 ──
    const optionA = options?.[0] || undefined;
    const optionB = options?.[1] || undefined;

    const input: OracleInput = {
      decision: decision.trim(),
      optionA,
      optionB,
      archetypeCode,
      shadowCode,
      axisScores,
      currentWeather:
        (dailyStateRow?.inner_weather as string | undefined) ?? "calm",
      observationDepth,
    };

    const response = generateOracleResponse(input);

    // ── DB 永続化 ──
    const { data: inserted, error: insertError } = await supabase
      .from("stargazer_decision_oracle")
      .insert({
        user_id: user.id,
        decision_question: decision.trim(),
        decision_options: options?.filter(Boolean) ?? null,
        decision_context: context?.trim() || null,
        predicted_choice: response.predictedChoice,
        predicted_reason: response.predictedReason,
        predicted_confidence: response.confidenceLevel,
        shadow_choice: response.shadowChoice,
        shadow_reason: response.insight,
        ideal_choice: response.idealChoice,
        ideal_reason: JSON.stringify({
          patternReference: response.patternReference,
          verificationQuestion: response.verificationQuestion,
        }),
        narrative: response.narrative,
        decision_tendency: archetypeResult?.code ?? null,
      })
      .select("id, created_at")
      .single();

    if (insertError) {
      console.error("[oracle] insert error:", insertError);
      // DB 保存失敗でもレスポンスは返す
    }

    return NextResponse.json({
      ok: true,
      id: inserted?.id ?? null,
      createdAt: inserted?.created_at ?? new Date().toISOString(),
      response,
      archetypeCode,
      shadowCode,
      observationDepth,
    });
  } catch (err) {
    console.error("[oracle] POST error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET — 過去の予測履歴を取得
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: rows, error } = await supabase
      .from("stargazer_decision_oracle")
      .select(
        "id, decision_question, decision_options, predicted_choice, predicted_reason, predicted_confidence, shadow_choice, shadow_reason, ideal_choice, ideal_reason, narrative, decision_tendency, actual_choice, prediction_correct, verified_at, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error("[oracle] GET error:", error);
      return NextResponse.json(
        { error: "Failed to fetch history" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, history: rows ?? [] });
  } catch (err) {
    console.error("[oracle] GET error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH — 実際の選択を記録（検証）
// ---------------------------------------------------------------------------
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, actualChoice } = (await req.json()) as {
      id: string;
      actualChoice: string;
    };

    if (!id || !actualChoice?.trim()) {
      return NextResponse.json(
        { error: "id and actualChoice are required" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("stargazer_decision_oracle")
      .update({
        actual_choice: actualChoice.trim(),
        verified_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[oracle] PATCH error:", error);
      return NextResponse.json(
        { error: "Failed to update" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[oracle] PATCH error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
